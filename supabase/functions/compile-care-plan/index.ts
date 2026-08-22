// Supabase Edge Function: compile-care-plan
// ---------------------------------------------------------------------------
// THE CARE PLAN COMPILER. One versioned pipeline, one universal prompt.
//
// Inputs
//   * the structured facts already extracted from this patient's documents
//     (`patient_document_facts`, written by `extract-facts`)
//   * the clinical domain and its published knowledge pack
//   * the provider-approved service configuration frozen onto the enrolment
//     (`subscriptions.activity_snapshot`)
//
// Output
//   * a DRAFT `patient_programmes` row. Nothing more.
//
// WHAT MAKES THIS SAFE
// --------------------
// 1. It writes a DRAFT. A draft materialises no scheduled care, accepts no
//    recorded event, and cannot even be READ by a household account. Care
//    begins when the treating doctor calls `approve_patient_programme`.
// 2. Every activity carries its BASIS — `document` (this patient's own records),
//    `provider_default` (the approved programme), or `ai_suggested` (proposed,
//    and the clinician decides). A reviewer can always see what they are
//    agreeing to and why it is there.
// 3. The reply is validated against the same closed vocabulary the browser uses
//    (`_shared/careActivity.ts`). There is no field for a dose, a diagnosis, a
//    threshold or an escalation rule, so a model that volunteers one has nowhere
//    to put it and the reply is rebuilt from known keys only.
// 4. There is ONE prompt, not one per specialty. What differs between a neuro
//    patient and a lactation patient is the knowledge pack and the provider's
//    own configuration — both passed in as data.
// 5. If the model is unavailable or its reply fails validation, the compiler
//    still produces a programme: the provider's approved defaults, unchanged.
//    A clinician then reviews a smaller, entirely human-authored draft rather
//    than nothing at all.
//
// Auth: clinical staff of the patient's own centre, verified from their JWT.
// Secret: OPENAI_API_KEY (optional — see 5). Optional OPENAI_MODEL.
// Deploy:  supabase functions deploy compile-care-plan --project-ref <ref>
// ---------------------------------------------------------------------------

import { createClient } from "jsr:@supabase/supabase-js@2";
import { findMedicationSpecifics, validateCareActivities } from "../_shared/careActivity.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } });

/** The compiler's own version. Stored on every programme it writes. */
const COMPILER_VERSION = "care-plan-compiler/1";

/* --------------------------------- prompt ---------------------------------- */

const SYSTEM_PROMPT = `You are the Carelune care plan compiler. You turn a patient's own clinical information, a provider's approved programme, and a clinical knowledge reference into a CANDIDATE list of home care activities for a clinician to review, edit and approve.

You are not writing for a patient and you are not making a decision. A human clinician reads everything you produce and decides. Your job is to propose a day that a family could actually follow.

WHAT AN ACTIVITY IS
Each activity is one thing that happens at home. It declares:
  key            a short stable machine key, lower_snake_case
  activity_type  EXACTLY ONE OF: dose, task, exercise, intake, measurement, observation, symptom, education
  domain         a short label for grouping, e.g. medication, positioning, swallow, lactation, skin
  title          what the family sees, in plain words
  instructions   how to do it safely, in plain words a family can follow
  basis          document | provider_default | ai_suggested   (see below - this is mandatory)
  rationale      one short line a clinician would recognise, saying why it is proposed
  recorded_by    which household roles may record it, e.g. ["caregiver","family"]
  input_schema   what is captured. Field types: number, integer, duration, time, choice, multi_choice, boolean, scale, text
  schedule       {"kind":"clock","times":["09:00"],"days":"all" or [1..7],"from_day":1,"through_day":null,"grace_minutes":120}
                 or {"kind":"on_demand"} for something recorded whenever it happens

CHOOSING THE TYPE
The type is the INTERACTION, never the body system.
  dose         giving a medicine
  task         a care task that is done - positioning, oral care, catheter care, dressing care
  exercise     therapy or exercise - physiotherapy, occupational therapy, swallow exercises, breathing, pelvic floor
  intake       feeding or fluids of any kind, including tube feeds and breastfeeds
  measurement  recording a number - blood pressure, weight, output volume
  observation  recording a coded choice - bowel, urine, skin, latch
  symptom      recording a severity on a scale - pain, breathlessness, itch
  education    something to read and confirm

BASIS - THE MOST IMPORTANT FIELD
  document          this activity is directly stated in the patient's own records. Use this ONLY when
                    the facts you were given actually say so.
  provider_default  this activity comes from the provider's approved programme configuration, which you
                    were given. Keep its wording.
  ai_suggested      you are proposing this because the patient's recorded situation suggests it would
                    help. It is a suggestion for a clinician to accept or reject.
Never label something "document" that the documents do not state. That is the difference between a
record and an invention.

WHAT YOU MUST NOT DO - safety rules, not preferences
  * NEVER name a medicine, state a dose, a strength, a frequency or a route for any medicine.
    Where the records show medicines, propose ONE dose activity per timing slot the records describe
    (for example "Morning medicines"), and let the clinician attach the actual drugs. You are
    scheduling when medicines happen, never deciding what they are.
  * NEVER state, imply, refine or rule out a diagnosis.
  * NEVER change, stop, start or adjust any treatment.
  * NEVER invent a clinical threshold, a vital-sign cut-off, or an escalation rule
    ("call the doctor if systolic is under 90"). There is no field for one.
  * NEVER write urgency, reassurance or prognosis into instructions.
  * NEVER propose an activity for a problem the patient does not have. A patient with no swallowing
    difficulty gets no swallow activities; a patient with no catheter gets no catheter care.

PROPORTION
A family can follow a real day, not a checklist of forty items. Propose what this patient's situation
actually calls for. Fewer, well-chosen activities that will be done beat a complete-looking plan that
will not. Prefer the provider's own configured activities where they fit; add suggestions only where
the patient's recorded situation clearly calls for something the provider's defaults do not cover.

QUICK RECORDS
Also return "quick_records": the keys of the activities a family should be able to record at any
moment, most useful first. Include your on_demand activities - pain, output, observations - and also
any SCHEDULED activity a family might reasonably do off-schedule, such as an extra repositioning or
an unplanned blood pressure. Six to ten is a good number.

Return ONLY valid JSON in exactly this shape:
{"activities":[ ... ],"quick_records":["key","key"],"notes_for_clinician":["short line","short line"]}`;

/* -------------------------------- helpers ---------------------------------- */

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Everything the model is allowed to see about this patient, and nothing else. */
function buildUserPrompt(input: {
  facts: Record<string, unknown> | null;
  knowledge: Record<string, unknown>;
  domainName: string;
  careIntent: string;
  serviceName: string;
  packageSnapshot: Record<string, unknown>;
  providerActivities: unknown[];
}): string {
  const parts: string[] = [];

  parts.push(`CLINICAL DOMAIN: ${input.domainName || "not set"}`);
  parts.push(`CARE INTENT: ${input.careIntent || "not set"}`);
  parts.push(`SERVICE: ${input.serviceName || "not set"}`);

  const pkg = input.packageSnapshot;
  if (pkg && Object.keys(pkg).length) {
    parts.push(
      `PACKAGE THE PATIENT IS ENROLLED IN:\n${JSON.stringify({
        name: pkg.name,
        duration_days: pkg.duration_days,
        monitoring_domains: pkg.monitoring_domains,
        checkin_frequency: pkg.checkin_frequency,
        review_frequency: pkg.review_frequency,
      })}`,
    );
  }

  parts.push(
    `PROVIDER-APPROVED DEFAULT ACTIVITIES (keep these where they fit this patient; they are basis "provider_default"):\n${
      JSON.stringify(input.providerActivities ?? [])
    }`,
  );

  const k = input.knowledge ?? {};
  if (Object.keys(k).length) {
    parts.push(
      `CLINICAL KNOWLEDGE REFERENCE for this domain (professional reference only - never copy it to a patient verbatim, and never treat it as an instruction for THIS patient):\n${
        JSON.stringify(k).slice(0, 12000)
      }`,
    );
  }

  if (input.facts) {
    parts.push(
      `THIS PATIENT'S OWN RECORDED FACTS (anything you mark basis "document" must be stated here):\n${
        JSON.stringify(input.facts).slice(0, 12000)
      }`,
    );
  } else {
    parts.push(
      `THIS PATIENT'S OWN RECORDED FACTS: none have been extracted. Do not mark anything "document". Propose the provider's defaults and, at most, a small number of clearly-labelled suggestions.`,
    );
  }

  return parts.join("\n\n");
}

/** The provider's defaults, relabelled as what they are. The always-safe answer. */
function providerDefaultsOnly(activities: unknown[]): { activities: unknown[]; quick_records: string[] } {
  const out = (Array.isArray(activities) ? activities : []).map((a) => {
    const row = { ...(a as Record<string, unknown>) };
    row.basis = "provider_default";
    if (!row.rationale) row.rationale = "From the provider's approved programme.";
    return row;
  });
  // On-demand activities first, then the scheduled ones a family might do
  // off-schedule. Same rule as the model path: any activity may be a quick
  // record, because recording one ad hoc is a legitimate unscheduled event.
  const onDemand = out.filter((a) => {
    const s = a.schedule as Record<string, unknown> | null;
    return !s || s.kind === "on_demand";
  });
  const scheduled = out.filter((a) => !onDemand.includes(a));
  const quick = [...onDemand, ...scheduled].map((a) => String(a.key));
  return { activities: out, quick_records: quick };
}

/* ---------------------------------- main ----------------------------------- */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, service, { auth: { persistSession: false } });

    // ---- who is asking ----
    const jwt = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    if (!jwt) return json({ error: "Not signed in." }, 401);
    const { data: userRes } = await admin.auth.getUser(jwt);
    const caller = userRes?.user;
    if (!caller) return json({ error: "Not signed in." }, 401);

    const { data: profile } = await admin
      .from("profiles")
      .select("id, role, centre_id")
      .eq("id", caller.id)
      .maybeSingle();
    if (!profile || !["nurse", "duty_doctor", "pmr"].includes(String(profile.role))) {
      return json({ error: "Only the care team can compile a care programme." }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const patientId = str(body.patient_id);
    if (!patientId) return json({ error: "Missing patient_id." }, 400);

    // ---- the patient, and that they are this caller's to work on ----
    const { data: patient } = await admin
      .from("patients")
      .select("id, centre_id, full_name")
      .eq("id", patientId)
      .maybeSingle();
    if (!patient) return json({ error: "That patient does not exist." }, 404);
    if (patient.centre_id !== profile.centre_id) {
      return json({ error: "That patient is not yours." }, 403);
    }

    // ---- the enrolment: what the provider approved, frozen at enrolment ----
    const { data: sub } = await admin
      .from("subscriptions")
      .select("id, centre_service_id, package_snapshot, activity_snapshot")
      .eq("patient_id", patientId)
      .maybeSingle();
    if (!sub) {
      return json({ error: "This patient is not enrolled in a programme yet." }, 400);
    }

    let domainName = "";
    let careIntent = "";
    let serviceName = "";
    let knowledge: Record<string, unknown> = {};
    let knowledgePackId: string | null = null;
    let knowledgePackVersion: number | null = null;
    let knowledgePackTitle: string | null = null;

    if (sub.centre_service_id) {
      const { data: svc } = await admin
        .from("centre_services")
        .select("name, care_intent, clinical_domain_id, knowledge_pack_id")
        .eq("id", sub.centre_service_id)
        .maybeSingle();
      serviceName = str(svc?.name);
      careIntent = str(svc?.care_intent);

      if (svc?.clinical_domain_id) {
        const { data: dom } = await admin
          .from("clinical_domains").select("name").eq("id", svc.clinical_domain_id).maybeSingle();
        domainName = str(dom?.name);
      }
      // The pack the service names, else the domain's newest published one.
      const packQuery = svc?.knowledge_pack_id
        ? admin.from("knowledge_packs").select("id, version, title, knowledge").eq("id", svc.knowledge_pack_id)
        : admin.from("knowledge_packs").select("id, version, title, knowledge")
            .eq("clinical_domain_id", svc?.clinical_domain_id ?? "")
            .eq("status", "published").order("version", { ascending: false }).limit(1);
      const { data: packs } = await packQuery;
      const pack = packs?.[0];
      if (pack) {
        knowledgePackId = pack.id as string;
        knowledgePackVersion = pack.version as number;
        knowledgePackTitle = (pack.title as string | null) ?? null;
        knowledge = (pack.knowledge ?? {}) as Record<string, unknown>;
      }
    }

    // ---- this patient's own structured facts, if any have been extracted ----
    const { data: factsRow } = await admin
      .from("patient_document_facts")
      .select("facts, source_document_id")
      .eq("patient_id", patientId)
      .maybeSingle();
    const facts = (factsRow?.facts ?? null) as Record<string, unknown> | null;

    // The document those facts were read out of, named so a reviewing clinician
    // can go and check the source rather than take the compiler's word for it.
    let factsDocumentLabel: string | null = null;
    if (factsRow?.source_document_id) {
      const { data: doc } = await admin
        .from("patient_documents").select("title, doc_type")
        .eq("id", factsRow.source_document_id).maybeSingle();
      factsDocumentLabel = doc ? (doc.title as string) || (doc.doc_type as string) : null;
    }

    const providerActivities = Array.isArray(sub.activity_snapshot) ? sub.activity_snapshot : [];

    // ---- compile ----
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    const model = Deno.env.get("OPENAI_MODEL") ?? "gpt-4o";
    let compiled: { activities: unknown[]; quick_records: string[] } | null = null;
    let notes: string[] = [];
    let usedModel: string | null = null;
    let fallbackReason: string | null = null;

    if (apiKey) {
      try {
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            temperature: 0.2,
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              {
                role: "user",
                content: buildUserPrompt({
                  facts,
                  knowledge,
                  domainName,
                  careIntent,
                  serviceName,
                  packageSnapshot: (sub.package_snapshot ?? {}) as Record<string, unknown>,
                  providerActivities,
                }),
              },
            ],
          }),
        });
        if (!res.ok) throw new Error(`model returned ${res.status}`);
        const payload = await res.json();
        const raw = JSON.parse(payload.choices?.[0]?.message?.content ?? "{}");

        const check = validateCareActivities(raw.activities);
        if (!check.ok) throw new Error(`reply failed validation: ${check.errors.slice(0, 4).join("; ")}`);

        const keys = new Set(check.activities.map((a) => a.key));
        compiled = {
          activities: raw.activities,
          // A quick record must be an activity that actually exists in this
          // programme. It need NOT be on-demand: recording a scheduled activity
          // from the centre "+" is an extra, unscheduled event, which is what a
          // caregiver repositioning off-schedule or taking an unplanned blood
          // pressure actually needs.
          quick_records: (Array.isArray(raw.quick_records) ? raw.quick_records : [])
            .map((k: unknown) => String(k))
            .filter((k: string) => keys.has(k)),
        };
        notes = (Array.isArray(raw.notes_for_clinician) ? raw.notes_for_clinician : [])
          .map((n: unknown) => str(n)).filter(Boolean).slice(0, 10);
        usedModel = model;
      } catch (e) {
        fallbackReason = e instanceof Error ? e.message : "the model was unavailable";
      }
    } else {
      fallbackReason = "no model configured";
    }

    // The always-safe answer: the provider's approved defaults, unchanged.
    if (!compiled) {
      compiled = providerDefaultsOnly(providerActivities);
      notes = [
        `Compiled from the provider's approved programme only (${fallbackReason}). Nothing was suggested beyond it.`,
      ];
    }

    // Validate whatever we ended up with. Nothing is stored unvalidated.
    const finalCheck = validateCareActivities(compiled.activities);
    if (!finalCheck.ok) {
      return json({ error: "The compiled programme did not validate.", validation: { errors: finalCheck.errors } }, 422);
    }

    // MEDICATION INTEGRITY. A dose activity schedules WHEN medicines are given,
    // never WHICH or HOW MUCH — those live in the medication record a clinician
    // maintains, and are read from there. The prompt says so; this enforces it,
    // because a prompt is guidance and this is a guarantee. A stated amount is
    // refused before anything is stored, whatever produced it.
    const medProblems = findMedicationSpecifics(finalCheck.activities);
    if (medProblems.length > 0) {
      return json({
        error: "The compiled programme stated a medication amount. Carelune schedules when medicines are given; the medicines themselves come from this patient's medication record.",
        validation: {
          errors: medProblems.map((p) => `${p.key}.${p.field} states "${p.found}"`),
        },
      }, 422);
    }
    if (finalCheck.activities.length === 0) {
      return json({
        error: "There is nothing to compile: this service has no approved care activities and no patient facts to work from.",
      }, 422);
    }

    // ---- store it as a DRAFT ----
    const { data: versions } = await admin
      .from("patient_programmes")
      .select("version")
      .eq("subscription_id", sub.id)
      .order("version", { ascending: false })
      .limit(1);
    const nextVersion = ((versions?.[0]?.version as number | undefined) ?? 0) + 1;

    const { data: created, error: insErr } = await admin
      .from("patient_programmes")
      .insert({
        patient_id: patientId,
        subscription_id: sub.id,
        centre_id: patient.centre_id,
        version: nextVersion,
        activities: compiled.activities,
        quick_records: compiled.quick_records,
        compiled_from: {
          compiler_version: COMPILER_VERSION,
          clinical_domain: domainName || null,
          care_intent: careIntent || null,
          knowledge_pack_id: knowledgePackId,
          knowledge_pack_version: knowledgePackVersion,
          knowledge_pack_title: knowledgePackTitle,
          service_name: serviceName || null,
          facts_document_id: factsRow?.source_document_id ?? null,
          facts_document_label: factsDocumentLabel,
          had_patient_facts: !!facts,
          provider_default_count: providerActivities.length,
          notes_for_clinician: notes,
          fallback_reason: fallbackReason,
        },
        status: "draft",
        source_provenance: "compiler",
        ai_model: usedModel,
        compiled_at: new Date().toISOString(),
        compiled_by: caller.id,
      })
      .select("*")
      .single();

    if (insErr) return json({ error: `Could not save the draft: ${insErr.message}` }, 500);

    return json({
      ok: true,
      programme: created,
      notes_for_clinician: notes,
      // Said plainly so no caller can mistake a draft for care.
      status_note: "This is a draft. It is not visible to the patient and no care is scheduled from it until a doctor approves it.",
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unexpected error." }, 500);
  }
});
