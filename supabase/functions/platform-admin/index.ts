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
import { validateServiceDraft } from "../_shared/serviceDraft.ts";

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
        .select("id, name, display_name, setup_complete, institution_type, created_at, status")
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
          status: (c as { status?: string }).status ?? "active",
        };
      });
      return json({ orgs });
    }

    // ---- pause / resume an institution (no data is deleted) ----
    if (action === "set-org-status") {
      const centre_id = String(body.centre_id ?? "");
      const status = String(body.status ?? "");
      if (!centre_id) return json({ error: "centre_id is required." }, 400);
      if (!["active", "paused"].includes(status)) return json({ error: "status must be 'active' or 'paused'." }, 400);
      const { error: sErr } = await admin.from("centres").update({ status }).eq("id", centre_id);
      if (sErr) return json({ error: sErr.message }, 400);
      return json({ ok: true, centre_id, status });
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


    // ---- create a provider AND its first configured service (Level 1) ----
    //
    // The Super Admin service builder's single write. It creates the
    // organisation and its primary professional exactly as `create-org` does,
    // then stores the confirmed service configuration and advances it through
    // the D-003 lifecycle: inserted as `draft`, then confirmed by the platform
    // to `pending_provider_confirmation`. Level 2 — the provider's designated
    // approver publishing it — is deliberately NOT performed here.
    //
    // The draft is re-validated server-side even though analyse-provider-service
    // already validated it: the browser sat in between and the operator edited it.
    if (action === "create-provider-service") {
      const org_name = String(body.org_name ?? "").trim();
      const admin_name = String(body.admin_name ?? "").trim() || null;
      const admin_email = String(body.admin_email ?? "").trim().toLowerCase();
      const admin_password = String(body.admin_password ?? "");
      if (!org_name) return json({ error: "Provider name is required." }, 400);
      if (!admin_email || !admin_password) return json({ error: "The primary professional's email and password are required." }, 400);
      if (admin_password.length < 6) return json({ error: "Password must be at least 6 characters." }, 400);

      // The human-facing provider type is what the operator chose and what the
      // model was told; `centres.institution_type` still accepts only the four
      // values its CHECK constraint allows, so map onto them here rather than
      // letting a client send something the database will reject.
      const providerType = String(body.provider_type ?? "").trim();
      const TYPE_MAP: Record<string, string> = {
        solo_professional: "doctor_practice",
        clinic: "doctor_practice",
        hospital: "hospital",
        rehab_centre: "rehab_centre",
        allied_health: "clinical_group",
        other: "clinical_group",
      };
      const institution_type = TYPE_MAP[providerType] ?? null;

      // Validate the confirmed service by running it back through the draft
      // schema as a one-service draft.
      const provider_summary = String(body.provider_summary ?? "").trim();
      const check = validateServiceDraft({
        provider_summary,
        suggested_services: [body.service],
      });
      if (!check.ok) {
        return json({ error: "This service configuration is incomplete.", details: check.errors.slice(0, 12) }, 400);
      }
      const service = (check.draft.suggested_services as Record<string, unknown>[])[0];
      const packages = service.suggested_packages as Record<string, unknown>[];

      const provenance = ["ai_drafted", "super_admin", "provider_supplied"].includes(String(body.source_provenance))
        ? String(body.source_provenance)
        : "ai_drafted";
      const ai_model = body.ai_model ? String(body.ai_model).slice(0, 120) : null;

      // 1. the organisation
      // setup_complete: the Super Admin has just done the setup on the provider's
      // behalf — identity, service and packages are all configured here. Without
      // this the provider's first sign-in is routed into the legacy first-run
      // wizard (App.tsx), which asks them to name the institution and pick a
      // package all over again.
      const { data: centre, error: cErr } = await admin
        .from("centres").insert({ name: org_name, institution_type, setup_complete: true }).select("id").single();
      if (cErr || !centre) return json({ error: cErr?.message ?? "Could not create the provider." }, 400);

      const rollback = async (created_user_id?: string) => {
        if (created_user_id) await admin.auth.admin.deleteUser(created_user_id).catch(() => {});
        await admin.from("centres").delete().eq("id", centre.id);
      };

      // 2. its primary professional — who also becomes the designated Level-2
      //    approver for this service (D-003: designation is the authority).
      const { data: created, error: uCErr } = await admin.auth.admin.createUser({
        email: admin_email, password: admin_password, email_confirm: true,
        user_metadata: { role: "pmr", full_name: admin_name },
      });
      if (uCErr || !created.user) {
        await rollback();
        return json({ error: uCErr?.message ?? "Could not create the primary professional's account." }, 400);
      }
      const approverId = created.user.id;

      const { error: pErr } = await admin.from("profiles").upsert({
        id: approverId, email: admin_email, role: "pmr", full_name: admin_name,
        centre_id: centre.id, is_admin: true, must_reset_password: true,
      });
      if (pErr) { await rollback(approverId); return json({ error: pErr.message }, 400); }

      // 3. the service, as a draft.
      //
      //    `programme_config` holds everything the patient-facing programme is
      //    rendered from — monitoring areas, the questions, the care team, the
      //    period outline — plus the brief the operator wrote, so the record
      //    carries its own provenance. NOTE: platform_fee_pct is never read from
      //    the request; packages take the column default (20%, D-004).
      const slugBase = String(service.name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
      const { data: svc, error: sErr } = await admin.from("centre_services").insert({
        centre_id: centre.id,
        name: service.name,
        slug: slugBase || null,
        summary: service.summary,
        origin: "custom",
        patient_type: service.patient_type,
        entry_point: service.entry_point,
        typical_duration_days: service.typical_duration_days,
        objective: service.objective,
        end_condition: service.end_condition,
        owner_profile_id: approverId,
        provider_approver_profile_id: approverId,
        supporting_disciplines: service.care_team_suggestions ?? [],
        programme_config: {
          provider_summary,
          provider_brief: {
            provider_type: providerType || null,
            description: String(body.description ?? "").slice(0, 4000) || null,
            website: String(body.website ?? "").slice(0, 500) || null,
            social: String(body.social ?? "").slice(0, 500) || null,
          },
          monitoring_domains: service.monitoring_domains,
          patient_inputs: service.suggested_patient_inputs,
          care_team: service.care_team_suggestions,
          programme_outline: service.programme_outline,
        },
        status: "draft",
        source_provenance: provenance,
        ai_model,
        ai_drafted_at: ai_model ? new Date().toISOString() : null,
        source_note: String(body.notes ?? "").slice(0, 4000) || null,
        configured_by: user.id,
      }).select("id").single();
      if (sErr || !svc) { await rollback(approverId); return json({ error: sErr?.message ?? "Could not save the service." }, 400); }

      // 4. its packages, as drafts. They go live when the provider publishes
      //    the service at Level 2.
      const { error: pkgErr } = await admin.from("service_packages").insert(
        packages.map((p, i) => ({
          centre_service_id: svc.id,
          centre_id: centre.id,
          name: p.name,
          positioning: p.positioning,
          sort_order: i,
          duration_days: p.duration_days,
          monitoring_domains: p.monitoring_domains,
          checkin_frequency: p.checkin_frequency,
          review_frequency: p.review_frequency,
          support_level: p.support_level,
          milestones: p.milestones,
          includes: p.includes,
          status: "draft",
          source_provenance: provenance,
          ai_model,
          created_by: user.id,
        })),
      );
      if (pkgErr) { await rollback(approverId); return json({ error: pkgErr.message }, 400); }

      // 5. Level 1 — the Super Admin confirms the structured configuration.
      const { error: confErr } = await admin.from("centre_services").update({
        status: "pending_provider_confirmation",
        confirmed_by_platform_at: new Date().toISOString(),
        confirmed_by_platform_by: user.id,
      }).eq("id", svc.id);
      if (confErr) { await rollback(approverId); return json({ error: confErr.message }, 400); }

      return json({
        org: { id: centre.id, name: org_name },
        admin: { email: admin_email, full_name: admin_name },
        service: {
          id: svc.id,
          name: service.name,
          status: "pending_provider_confirmation",
          packages: packages.length,
          approver_name: admin_name,
        },
      });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
