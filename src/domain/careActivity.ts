/*
 * One factual answer to "is there current information about this patient?",
 * whichever product they are on.
 *
 * A recovery patient records through `daily_readings` and the existing
 * attention model decides what that means. A programme patient records through
 * `checkin_submissions`, and the attention model has never heard of them — so
 * without this they read as "No readings recorded yet" however diligently they
 * check in. That is the bug this closes, and the whole of what it closes.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO
 * ----------------------------------
 * It does not look at a single answer. Not the number, not the yes/no, not the
 * free text. A programme's questions carry no polarity and no thresholds — the
 * configuration says what to ask, never what an answer means — so "3" could be
 * good pain or bad rest, and "yes" could be reassuring or alarming depending on
 * the question. Turning that into "stable" or "deteriorating" would be the
 * platform inventing a clinical judgement it has no basis for. So this reports
 * ACTIVITY: something arrived, or it did not.
 *
 * The legacy attention band is passed through untouched. This wraps it; it
 * never rewrites it.
 */
import type { Attention } from "../screens/pmr/attention-model";
import { checkinExpectedOn } from "./checkin";

export type CareActivitySource = "legacy_recovery" | "programme_checkin";

export type CareActivityState =
  /** Recovery patient — the existing attention model speaks for them. */
  | "legacy"
  /** A programme check-in arrived today. */
  | "checkin_received"
  /** The cadence says one is due today and none has arrived. */
  | "checkin_expected"
  /** No check-in due today; one can still be sent. */
  | "checkin_available";

/** The latest programme check-in, as facts only. */
export type LatestCheckinFacts = {
  submitted_at: string;
  local_date: string;
  programme_day: number | null;
  programme_period_label: string | null;
  responses: number;
};

export type ProgrammeActivity = {
  programmeName: string | null;
  checkinFrequency: string | null;
  latest: LatestCheckinFacts | null;
};

export type CareActivity = {
  patientId: string;
  source: CareActivitySource;
  latestUpdateAt: string | null;
  latestUpdateLabel: string;
  /** null for a recovery patient — cadence is not a concept there. */
  expectedToday: boolean | null;
  submittedToday: boolean | null;
  responseCount: number | null;
  programmeName: string | null;
  programmeDay: number | null;
  programmePeriod: string | null;
  /** Only ever from the existing concern pathway — never inferred from answers. */
  hasExplicitPatientConcern: boolean;
  /** The existing model's output, unchanged. */
  attention: Attention;
  displayState: CareActivityState;
};

/** The local calendar day, the way a submission records it. */
export function localDateOf(now: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** Whole calendar days between two YYYY-MM-DD dates. */
function daysAgo(localDate: string, now: Date): number | null {
  const then = new Date(`${localDate}T00:00:00`);
  if (Number.isNaN(then.getTime())) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((today.getTime() - then.getTime()) / 86_400_000);
}

export function buildCareActivity(input: {
  patientId: string;
  attention: Attention;
  programme: ProgrammeActivity | null;
  /** Unanswered concerns raised through the existing pathway. */
  explicitConcerns: number;
  now?: Date;
}): CareActivity {
  const { patientId, attention, programme, explicitConcerns } = input;
  const now = input.now ?? new Date();
  const hasExplicitPatientConcern = explicitConcerns > 0;

  // Recovery: nothing about this patient changes. The existing model's own
  // wording is what the clinician keeps reading.
  if (!programme) {
    return {
      patientId,
      source: "legacy_recovery",
      latestUpdateAt: null,
      latestUpdateLabel: attention.lastUpdate,
      expectedToday: null,
      submittedToday: null,
      responseCount: null,
      programmeName: null,
      programmeDay: null,
      programmePeriod: null,
      hasExplicitPatientConcern,
      attention,
      displayState: "legacy",
    };
  }

  const latest = programme.latest;
  const submittedToday = !!latest && latest.local_date === localDateOf(now);
  const expectedToday = checkinExpectedOn(programme.checkinFrequency, now);

  let latestUpdateLabel: string;
  if (submittedToday) {
    latestUpdateLabel = "Check-in received today";
  } else if (!latest) {
    latestUpdateLabel = "No check-in yet";
  } else {
    const d = daysAgo(latest.local_date, now);
    latestUpdateLabel =
      d === null ? "Last check-in recorded"
      : d === 1 ? "Last check-in yesterday"
      : `Last check-in ${d} days ago`;
  }

  return {
    patientId,
    source: "programme_checkin",
    latestUpdateAt: latest?.submitted_at ?? null,
    latestUpdateLabel,
    expectedToday,
    submittedToday,
    responseCount: latest?.responses ?? null,
    programmeName: programme.programmeName,
    programmeDay: latest?.programme_day ?? null,
    programmePeriod: latest?.programme_period_label ?? null,
    hasExplicitPatientConcern,
    attention,
    // "expected" only where the cadence actually said so. Where it could not be
    // read, checkinExpectedOn errs towards offering one, and the wording stays
    // "available" — a patient is never told they missed something we inferred.
    displayState: submittedToday ? "checkin_received" : expectedToday ? "checkin_expected" : "checkin_available",
  };
}

/** The short factual line a caseload card shows for a programme patient. */
export function activityStatusLabel(a: CareActivity): string {
  if (a.source === "legacy_recovery") return a.attention.lastUpdate;
  if (a.displayState === "checkin_received") {
    return a.responseCount != null ? `Check-in received today · ${a.responseCount} responses` : "Check-in received today";
  }
  if (a.displayState === "checkin_expected") return `Check-in expected today · ${a.latestUpdateLabel.toLowerCase()}`;
  return `Check-in available · ${a.latestUpdateLabel.toLowerCase()}`;
}

/**
 * The neutral tag a programme patient's card carries.
 *
 * They are grouped by what is waiting on the clinician, and the quiet group is
 * called "Stable" — a word that reads as a clinical assessment. For a recovery
 * patient it is one: it rests on recorded vitals the attention model can see.
 * For a programme patient it would rest on nothing, because Phase 5 reads no
 * answer. So their card says what is actually known — an update arrived, or
 * nothing is waiting — and never claims their condition is stable.
 *
 * Returns null for a recovery patient: their card is unchanged.
 */
export function activityStateTag(a: CareActivity): string | null {
  if (a.source === "legacy_recovery") return null;
  return a.displayState === "checkin_received" ? "Update received" : "No action pending";
}

/**
 * The explanatory copy a programme patient's card shows.
 *
 * The attention model writes for the recovery product, in its language: a newly
 * registered patient is told to "Build and activate the recovery plan", and a
 * quiet one has "No trend recorded yet". Read on a dermatology or a
 * mother-and-baby patient, that is simply the wrong product talking — there is
 * no recovery plan to build and no vitals trend to record.
 *
 * So a programme patient's lines are derived here instead, from what is
 * genuinely known: work actually waiting on the clinician, and whether an
 * update arrived. `changed` is null because "what changed" in the recovery
 * sense — a moving vitals trend — has no counterpart yet, and inventing one
 * would be exactly the clinical inference this phase refuses to make.
 *
 * Returns null for a recovery patient: their card keeps the model's own words,
 * unchanged.
 */
export function activityCopy(a: CareActivity): { reason: string; changed: string | null; action: string } | null {
  if (a.source === "legacy_recovery") return null;

  const decisions = a.attention.decisions;
  const concerns = a.attention.concerns;
  const plural = (n: number) => (n === 1 ? "" : "s");

  const reason =
    decisions > 0 ? `${decisions} item${plural(decisions)} awaiting your decision`
    : concerns > 0 ? `${concerns} concern${plural(concerns)} raised from home`
    : a.displayState === "checkin_received" ? "Latest programme update received"
    : a.displayState === "checkin_expected" ? "Check-in expected today"
    : "No action pending";

  const action =
    decisions > 0 ? "Review and decide"
    : concerns > 0 ? "Answer the concern"
    : "No action pending";

  return { reason, changed: null, action };
}
