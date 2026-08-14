import { useEffect, useState } from "react";
import {
  getPatientQueries,
  getQueryReplies,
  postQueryReply,
  type ApprovalRow,
  type QueryMessageRow,
} from "../lib/db";

/**
 * Staff view of family concerns/questions (patient_query) with the reply thread.
 * The NURSE is the first-level responder; the DOCTOR sees the same threads and
 * can intervene, especially on urgent ones. Both reply here (RLS allows nurse +
 * doctor to post). Urgent, still-unanswered messages float to the top.
 */
export default function ConcernInbox({ patientId }: { patientId: string }) {
  const [queries, setQueries] = useState<ApprovalRow[]>([]);
  const [replies, setReplies] = useState<QueryMessageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const [qs, rs] = await Promise.all([
      getPatientQueries(patientId).catch(() => [] as ApprovalRow[]),
      getQueryReplies(patientId).catch(() => [] as QueryMessageRow[]),
    ]);
    setQueries(qs);
    setReplies(rs);
    setLoading(false);
  };

  useEffect(() => {
    setLoading(true);
    void load().catch((e) => {
      setError(e instanceof Error ? e.message : "Could not load messages.");
      setLoading(false);
    });
    const onVis = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId]);

  // Urgent & unanswered first, then unanswered, then the rest — newest within each.
  const rank = (q: ApprovalRow) => (q.status === "pending" ? (q.urgency === "urgent" ? 0 : 1) : 2);
  const ordered = [...queries].sort(
    (a, b) => rank(a) - rank(b) || new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
  const open = queries.filter((q) => q.status === "pending").length;

  return (
    <section className="rounded-2xl bg-white p-5 shadow-lift ring-1 ring-ink/[0.05]">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-[16px] font-semibold text-ink">Messages from families</h2>
        <span
          className={`rounded-full px-2.5 py-1 text-[12px] font-semibold ${
            open > 0 ? "bg-coral-100 text-coral-600" : "bg-good-100 text-good-600"
          }`}
        >
          {open} to answer
        </span>
      </div>
      <p className="mt-0.5 text-[12.5px] text-sage-600">
        Reply to concerns and questions. Urgent ones are shown first — escalate serious issues to the doctor.
      </p>

      {error && <p className="mt-3 text-[13px] text-coral-600">{error}</p>}

      {loading ? (
        <div className="mt-4 h-24 animate-pulse rounded-xl bg-mist-200" />
      ) : ordered.length === 0 ? (
        <p className="mt-4 text-[13px] text-sage-500">No messages from families yet.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {ordered.map((q) => (
            <ConcernRow
              key={q.id}
              query={q}
              thread={replies.filter((r) => r.query_id === q.id)}
              patientId={patientId}
              onReplied={load}
            />
          ))}
        </ul>
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

function ConcernRow({
  query,
  thread,
  patientId,
  onReplied,
}: {
  query: ApprovalRow;
  thread: QueryMessageRow[];
  patientId: string;
  onReplied: () => Promise<void> | void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unanswered = query.status === "pending";

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    setBusy(true);
    setError(null);
    try {
      await postQueryReply(query.id, patientId, body);
      setText("");
      await onReplied();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send the reply.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <li
      className={`rounded-2xl p-3.5 ring-1 ${
        unanswered && query.urgency === "urgent" ? "bg-coral-100/40 ring-coral-500/20" : "bg-mist ring-ink/[0.05]"
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="text-[13px] font-semibold text-ink">{query.from_name ?? "Family"}</span>
        {query.urgency === "urgent" && (
          <span className="rounded-full bg-coral-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-coral-600">
            Urgent
          </span>
        )}
        <span className="ml-auto text-[11px] text-sage-500">{niceTime(query.created_at)}</span>
      </div>
      <p className="mt-1 whitespace-pre-line text-[13px] leading-relaxed text-sage-700">{query.message}</p>

      {thread.length > 0 && (
        <ul className="mt-2.5 space-y-1.5 border-l-2 border-brand-100 pl-3">
          {thread.map((m) => (
            <li key={m.id}>
              <span className="text-[11.5px] font-semibold text-brand-700">
                {REPLY_ROLE[m.author_role ?? ""] ?? "Care team"}
                {m.author_name ? ` · ${m.author_name}` : ""}
              </span>
              <p className="whitespace-pre-line text-[13px] leading-relaxed text-ink">{m.body}</p>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-2.5">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          placeholder={thread.length ? "Add a reply…" : "Reply to the family…"}
          className="w-full resize-y rounded-xl bg-white px-3 py-2 text-[13px] text-ink ring-1 ring-ink/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
        />
        {error && <p className="mt-1 text-[12px] text-coral-600">{error}</p>}
        <div className="mt-1.5 flex items-center gap-2">
          <button
            type="button"
            onClick={send}
            disabled={busy || !text.trim()}
            className="tap rounded-full bg-brand-600 px-4 py-1.5 text-[12px] font-semibold text-white hover:bg-brand-500 disabled:opacity-60"
          >
            {busy ? "Sending…" : "Send reply"}
          </button>
          <span className="text-[11px] font-medium text-sage-500">
            {unanswered ? "Awaiting a reply" : "Answered · the family can see it"}
          </span>
        </div>
      </div>
    </li>
  );
}

function niceTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}
