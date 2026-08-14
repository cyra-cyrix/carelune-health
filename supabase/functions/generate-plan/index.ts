// Supabase Edge Function: generate-plan  (Stage B of governed plan generation)
// ---------------------------------------------------------------------------
// Combines, server-side:
//   * the APPROVED pathway version's stored structure (loaded here, NOT resent by
//     the client — token-efficient),
//   * the Stage-A patient facts (patient_document_facts), and
//   * the doctor's three answers (patient_plan_intake)
// into a DRAFT patient plan. The pathway-sourced sections (monitoring modules,
// warning signs, escalation, education, milestone templates) are taken DIRECTLY
// from the stored config — the model never invents them. The model only maps the
// patient facts + doctor instructions into diagnosis/procedure/medicines/diet/
// precautions/tasks, each carrying provenance, and flags missing/conflicting info.
//
// The output is validated against a strict schema HERE before it is saved as a
// DRAFT. It is never activated — the doctor edits and approves it downstream.
//
// Auth: clinical staff only. Reads/writes via service_role after verifying caller.
// Secret: OPENAI_API_KEY. Optional OPENAI_MODEL.
// Deploy:  supabase functions deploy generate-plan --project-ref <ref>
// ---------------------------------------------------------------------------

import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } });

const asStr = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
const arr = (v: unknown) => (Array.isArray(v) ? v : []);
const FACT = ["document", "doctor"];

/* -- server-side strict validation (mirror of src/lib/pathwayValidation.ts) -- */
function validatePlan(p: Record<string, unknown>, enabled: string[]): string[] {
  const e: string[] = [];
  const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
  const ok = (v: unknown) => typeof v === "string" && v.trim().length > 0;
  if (!ok(p.clinical_summary)) e.push("clinical_summary required");
  const facts = (label: string, allowed: string[]) => arr(p[label]).forEach((f, i) => {
    if (!isObj(f) || !ok(f.text)) e.push(`${label}[${i}] needs text`);
    else if (!allowed.includes(String(f.provenance))) e.push(`${label}[${i}] provenance invalid`);
  });
  facts("diagnosis", FACT);
  facts("diet", FACT);
  facts("precautions", [...FACT, "pathway"]);
  facts("investigations", [...FACT, "pathway"]);
  if (p.procedure && isObj(p.procedure) && !FACT.includes(String(p.procedure.provenance))) e.push("procedure provenance must be document/doctor");
  arr(p.medicines).forEach((m, i) => {
    if (!isObj(m) || !ok(m.name)) e.push(`medicines[${i}].name required`);
    else if (!FACT.includes(String(m.provenance))) e.push(`medicines[${i}] must come from a document or doctor, never invented`);
  });
  arr(p.observations).forEach((o, i) => {
    if (!isObj(o) || !ok(o.module)) e.push(`observations[${i}] needs module`);
    else if (!enabled.includes(String(o.module))) e.push(`observations[${i}] module not enabled for pathway`);
  });
  const esc = p.escalation;
  if (!isObj(esc) || !ok(esc.routine) || !ok(esc.urgent) || !ok(esc.emergency)) e.push("escalation incomplete");
  return e;
}

const SYSTEM_PROMPT = `You are a careful clinical scribe assembling a DRAFT home-recovery plan for a doctor to review, for a post-discharge programme in India. You are given: (A) patient FACTS already extracted from the discharge documents, (B) the doctor's three instructions, and (C) the list of monitoring modules the approved pathway enables (for context only).

STRICT SAFETY RULES:
- Never invent diagnoses, medicines, doses, investigations, diets or restrictions. Use ONLY the FACTS or the DOCTOR's instructions.
- Copy medicines EXACTLY from the facts (name/dose/freq/timing). Provenance "document".
- Diagnosis/procedure/investigations come from facts (provenance "document"). Precautions/diet may come from facts ("document") or the doctor ("doctor"). A milestone/target stated by the doctor is provenance "doctor".
- Convert care into simple caregiver-facing daily_tasks and therapy_tasks. Task provenance is "document", "doctor", or "pathway".
- If important information is missing or the documents conflict, DO NOT guess — add a short note to "missing" or "conflicts".

Return ONLY JSON:
{
 "clinical_summary": "one plain sentence",
 "diagnosis": [{"text":"…","provenance":"document"}],
 "procedure": {"text":"…","provenance":"document"} ,
 "medicines": [{"name":"…","dose":"…","freq":"…","timing":"…","note":"…","provenance":"document"}],
 "investigations": [{"text":"…","provenance":"document"}],
 "diet": [{"text":"…","provenance":"document"}],
 "precautions": [{"text":"…","provenance":"document"}],
 "daily_tasks": [{"time_label":"08:00","discipline":"Nursing","title":"…","detail":"","provenance":"document"}],
 "therapy_tasks": [{"time_label":"10:00","discipline":"Physiotherapy","title":"…","detail":"","provenance":"pathway"}],
 "missing": ["…"],
 "conflicts": ["…"]
}
If procedure is not stated, use null. Output valid JSON only.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    const model = Deno.env.get("OPENAI_MODEL") ?? "gpt-4o";
    if (!openaiKey) return json({ error: "OpenAI key not set." }, 500);

    const authHeader = req.headers.get("Authorization") ?? "";
    const caller = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: uErr } = await caller.auth.getUser();
    if (uErr || !user) return json({ error: "Not authenticated" }, 401);
    const { data: prof } = await caller.from("profiles").select("role, centre_id").eq("id", user.id).maybeSingle();
    if (!prof || !["duty_doctor", "pmr"].includes(prof.role)) {
      return json({ error: "Only a doctor can generate a patient plan." }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const patientId = String(body.patient_id ?? "");
    if (!patientId) return json({ error: "patient_id is required." }, 400);

    const admin = createClient(url, service, { auth: { persistSession: false } });
    const { data: pat } = await admin.from("patients")
      .select("id, full_name, centre_id, pathway_pack_id, pathway_version_id").eq("id", patientId).maybeSingle();
    if (!pat || pat.centre_id !== prof.centre_id) return json({ error: "Patient not found for your institution." }, 404);
    if (!pat.pathway_version_id) return json({ error: "Assign and approve a pathway version for this patient first." }, 409);

    // Load the governed, already-stored pathway structure (NOT sent by the client).
    const { data: ver } = await admin.from("pathway_versions")
      .select("id, status, config, pathway_id, pathways(name, pack_id)").eq("id", pat.pathway_version_id).maybeSingle();
    if (!ver) return json({ error: "Pathway version not found." }, 404);
    // The governing version must be approved (platform) OR institution-approved.
    const { data: instApproved } = await admin.from("institution_pathway_versions")
      .select("id").eq("centre_id", pat.centre_id).eq("version_id", ver.id).maybeSingle();
    if (ver.status !== "approved" && !instApproved) {
      return json({ error: "This pathway version is not clinically approved for your institution." }, 409);
    }

    const cfg = (ver.config ?? {}) as Record<string, unknown>;
    const modules = arr(cfg.modules) as Record<string, unknown>[];
    const enabled = modules.map((m) => asStr(m.key)).filter(Boolean);

    const { data: factsRow } = await admin.from("patient_document_facts").select("facts").eq("patient_id", patientId).maybeSingle();
    if (!factsRow) return json({ error: "Extract document facts first (upload the discharge summary)." }, 409);
    const { data: intake } = await admin.from("patient_plan_intake")
      .select("milestone_goal, milestone_by, monitor_focus, non_negotiables").eq("patient_id", patientId).maybeSingle();

    const userContent = [
      `FACTS (from discharge documents):\n${JSON.stringify(factsRow.facts)}`,
      `DOCTOR INSTRUCTIONS:\n- Expected milestone: ${asStr(intake?.milestone_goal)} (by ${asStr(intake?.milestone_by)})\n- Monitor more closely: ${asStr(intake?.monitor_focus)}\n- Non-negotiable boundaries: ${asStr(intake?.non_negotiables)}`,
      `ENABLED MONITORING MODULES (context): ${enabled.join(", ")}`,
    ].join("\n\n");

    const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model, temperature: 0.1, response_format: { type: "json_object" },
        messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: userContent }],
      }),
    });
    if (!aiRes.ok) return json({ error: `OpenAI error (${aiRes.status}): ${(await aiRes.text()).slice(0, 400)}` }, 502);
    let ai: Record<string, unknown>;
    try { ai = JSON.parse((await aiRes.json())?.choices?.[0]?.message?.content ?? "{}"); } catch { return json({ error: "Model did not return valid JSON." }, 502); }

    // Pathway-sourced sections come straight from the stored config (never the model).
    const observations = modules.map((m) => ({
      module: asStr(m.key),
      frequency: asStr(m.frequency) || "daily",
      recorded_by: asStr(m.recorded_by) || "caregiver",
    })).filter((o) => enabled.includes(o.module));
    const milestones = arr(cfg.milestones).map((m) => {
      const o = (m ?? {}) as Record<string, unknown>;
      return { key: asStr(o.key), name: asStr(o.name), by_day: typeof o.by_day === "number" ? o.by_day : null };
    }).filter((m) => m.name);
    if (asStr(intake?.milestone_goal)) {
      milestones.push({ key: "doctor_goal", name: `${asStr(intake?.milestone_goal)}${intake?.milestone_by ? ` (by ${asStr(intake?.milestone_by)})` : ""}`, by_day: null });
    }
    const warning_signs = arr(cfg.warning_signs).map((w) => {
      const o = (w ?? {}) as Record<string, unknown>;
      return { text: asStr(o.text), severity: asStr(o.severity) === "attention" ? "attention" : "urgent" };
    }).filter((w) => w.text);
    const escalation = (cfg.escalation && typeof cfg.escalation === "object")
      ? cfg.escalation
      : { routine: "nurse", urgent: "doctor", emergency: "Call 112 or 108, or go to the nearest hospital" };
    const education = arr(cfg.education).map((ed) => {
      const o = (ed ?? {}) as Record<string, unknown>;
      return { title: asStr(o.title), status: asStr(o.status) || "approval_pending" };
    }).filter((ed) => ed.title);

    // Doctor non-negotiables become explicit precautions with doctor provenance.
    const modelPrecautions = arr(ai.precautions);
    const precautions = asStr(intake?.non_negotiables)
      ? [{ text: asStr(intake?.non_negotiables), provenance: "doctor" }, ...modelPrecautions]
      : modelPrecautions;

    const plan = {
      clinical_summary: asStr(ai.clinical_summary),
      diagnosis: arr(ai.diagnosis),
      procedure: ai.procedure && typeof ai.procedure === "object" ? ai.procedure : null,
      medicines: arr(ai.medicines),
      investigations: arr(ai.investigations),
      daily_tasks: arr(ai.daily_tasks),
      therapy_tasks: arr(ai.therapy_tasks),
      diet: arr(ai.diet),
      observations,
      milestones,
      precautions,
      warning_signs,
      escalation,
      education,
      review_dates: [],
      missing: arr(ai.missing).map(asStr).filter(Boolean),
      conflicts: arr(ai.conflicts).map(asStr).filter(Boolean),
    };

    const errors = validatePlan(plan as Record<string, unknown>, enabled);
    if (errors.length) return json({ error: "Generated plan failed validation.", validation: { ok: false, errors } }, 422);

    // Versioning: overwrite the current editable draft, but preserve any already
    // approved/activated version by creating a NEW draft version above it.
    const { data: latest } = await admin.from("patient_plans")
      .select("version, status").eq("patient_id", patientId).order("version", { ascending: false }).limit(1).maybeSingle();
    const nextVersion = latest ? (latest.status === "draft" ? latest.version : latest.version + 1) : 1;

    const { data: saved, error: sErr } = await admin.from("patient_plans").upsert(
      {
        patient_id: patientId, centre_id: pat.centre_id, version: nextVersion,
        pathway_version_id: pat.pathway_version_id, content: plan, status: "draft", generated_by: user.id,
      },
      { onConflict: "patient_id,version" },
    ).select("id, version, status").single();
    if (sErr) return json({ error: `Could not save the draft: ${sErr.message}` }, 500);

    return json({ plan, saved, validation: { ok: true, errors: [] } });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
