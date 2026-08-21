// Supabase Edge Function: registry
// ---------------------------------------------------------------------------
// Two actions behind one function:
//
//   register       (PUBLIC, no login) — a family opens the org's registration
//                  link and registers the patient. Authorised by the org invite
//                  TOKEN, not a JWT. Creates the family's own login + a PENDING
//                  patient record + the family↔patient link + consent.
//
//   add-caregiver  (family/staff, JWT) — a linked family member (or staff) adds
//                  a caregiver to their patient. The caregiver gets a login and
//                  is linked; they reset the temp password on first sign-in.
//
// Because `register` runs before the family has an account, deploy WITHOUT JWT
// verification and authorise in code:
//   supabase functions deploy registry --no-verify-jwt --project-ref <ref>
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

const str = (v: unknown) => String(v ?? "").trim();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";

    const admin = createClient(url, service, { auth: { persistSession: false } });
    const body = await req.json().catch(() => ({}));
    const action = str(body.action) || "register";

    // ---- PUBLIC: white-label institution + package summary for the onboarding
    //      screen. Authorised by the invite token; returns only display-safe
    //      fields (no Carelune branding, no internal identifiers). ----
    if (action === "org-info") {
      const token = str(body.token);
      if (!token) return json({ error: "Missing registration token." }, 400);

      // A universal service invitation (0031) is tried FIRST. The token alone
      // decides which kind of link this is — the browser never says.
      const { data: invite } = await admin.rpc("service_invite_for_token", { t: token });

      let centreId: string | null = invite?.centre_id ?? null;
      if (!centreId) {
        const { data: legacyCentre, error: tErr } = await admin.rpc("centre_id_for_token", { t: token });
        if (tErr) return json({ error: `Token lookup failed: ${tErr.message}` }, 500);
        centreId = legacyCentre ?? null;
      }
      if (!centreId) return json({ error: "This registration link is invalid or has expired." }, 403);

      // The organisation's own patient-facing identity, resolved from the token.
      //
      // `name` is the fallback for an organisation that never set a separate
      // display name. Without it this returned null for a perfectly
      // well-identified institution, and the page fell back to the generic
      // "Your care team" — which is what families were seeing.
      const { data: c } = await admin
        .from("centres")
        .select("display_name, name, logo_url, package_price, trial_days")
        .eq("id", centreId)
        .maybeSingle();

      const institution_name = c?.display_name?.trim() || c?.name?.trim() || null;
      const logo_url = c?.logo_url ?? null;

      if (invite) {
        return json({
          ok: true,
          kind: "service",
          institution_name,
          logo_url,
          service_name: invite.service_name ?? null,
          package_name: invite.package_name ?? null,
          positioning: invite.positioning ?? null,
          duration_days: invite.duration_days ?? null,
          checkin_frequency: invite.checkin_frequency ?? null,
          review_frequency: invite.review_frequency ?? null,
          support_level: invite.support_level ?? null,
          includes: Array.isArray(invite.includes) ? invite.includes : [],
          monitoring_domains: Array.isArray(invite.monitoring_domains) ? invite.monitoring_domains : [],
          package_price: invite.price ?? null,
          currency: invite.currency ?? "INR",
          trial_days: invite.trial_days ?? 0,
        });
      }

      return json({
        ok: true,
        kind: "legacy",
        institution_name,
        logo_url,
        package_price: c?.package_price ?? null,
        trial_days: c?.trial_days ?? 0,
      });
    }

    // ---- PUBLIC: register a patient via the org invite token ----
    if (action === "register") {
      const token = str(body.token);
      const patient = body.patient ?? {};
      const family = body.family ?? {};
      const consent = body.consent ?? {};

      if (!token) return json({ error: "Missing registration token." }, 400);

      // Which kind of invitation is this? Resolved from the token server-side.
      // A universal invite carries its own centre, and the package is re-read
      // from the token again inside the transaction — the request body never
      // names a package, so there is nothing for a client to swap.
      const { data: invite } = await admin.rpc("service_invite_for_token", { t: token });
      const inviteToken = invite ? token : null;

      let centreId: string | null = invite?.centre_id ?? null;
      if (!centreId) {
        const { data: legacyCentre, error: tErr } = await admin.rpc("centre_id_for_token", { t: token });
        if (tErr) return json({ error: `Token lookup failed: ${tErr.message}` }, 500);
        centreId = legacyCentre ?? null;
      }
      if (!centreId) return json({ error: "This registration link is invalid or has expired." }, 403);

      const patientName = str(patient.full_name);
      const familyName = str(family.full_name);
      const email = str(family.email).toLowerCase();
      const password = str(family.password);
      if (!patientName) return json({ error: "Patient name is required." }, 400);
      if (!email || !password) return json({ error: "Your email and a password are required." }, 400);
      if (password.length < 6) return json({ error: "Password must be at least 6 characters." }, 400);

      // Create the family's login.
      const { data: created, error: cErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { role: "family", full_name: familyName || null },
      });
      if (cErr || !created.user) {
        const msg = cErr?.message ?? "Could not create your account.";
        const nice = /already/i.test(msg)
          ? "That email is already registered. Please sign in instead."
          : msg;
        return json({ error: nice }, 400);
      }
      const familyId = created.user.id;

      // All DB writes run in ONE transaction (SECURITY DEFINER RPC). If it fails,
      // delete the just-created auth user so the family can retry the same email.
      const { error: txErr } = await admin.rpc("register_patient_tx", {
        p_centre: centreId,
        p_family: familyId,
        p_patient: {
          full_name: patientName,
          age: str(patient.age),
          sex: str(patient.sex),
          location: str(patient.location),
          discharged_on: str(patient.discharged_on),
        },
        p_consent: {
          subject_name: str(consent.subject_name) || familyName,
          relation_to_patient: str(consent.relation_to_patient) || str(family.relation),
        },
        // NULL for a legacy invitation -> the transaction takes exactly the
        // path it always did and creates no subscription.
        p_invite_token: inviteToken,
      });
      if (txErr) {
        await admin.auth.admin.deleteUser(familyId).catch(() => {});
        return json({ error: `Registration failed: ${txErr.message}` }, 400);
      }

      return json({ ok: true, patient_name: patientName, family_email: email });
    }

    // ---- add a caregiver to a patient (family/staff, verified by JWT) ----
    if (action === "add-caregiver") {
      const caller = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
      const {
        data: { user },
        error: uErr,
      } = await caller.auth.getUser();
      if (uErr || !user) return json({ error: "Not authenticated" }, 401);

      const patientId = str(body.patient_id);
      const email = str(body.email).toLowerCase();
      const password = str(body.password);
      const fullName = str(body.full_name) || null;
      if (!patientId) return json({ error: "Missing patient." }, 400);
      if (!email || !password) return json({ error: "Caregiver email and password are required." }, 400);
      if (password.length < 6) return json({ error: "Password must be at least 6 characters." }, 400);

      // Authorise via the caller's own RLS scope: can they see this patient?
      const { data: pat, error: rErr } = await caller
        .from("patients")
        .select("id, centre_id")
        .eq("id", patientId)
        .maybeSingle();
      if (rErr) return json({ error: `Access check failed: ${rErr.message}` }, 500);
      if (!pat) return json({ error: "You are not linked to this patient." }, 403);

      const { data: created, error: cErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { role: "caregiver", full_name: fullName },
      });
      if (cErr || !created.user) {
        const msg = cErr?.message ?? "Could not create the caregiver account.";
        const nice = /already/i.test(msg) ? "That email is already registered." : msg;
        return json({ error: nice }, 400);
      }
      const caregiverId = created.user.id;

      // Profile + link in one transaction; roll back the auth user on failure.
      const { error: txErr } = await admin.rpc("add_caregiver_tx", {
        p_patient: patientId,
        p_caregiver: caregiverId,
      });
      if (txErr) {
        await admin.auth.admin.deleteUser(caregiverId).catch(() => {});
        return json({ error: `Could not add the caregiver: ${txErr.message}` }, 400);
      }

      return json({ ok: true, email });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
