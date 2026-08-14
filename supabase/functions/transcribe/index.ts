// Supabase Edge Function: transcribe
// ---------------------------------------------------------------------------
// Turns a short voice note (recorded by a caregiver or family member on their
// phone) into text via OpenAI's audio transcription. It returns the transcript
// ONLY — it never submits anything. The person reads/edits the text and decides
// whether to send it as a concern or question. This keeps a human in the loop
// (AI transcribes; it does not act).
//
// Auth: any signed-in user (caregiver/family/staff) may transcribe their own
// voice note. We verify the caller's JWT so the OpenAI key can't be used by
// outsiders.
//
// Secret (already set for structure-discharge; reused here):
//   supabase secrets set OPENAI_API_KEY=sk-...  --project-ref <ref>
//   (optional) supabase secrets set OPENAI_TRANSCRIBE_MODEL=whisper-1
//
// Deploy:  supabase functions deploy transcribe --project-ref <ref>
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

// OpenAI detects the audio format from the filename extension, so map the
// browser's MIME type to a matching extension.
function extForMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes("webm")) return "webm";
  if (m.includes("mp4") || m.includes("m4a")) return "mp4";
  if (m.includes("mpeg") || m.includes("mp3")) return "mp3";
  if (m.includes("wav")) return "wav";
  if (m.includes("ogg")) return "ogg";
  return "webm";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    const model = Deno.env.get("OPENAI_TRANSCRIBE_MODEL") ?? "whisper-1";
    const authHeader = req.headers.get("Authorization") ?? "";

    if (!openaiKey) {
      return json({ error: "OpenAI key not set. Run: supabase secrets set OPENAI_API_KEY=sk-... " }, 500);
    }

    // Any authenticated user may transcribe their own voice note.
    const caller = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const {
      data: { user },
      error: uErr,
    } = await caller.auth.getUser();
    if (uErr || !user) return json({ error: "Not authenticated" }, 401);

    const body = await req.json().catch(() => ({}));
    const b64 = String(body.audio_base64 ?? "");
    const mime = String(body.mime ?? "audio/webm");
    if (!b64) return json({ error: "No audio was received." }, 400);

    // Decode base64 → bytes. Guard against oversized uploads (~10 MB).
    let bytes: Uint8Array;
    try {
      const bin = atob(b64);
      if (bin.length > 10_000_000) return json({ error: "Voice note is too long. Keep it under a minute." }, 413);
      bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    } catch {
      return json({ error: "Audio could not be decoded." }, 400);
    }
    if (bytes.length < 200) return json({ error: "The recording was empty. Please try again." }, 400);

    const form = new FormData();
    form.append("file", new Blob([bytes], { type: mime }), `voice.${extForMime(mime)}`);
    form.append("model", model);
    // Ask for plain text back.
    form.append("response_format", "text");

    const aiRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiKey}` },
      body: form,
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text().catch(() => "");
      return json({ error: `Transcription failed (${aiRes.status}): ${errText.slice(0, 300)}` }, 502);
    }

    const text = (await aiRes.text()).trim();
    return json({ text });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
