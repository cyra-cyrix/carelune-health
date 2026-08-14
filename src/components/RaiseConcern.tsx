import { useEffect, useRef, useState } from "react";
import {
  raiseApproval,
  getPatientQueries,
  getQueryReplies,
  transcribeAudio,
  getMyProfile,
  type ApprovalRow,
  type QueryMessageRow,
} from "../lib/db";

/**
 * Family / caregiver → care team: raise a concern or question, by typing or by
 * recording a short voice note (transcribed to text, which the person reviews
 * before sending). Each one becomes a `patient_query` the doctor sees in their
 * approvals inbox. Below the box, the person sees what they've already sent and
 * whether the team has looked at it. No clinical advice is given here.
 */
export default function RaiseConcern({ patientId }: { patientId: string }) {
  const [text, setText] = useState("");
  const [urgency, setUrgency] = useState<"routine" | "urgent">("routine");
  const [name, setName] = useState<string | null>(null);
  const [history, setHistory] = useState<ApprovalRow[]>([]);
  const [replies, setReplies] = useState<QueryMessageRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  // Voice state.
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const canRecord =
    typeof window !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia;

  const load = async () => {
    const [me, rows, reps] = await Promise.all([
      getMyProfile().catch(() => null),
      getPatientQueries(patientId).catch(() => [] as ApprovalRow[]),
      getQueryReplies(patientId).catch(() => [] as QueryMessageRow[]),
    ]);
    setName(me?.full_name ?? null);
    setHistory(rows);
    setReplies(reps);
  };

  useEffect(() => {
    void load();
    const onVis = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId]);

  const startRec = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setTranscribing(true);
        try {
          const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
          const b64 = await blobToBase64(blob);
          const transcript = await transcribeAudio(b64, blob.type);
          if (transcript) setText((prev) => (prev ? prev.trim() + " " : "") + transcript);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Could not transcribe the voice note.");
        } finally {
          setTranscribing(false);
        }
      };
      mr.start();
      recorderRef.current = mr;
      setRecording(true);
    } catch {
      setError("Microphone is unavailable or permission was denied. You can type your message instead.");
    }
  };

  const stopRec = () => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
  };

  const submit = async () => {
    const msg = text.trim();
    if (!msg) return;
    setBusy(true);
    setError(null);
    try {
      await raiseApproval(patientId, {
        type: "patient_query",
        message: msg,
        urgency,
        from_name: name ?? "Family",
      });
      setText("");
      setUrgency("routine");
      setSent(true);
      setTimeout(() => setSent(false), 2500);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl bg-white p-4 shadow-lift ring-1 ring-ink/[0.05]">
      <h2 className="font-display text-[15px] font-semibold text-ink">Ask the care team</h2>
      <p className="mt-0.5 text-[12.5px] leading-relaxed text-sage-600">
        Share a concern or a question. Type it, or record a short voice note and we&rsquo;ll turn it into text
        for you to check before sending.
      </p>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder="e.g. His left leg looks more swollen today — is that expected?"
        className="mt-3 w-full resize-y rounded-xl bg-white px-3.5 py-2.5 text-[14px] text-ink ring-1 ring-ink/10 placeholder:text-sage-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
      />

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {canRecord && (
          <button
            type="button"
            onClick={recording ? stopRec : startRec}
            disabled={transcribing || busy}
            className={`tap inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-semibold disabled:opacity-60 ${
              recording
                ? "bg-coral-600 text-white hover:bg-coral-500"
                : "border border-line text-ink hover:bg-mist-100"
            }`}
          >
            <MicIcon />
            {recording ? "Stop" : transcribing ? "Transcribing…" : "Record voice"}
          </button>
        )}
        {recording && (
          <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-coral-600">
            <span className="h-2 w-2 animate-pulse rounded-full bg-coral-600" /> Recording…
          </span>
        )}
        {transcribing && !recording && (
          <span className="text-[12px] font-medium text-sage-500">Turning your voice into text…</span>
        )}
      </div>

      {/* Urgency */}
      <div className="mt-3 flex items-center gap-2">
        <span className="text-[12px] font-semibold text-sage-600">Urgency</span>
        <div className="inline-flex rounded-full bg-mist-100 p-0.5 ring-1 ring-ink/[0.04]">
          {(["routine", "urgent"] as const).map((u) => (
            <button
              key={u}
              type="button"
              onClick={() => setUrgency(u)}
              className={`rounded-full px-3 py-1 text-[12px] font-semibold capitalize transition-colors ${
                urgency === u
                  ? u === "urgent"
                    ? "bg-coral-600 text-white"
                    : "bg-white text-ink shadow-sm"
                  : "text-sage-600"
              }`}
            >
              {u}
            </button>
          ))}
        </div>
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-sage-500">
        Not for emergencies. If this is an emergency, call 112 or 108 straight away.
      </p>

      {error && <p className="mt-2 text-[13px] text-coral-600">{error}</p>}

      <button
        type="button"
        onClick={submit}
        disabled={busy || transcribing || !text.trim()}
        className="tap mt-3 w-full rounded-xl bg-brand-600 py-2.5 text-[14px] font-semibold text-white hover:bg-brand-500 disabled:opacity-50"
      >
        {busy ? "Sending…" : sent ? "Sent ✓" : "Send to the care team"}
      </button>

      {/* What you've already asked */}
      {history.length > 0 && (
        <div className="mt-4 border-t border-line pt-3">
          <h3 className="text-[12px] font-semibold uppercase tracking-wide text-sage-500">Your messages</h3>
          <ul className="mt-2 space-y-2">
            {history.map((q) => {
              const thread = replies.filter((r) => r.query_id === q.id);
              const st = queryStatus(q, thread.length > 0);
              return (
                <li key={q.id} className="rounded-xl bg-mist-100 p-3 ring-1 ring-ink/[0.04]">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 whitespace-pre-line text-[13px] leading-relaxed text-ink">{q.message}</p>
                    {q.urgency === "urgent" && (
                      <span className="shrink-0 rounded-full bg-coral-100 px-2 py-0.5 text-[10px] font-semibold text-coral-600">
                        Urgent
                      </span>
                    )}
                  </div>
                  {thread.length > 0 && (
                    <ul className="mt-2 space-y-1.5 border-l-2 border-brand-100 pl-2.5">
                      {thread.map((m) => (
                        <li key={m.id}>
                          <span className="text-[11px] font-semibold text-brand-700">{REPLY_ROLE[m.author_role ?? ""] ?? "Care team"}</span>
                          <p className="whitespace-pre-line text-[12.5px] leading-relaxed text-ink">{m.body}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    <span className={`text-[11px] font-semibold ${st.cls}`}>{st.label}</span>
                    <span className="text-[11px] text-sage-500">{niceDate(q.created_at)}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}

const REPLY_ROLE: Record<string, string> = {
  nurse: "Nurse",
  pmr: "Doctor",
  duty_doctor: "Duty Doctor",
  caregiver: "Caregiver",
  family: "Family",
};

function queryStatus(q: ApprovalRow, replied: boolean): { label: string; cls: string } {
  if (replied) return { label: "Replied", cls: "text-good-600" };
  if (q.status === "pending") return { label: "Awaiting the care team", cls: "text-warn-600" };
  return { label: "Reviewed by the care team", cls: "text-good-600" };
}

function niceDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function MicIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="9" y="3" width="6" height="12" rx="3" fill="currentColor" />
      <path
        d="M5 11a7 7 0 0 0 14 0M12 18v3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
