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

const SYSTEM_PROMPT = `You are a continuing-care rehabilitation clinician drafting a 30-day home-recovery programme for the TREATING DOCTOR to review, edit and approve, for a patient discharged to home care in India. You are given (A) FACTS extracted from the discharge document, including a FUNCTION block describing the patient's deficits, and (B) any instruction the doctor added.

TWO KINDS OF CONTENT — this distinction is the safety spine of the product:

1. FACTS — diagnoses, procedure, medicines, doses, investigations. NEVER invent, infer, adjust or "correct" these. Copy them exactly, provenance "document" (or "doctor"). A medicine not in the documents does not appear. Never change a dose, add a drug, or suggest a referral.

2. REGIMEN — therapy, diet, wound care, monitoring, precautions, targets, education. Where the document specifies it, use it (provenance "document"). Where the document is SILENT, you MUST still build a complete programme from international standard-of-care for these deficits, marked provenance "ai_suggested". The doctor rules on every ai_suggested line before activation.

BUILD A MULTIDISCIPLINARY PROGRAMME — this is the core of the task.
Read the FUNCTION block and, for EVERY deficit it records, include concrete daily work from the discipline that treats it. A recovery plan that names a deficit and then schedules nothing for it is a failure.

  weakness / mobility        -> Physiotherapy: positioning, bed mobility, sitting and standing balance,
                                transfers, gait re-education, graded strengthening.
  upper_limb                 -> Occupational therapy: reach and grasp, hand function, and retraining the
                                actual activities of daily living — feeding, dressing, grooming, bathing.
  swallowing                 -> Speech & swallow therapy: safe-swallow positioning, prescribed diet
                                consistency, oral care, aspiration precautions, feed handling if the
                                patient is on RT/NG/PEG.
  communication              -> Speech & language therapy: comprehension and expression work, and how the
                                family should communicate with the patient.
  cognition                  -> Orientation, attention and memory work, with a safe daily routine.
  continence / skin          -> Nursing: toileting schedule, catheter care, two-hourly positioning,
                                pressure-area and skin checks.
  respiratory                -> Chest physiotherapy, breathing exercises, nebulisation, suction, positioning.
  pain                       -> Non-drug measures alongside whatever the document already prescribes.
  ALWAYS                     -> Diet and hydration appropriate to the swallowing status and comorbidities;
                                falls prevention; carer education.

Put each task in therapy_tasks (therapy disciplines) or daily_tasks (nursing and routine care), and set "discipline" to the profession that owns it: Physiotherapy, Occupational therapy, Speech & language therapy, Dietetics, Nursing, Respiratory therapy.

TIME-BOUND AND PROGRESS EVERYTHING. Day 1 is the discharge day. Every task carries from_day and, where it changes or stops, through_day. Build a real progression across roughly week 1, weeks 2-3 and week 4 — protection and small volumes first, then graded increase. Do not repeat one undated instruction for thirty days. Give sets, repetitions or durations a family can follow.

SAFETY:
- Precautions and restrictions in the document OVERRIDE anything you would otherwise propose. If the patient is nil-by-mouth, do not schedule oral feeding; schedule the feed and swallow work that is safe.
- If a deficit is recorded but you cannot safely plan for it without more information, add a specific question to "missing". Never guess a deficit that is not documented, and never leave a documented deficit unaddressed in silence.
- If documents disagree, record it in "conflicts". Do not silently pick one.
- Write for a family caregiver with no clinical training: short, plain, imperative sentences. No abbreviations.
- Contact and emergency wording: keep it general; do not invent phone numbers.

Draw on established international guidance for the condition, for example: WHO Rehabilitation 2030; AHA/ASA stroke rehabilitation and recovery; ERAS post-operative recovery; NICE rehabilitation guidance; ACSM exercise prescription; ESPEN/BDA nutrition and dysphagia guidance; WOCN/EWMA wound care. List in "standards" only the families you actually applied. Never claim certification, endorsement or compliance.

Return ONLY valid JSON in exactly this shape:
{
 "clinical_summary": "one plain sentence a family would understand",
 "diagnosis": [{"text":"…","provenance":"document"}],
 "procedure": {"text":"…","provenance":"document"} or null,
 "medicines": [{"name":"…","dose":"…","freq":"…","timing":"…","note":"…","provenance":"document"}],
 "investigations": [{"text":"…","provenance":"document"}],
 "targets": [{"text":"measurable recovery target","by_day":21,"provenance":"ai_suggested"}],
 "therapy_tasks": [{"time_label":"08:00","discipline":"Physiotherapy","title":"…","detail":"sets, reps, how to do it safely","from_day":1,"through_day":7,"provenance":"ai_suggested"}],
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
"wound_care" is [] when there is no wound or procedure. Output valid JSON only, no prose.`;

/*
 * Deterministic coverage check — the safety net behind the prompt.
 *
 * A documented deficit with nothing scheduled for it is the failure mode that
 * matters here: the plan looks complete and silently omits the therapy the
 * patient actually needs. We do not trust the model to police this, so we check
 * the finished plan against the FUNCTION block and turn every gap into an
 * explicit question for the doctor rather than letting it pass unseen.
 */
const COVERAGE: { field: string; disciplines: string[]; label: string }[] = [
  { field: "weakness", disciplines: ["physiotherap"], label: "physiotherapy for the documented weakness" },
  { field: "mobility", disciplines: ["physiotherap"], label: "mobility or gait work" },
  { field: "upper_limb", disciplines: ["occupational"], label: "occupational therapy for hand/arm function and daily activities" },
  { field: "swallowing", disciplines: ["speech", "swallow", "dietetic"], label: "swallow-safety work for the documented swallowing problem" },
  { field: "communication", disciplines: ["speech"], label: "speech and language work for the documented communication problem" },
  { field: "cognition", disciplines: ["speech", "occupational", "nursing"], label: "cognitive or orientation work" },
  { field: "continence", disciplines: ["nursing"], label: "nursing care for continence" },
  { field: "skin", disciplines: ["nursing", "wound"], label: "skin and pressure-area care" },
  { field: "respiratory", disciplines: ["respiratory", "physiotherap"], label: "chest or breathing care" },
];

function coverageGaps(fnBlock: Record<string, unknown>, tasks: Record<string, unknown>[]): string[] {
  const present = tasks
    .map((t) => `${asStr(t.discipline)} ${asStr(t.title)} ${asStr(t.detail)}`.toLowerCase())
    .join(" | ");
  const gaps: string[] = [];
  for (const rule of COVERAGE) {
    const stated = asStr(fnBlock[rule.field]).trim();
    if (!stated) continue;
    if (!rule.disciplines.some((d) => present.includes(d))) {
      gaps.push(`The document records "${stated}" but the plan has no ${rule.label}. Add it or confirm it is not needed.`);
    }
  }
  return gaps;
}

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

    const factsObj = (factsRow.facts ?? {}) as Record<string, unknown>;
    const fnBlock = (factsObj.function ?? {}) as Record<string, unknown>;
    // Restate the deficits explicitly. Buried inside the facts blob they were
    // being skimmed over, which is how a patient needing swallow and speech work
    // ended up with a two-task plan.
    const deficits = Object.entries(fnBlock)
      .filter(([, v]) => asStr(v).trim())
      .map(([k, v]) => `- ${k.replace(/_/g, " ")}: ${asStr(v)}`)
      .join("\n") || "- none recorded in the document";
    const advised = arr(factsObj.therapies_advised).map(asStr).filter(Boolean);

    const userContent = [
      `FACTS (from discharge documents):\n${JSON.stringify(factsRow.facts)}`,
      `DOCUMENTED DEFICITS — every one of these needs work scheduled for it:\n${deficits}`,
      `THERAPIES THE DOCUMENT ADVISES: ${advised.length ? advised.join(", ") : "none named — decide from the deficits above"}`,
      `DOCTOR INSTRUCTIONS:\n- Expected milestone: ${asStr(intake?.milestone_goal)} (by ${asStr(intake?.milestone_by)})\n- Monitor more closely: ${asStr(intake?.monitor_focus)}\n- Non-negotiable boundaries: ${asStr(intake?.non_negotiables)}`,
      `ENABLED MONITORING MODULES (context): ${enabled.join(", ")}`,
    ].join("\n\n");

    const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model, temperature: 0.2, max_tokens: 8000, response_format: { type: "json_object" },
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
      missing: [
        ...arr(ai.missing).map(asStr).filter(Boolean),
        // A documented deficit with nothing scheduled becomes an explicit question
        // rather than a silent omission.
        ...coverageGaps(fnBlock, [...arr(ai.therapy_tasks), ...arr(ai.daily_tasks), ...arr(ai.wound_care)] as Record<string, unknown>[]),
      ],
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
