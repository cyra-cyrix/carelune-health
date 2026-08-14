// Supabase Edge Function: structure-discharge
// ---------------------------------------------------------------------------
// Takes a discharge summary (free text) and asks OpenAI to RESTRUCTURE it into
// a draft care plan — diagnosis, a daily task plan, medicines and targets. The
// model is instructed to only reorganise what is written; it must never invent
// treatments, medicines, diagnoses or doses. The doctor reviews and approves
// everything on screen before anything is saved — this function writes nothing
// to the database.
//
// Auth: reads the caller's JWT and confirms they are clinical staff via their
// own RLS-scoped self-read, so the OpenAI key can't be used by outsiders.
//
// Secret to set (once):
//   supabase secrets set OPENAI_API_KEY=sk-...  --project-ref <ref>
//   (optional) supabase secrets set OPENAI_MODEL=gpt-4o
//
// Deploy:  supabase functions deploy structure-discharge --project-ref <ref>
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

const SYSTEM_PROMPT = `You are a careful medical scribe for a post-discharge home-recovery programme in India.
You are given a hospital/rehab DISCHARGE SUMMARY. Your only job is to RESTRUCTURE what is already written into a structured JSON care plan for the home care team.

STRICT RULES — these are safety rules, not preferences:
- Use ONLY information present in the discharge summary. Never invent, guess, or add diagnoses, medicines, doses, frequencies, exercises, diets or targets that are not stated.
- Do NOT change any medicine name, dose, frequency or timing. Copy them exactly as written.
- If a field is not stated in the summary, leave it as an empty string "" (or omit the item). Do not fill gaps with typical/standard values.
- Do NOT give new medical advice or progress the plan. You are reorganising, not treating.
- Convert the plan into simple daily tasks a family caregiver at home can follow.

Return ONLY a JSON object with exactly this shape:
{
  "summary": "one plain-language sentence describing the patient's situation at discharge",
  "diagnosis": ["short diagnosis string", "..."],
  "tasks": [
    { "time_label": "07:00", "discipline": "Physiotherapy | Nursing | Medication | Diet | Occupational therapy | Speech & swallow | General care",
      "title": "short caregiver-facing task", "detail": "how/precautions, from the summary or empty" }
  ],
  "medications": [
    { "name": "exact name", "dose": "e.g. 5 mg", "freq": "e.g. 1-0-1", "timing": "e.g. After food", "note": "from summary or empty" }
  ],
  "targets": [
    { "goal": "recovery goal stated or implied in the summary", "window": "e.g. By week 4 (only if stated), else empty" }
  ]
}
Use time_label in 24h HH:MM. Order tasks by time. Keep titles short. Output valid JSON only, no prose.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    const model = Deno.env.get("OPENAI_MODEL") ?? "gpt-4o";
    const authHeader = req.headers.get("Authorization") ?? "";

    if (!openaiKey) {
      return json({ error: "OpenAI key not set. Run: supabase secrets set OPENAI_API_KEY=sk-... " }, 500);
    }

    // Identify + authorise the caller (clinical staff only) via their own client.
    const caller = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const {
      data: { user },
      error: uErr,
    } = await caller.auth.getUser();
    if (uErr || !user) return json({ error: "Not authenticated" }, 401);

    const { data: prof, error: pErr } = await caller
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    if (pErr) return json({ error: `Profile read failed: ${pErr.message}` }, 500);
    if (!prof || !["nurse", "duty_doctor", "pmr"].includes(prof.role)) {
      return json({ error: "Only clinical staff can structure a discharge summary." }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const summaryText = String(body.discharge_text ?? "").trim();
    if (summaryText.length < 20) {
      return json({ error: "Paste the discharge summary text (at least a few lines) first." }, 400);
    }

    // PHI minimisation: send only the summary text to OpenAI, never the patient's name.
    const userContent = `DISCHARGE SUMMARY:\n${summaryText}`;

    const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text().catch(() => "");
      return json({ error: `OpenAI error (${aiRes.status}): ${errText.slice(0, 500)}` }, 502);
    }

    const aiJson = await aiRes.json();
    const content = aiJson?.choices?.[0]?.message?.content ?? "{}";

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(content);
    } catch {
      return json({ error: "The model did not return valid JSON. Please try again." }, 502);
    }

    // Defensive normalisation — never trust the shape blindly.
    const asStr = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
    const arr = (v: unknown) => (Array.isArray(v) ? v : []);

    const plan = {
      summary: asStr(parsed.summary),
      diagnosis: arr(parsed.diagnosis).map(asStr).filter(Boolean),
      tasks: arr(parsed.tasks)
        .map((t) => {
          const o = (t ?? {}) as Record<string, unknown>;
          return {
            time_label: asStr(o.time_label) || "08:00",
            discipline: asStr(o.discipline) || "General care",
            title: asStr(o.title),
            detail: asStr(o.detail),
          };
        })
        .filter((t) => t.title),
      medications: arr(parsed.medications)
        .map((m) => {
          const o = (m ?? {}) as Record<string, unknown>;
          return {
            name: asStr(o.name),
            dose: asStr(o.dose),
            freq: asStr(o.freq),
            timing: asStr(o.timing),
            note: asStr(o.note),
          };
        })
        .filter((m) => m.name),
      targets: arr(parsed.targets)
        .map((t) => {
          const o = (t ?? {}) as Record<string, unknown>;
          return { goal: asStr(o.goal), window: asStr(o.window) };
        })
        .filter((t) => t.goal),
    };

    return json({ plan });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
