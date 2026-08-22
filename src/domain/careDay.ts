/*
 * One patient's day, assembled from what was expected and what happened.
 *
 * TODAY answers four questions and this module produces exactly those four
 * answers, in order:
 *
 *   NOW        what should be happening around this moment
 *   EARLIER    what is still unresolved from earlier today
 *   COMPLETED  what has already been recorded
 *   NEXT       what is coming
 *
 * Everything here is derived from `care_occurrences` (the expectation) and
 * `care_events` (the record). Nothing is inferred from the CONTENT of an answer:
 * a pain of 8 and a pain of 1 produce identical timelines, because what a value
 * means is a clinician's judgement and this module does not make it.
 *
 * Morning / Afternoon / Evening / Night are display grouping and nothing else.
 * They are read from the occurrence's own stored group, which the database
 * derived from the patient's local clock — so the client and the server never
 * disagree about which part of the day something belongs to.
 */
import {
  DISPLAY_GROUPS, DISPLAY_GROUP_LABEL, displayGroupForHour,
  type CareActivity, type DisplayGroup,
} from "./careActivityModel";

/* ---------------------------------- rows ---------------------------------- */

/** A materialised expectation, as the database stores it. */
export type OccurrenceRow = {
  id: string;
  activity_key: string;
  activity_type: string;
  definition_snapshot: unknown;
  due_at: string;
  window_end: string | null;
  local_date: string;
  display_group: DisplayGroup;
  status: "pending" | "done" | "partial" | "unable" | "skipped" | "missed" | "cancelled";
  resolved_by_event_id: string | null;
};

/** A record of something that happened. */
export type CareEventRow = {
  id: string;
  occurrence_id: string | null;
  activity_key: string;
  activity_type: string;
  label_snapshot: string;
  occurred_at: string;
  local_date: string;
  outcome: "done" | "partial" | "unable" | "skipped" | "recorded" | null;
  payload: Record<string, unknown>;
  note: string | null;
  entry_mode: "scheduled" | "quick" | "voice" | "text";
  acknowledgement_state: AcknowledgementState;
  shared_with_care_team: boolean;
};

/* ---------------------------- acknowledgement ----------------------------- */

/**
 * The governed states an entry may be in.
 *
 * The SYSTEM decides which one applies, from facts it can observe — was this
 * recorded, is it still expected, has the care team seen it. Wording may be
 * personalised; the STATE may not, and none of these says anything about how the
 * patient is doing. There is deliberately no "concerning", no "urgent" and no
 * "improving" here: those are clinical judgements.
 */
export const ACKNOWLEDGEMENT_STATES = [
  "recorded",
  "completed",
  "observe_again",
  "not_recorded",
  "shared_with_care_team",
  "care_team_replied",
] as const;
export type AcknowledgementState = (typeof ACKNOWLEDGEMENT_STATES)[number];

/** The neutral wording for each state. Factual, never congratulatory. */
export const ACKNOWLEDGEMENT_COPY: Record<AcknowledgementState, string> = {
  recorded: "Recorded",
  completed: "Completed",
  observe_again: "Noted — worth checking again",
  not_recorded: "Not recorded",
  shared_with_care_team: "Shared with your care team",
  care_team_replied: "Your care team replied",
};

/**
 * Which state an entry is in.
 *
 * Derived, in this order, from things that are true rather than things that are
 * judged: has the team replied, was it shared, was it completed, was it tried
 * and not possible, was it recorded at all.
 */
export function acknowledgementFor(event: CareEventRow): AcknowledgementState {
  if (event.acknowledgement_state === "care_team_replied") return "care_team_replied";
  if (event.shared_with_care_team) return "shared_with_care_team";
  if (event.outcome === "done" || event.outcome === "partial") return "completed";
  if (event.outcome === "unable" || event.outcome === "skipped") return "observe_again";
  return "recorded";
}

/* -------------------------------- timeline -------------------------------- */

export type TimelineState =
  | "due_now"
  | "upcoming"
  | "unresolved"
  | "completed"
  | "not_recorded";

export type TimelineItem = {
  occurrenceId: string;
  activityKey: string;
  activity: CareActivity | null;
  /** The wording to show, from the occurrence's own frozen definition. */
  title: string;
  activityType: string;
  dueAt: Date;
  /** "09:00" in the patient's local clock, as the schedule stated it. */
  timeLabel: string;
  displayGroup: DisplayGroup;
  state: TimelineState;
  /** The record that closed this expectation, if one did. */
  event: CareEventRow | null;
  outcome: OccurrenceRow["status"];
};

export type DayGroup = {
  key: DisplayGroup;
  label: string;
  items: TimelineItem[];
};

export type CareDay = {
  /** Which part of the day it is now, for the group navigation. */
  currentGroup: DisplayGroup;
  /** Everything scheduled today, grouped for display. */
  groups: DayGroup[];
  /** What should be happening around now — at most a handful. */
  now: TimelineItem[];
  /** Still unresolved from earlier today. */
  unresolved: TimelineItem[];
  /** Already recorded today. */
  completed: TimelineItem[];
  /** Still to come today. */
  next: TimelineItem[];
  /** Anything recorded today that answered no expectation (the centre "+"). */
  unscheduled: CareEventRow[];
  scheduledTotal: number;
  scheduledRecorded: number;
};

/** How wide "now" is, in minutes either side of this moment. */
const NOW_WINDOW_MINUTES = 90;

const timeOf = (d: Date) =>
  `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

function asActivity(snapshot: unknown): CareActivity | null {
  if (typeof snapshot !== "object" || snapshot === null) return null;
  const s = snapshot as Record<string, unknown>;
  if (typeof s.key !== "string") return null;
  // The snapshot is already validated configuration — it was validated before it
  // was ever stored. Reading it back is a cast, not a second validation pass.
  return {
    key: s.key,
    activityType: String(s.activity_type ?? "task") as CareActivity["activityType"],
    domain: typeof s.domain === "string" ? s.domain : "",
    title: typeof s.title === "string" ? s.title : s.key,
    instructions: typeof s.instructions === "string" ? s.instructions : "",
    schedule: null,
    inputSchema: Array.isArray(s.input_schema)
      ? (s.input_schema as CareActivity["inputSchema"])
      : [],
    basis: (typeof s.basis === "string" ? s.basis : "provider_default") as CareActivity["basis"],
    rationale: typeof s.rationale === "string" ? s.rationale : "",
    recordedBy: Array.isArray(s.recorded_by) ? (s.recorded_by as string[]) : [],
    medicationIds: Array.isArray(s.medication_ids) ? (s.medication_ids as string[]) : [],
  };
}

/**
 * Build the day.
 *
 * `now` is injected so the whole timeline is testable without waiting for a
 * particular hour to come around.
 */
export function buildCareDay(
  occurrences: OccurrenceRow[],
  events: CareEventRow[],
  now: Date = new Date(),
): CareDay {
  const eventById = new Map(events.map((e) => [e.id, e]));
  const eventByOccurrence = new Map(
    events.filter((e) => e.occurrence_id).map((e) => [e.occurrence_id as string, e]),
  );

  const nowMs = now.getTime();
  const windowMs = NOW_WINDOW_MINUTES * 60_000;

  const items: TimelineItem[] = occurrences
    // An expectation from a replaced programme version is not part of the day.
    .filter((o) => o.status !== "cancelled")
    .map((o) => {
      const dueAt = new Date(o.due_at);
      const activity = asActivity(o.definition_snapshot);
      const event =
        eventByOccurrence.get(o.id) ??
        (o.resolved_by_event_id ? eventById.get(o.resolved_by_event_id) ?? null : null);

      const recorded = o.status !== "pending" && o.status !== "missed";
      const state: TimelineState = recorded
        ? "completed"
        : o.status === "missed"
          ? "not_recorded"
          : Math.abs(dueAt.getTime() - nowMs) <= windowMs
            ? "due_now"
            : dueAt.getTime() < nowMs
              ? "unresolved"
              : "upcoming";

      return {
        occurrenceId: o.id,
        activityKey: o.activity_key,
        activity,
        title: activity?.title ?? o.activity_key,
        activityType: o.activity_type,
        dueAt,
        timeLabel: timeOf(dueAt),
        displayGroup: o.display_group,
        state,
        event,
        outcome: o.status,
      };
    })
    .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());

  const groups: DayGroup[] = DISPLAY_GROUPS.map((key) => ({
    key,
    label: DISPLAY_GROUP_LABEL[key],
    items: items.filter((i) => i.displayGroup === key),
  })).filter((g) => g.items.length > 0);

  return {
    currentGroup: displayGroupForHour(now.getHours()),
    groups,
    now: items.filter((i) => i.state === "due_now"),
    // Oldest first (items are already in due order): the thing that has been
    // waiting longest is the thing to deal with first.
    unresolved: items.filter((i) => i.state === "unresolved" || i.state === "not_recorded"),
    completed: items.filter((i) => i.state === "completed"),
    next: items.filter((i) => i.state === "upcoming"),
    unscheduled: events
      .filter((e) => e.occurrence_id === null)
      .sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime()),
    scheduledTotal: items.length,
    scheduledRecorded: items.filter((i) => i.state === "completed").length,
  };
}

/* --------------------------------- journey -------------------------------- */

export type DaySummary = {
  localDate: string;
  scheduled: number;
  recorded: number;
  notRecorded: number;
  unscheduled: number;
};

/**
 * Factual continuity for JOURNEY — how many expectations there were on each day
 * and how many were recorded.
 *
 * Deliberately NOT a percentage presented as clinical progress. It counts
 * records, which is a fact about the household's day, and says nothing about
 * recovery.
 */
export function summariseDays(
  occurrences: OccurrenceRow[],
  events: CareEventRow[],
): DaySummary[] {
  const byDate = new Map<string, DaySummary>();
  const ensure = (d: string) => {
    let row = byDate.get(d);
    if (!row) {
      row = { localDate: d, scheduled: 0, recorded: 0, notRecorded: 0, unscheduled: 0 };
      byDate.set(d, row);
    }
    return row;
  };

  for (const o of occurrences) {
    if (o.status === "cancelled") continue;
    const row = ensure(o.local_date);
    row.scheduled += 1;
    if (o.status === "done" || o.status === "partial") row.recorded += 1;
    else if (o.status === "missed") row.notRecorded += 1;
  }
  for (const e of events) {
    if (e.occurrence_id === null) ensure(e.local_date).unscheduled += 1;
  }

  return [...byDate.values()].sort((a, b) => (a.localDate < b.localDate ? 1 : -1));
}

/** Every distinct activity the patient has actually recorded, most recent first. */
export function routinesFrom(
  events: CareEventRow[],
): { key: string; label: string; count: number; latest: string }[] {
  const map = new Map<string, { key: string; label: string; count: number; latest: string }>();
  for (const e of events) {
    const row = map.get(e.activity_key);
    if (row) {
      row.count += 1;
      if (e.occurred_at > row.latest) row.latest = e.occurred_at;
    } else {
      map.set(e.activity_key, {
        key: e.activity_key,
        label: e.label_snapshot,
        count: 1,
        latest: e.occurred_at,
      });
    }
  }
  return [...map.values()].sort((a, b) => (a.latest < b.latest ? 1 : -1));
}
