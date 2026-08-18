import type { PatientRow, PendingCount } from "../../lib/db";

/* ============================================================================
   The attention model behind the clinician caseload.

   Every patient sits in exactly one band, derived only from data the caseload
   has already loaded — pending approvals, unanswered family concerns, the
   recorded vital trend, and the registration status. Nothing is invented and no
   composite severity score exists: a band is a statement about what is waiting,
   not a claim about how ill somebody is.
   ========================================================================== */

export type Band = "decision" | "change" | "concern" | "stable";

/** The salient recorded trend for a patient, or null when none is computable. */
export type TrendSignal = {
  label: string;
  change: string;
  /** true improving, false worsening, null steady/unknown. */
  improving: boolean | null;
  /** Latest day the home team recorded anything (yyyy-mm-dd). */
  lastRecorded: string | null;
};

export type AttentionInput = {
  patient: PatientRow;
  /** Every pending approval for this patient (concerns included). */
  allPending: PendingCount;
  /** Unanswered family concerns only. */
  concerns: PendingCount;
  signal: TrendSignal | null;
  /** False for surfaces that do not show an approvals queue at all. */
  showPending: boolean;
  /** "family" = nurse view (messages only); "all" = clinician view. */
  countType: "all" | "family";
  /** Injected so the "last update" wording is testable. */
  now?: number;
};

export type Attention = {
  band: Band;
  /** Why this patient is surfaced at all. */
  reason: string;
  /** What changed since the clinician last looked. */
  changed: string;
  /** The single action waiting on the clinician. */
  action: string;
  urgent: boolean;
  lastUpdate: string;
  decisions: number;
  concerns: number;
};

export const BANDS: { key: Band; label: string; blurb: string }[] = [
  { key: "decision", label: "Needs decision", blurb: "Waiting on you before care can continue." },
  { key: "change", label: "Clinical change", blurb: "A recorded trend is moving the wrong way." },
  { key: "concern", label: "New concerns", blurb: "Raised from home and not yet answered." },
  { key: "stable", label: "Stable", blurb: "Progressing as expected — nothing waiting on you." },
];

/** "Last recorded today" / "…yesterday" / "…N days ago". */
export function lastUpdateLabel(iso: string | null, now = Date.now()): string {
  if (!iso) return "No readings recorded yet";
  // Calendar days apart, not elapsed hours: a reading taken this morning must
  // read "today" whether the clinician looks at 09:00 or at 23:00.
  const then = new Date(`${iso}T00:00:00`);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const days = Math.round((today.getTime() - then.getTime()) / 86_400_000);
  if (Number.isNaN(days)) return "No readings recorded yet";
  if (days <= 0) return "Last recorded today";
  if (days === 1) return "Last recorded yesterday";
  return `Last recorded ${days} days ago`;
}

export function deriveAttention(input: AttentionInput): Attention {
  const { patient, allPending, concerns: q, signal, showPending, countType, now = Date.now() } = input;

  const concerns = showPending ? q.pending : 0;
  const concernsUrgent = showPending ? q.urgent : 0;
  // The clinician view subtracts family concerns so "needs decision" means
  // clinical decisions, not unread messages. The nurse view has no decisions.
  const decisions = showPending && countType === "all" ? Math.max(0, allPending.pending - q.pending) : 0;
  const decisionsUrgent = showPending && countType === "all" ? Math.max(0, allPending.urgent - q.urgent) : 0;

  const isNew = patient.status === "pending";
  const isActive = patient.status === "active";
  const worsening = isActive && signal?.improving === false;

  const band: Band = isNew || decisions > 0 ? "decision"
    : worsening ? "change"
    : concerns > 0 ? "concern"
    : "stable";

  const reason = isNew ? "Registered and has no recovery plan yet"
    : decisions > 0 ? `${decisions} item${decisions === 1 ? "" : "s"} awaiting your decision`
    : worsening ? `${signal?.label} is trending the wrong way`
    : concerns > 0 ? `${concerns} concern${concerns === 1 ? "" : "s"} raised from home`
    : "Nothing waiting on you";

  const changed = isNew ? "New registration"
    : signal?.change
      ? `${signal.change}${signal.improving === true ? " · improving" : signal.improving === false ? " · watch" : " · steady"}`
      : "No trend recorded yet";

  const action = isNew ? "Build and activate the recovery plan"
    : decisions > 0 ? "Review and decide"
    : concerns > 0 ? (countType === "family" ? "Answer the family" : "Read and reply")
    : worsening ? "Review the trend"
    : "No action pending";

  return {
    band,
    reason,
    changed,
    action,
    urgent: decisionsUrgent > 0 || concernsUrgent > 0,
    lastUpdate: isNew ? "Not started" : lastUpdateLabel(signal?.lastRecorded ?? null, now),
    decisions,
    concerns,
  };
}
