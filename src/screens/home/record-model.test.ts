import { describe, expect, it } from "vitest";
import type { CareEventRow } from "../../lib/db";
import { nextPosition, POSITIONS, rankRecordOptions, repeatLabel } from "./record-model";

/*
 * Dates are built in LOCAL time on purpose. rankRecordOptions reads
 * `now.getHours()`, so UTC literals would mean these tests exercise a different
 * hour on a developer machine (IST) than in CI (UTC) — the flakiest kind of bug
 * to chase later.
 */
const local = (h: number, m = 0) => new Date(2026, 7, 20, h, m, 0, 0);

const at = (h: number, m: number, kind: string, extra: Partial<CareEventRow> = {}): CareEventRow => ({
  id: `${kind}-${h}-${m}`,
  patient_id: "p1",
  kind: kind as CareEventRow["kind"],
  detail: null,
  amount: null,
  unit: null,
  document_id: null,
  occurred_at: local(h, m).toISOString(),
  recorded_by: null,
  ...extra,
});

const noon = local(12);

describe("rankRecordOptions", () => {
  it("puts an overdue recurring duty first", () => {
    // Last position change was 3h ago; turning is two-hourly.
    const ranked = rankRecordOptions([at(9, 0, "positioning")], noon);
    expect(ranked[0].kind).toBe("positioning");
    expect(ranked[0].hint).toMatch(/^Due/);
  });

  it("pushes something just done down, but never removes it", () => {
    const ranked = rankRecordOptions([at(11, 50, "feed", { amount: 150 })], noon);
    const feed = ranked.find((o) => o.kind === "feed")!;
    expect(feed.hint).toBe("Last 10 min ago");
    expect(ranked.indexOf(feed)).toBeGreaterThan(0);
    // Still reachable — a caregiver correcting a mistake must not be blocked.
    expect(feed).toBeTruthy();
  });

  it("flags a recurring duty with nothing recorded by mid-morning", () => {
    const ranked = rankRecordOptions([], noon);
    expect(ranked[0].hint).toBe("Not recorded today");
  });

  it("counts repeats, which one daily value could never express", () => {
    const events = [at(7, 0, "feed"), at(10, 0, "feed"), at(11, 30, "feed")];
    expect(rankRecordOptions(events, noon).find((o) => o.kind === "feed")!.count).toBe(3);
  });

  it("sinks an implausible hour without hiding it", () => {
    const threeAm = local(3);
    const ranked = rankRecordOptions([], threeAm);
    const feed = ranked.find((o) => o.kind === "feed");
    expect(feed).toBeTruthy();
    expect(ranked.indexOf(feed!)).toBeGreaterThan(0);
  });
});

describe("repeatLabel", () => {
  it("offers the last value so a routine feed is one tap", () => {
    const [feed] = rankRecordOptions([at(8, 0, "feed", { amount: 150, detail: "Ryle's tube" })], noon)
      .filter((o) => o.kind === "feed");
    expect(repeatLabel({ ...feed, unit: "mL" })).toBe("150 mL · Ryle's tube");
  });

  it("offers nothing when there is nothing to repeat", () => {
    const [feed] = rankRecordOptions([], noon).filter((o) => o.kind === "feed");
    expect(repeatLabel(feed)).toBeNull();
  });
});

describe("nextPosition", () => {
  it("alternates sides — pressure relief is about changing side", () => {
    expect(nextPosition("Left lateral")).toBe("Right lateral");
    expect(nextPosition("Right lateral")).toBe("Left lateral");
  });

  it("starts somewhere sensible when there is no history or it is unrecognised", () => {
    expect(nextPosition(null)).toBe(POSITIONS[0]);
    expect(nextPosition("propped on pillows")).toBe(POSITIONS[0]);
  });
});
