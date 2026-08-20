import { describe, expect, it } from "vitest";
import type { MedicationRow, MedAdminStatus } from "../../lib/db";
import { activeMedPeriod } from "./MedicationGroup";

const med = (id: string, freq: string): MedicationRow => ({
  id, patient_id: "p1", name: `Tab ${id}`, dose: "5 mg", freq,
  timing: null, note: null, active: true,
});

const at = (h: number) => new Date(2026, 7, 20, h, 0, 0, 0);

describe("activeMedPeriod", () => {
  it("returns null when nothing is prescribed", () => {
    expect(activeMedPeriod([], new Map(), at(9))).toBeNull();
  });

  it("keeps a missed morning round visible in the evening", () => {
    // 1-0-1 gives a morning and a bedtime dose; morning was never recorded.
    const meds = [med("a", "1-0-1")];
    expect(activeMedPeriod(meds, new Map(), at(19))).toBe("morning");
  });

  it("moves on once the earlier round is recorded", () => {
    const meds = [med("a", "1-0-1")];
    const admin = new Map<string, MedAdminStatus>([["a|morning", "given"]]);
    expect(activeMedPeriod(meds, admin, at(19))).toBe("bedtime");
  });

  it("falls back to the current time of day when everything is recorded", () => {
    const meds = [med("a", "1-0-1")];
    const admin = new Map<string, MedAdminStatus>([
      ["a|morning", "given"],
      ["a|bedtime", "given"],
    ]);
    expect(activeMedPeriod(meds, admin, at(9))).toBe("morning");
  });
});
