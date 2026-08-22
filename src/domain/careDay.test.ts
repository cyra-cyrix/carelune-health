import { describe, expect, it } from "vitest";
import {
  acknowledgementFor, buildCareDay, routinesFrom, summariseDays,
  type CareEventRow, type OccurrenceRow,
} from "./careDay";

/** 22 August 2026, 14:00 local. Every assertion below is relative to this. */
const NOW = new Date("2026-08-22T14:00:00");
const at = (hhmm: string) => `2026-08-22T${hhmm}:00`;

const occ = (patch: Partial<OccurrenceRow> & { id: string; due_at: string }): OccurrenceRow => ({
  activity_key: patch.id,
  activity_type: "task",
  definition_snapshot: { key: patch.id, activity_type: "task", title: `Activity ${patch.id}` },
  window_end: null,
  local_date: "2026-08-22",
  display_group: "morning",
  status: "pending",
  resolved_by_event_id: null,
  ...patch,
});

const ev = (patch: Partial<CareEventRow> & { id: string }): CareEventRow => ({
  occurrence_id: null,
  activity_key: "pain",
  activity_type: "symptom",
  label_snapshot: "Pain",
  occurred_at: at("11:12"),
  local_date: "2026-08-22",
  outcome: "recorded",
  payload: {},
  note: null,
  entry_mode: "quick",
  acknowledgement_state: "recorded",
  shared_with_care_team: false,
  ...patch,
});

describe("the day", () => {
  const occurrences = [
    occ({ id: "meds", due_at: at("09:00"), display_group: "morning", status: "done", resolved_by_event_id: "e1" }),
    occ({ id: "bp", due_at: at("08:00"), display_group: "morning", status: "missed" }),
    occ({ id: "feed", due_at: at("13:00"), display_group: "afternoon" }),
    occ({ id: "physio", due_at: at("10:00"), display_group: "morning" }),
    occ({ id: "evening_meds", due_at: at("21:00"), display_group: "night" }),
  ];
  const events = [
    ev({ id: "e1", occurrence_id: "meds", activity_key: "meds", label_snapshot: "Morning medicines", outcome: "done", entry_mode: "scheduled" }),
    ev({ id: "e2" }),
  ];
  const day = buildCareDay(occurrences, events, NOW);

  it("puts what is due around now in NOW", () => {
    // 13:00 is 60 minutes ago — inside the 90-minute window either side.
    expect(day.now.map((i) => i.activityKey)).toEqual(["feed"]);
  });

  it("puts what is still open from earlier in unresolved, oldest first", () => {
    expect(day.unresolved.map((i) => i.activityKey)).toEqual(["bp", "physio"]);
  });

  it("puts what has been recorded in completed", () => {
    expect(day.completed.map((i) => i.activityKey)).toEqual(["meds"]);
  });

  it("puts what is still to come in next", () => {
    expect(day.next.map((i) => i.activityKey)).toEqual(["evening_meds"]);
  });

  it("assigns every scheduled item to exactly one of the four", () => {
    const all = [...day.now, ...day.unresolved, ...day.completed, ...day.next].map((i) => i.activityKey);
    expect(all.slice().sort()).toEqual(occurrences.map((o) => o.activity_key).sort());
    expect(new Set(all).size).toBe(all.length);
  });

  it("groups the day for display without those groups meaning anything else", () => {
    expect(day.groups.map((g) => g.key)).toEqual(["morning", "afternoon", "night"]);
    expect(day.groups.find((g) => g.key === "morning")?.items).toHaveLength(3);
    expect(day.currentGroup).toBe("afternoon");
  });

  it("keeps an unscheduled record out of the scheduled timeline entirely", () => {
    expect(day.unscheduled.map((e) => e.id)).toEqual(["e2"]);
    expect(day.scheduledTotal).toBe(5);
    expect(day.scheduledRecorded).toBe(1);
    // The quick record is not an expectation, so it can never read as missed.
    expect([...day.now, ...day.unresolved, ...day.next].map((i) => i.activityKey)).not.toContain("pain");
  });

  it("shows the wording from the occurrence's own frozen definition", () => {
    expect(day.completed[0].title).toBe("Activity meds");
    expect(day.completed[0].event?.id).toBe("e1");
  });

  it("leaves out an expectation from a replaced programme version", () => {
    // Found on staging: approving version 2 left version 1's pending items in
    // place, and the family saw every activity twice.
    const withCancelled = buildCareDay(
      [
        occ({ id: "meds", due_at: at("09:00"), status: "pending" }),
        occ({ id: "meds_v1", activity_key: "meds", due_at: at("09:00"), status: "cancelled" }),
      ],
      [],
      NOW,
    );
    expect(withCancelled.scheduledTotal).toBe(1);
    expect([...withCancelled.now, ...withCancelled.unresolved, ...withCancelled.next]).toHaveLength(1);
    // And it is not silently counted as done either.
    expect(withCancelled.completed).toEqual([]);
  });

  it("reads an empty day without inventing anything", () => {
    const empty = buildCareDay([], [], NOW);
    expect(empty.now).toEqual([]);
    expect(empty.groups).toEqual([]);
    expect(empty.scheduledTotal).toBe(0);
  });
});

describe("acknowledgement", () => {
  it("is decided by the system from what is observably true", () => {
    expect(acknowledgementFor(ev({ id: "a", outcome: "done" }))).toBe("completed");
    expect(acknowledgementFor(ev({ id: "b", outcome: "partial" }))).toBe("completed");
    expect(acknowledgementFor(ev({ id: "c", outcome: "unable" }))).toBe("observe_again");
    expect(acknowledgementFor(ev({ id: "d", outcome: "skipped" }))).toBe("observe_again");
    expect(acknowledgementFor(ev({ id: "e", outcome: "recorded" }))).toBe("recorded");
    expect(acknowledgementFor(ev({ id: "f", outcome: "done", shared_with_care_team: true }))).toBe("shared_with_care_team");
    expect(acknowledgementFor(ev({ id: "g", acknowledgement_state: "care_team_replied" }))).toBe("care_team_replied");
  });

  it("never depends on the VALUE the patient recorded", () => {
    const mild = ev({ id: "h", activity_key: "pain", payload: { scale: 1 }, outcome: "recorded" });
    const severe = ev({ id: "i", activity_key: "pain", payload: { scale: 10 }, outcome: "recorded" });
    expect(acknowledgementFor(mild)).toBe(acknowledgementFor(severe));
  });
});

describe("journey continuity", () => {
  it("counts records per day rather than reporting elapsed time as progress", () => {
    const rows = summariseDays(
      [
        occ({ id: "a", due_at: at("09:00"), local_date: "2026-08-22", status: "done" }),
        occ({ id: "b", due_at: at("10:00"), local_date: "2026-08-22", status: "missed" }),
        occ({ id: "c", due_at: at("09:00"), local_date: "2026-08-21", status: "done" }),
        // A replaced version's unmet expectation counts towards nothing.
        occ({ id: "d", due_at: at("11:00"), local_date: "2026-08-22", status: "cancelled" }),
      ],
      [ev({ id: "e", local_date: "2026-08-22" })],
    );
    expect(rows[0]).toEqual({ localDate: "2026-08-22", scheduled: 2, recorded: 1, notRecorded: 1, unscheduled: 1 });
    expect(rows[1]).toEqual({ localDate: "2026-08-21", scheduled: 1, recorded: 1, notRecorded: 0, unscheduled: 0 });
  });

  it("lists the routines the household has actually kept, most recent first", () => {
    const routines = routinesFrom([
      ev({ id: "1", activity_key: "feed", label_snapshot: "Feed", occurred_at: at("08:00") }),
      ev({ id: "2", activity_key: "feed", label_snapshot: "Feed", occurred_at: at("13:00") }),
      ev({ id: "3", activity_key: "pain", label_snapshot: "Pain", occurred_at: at("11:00") }),
    ]);
    expect(routines.map((r) => [r.key, r.count])).toEqual([["feed", 2], ["pain", 1]]);
  });
});
