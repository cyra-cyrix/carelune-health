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
// Regimen content the model MAY propose where the documents are silent (D-002).
const REGIMEN = [...FACT, "pathway", "ai_structured", "ai_suggested"];

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
  facts("diet", REGIMEN);
  facts("precautions", REGIMEN);
  facts("targets", REGIMEN);
  facts("investigations", [...FACT, "pathway"]);
  if (p.procedure && isObj(p.procedure) && !FACT.includes(String(p.procedure.provenance))) e.push("procedure provenance must be document/doctor");
  arr(p.medicines).forEach((m, i) => {
    if (!isObj(m) || !ok(m.name)) e.push(`medicines[${i}].name required`);
    else if (!FACT.includes(String(m.provenance))) e.push(`medicines[${i}] must come from a document or doctor, never invented`);
  });
  arr(p.observations).forEach((o, i) => {
    if (!isObj(o) || !ok(o.module)) e.push(`observations[${i}] needs module`);
    // Only constrain modules when a legacy pathway actually enabled a set.
    else if (enabled.length && !enabled.includes(String(o.module))) e.push(`observations[${i}] module not enabled for pathway`);
  });
  // Scheduled work must be time-bound sanely; day 1 is the discharge day.
  for (const label of ["daily_tasks", "therapy_tasks", "wound_care"]) {
    arr(p[label]).forEach((t, i) => {
      if (!isObj(t) || !ok(t.title)) return e.push(`${label}[${i}] needs a title`);
      const from = t.from_day, thru = t.through_day;
      const bad = (v: unknown) => v !== null && v !== undefined && (typeof v !== "number" || !Number.isInteger(v) || v < 1);
      if (bad(from)) e.push(`${label}[${i}].from_day must be a whole day >= 1`);
      if (bad(thru)) e.push(`${label}[${i}].through_day must be a whole day >= 1`);
      if (typeof from === "number" && typeof thru === "number" && thru < from)
        e.push(`${label}[${i}] ends before it starts`);
    });
  }
  const esc = p.escalation;
  if (!isObj(esc) || !ok(esc.routine) || !ok(esc.urgent) || !ok(esc.emergency)) e.push("escalation incomplete");
  return e;
}

const STANDARDS_HINT = [
  "WHO Rehabilitation 2030",
  "AHA/ASA stroke rehabilitation and recovery",
  "ERAS Society post-operative recovery",
  "NICE post-surgical and rehabilitation guidance",
  "ACSM exercise prescription",
  "ESPEN / BDA nutrition",
  "WOCN / EWMA wound care",
].join("; ");

const SYSTEM_PROMPT = `You are a continuing-care clinician assembling a DRAFT home-recovery programme for the TREATING DOCTOR to review, edit and approve, for a patient discharged to home care in India. You are given (A) FACTS extracted from the patient's discharge documents and (B) any instructions the doctor added.

TWO KINDS OF CONTENT — this distinction is the safety spine of the product:

1. FACTS — diagnoses, procedure, medicines, doses, investigations. NEVER invent, infer, adjust or "correct" these. Copy them exactly from the FACTS with provenance "document" (or "doctor" if the doctor stated them). A medicine that is not in the documents does not appear in the plan. Never change a dose, never add a drug, never suggest a referral.

2. REGIMEN — exercise, diet, wound care, monitoring, precautions, targets, education. Where the documents specify it, use it with provenance "document". Where the documents are SILENT, you MAY propose what international standard-of-care would ordinarily include for this diagnosis/procedure at this stage of recovery — and you MUST mark it provenance "ai_suggested". The doctor rules on every ai_suggested line before anything is activated; nothing reaches the family until then.

Draw on established international guidance appropriate to the condition, for example: ${STANDARDS_HINT}. List in "standards" ONLY the families you actually applied. Never claim certification, endorsement, accreditation or compliance — this is a draft written with reference to them.

TIME-BOUND EVERYTHING. Day 1 is the discharge day. Every task carries from_day, and through_day when it should stop or change. Build a PROGRESSION — protection and small volumes early, graded increase later — not one instruction repeated for the whole programme.

SAFETY RULES:
- Any precaution, restriction or contraindication stated in the documents OVERRIDES anything you would otherwise propose. Re-read them before proposing exercise or diet.
- If you are unsure, do NOT guess: add a short, specific question to "missing" for the doctor to answer.
- If the documents disagree with each other, record it in "conflicts". Never silently pick one.
- Write for the person doing the work: a family caregiver with no clinical training. Short, plain, imperative sentences. No abbreviations, no jargon.
- Anything genuinely dangerous to get wrong belongs in warning_signs, with the escalation route.

Return ONLY valid JSON in exactly this shape:
{
 "clinical_summary": "one plain sentence a family would understand",
 "diagnosis": [{"text":"…","provenance":"document"}],
 "procedure": {"text":"…","provenance":"document"} or null,
 "medicines": [{"name":"…","dose":"…","freq":"…","timing":"…","note":"…","provenance":"document"}],
 "investigations": [{"text":"…","provenance":"document"}],
 "targets": [{"text":"what good recovery looks like, measurable","by_day":21,"provenance":"ai_suggested"}],
 "therapy_tasks": [{"time_label":"08:00","discipline":"Physiotherapy","title":"…","detail":"how to do it, plainly","from_day":1,"through_day":7,"provenance":"ai_suggested"}],
 "daily_tasks": [{"time_label":"08:00","discipline":"Nursing","title":"…","detail":"…","from_day":1,"through_day":null,"provenance":"document"}],
 "wound_care": [{"time_label":"09:00","discipline":"Wound care","title":"…","detail":"…","from_day":1,"through_day":14,"provenance":"ai_suggested"}],
 "diet": [{"text":"…","provenance":"ai_suggested"}],
 "precautions": [{"text":"…","provenance":"document"}],
 "observations": [{"module":"vitals","frequency":"daily","recorded_by":"caregiver"}],
 "milestones": [{"key":"walk_50m","name":"…","by_day":21}],
 "warning_signs": [{"text":"…","severity":"urgent"}],
 "escalation": {"routine":"…","urgent":"…","emergency":"…"},
 "education": [{"title":"…","status":"pending"}],
 "review_dates": [{"date":"YYYY-MM-DD","purpose":"…"}],
 "standards": ["…"],
 "missing": ["a specific question for the doctor"],
 "conflicts": ["…"]
}
"wound_care" is [] when there was no procedure or wound. Output valid JSON only, no prose.`;

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
    // A governed pathway is OPTIONAL now (docs/DECISIONS.md D-001). The plan is
    // built from this patient's own documents; if a legacy pathway version happens
    // to be assigned we still read it for monitoring-module context, but its
    // absence never blocks the doctor.

    const { data: ver } = pat.pathway_version_id
      ? await admin.from("pathway_versions").select("id, config").eq("id", pat.pathway_version_id).maybeSingle()
      : { data: null };

    const cfg = (ver?.config ?? {}) as Record<string, unknown>;
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

    /*
     * These sections used to come exclusively from a governed pathway config. With
     * pathways removed (D-001) the model supplies them, and a legacy config — when
     * one happens to still be attached — takes precedence over the model's version.
     */
    const cfgObservations = modules.map((m) => ({
      module: asStr(m.key),
      frequency: asStr(m.frequency) || "daily",
      recorded_by: asStr(m.recorded_by) || "caregiver",
    })).filter((o) => enabled.includes(o.module));
    const observations = cfgObservations.length ? cfgObservations : arr(ai.observations);
    const milestones = (arr(cfg.milestones).length ? arr(cfg.milestones) : arr(ai.milestones)).map((m) => {
      const o = (m ?? {}) as Record<string, unknown>;
      return { key: asStr(o.key), name: asStr(o.name), by_day: typeof o.by_day === "number" ? o.by_day : null };
    }).filter((m) => m.name);
    if (asStr(intake?.milestone_goal)) {
      milestones.push({ key: "doctor_goal", name: `${asStr(intake?.milestone_goal)}${intake?.milestone_by ? ` (by ${asStr(intake?.milestone_by)})` : ""}`, by_day: null });
    }
    const warning_signs = (arr(cfg.warning_signs).length ? arr(cfg.warning_signs) : arr(ai.warning_signs)).map((w) => {
      const o = (w ?? {}) as Record<string, unknown>;
      return { text: asStr(o.text), severity: asStr(o.severity) === "attention" ? "attention" : "urgent" };
    }).filter((w) => w.text);
    const escalation = (cfg.escalation && typeof cfg.escalation === "object")
      ? cfg.escalation
      : (ai.escalation && typeof ai.escalation === "object")
        ? ai.escalation
        // Frozen emergency wording — never let the model author the 112/108 line.
        : { routine: "nurse", urgent: "doctor", emergency: "Call 112 or 108, or go to the nearest hospital" };
    const education = (arr(cfg.education).length ? arr(cfg.education) : arr(ai.education)).map((ed) => {
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
      wound_care: arr(ai.wound_care),
      diet: arr(ai.diet),
      targets: arr(ai.targets),
      standards: arr(ai.standards).map(asStr).filter(Boolean),
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
