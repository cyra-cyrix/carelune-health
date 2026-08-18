import { describe, expect, it } from "vitest";
import type { PatientRow } from "../../lib/db";
import { deriveAttention, lastUpdateLabel } from "./attention-model";

const NOW = Date.parse("2026-08-18T09:00:00.000Z");

function patient(overrides: Partial<PatientRow> = {}): PatientRow {
  return {
    id: "p1",
    centre_id: "c1",
    full_name: "Anand Menon",
    age: 62,
    sex: "M",
    location: "Bengaluru",
    discharged_on: "2026-08-06",
    journey_start: "2026-08-06T00:00:00.000Z",
    journey_total_days: 30,
    diagnosis: ["Stroke recovery"],
    status: "active",
    pathway_pack_id: "neuro",
    pathway_version_id: "v1",
    ...overrides,
  };
}

const base = {
  allPending: { pending: 0, urgent: 0 },
  concerns: { pending: 0, urgent: 0 },
  signal: null,
  showPending: true,
  countType: "all" as const,
  now: NOW,
};

describe("deriveAttention", () => {
  it("puts a new registration in Needs decision with the plan as the pending action", () => {
    const a = deriveAttention({ ...base, patient: patient({ status: "pending" }) });
    expect(a.band).toBe("decision");
    expect(a.reason).toBe("Registered and has no recovery plan yet");
    expect(a.action).toBe("Build and activate the recovery plan");
    expect(a.lastUpdate).toBe("Not started");
  });

  it("counts clinical approvals as decisions and family concerns separately", () => {
    const a = deriveAttention({
      ...base,
      patient: patient(),
      allPending: { pending: 3, urgent: 1 },
      concerns: { pending: 2, urgent: 1 },
    });
    expect(a.decisions).toBe(1);
    expect(a.concerns).toBe(2);
    expect(a.band).toBe("decision");
    expect(a.reason).toBe("1 item awaiting your decision");
    expect(a.urgent).toBe(true);
  });

  it("surfaces a worsening trend as Clinical change when nothing is awaiting a decision", () => {
    const a = deriveAttention({
      ...base,
      patient: patient(),
      signal: { label: "BP", change: "BP 130 → 152", improving: false, lastRecorded: "2026-08-17" },
    });
    expect(a.band).toBe("change");
    expect(a.reason).toBe("BP is trending the wrong way");
    expect(a.changed).toBe("BP 130 → 152 · watch");
    expect(a.action).toBe("Review the trend");
    expect(a.lastUpdate).toBe("Last recorded yesterday");
  });

  it("surfaces unanswered concerns only when nothing more urgent is pending", () => {
    const a = deriveAttention({
      ...base,
      patient: patient(),
      allPending: { pending: 1, urgent: 0 },
      concerns: { pending: 1, urgent: 0 },
      signal: { label: "BP", change: "BP 140 → 128", improving: true, lastRecorded: "2026-08-18" },
    });
    expect(a.decisions).toBe(0);
    expect(a.band).toBe("concern");
    expect(a.reason).toBe("1 concern raised from home");
    expect(a.action).toBe("Read and reply");
    expect(a.changed).toBe("BP 140 → 128 · improving");
    expect(a.lastUpdate).toBe("Last recorded today");
  });

  it("says the nurse answers the family, and never shows them a decision queue", () => {
    const a = deriveAttention({
      ...base,
      patient: patient(),
      countType: "family",
      allPending: { pending: 4, urgent: 0 },
      concerns: { pending: 1, urgent: 0 },
    });
    expect(a.decisions).toBe(0);
    expect(a.band).toBe("concern");
    expect(a.action).toBe("Answer the family");
  });

  it("leaves a settled patient stable with nothing pending", () => {
    const a = deriveAttention({
      ...base,
      patient: patient(),
      signal: { label: "BP", change: "BP 130 → 130", improving: null, lastRecorded: "2026-08-14" },
    });
    expect(a.band).toBe("stable");
    expect(a.reason).toBe("Nothing waiting on you");
    expect(a.action).toBe("No action pending");
    expect(a.changed).toBe("BP 130 → 130 · steady");
    expect(a.lastUpdate).toBe("Last recorded 4 days ago");
  });
});

describe("lastUpdateLabel", () => {
  it("is explicit when the home team has recorded nothing", () => {
    expect(lastUpdateLabel(null, NOW)).toBe("No readings recorded yet");
  });
});

describe("condition counting is independent of the listing band", () => {
  const bothConditions = {
    ...base,
    patient: patient(),
    allPending: { pending: 2, urgent: 0 },
    concerns: { pending: 0, urgent: 0 },
    signal: { label: "BP", change: "BP 128 → 146", improving: false, lastRecorded: "2026-08-18" },
  };

  it("lists a patient once, under the most actionable band", () => {
    expect(deriveAttention(bothConditions).band).toBe("decision");
  });

  it("still counts the clinical change, so a summary cannot read a false zero", () => {
    const a = deriveAttention(bothConditions);
    expect(a.signals).toContain("decision");
    expect(a.signals).toContain("change");
    expect(a.signals).not.toContain("stable");
  });

  it("marks the row so the clinical change is visible where the patient is listed", () => {
    expect(deriveAttention(bothConditions).alsoClinicalChange).toBe(true);
  });

  it("does not mark a patient who is already listed under Clinical change", () => {
    const a = deriveAttention({
      ...base,
      patient: patient(),
      signal: { label: "BP", change: "BP 128 → 146", improving: false, lastRecorded: "2026-08-18" },
    });
    expect(a.band).toBe("change");
    expect(a.alsoClinicalChange).toBe(false);
    expect(a.signals).toEqual(["change"]);
  });

  it("counts a decision, a clinical change and an unanswered concern all at once", () => {
    const a = deriveAttention({
      ...bothConditions,
      concerns: { pending: 1, urgent: 0 },
      allPending: { pending: 3, urgent: 0 },
    });
    expect(a.band).toBe("decision");
    expect(a.signals.sort()).toEqual(["change", "concern", "decision"]);
  });

  it("gives a settled patient exactly one signal", () => {
    const a = deriveAttention({ ...base, patient: patient() });
    expect(a.signals).toEqual(["stable"]);
    expect(a.alsoClinicalChange).toBe(false);
  });
});
