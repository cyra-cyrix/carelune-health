// Supabase Edge Function: admin-users
// ---------------------------------------------------------------------------
// The org admin lists and creates teammate accounts (email + password + role).
// Creating users needs the service_role key, which can only live server-side —
// hence this function. The browser calls it via supabase.functions.invoke().
//
// Auth model: we read the CALLER's JWT to confirm they are an admin, then act
// only within the caller's own org (centre_id). service_role is never exposed.
//
// SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are injected by
// Supabase automatically — no secrets to set for this function.
//
// Deploy:  supabase functions deploy admin-users --project-ref <ref>
// ---------------------------------------------------------------------------

import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ROLES = ["pmr", "duty_doctor", "nurse", "caregiver", "family"];

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";

    // Identify the caller from their JWT, using their own RLS-scoped client.
    const caller = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const {
      data: { user },
      error: uErr,
    } = await caller.auth.getUser();
    if (uErr || !user) return json({ error: "Not authenticated" }, 401);

    // Confirm admin via the CALLER's client (self-read works under RLS) — this
    // does not depend on the service key bypassing RLS.
    const { data: prof, error: pReadErr } = await caller
      .from("profiles")
      .select("is_admin, centre_id")
      .eq("id", user.id)
      .maybeSingle();
    if (pReadErr) return json({ error: `Profile read failed: ${pReadErr.message}` }, 500);
    if (!prof) return json({ error: "No profile found for this account." }, 403);
    if (!prof.is_admin) return json({ error: "This account is not an admin." }, 403);
    if (!prof.centre_id) return json({ error: "This admin has no org (centre_id) set." }, 403);
    const centreId = prof.centre_id as string;

    // Service client — used only for the privileged writes below.
    const admin = createClient(url, service, { auth: { persistSession: false } });

    const body = await req.json().catch(() => ({}));
    const action = body.action ?? "list";

    // ---- list teammates in this org ----
    if (action === "list") {
      // Read email straight off profiles (denormalised) — no per-user Admin API call.
      const { data: profs } = await admin
        .from("profiles")
        .select("id, full_name, role, is_admin, email")
        .eq("centre_id", centreId);
      const users = (profs ?? []).map((p) => ({
        id: p.id,
        email: p.email ?? "",
        full_name: p.full_name,
        role: p.role,
        is_admin: p.is_admin,
      }));
      users.sort((a, b) => (a.is_admin === b.is_admin ? 0 : a.is_admin ? -1 : 1));
      return json({ users });
    }

    // ---- create a teammate ----
    if (action === "create") {
      const email = String(body.email ?? "").trim().toLowerCase();
      const password = String(body.password ?? "");
      const role = String(body.role ?? "");
      const full_name = String(body.full_name ?? "").trim() || null;
      if (!email || !password) return json({ error: "Email and password are required." }, 400);
      if (password.length < 6) return json({ error: "Password must be at least 6 characters." }, 400);
      if (!ROLES.includes(role)) return json({ error: "Pick a valid role." }, 400);

      const { data: created, error: cErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { role, full_name },
      });
      if (cErr || !created.user) return json({ error: cErr?.message ?? "Could not create user." }, 400);

      const uid = created.user.id;
      // The signup trigger makes a profile; ensure it has this org + role.
      const { error: pErr } = await admin
        .from("profiles")
        .upsert({ id: uid, email, role, full_name, centre_id: centreId, is_admin: false, must_reset_password: true });
      if (pErr) return json({ error: pErr.message }, 400);

      return json({ user: { id: uid, email, full_name, role, is_admin: false } });
    }

    // ---- reset a teammate's password (issues a new temporary password) ----
    if (action === "reset-password") {
      const target_id = String(body.user_id ?? "");
      const password = String(body.password ?? "");
      if (!target_id) return json({ error: "user_id is required." }, 400);
      if (password.length < 6) return json({ error: "Password must be at least 6 characters." }, 400);

      const { data: tp } = await admin.from("profiles").select("centre_id").eq("id", target_id).maybeSingle();
      if (!tp || tp.centre_id !== centreId) return json({ error: "That teammate is not in your institution." }, 403);

      const { error: upErr } = await admin.auth.admin.updateUserById(target_id, { password });
      if (upErr) return json({ error: upErr.message }, 400);
      await admin.from("profiles").update({ must_reset_password: true }).eq("id", target_id);
      return json({ ok: true, user_id: target_id });
    }

    // ---- remove a teammate (permanent; guarded) ----
    if (action === "remove") {
      const target_id = String(body.user_id ?? "");
      if (!target_id) return json({ error: "user_id is required." }, 400);
      if (target_id === user.id) return json({ error: "You can't remove your own account." }, 400);

      const { data: tp } = await admin
        .from("profiles")
        .select("centre_id, is_admin, is_super_admin")
        .eq("id", target_id)
        .maybeSingle();
      if (!tp || tp.centre_id !== centreId) return json({ error: "That teammate is not in your institution." }, 403);
      if (tp.is_admin || tp.is_super_admin) return json({ error: "You can't remove an admin account." }, 400);

      const { error: dErr } = await admin.auth.admin.deleteUser(target_id);
      if (dErr) return json({ error: dErr.message }, 400);
      return json({ ok: true, user_id: target_id });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
