// Supabase Edge Function: extract-facts  (Stage A of governed plan generation)
// ---------------------------------------------------------------------------
// Extracts PATIENT-SPECIFIC facts from a discharge summary (free text) into a
// compact JSON structure, and caches them in patient_document_facts. This is run
// ONCE per patient's documents; generate-plan then combines these facts with the
// already-stored pathway structure — so the pathway is never resent to the model
// and each generation stays token-efficient.
//
// The model may ONLY copy what the documents state (every fact is provenance
// "document"); it must never invent diagnoses, medicines, doses or restrictions.
//
// Auth: caller must be clinical staff (verified via their own RLS self-read).
// Writes: uses service_role to upsert the cache after verifying the caller.
//
// Secret: OPENAI_API_KEY (already set). Optional OPENAI_MODEL.
// Deploy:  supabase functions deploy extract-facts --project-ref <ref>
// ---------------------------------------------------------------------------

import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } });

const SYSTEM_PROMPT = `You extract patient-specific facts from a hospital/rehab DISCHARGE SUMMARY for a post-discharge home-recovery programme in India.
Your ONLY job is to copy facts that are explicitly written. This is a safety task, not a writing task.

STRICT RULES:
- Use ONLY what the document states. Never invent, infer or "fill in" diagnoses, medicines, doses, frequencies, investigations, precautions or diets.
- Copy medicine name/dose/frequency/timing EXACTLY as written. Do not standardise or correct them.
- If something is not stated, omit it and add a short note to "missing". Do not guess.
- If the document states two contradictory things, list both and add a note to "conflicts".

Return ONLY JSON with this shape (every item's provenance is "document"):
{
  "diagnoses": [{"text": "…", "provenance": "document"}],
  "procedure": {"text": "…", "provenance": "document"} ,
  "medicines": [{"name":"…","dose":"…","freq":"…","timing":"…","note":"…","provenance":"document"}],
  "investigations": [{"text":"…","provenance":"document"}],
  "precautions": [{"text":"…","provenance":"document"}],
  "diet": [{"text":"…","provenance":"document"}],
  "baseline_function": "one short phrase on function at discharge, if stated, else empty",
  "dates": {"discharged_on":"YYYY-MM-DD or empty","surgery_on":"YYYY-MM-DD or empty"},
  "missing": ["short note on each important item NOT stated"],
  "conflicts": ["short note on each contradiction found"]
}
Output valid JSON only, no prose. If "procedure" is not stated, set it to null.`;

const asStr = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
const arr = (v: unknown) => (Array.isArray(v) ? v : []);
const fact = (t: unknown) => ({ text: asStr((t as Record<string, unknown>)?.text ?? t), provenance: "document" as const });

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
    if (!prof || !["nurse", "duty_doctor", "pmr"].includes(prof.role)) {
      return json({ error: "Only clinical staff can extract facts." }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const patientId = String(body.patient_id ?? "");
    const dischargeText = String(body.discharge_text ?? "").trim();
    if (!patientId) return json({ error: "patient_id is required." }, 400);
    if (dischargeText.length < 20) return json({ error: "Paste the discharge summary text first." }, 400);

    const admin = createClient(url, service, { auth: { persistSession: false } });
    // Confirm the caller can see this patient (same institution) before doing anything.
    const { data: pat } = await admin.from("patients").select("id, centre_id").eq("id", patientId).maybeSingle();
    if (!pat || pat.centre_id !== prof.centre_id) return json({ error: "Patient not found for your institution." }, 404);

    // NOTE: discharge TEXT still contains PHI — not de-identified. Real-patient use
    // needs an OpenAI DPA / zero-retention endpoint + upstream redaction. See 0011 notes.
    const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model, temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `DISCHARGE SUMMARY:\n${dischargeText}` },
        ],
      }),
    });
    if (!aiRes.ok) return json({ error: `OpenAI error (${aiRes.status}): ${(await aiRes.text()).slice(0, 400)}` }, 502);
    const content = (await aiRes.json())?.choices?.[0]?.message?.content ?? "{}";
    let parsed: Record<string, unknown>;
    try { parsed = JSON.parse(content); } catch { return json({ error: "Model did not return valid JSON." }, 502); }

    // Defensive normalisation — force provenance "document" everywhere.
    const procedure = parsed.procedure && typeof parsed.procedure === "object"
      ? { text: asStr((parsed.procedure as Record<string, unknown>).text), provenance: "document" as const }
      : null;
    const facts = {
      diagnoses: arr(parsed.diagnoses).map(fact).filter((d) => d.text),
      procedure: procedure && procedure.text ? procedure : null,
      medicines: arr(parsed.medicines).map((m) => {
        const o = (m ?? {}) as Record<string, unknown>;
        return { name: asStr(o.name), dose: asStr(o.dose), freq: asStr(o.freq), timing: asStr(o.timing), note: asStr(o.note), provenance: "document" as const };
      }).filter((m) => m.name),
      investigations: arr(parsed.investigations).map(fact).filter((d) => d.text),
      precautions: arr(parsed.precautions).map(fact).filter((d) => d.text),
      diet: arr(parsed.diet).map(fact).filter((d) => d.text),
      baseline_function: asStr(parsed.baseline_function),
      dates: {
        discharged_on: asStr((parsed.dates as Record<string, unknown>)?.discharged_on),
        surgery_on: asStr((parsed.dates as Record<string, unknown>)?.surgery_on),
      },
      missing: arr(parsed.missing).map(asStr).filter(Boolean),
      conflicts: arr(parsed.conflicts).map(asStr).filter(Boolean),
    };

    const { error: upErr } = await admin.from("patient_document_facts").upsert(
      { patient_id: patientId, centre_id: pat.centre_id, facts, model, created_by: user.id, created_at: new Date().toISOString() },
      { onConflict: "patient_id" },
    );
    if (upErr) return json({ error: `Could not cache facts: ${upErr.message}` }, 500);

    return json({ facts });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
