// Supabase Edge Function: platform-admin
// ---------------------------------------------------------------------------
// Carelune platform console (super admin only). Lists organisations and creates
// an organisation together with its admin (HOD) account. The admin is created
// with a temporary password and must_reset_password = true, so the app forces a
// password reset on first login.
//
// Auth: reads the caller's JWT and confirms is_super_admin via their own
// RLS-scoped self-read. All writes use service_role, scoped by the code.
//
// Deploy:  supabase functions deploy platform-admin --project-ref <ref>
// ---------------------------------------------------------------------------

import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

    const caller = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const {
      data: { user },
      error: uErr,
    } = await caller.auth.getUser();
    if (uErr || !user) return json({ error: "Not authenticated" }, 401);

    const { data: prof, error: pReadErr } = await caller
      .from("profiles")
      .select("is_super_admin")
      .eq("id", user.id)
      .maybeSingle();
    if (pReadErr) return json({ error: `Profile read failed: ${pReadErr.message}` }, 500);
    if (!prof?.is_super_admin) return json({ error: "Super admin only" }, 403);

    const admin = createClient(url, service, { auth: { persistSession: false } });
    const body = await req.json().catch(() => ({}));
    const action = body.action ?? "list-orgs";

    // ---- list all orgs + their admin ----
    if (action === "list-orgs") {
      const { data: centres } = await admin
        .from("centres")
        .select("id, name, display_name, setup_complete, institution_type, created_at")
        .order("created_at", { ascending: false });
      const { data: admins } = await admin
        .from("profiles")
        .select("id, full_name, centre_id, email")
        .eq("is_admin", true);
      const { data: ipRows } = await admin
        .from("institution_pathways")
        .select("centre_id, pathway_packs(key)")
        .eq("enabled", true);
      const { data: patientRows } = await admin.from("patients").select("centre_id");

      const adminByCentre = new Map<string, { full_name: string | null; email: string | null }>();
      for (const a of admins ?? []) {
        if (a.centre_id && !adminByCentre.has(a.centre_id)) {
          adminByCentre.set(a.centre_id, { full_name: a.full_name, email: a.email ?? null });
        }
      }
      const pathwaysByCentre = new Map<string, string[]>();
      for (const r of ipRows ?? []) {
        const key = (r as { pathway_packs?: { key?: string } }).pathway_packs?.key;
        const cid = (r as { centre_id: string }).centre_id;
        if (!key) continue;
        pathwaysByCentre.set(cid, [...(pathwaysByCentre.get(cid) ?? []), key]);
      }
      const countByCentre = new Map<string, number>();
      for (const r of patientRows ?? []) {
        const cid = (r as { centre_id: string }).centre_id;
        countByCentre.set(cid, (countByCentre.get(cid) ?? 0) + 1);
      }

      const orgs = (centres ?? []).map((c) => {
        const a = adminByCentre.get(c.id);
        return {
          id: c.id,
          name: c.name,
          display_name: c.display_name,
          setup_complete: c.setup_complete,
          institution_type: c.institution_type ?? null,
          admin_name: a?.full_name ?? null,
          admin_email: a?.email ?? null,
          pathways: pathwaysByCentre.get(c.id) ?? [],
          patient_count: countByCentre.get(c.id) ?? 0,
        };
      });
      return json({ orgs });
    }

    // ---- create an org + its admin ----
    if (action === "create-org") {
      const org_name = String(body.org_name ?? "").trim();
      const admin_name = String(body.admin_name ?? "").trim() || null;
      const admin_email = String(body.admin_email ?? "").trim().toLowerCase();
      const admin_password = String(body.admin_password ?? "");
      if (!org_name) return json({ error: "Organisation name is required." }, 400);
      if (!admin_email || !admin_password) return json({ error: "Admin email and password are required." }, 400);
      if (admin_password.length < 6) return json({ error: "Password must be at least 6 characters." }, 400);

      const validTypes = ["hospital", "rehab_centre", "doctor_practice", "clinical_group"];
      const institution_type = validTypes.includes(String(body.institution_type)) ? String(body.institution_type) : null;
      const pathway_keys = Array.isArray(body.pathway_keys)
        ? body.pathway_keys.filter((k: unknown) => ["spine", "joint", "neuro"].includes(String(k)))
        : [];

      const { data: centre, error: cErr } = await admin
        .from("centres")
        .insert({ name: org_name, institution_type })
        .select("id")
        .single();
      if (cErr || !centre) return json({ error: cErr?.message ?? "Could not create org." }, 400);

      const { data: created, error: uCErr } = await admin.auth.admin.createUser({
        email: admin_email,
        password: admin_password,
        email_confirm: true,
        user_metadata: { role: "pmr", full_name: admin_name },
      });
      if (uCErr || !created.user) {
        // roll back the org so we don't leave an admin-less shell
        await admin.from("centres").delete().eq("id", centre.id);
        return json({ error: uCErr?.message ?? "Could not create the admin account." }, 400);
      }

      const { error: pErr } = await admin.from("profiles").upsert({
        id: created.user.id,
        email: admin_email,
        role: "pmr",
        full_name: admin_name,
        centre_id: centre.id,
        is_admin: true,
        must_reset_password: true,
      });
      if (pErr) return json({ error: pErr.message }, 400);

      // Assign the Super Admin's selected pathway packs (service_role RPC).
      if (pathway_keys.length) {
        const { error: aErr } = await admin.rpc("set_institution_pathways", {
          p_centre: centre.id,
          p_pack_keys: pathway_keys,
        });
        if (aErr) return json({ error: `Organisation created, but pathway assignment failed: ${aErr.message}` }, 400);
      }

      return json({
        org: { id: centre.id, name: org_name },
        admin: { email: admin_email, full_name: admin_name },
        pathways: pathway_keys,
      });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
