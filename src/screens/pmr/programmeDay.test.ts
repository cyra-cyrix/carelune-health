import { describe, expect, it } from "vitest";
import { programmeDayOf } from "./PatientProgress";
import type { SubscriptionRow } from "../../lib/db";

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

const enrolment = (over: Partial<SubscriptionRow> = {}) =>
  ({
    id: "sub-1",
    patient_id: "p1",
    service_package_id: "pkg-1",
    started_at: daysAgo(6),
    package_snapshot: { duration_days: 60 },
    ...over,
  }) as unknown as SubscriptionRow;

describe("which day the clinician is told it is", () => {
  it("counts a programme patient against their own package", () => {
    // Not "Day 7 of 90": 90 is the legacy recovery journey's default and has
    // nothing to do with the 60-day programme this patient is actually on.
    expect(programmeDayOf(enrolment())).toEqual({ day: 7, total: 60 });
  });

  it("counts from the day of enrolment, not from a fixed start", () => {
    expect(programmeDayOf(enrolment({ started_at: daysAgo(0) }))?.day).toBe(1);
    expect(programmeDayOf(enrolment({ started_at: daysAgo(41) }))?.day).toBe(42);
  });

  it("leaves a legacy recovery patient to the legacy count", () => {
    expect(programmeDayOf(enrolment({ service_package_id: null }))).toBeNull();
    expect(programmeDayOf(null)).toBeNull();
  });

  it("declines rather than inventing a duration the snapshot does not state", () => {
    expect(programmeDayOf(enrolment({ package_snapshot: {} as never }))).toBeNull();
    expect(programmeDayOf(enrolment({ package_snapshot: { duration_days: 0 } as never }))).toBeNull();
    expect(programmeDayOf(enrolment({ started_at: "not a date" }))).toBeNull();
  });
});
