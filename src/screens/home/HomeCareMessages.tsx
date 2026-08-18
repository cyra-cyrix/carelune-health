import { useEffect, useState } from "react";
import {
  raiseApproval, getPatientQueries, getQueryReplies,
  type ApprovalRow, type QueryMessageRow,
} from "../../lib/db";
import { useBranding } from "../../branding/BrandingProvider";
import { useHc, HcIcon, HOUSEHOLD_LABEL, useSubmit } from "./hc-kit";
import { EmergencyBlock, NotAnEmergencyLine } from "./hc-safety";
import { TabHead } from "./HomeCareMedicines";

/* ============================================================================
   Messages — raise a concern, and see what happened to the ones already raised.

   Backend is unchanged: every concern is one `patient_query` row written through
   the existing `raiseApproval`, and the thread is read back through
   `getPatientQueries` + `getQueryReplies`. There is no new notification, routing
   or escalation machinery here — the concern lands in the inbox the nurse and
   doctor screens already read.

   The plain-language category is carried inside the message the care team reads
   (there is no category column, and this stage changes no schema), so the doctor
   sees exactly the words the family chose.
   ========================================================================== */

const CATEGORIES = [
  "Pain or discomfort",
  "Breathing",
  "Wound or skin",
  "Medicine question",
  "Eating or swallowing",
  "Movement or exercise",
  "Mood or sleep",
  "Something else",
];

/** Plain words for the two urgencies the backend stores. */
const URGENCY: { key: "routine" | "urgent"; label: string; help: string }[] = [
  { key: "routine", label: "It can wait", help: "Answered in the team’s working hours." },
  { key: "urgent", label: "Needs attention today", help: "Flagged urgent in the care team’s inbox." },
];

export function HomeCareMessages() {
  const { patient, role } = useHc();
  const { profile, org } = useBranding();
  const [category, setCategory] = useState("");
  const [note, setNote] = useState("");
  const [urgency, setUrgency] = useState<"routine" | "urgent">("routine");
  const [history, setHistory] = useState<ApprovalRow[]>([]);
  const [replies, setReplies] = useState<QueryMessageRow[]>([]);
  const [justSent, setJustSent] = useState<{ category: string; urgency: "routine" | "urgent" } | null>(null);
  const send = useSubmit(0);

  const hours = org?.service_hours?.trim();
  const who = profile?.full_name?.trim() || HOUSEHOLD_LABEL[role];

  const load = async () => {
    const [rows, reps] = await Promise.all([
      getPatientQueries(patient.id).catch(() => [] as ApprovalRow[]),
      getQueryReplies(patient.id).catch(() => [] as QueryMessageRow[]),
    ]);
    setHistory(rows);
    setReplies(reps);
  };

  useEffect(() => {
    void load();
    const onVisible = () => document.visibilityState === "visible" && void load();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patient.id]);

  const canSend = note.trim().length > 0 && category !== "";

  const submit = () => send.run(async () => {
    // One concern = one row. The category leads the message so the care team
    // reads the family's own words before the detail.
    await raiseApproval(patient.id, {
      type: "patient_query",
      message: `${category}: ${note.trim()}`,
      urgency,
      from_name: who,
    });
    setJustSent({ category, urgency });
    setCategory("");
    setNote("");
    setUrgency("routine");
    await load();
    return true;
  });

  return (
    <div style={{ paddingTop: 8 }}>
      <TabHead title="Messages" sub="Raise a concern, or read what the care team has replied." />

      {justSent ? (
        <SubmittedReceipt
          category={justSent.category}
          urgent={justSent.urgency === "urgent"}
          hours={hours}
          onAnother={() => setJustSent(null)}
        />
      ) : (
        <section className="hc-card" aria-labelledby="concern-title">
          <h3 id="concern-title">Raise a concern</h3>
          <p className="hc-muted" style={{ padding: "3px 0 0" }}>Tell the care team what you have noticed at home.</p>

          <div className="hc-field">
            <div className="hc-lab"><b>What is it about?</b></div>
            <div className="hc-choices">
              {CATEGORIES.map((c) => (
                <button key={c} type="button" className={`hc-choice${category === c ? " on" : ""}`}
                  aria-pressed={category === c} onClick={() => setCategory(category === c ? "" : c)}>{c}</button>
              ))}
            </div>
          </div>

          <div className="hc-field">
            <div className="hc-lab"><b>What have you noticed?</b></div>
            <textarea
              className="hc-textarea"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. His left leg looks more swollen than yesterday."
              aria-label="What have you noticed?"
            />
          </div>

          <div className="hc-field">
            <div className="hc-lab"><b>How soon does it need attention?</b></div>
            <div className="hc-choices">
              {URGENCY.map((u) => (
                <button key={u.key} type="button" className={`hc-choice${urgency === u.key ? " on" : ""}`}
                  aria-pressed={urgency === u.key} onClick={() => setUrgency(u.key)}>{u.label}</button>
              ))}
            </div>
            <p className="hc-muted" style={{ padding: "7px 0 0" }}>{URGENCY.find((u) => u.key === urgency)?.help}</p>
          </div>

          <NotAnEmergencyLine />

          {send.state === "error" && (
            <p className="hc-save-error" role="alert">Couldn&rsquo;t send it. Your words are still here — tap Try again.</p>
          )}
          <button type="button" className="hc-save" onClick={submit} disabled={!canSend || send.state === "saving"}>
            {send.state === "saving" ? "Sending…" : send.state === "error" ? "Try again" : "Send to the care team"}
          </button>
        </section>
      )}

      <EmergencyBlock />

      {history.length > 0 && (
        <section aria-labelledby="concern-history-title">
          <div className="hc-mgrp-head">
            <span className="mg-label" id="concern-history-title">What you have raised</span>
            <span className="mg-count">{history.length}</span>
          </div>
          <div className="hc-lgroup">
            {history.map((q) => (
              <ConcernRow key={q.id} query={q} thread={replies.filter((r) => r.query_id === q.id)} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/* ------------------------- after a concern is sent ------------------------ */

/** What happened, who has it, and what happens next — the three things a family
 *  needs after pressing send. No promise of a response time we cannot keep. */
function SubmittedReceipt({ category, urgent, hours, onAnother }: {
  category: string; urgent: boolean; hours?: string; onAnother: () => void;
}) {
  return (
    <section className="hc-receipt" aria-labelledby="concern-sent-title">
      <span className="hc-complete-icon"><HcIcon.Check size={20} /></span>
      <div>
        <b id="concern-sent-title">Your concern has been sent</b>
        <dl className="hc-receipt-list">
          <div><dt>Status</dt><dd>Waiting for the care team{urgent ? " · marked urgent" : ""}</dd></div>
          <div><dt>Who has it</dt><dd>The nursing and coordination team, who involve a doctor if a clinical decision is needed</dd></div>
          <div><dt>What happens next</dt><dd>{hours ? `They read messages during ${hours} and reply here.` : "They reply here, and you will see it in this list."}</dd></div>
          <div><dt>About</dt><dd>{category}</dd></div>
        </dl>
        <button type="button" className="hc-help-link" onClick={onAnother}>Raise another concern</button>
      </div>
    </section>
  );
}

/* ----------------------------- concern history ---------------------------- */

const REPLY_ROLE: Record<string, string> = {
  nurse: "Nurse",
  pmr: "Doctor",
  duty_doctor: "Duty doctor",
  caregiver: "Caregiver",
  family: "Family",
};

function concernStatus(q: ApprovalRow, replied: boolean): string {
  if (replied) return "Replied";
  if (q.read_at) return "Seen by the care team";
  if (q.status === "pending") return "Waiting for the care team";
  return "Reviewed by the care team";
}

function ConcernRow({ query, thread }: { query: ApprovalRow; thread: QueryMessageRow[] }) {
  const status = concernStatus(query, thread.length > 0);
  return (
    <div className="hc-lrow-wrap">
      <div className="hc-concern">
        <div className="hc-concern-head">
          <b>{query.message}</b>
          {query.urgency === "urgent" && <span className="hc-tag prn">Urgent</span>}
        </div>
        {thread.length > 0 && (
          <ul className="hc-concern-thread">
            {thread.map((m) => (
              <li key={m.id}>
                <span>{REPLY_ROLE[m.author_role ?? ""] ?? "Care team"}</span>
                <p>{m.body}</p>
              </li>
            ))}
          </ul>
        )}
        <div className="hc-concern-foot">
          <span className={thread.length > 0 ? "replied" : ""}>{status}</span>
          <time dateTime={query.created_at}>{shortDate(query.created_at)}</time>
        </div>
      </div>
    </div>
  );
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}
