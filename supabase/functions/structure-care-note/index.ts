// Supabase Edge Function: structure-care-note
// ---------------------------------------------------------------------------
// Turns what a caregiver said into a CANDIDATE entry they confirm.
//
// "She vomited twice after lunch" becomes a proposal: the Vomiting activity,
// episodes 2, around 2:30 PM — shown back, edited or confirmed, and only then
// recorded. Nothing here writes anything.
//
// WHAT IT MAY AND MAY NOT DO
// --------------------------
// It may only choose an activity that is ALREADY in this patient's own approved
// programme, and may only fill fields that activity's own `input_schema`
// declares. A key it invents is discarded; a field the schema does not have is
// discarded; a choice outside the configured options is discarded. So the worst
// a bad reply can do is propose nothing.
//
// It must not diagnose, must not name a medicine or a dose, and must not decide
// urgency. There is no field for any of those, and the caller shows the
// candidate to a human before it becomes a record.
//
// Auth: any account that may see the patient — this is the household's own
// capture path, and the RPC that eventually records the event checks again.
// Secret: OPENAI_API_KEY (optional — no key means no candidate, and the caller
// keeps the words as words).
// Deploy:  supabase functions deploy structure-care-note --project-ref <ref>
// ---------------------------------------------------------------------------

import { createClient } from "jsr:@supabase/supabase-js@2";
import { validateCareActivities, type CareActivity } from "../_shared/careActivity.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } });

const SYSTEM_PROMPT = `You read one short thing a family member said about a patient at home, and match it to one of the care activities that patient's programme already defines.

You are proposing, not deciding. A person sees your proposal and confirms or corrects it before anything is recorded.

YOU WILL BE GIVEN
  * the activities available, each with its key, title and the fields it captures
  * what the person said
  * the current local time

RETURN VALID JSON ONLY, in exactly this shape:
{"activity_key":"...","values":{...},"occurred_at":"ISO timestamp or null","occurred_label":"short phrase or null","summary":["line","line"]}

RULES
  * activity_key MUST be one of the keys you were given. If nothing fits, return {"activity_key":null}.
  * values may only use the field keys of THAT activity. Match the declared type:
    a choice field takes one of its listed options exactly; a number takes a number;
    a scale takes a number in range; a boolean takes true/false; text takes a short phrase.
  * Leave a field out rather than guessing it. A partly-filled candidate a person completes
    is better than a confident wrong one.
  * occurred_at only where the words actually indicate a time ("after lunch", "this morning",
    "around 2:30"). Otherwise null. Never a future time.
  * summary is two or three plain lines a person can check at a glance, for example
    ["2 episodes","After lunch"]. No advice, no interpretation.

NEVER
  * name or suggest a medicine, a dose or a treatment
  * state, imply or rule out a diagnosis or a cause
  * say anything about urgency, severity, risk or what should be done
  * invent a value the words do not support`;

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Rebuild the reply using only fields the activity actually declares. */
function coerceValues(activity: CareActivity, raw: unknown): Record<string, unknown> {
  if (typeof raw !== "object" || raw === null) return {};
  const out: Record<string, unknown> = {};
  for (const field of activity.inputSchema) {
    const v = (raw as Record<string, unknown>)[field.key];
    if (v === undefined || v === null || v === "") continue;

    if (field.type === "choice") {
      if (typeof v === "string" && (field.options ?? []).includes(v)) out[field.key] = v;
      continue;
    }
    if (field.type === "multi_choice") {
      const list = (Array.isArray(v) ? v : [v])
        .filter((x): x is string => typeof x === "string" && (field.options ?? []).includes(x));
      if (list.length) out[field.key] = list;
      continue;
    }
    if (field.type === "boolean") {
      if (typeof v === "boolean") out[field.key] = v;
      continue;
    }
    if (field.type === "text") {
      const s = str(v);
      if (s) out[field.key] = s.slice(0, 400);
      continue;
    }
    if (field.type === "time") {
      if (typeof v === "string" && /^\d{1,2}:\d{2}$/.test(v.trim())) out[field.key] = v.trim();
      continue;
    }
    // number | integer | duration | scale
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n)) continue;
    if (field.min !== undefined && n < field.min) continue;
    if (field.max !== undefined && n > field.max) continue;
    out[field.key] = field.type === "integer" ? Math.round(n) : n;
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, service, { auth: { persistSession: false } });

    const jwt = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    if (!jwt) return json({ error: "Not signed in." }, 401);
    const { data: userRes } = await admin.auth.getUser(jwt);
    if (!userRes?.user) return json({ error: "Not signed in." }, 401);

    const body = await req.json().catch(() => ({}));
    const subscriptionId = str(body.subscription_id);
    const text = str(body.text).slice(0, 1000);
    if (!subscriptionId || !text) return json({ error: "Missing subscription_id or text." }, 400);

    // The patient's own approved programme, and that this caller may see them.
    const { data: prog } = await admin
      .from("patient_programmes")
      .select("patient_id, activities, quick_records")
      .eq("subscription_id", subscriptionId)
      .eq("status", "approved")
      .maybeSingle();
    if (!prog) return json({ candidate: null });

    const { data: member } = await admin
      .from("patient_members")
      .select("patient_id")
      .eq("patient_id", prog.patient_id)
      .eq("user_id", userRes.user.id)
      .maybeSingle();
    if (!member) {
      const { data: prof } = await admin
        .from("profiles").select("centre_id, role").eq("id", userRes.user.id).maybeSingle();
      const { data: pt } = await admin
        .from("patients").select("centre_id").eq("id", prog.patient_id).maybeSingle();
      const staff = prof && ["nurse", "duty_doctor", "pmr"].includes(String(prof.role));
      if (!staff || prof?.centre_id !== pt?.centre_id) {
        return json({ error: "That patient is not yours." }, 403);
      }
    }

    const check = validateCareActivities(prog.activities);
    if (!check.ok) return json({ candidate: null });

    // Only what the family can record ad hoc is offered as a candidate.
    const offered = check.activities.filter((a) => (prog.quick_records as string[]).includes(a.key));
    if (offered.length === 0) return json({ candidate: null });

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) return json({ candidate: null });

    const catalogue = offered.map((a) => ({
      key: a.key,
      title: a.title,
      fields: a.inputSchema.map((f) => ({
        key: f.key, label: f.label, type: f.type,
        ...(f.options ? { options: f.options } : {}),
        ...(f.min !== undefined ? { min: f.min } : {}),
        ...(f.max !== undefined ? { max: f.max } : {}),
      })),
    }));

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: Deno.env.get("OPENAI_MODEL") ?? "gpt-4o",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `ACTIVITIES AVAILABLE:\n${JSON.stringify(catalogue)}\n\nTHE CURRENT LOCAL TIME: ${
              str(body.now) || new Date().toISOString()
            }\n\nWHAT THEY SAID:\n${text}`,
          },
        ],
      }),
    });
    if (!res.ok) return json({ candidate: null });

    const payload = await res.json();
    const raw = JSON.parse(payload.choices?.[0]?.message?.content ?? "{}");

    const key = str(raw.activity_key);
    const activity = offered.find((a) => a.key === key);
    if (!activity) return json({ candidate: null });

    // A time is only accepted if it is real and not in the future.
    let occurredAt: string | null = null;
    if (raw.occurred_at) {
      const d = new Date(String(raw.occurred_at));
      if (!Number.isNaN(d.getTime()) && d.getTime() <= Date.now() + 60_000) occurredAt = d.toISOString();
    }

    const summary = (Array.isArray(raw.summary) ? raw.summary : [])
      .map((l: unknown) => str(l)).filter(Boolean).slice(0, 4);

    return json({
      candidate: {
        activity_key: activity.key,
        values: coerceValues(activity, raw.values),
        occurred_at: occurredAt,
        occurred_label: str(raw.occurred_label) || null,
        summary: summary.length ? summary : [activity.title],
      },
    });
  } catch (e) {
    // Structuring is a convenience. A failure returns no candidate rather than
    // an error, so the caller can still keep the words.
    return json({ candidate: null, note: e instanceof Error ? e.message : "unavailable" });
  }
});
