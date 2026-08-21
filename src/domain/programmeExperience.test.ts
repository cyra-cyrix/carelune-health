import { describe, expect, it } from "vitest";
import { buildProgrammeExperience, daysBetween, parsePeriodLabel } from "./programmeExperience";
import { LACTATION_ENROLMENT, LEGACY_SUBSCRIPTION, SPINE_ENROLMENT } from "./enrolment.fixtures";
import type { SubscriptionRow } from "../lib/db";

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
/** Day 8 of Anand's programme (started 14 Aug). */
const DAY_8 = new Date("2026-08-21T09:00:00.000Z");

describe("parsePeriodLabel", () => {
  it("reads the week labels a model actually writes", () => {
    expect(parsePeriodLabel("Week 1")).toEqual({ fromDay: 1, toDay: 7 });
    expect(parsePeriodLabel("Weeks 2–4")).toEqual({ fromDay: 8, toDay: 28 });
    expect(parsePeriodLabel("Weeks 5-8")).toEqual({ fromDay: 29, toDay: 56 });
    expect(parsePeriodLabel("Weeks 9 to 12")).toEqual({ fromDay: 57, toDay: 84 });
  });

  it("reads day and month labels too", () => {
    expect(parsePeriodLabel("Days 1-14")).toEqual({ fromDay: 1, toDay: 14 });
    expect(parsePeriodLabel("Month 2")).toEqual({ fromDay: 31, toDay: 60 });
  });

  it("says so rather than guessing at a label it cannot read", () => {
    expect(parsePeriodLabel("Settling in")).toBeNull();
    expect(parsePeriodLabel("The first stretch")).toBeNull();
  });
});

describe("buildProgrammeExperience — the frozen enrolment", () => {
  it("places the patient in their programme", () => {
    const r = buildProgrammeExperience(SPINE_ENROLMENT, DAY_8);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.experience.currentDay).toBe(8);
    expect(r.experience.durationDays).toBe(60);
    expect(r.experience.packageName).toBe("Standard Recovery");
    expect(r.experience.programmeName).toBe("Post-operative Spine Recovery");
    expect(r.experience.percentComplete).toBe(13);
    expect(r.experience.finished).toBe(false);
  });

  it("works out which period today falls in", () => {
    const r = buildProgrammeExperience(SPINE_ENROLMENT, DAY_8);
    if (!r.ok) return;
    expect(r.experience.currentPeriod?.label).toBe("Weeks 2–4");
    expect(r.experience.currentPeriod?.focus).toBe("Building recovery");
    expect(r.experience.completedPeriods).toBe(1);
    expect(r.experience.nextPeriod?.label).toBe("Weeks 5–8");
    expect(r.experience.daysUntilNextPeriod).toBe(21);
  });

  it("runs the last period to the end of the programme", () => {
    const r = buildProgrammeExperience(SPINE_ENROLMENT, DAY_8);
    if (!r.ok) return;
    const last = r.experience.periods[r.experience.periods.length - 1];
    expect(last.toDay).toBe(60);
  });

  it("takes the areas and questions from the snapshot", () => {
    const r = buildProgrammeExperience(SPINE_ENROLMENT, DAY_8);
    if (!r.ok) return;
    expect(r.experience.monitoringAreas).toContain("Wound recovery");
    expect(r.experience.patientQuestions[0].label).toBe("How is your back or leg pain today?");
    expect(r.experience.checkinFrequency).toBe("Three times a week");
    expect(r.experience.includes).toContain("Wound photo review");
  });

  it("does the same for a completely different service", () => {
    const r = buildProgrammeExperience(LACTATION_ENROLMENT, DAY_8);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.experience.programmeName).toBe("Mother & Baby Postpartum Support");
    expect(r.experience.currentDay).toBe(22);
    expect(r.experience.currentPeriod?.focus).toBe("Settling into a rhythm");
    expect(r.experience.monitoringAreas).toContain("Baby feeding observations");
    expect(JSON.stringify(r.experience)).not.toMatch(/wound|spine/i);
  });

  it("clamps a patient who has run past the end", () => {
    const r = buildProgrammeExperience(SPINE_ENROLMENT, new Date("2027-01-01T00:00:00.000Z"));
    if (!r.ok) return;
    expect(r.experience.currentDay).toBe(60);
    expect(r.experience.finished).toBe(true);
    expect(r.experience.percentComplete).toBe(100);
  });

  it("falls back to an even split when the labels cannot be read", () => {
    const sub = clone(SPINE_ENROLMENT);
    sub.programme_config_snapshot!.programme_outline = [
      { period_label: "Settling in", focus: "a", checkin_frequency: "", monitoring_domains: [], milestones: [] },
      { period_label: "Finding your feet", focus: "b", checkin_frequency: "", monitoring_domains: [], milestones: [] },
    ];
    const r = buildProgrammeExperience(sub, DAY_8);
    if (!r.ok) return;
    expect(r.experience.periods.map((p) => [p.fromDay, p.toDay])).toEqual([[1, 30], [31, 60]]);
    expect(r.experience.currentPeriod?.label).toBe("Settling in");
  });
});

describe("buildProgrammeExperience — failing safely", () => {
  const bad = (mutate: (s: SubscriptionRow) => void) => {
    const s = clone(SPINE_ENROLMENT);
    mutate(s);
    return buildProgrammeExperience(s, DAY_8);
  };

  it("declines a legacy recovery subscription", () => {
    const r = buildProgrammeExperience(LEGACY_SUBSCRIPTION, DAY_8);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/Not a service enrolment/);
  });

  it("declines when there is no subscription at all", () => {
    expect(buildProgrammeExperience(null, DAY_8).ok).toBe(false);
  });

  it("declines a snapshot with no package details", () => {
    expect(bad((s) => { s.package_snapshot = null; }).ok).toBe(false);
    expect(bad((s) => { s.package_snapshot = { name: "X" }; }).ok).toBe(false);
  });

  it("declines an unreadable start date", () => {
    const r = bad((s) => { s.started_at = "not a date"; });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/start date/);
  });

  it("survives a snapshot with no programme outline at all", () => {
    const r = bad((s) => { s.programme_config_snapshot = {}; });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.experience.periods).toEqual([]);
    expect(r.experience.currentPeriod).toBeNull();
    expect(r.experience.monitoringAreas.length).toBeGreaterThan(0);
  });

  it("survives junk where lists were expected", () => {
    const r = bad((s) => {
      (s.package_snapshot as Record<string, unknown>).monitoring_domains = "Pain, walking";
      (s.programme_config_snapshot as Record<string, unknown>).patient_inputs = "ask them things";
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.experience.patientQuestions).toEqual([]);
  });
});

describe("daysBetween", () => {
  // Days are counted in the patient's own local calendar, not UTC: "day 8"
  // must turn over at their midnight, wherever they are.
  it("counts calendar days, not clock hours", () => {
    expect(daysBetween(new Date(2026, 7, 14, 23, 0), new Date(2026, 7, 15, 1, 0))).toBe(1);
    expect(daysBetween(new Date(2026, 7, 14, 0, 1), new Date(2026, 7, 14, 23, 59))).toBe(0);
  });
});
