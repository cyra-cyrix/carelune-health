// Supabase Edge Function: analyse-provider-service
// ---------------------------------------------------------------------------
// Step 2 of the Super Admin service builder. Takes what the Super Admin typed
// about a care provider and returns a STRUCTURED, VALIDATED draft of the
// service(s) that provider runs, the packages a patient could be enrolled into,
// and a programme outline — for a human to read, edit and confirm.
//
// Nothing here is stored and nothing here is live. The reply is an AI DRAFT that
// the Super Admin confirms (Level 1) before `platform-admin` writes it, and that
// the provider's designated approver confirms (Level 2) before any patient can
// be enrolled. See docs/DECISIONS.md D-003.
//
// THE SCHEMA IS THE CLINICAL BOUNDARY
// -----------------------------------
// The validator below rebuilds the reply from known keys only. There is no field
// for a medicine, a dose, a diagnosis or an emergency threshold, so a model that
// volunteers one has nowhere to put it. This mirrors src/domain/serviceDraft.ts
// the way generate-plan mirrors src/lib/pathwayValidation.ts — change one,
// change both.
//
// Auth: Carelune Super Admin only, verified from the caller's own JWT.
// Secret: OPENAI_API_KEY. Optional OPENAI_MODEL.
// Deploy:  supabase functions deploy analyse-provider-service --project-ref <ref>
// ---------------------------------------------------------------------------

import { createClient } from "jsr:@supabase/supabase-js@2";
import { validateServiceDraft } from "../_shared/serviceDraft.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } });

/* --------------------------------- prompt ---------------------------------- */

const SYSTEM_PROMPT = `You are helping Carelune, a continuing-care platform, understand a healthcare provider and structure the continuing-care service that provider actually runs, so a human operator can review and confirm it.

The provider may be anything: a solo surgeon, a lactation consultant, a physiotherapy practice, a dermatology clinic, a rehabilitation centre, a hospital department, an allied-health practice. Read what you are given and describe THAT provider. Never assume a specialty that was not described, and never fall back on a generic post-surgical rehabilitation template when the provider does something else.

WHAT YOU MAY PROPOSE
  * a plain-language summary of what the provider does
  * one or more continuing-care services they run, each with who it is for, how a patient enters it, what it is trying to achieve, and when it ends
  * how long the service typically runs
  * the areas worth following at home (monitoring domains)
  * the questions a patient or family member would answer at home, in their own everyday words, each with a short reason a clinician would recognise
  * which professionals are typically involved
  * THREE OR MORE package options of different lengths and intensities
  * milestones, check-in schedules, and what each package includes
  * a period-by-period programme outline

WHAT YOU MUST NOT DO — these are safety rules, not preferences:
  * NEVER name, prescribe, adjust or stop a medication, and never state a dose
  * NEVER state or imply a diagnosis for any individual
  * NEVER invent clinical thresholds, vital-sign cut-offs or emergency criteria ("call if BP is under 90")
  * NEVER write text addressed to a patient as instruction or advice; the questions you write are questions, not guidance
  * NEVER claim the service is approved, published, active or clinically endorsed
  * Do not invent facts about this provider that you were not told. If something was not described, keep it general rather than inventing a detail.

Where you must generalise beyond what you were told, stay at the level of ordinary service design — how often someone checks in, what is worth following — not clinical management.

Everything you return is an AI DRAFT. A Carelune operator confirms it, and then the provider's own designated clinician confirms it, before any patient sees anything.

OUTPUT
Return JSON only, matching this shape exactly. No prose outside the JSON, no extra keys.

{
  "provider_summary": "2-4 sentences, plain language, describing this provider and who they follow",
  "suggested_services": [
    {
      "name": "short service name",
      "summary": "1-2 sentences on what this service does for a patient",
      "patient_type": "who this is for",
      "entry_point": "how a patient enters the service",
      "typical_duration_days": 84,
      "objective": "one sentence — what the service is trying to achieve",
      "end_condition": "one sentence — when the service is complete",
      "monitoring_domains": ["3-8 short area names"],
      "suggested_patient_inputs": [{ "label": "the question as the patient reads it", "reason": "why it is worth asking" }],
      "care_team_suggestions": ["professional roles typically involved"],
      "suggested_packages": [
        {
          "name": "package name",
          "positioning": "one line on who this option suits",
          "duration_days": 30,
          "monitoring_domains": ["areas followed in this package"],
          "checkin_frequency": "e.g. Daily, or Three times a week",
          "review_frequency": "e.g. Weekly review by the treating professional",
          "support_level": "what support is included",
          "includes": ["what the patient gets"],
          "milestones": ["what progress looks like"]
        }
      ],
      "programme_outline": [
        {
          "period_label": "e.g. Week 1, Weeks 2-4",
          "focus": "what this period is about",
          "checkin_frequency": "how often the patient checks in",
          "monitoring_domains": ["what is followed in this period"],
          "milestones": ["what should be true by the end of this period"]
        }
      ]
    }
  ]
}

Give at least 3 packages per service, of clearly different lengths, and order them from the shortest to the longest. The packages are a ladder a patient chooses from: as the duration grows, the support must grow with it, so the longest option is the most complete one and the shortest is the lightest. Never offer a long package with less support than a shorter one.

Every specific thing you were told the provider wants to keep track of must appear in that service's monitoring_domains. Do not drop one because it seems minor, and do not merge two distinct ones into a single vague area.

Give at least 2 outline periods where the service runs longer than a few weeks. Suggest a second service only when the provider clearly runs one.`;

/* --------------------------------- handler --------------------------------- */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";

    // Auth: the caller's own JWT, read through their own RLS-scoped self-read.
    const caller = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: uErr } = await caller.auth.getUser();
    if (uErr || !user) return json({ error: "Not authenticated" }, 401);

    const { data: prof, error: pErr } = await caller
      .from("profiles").select("is_super_admin").eq("id", user.id).maybeSingle();
    if (pErr) return json({ error: `Profile read failed: ${pErr.message}` }, 500);
    if (!prof?.is_super_admin) return json({ error: "Super admin only" }, 403);

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    const model = Deno.env.get("OPENAI_MODEL") ?? "gpt-4o";
    if (!openaiKey) return json({ error: "OpenAI key not set." }, 500);

    const body = await req.json().catch(() => ({}));
    const provider_name = String(body.provider_name ?? "").trim();
    const provider_type = String(body.provider_type ?? "").trim();
    const description = String(body.description ?? "").trim();
    const website = String(body.website ?? "").trim();
    const social = String(body.social ?? "").trim();
    const notes = String(body.notes ?? "").trim();
    // Text the operator pasted or a document produced. Carelune does not fetch
    // the website or social profile: no crawler exists, and inventing one here
    // would mean the model reasoning over content nobody reviewed.
    const source_text = String(body.source_text ?? "").trim().slice(0, 20000);

    if (!provider_name) return json({ error: "A provider name is required." }, 400);
    if (description.length < 20 && !source_text) {
      return json({ error: "Tell Carelune a little more about this provider before analysing — a sentence or two about who they follow and what they want to keep track of." }, 400);
    }

    const userContent = [
      `PROVIDER: ${provider_name}`,
      `PROVIDER TYPE: ${provider_type || "not stated"}`,
      `WHAT THE CARELUNE TEAM WAS TOLD:\n${description || "(nothing written)"}`,
      website || social
        ? `REFERENCES SUPPLIED (not fetched — do not assume their contents):${website ? `\n- website: ${website}` : ""}${social ? `\n- social: ${social}` : ""}`
        : "",
      notes ? `CARELUNE TEAM NOTES:\n${notes}` : "",
      source_text ? `SOURCE TEXT SUPPLIED BY THE CARELUNE TEAM:\n${source_text}` : "",
    ].filter(Boolean).join("\n\n");

    const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model, temperature: 0.3, max_tokens: 6000, response_format: { type: "json_object" },
        messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: userContent }],
      }),
    });
    if (!aiRes.ok) return json({ error: `OpenAI error (${aiRes.status}): ${(await aiRes.text()).slice(0, 400)}` }, 502);

    let parsed: unknown;
    try {
      const payload = await aiRes.json();
      // Development cost observability. Token counts only — no prompt, no reply,
      // no key. Server-side log; nothing is added to the response.
      const u = payload?.usage ?? {};
      console.log(`[analyse-provider-service] model=${model} prompt_tokens=${u.prompt_tokens ?? "?"} completion_tokens=${u.completion_tokens ?? "?"} total_tokens=${u.total_tokens ?? "?"}`);
      parsed = JSON.parse(payload?.choices?.[0]?.message?.content ?? "{}");
    } catch {
      return json({ error: "Carelune could not read the reply. Try again." }, 502);
    }

    const result = validateServiceDraft(parsed);
    if (!result.ok) {
      // Never return unvalidated model JSON, not even to help debugging.
      return json({ error: "The reply did not match the service structure Carelune can store.", details: result.errors.slice(0, 12) }, 502);
    }

    return json({
      draft: result.draft,
      provenance: { source: "ai_drafted", ai_model: model, drafted_at: new Date().toISOString() },
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
