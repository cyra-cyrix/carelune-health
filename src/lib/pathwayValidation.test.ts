import { describe, it, expect } from "vitest";
import { validatePathwayConfig, validatePlanOutput, proposedCount } from "./pathwayValidation";

const goodConfig = {
  content_status: "clinically_review_required",
  phases: [{ key: "acute", name: "Early", from_day: 0, to_day: 14 }],
  modules: [
    { key: "medicines", recorded_by: "doctor", frequency: "as_needed" },
    { key: "pain", recorded_by: "caregiver", frequency: "daily" },
  ],
  milestones: [],
  warning_signs: [{ key: "fever", text: "Temp 38C+", severity: "urgent" }],
  escalation: { routine: "nurse", urgent: "doctor", emergency: "112/108" },
  education: [],
};

describe("validatePathwayConfig (Stage A)", () => {
  it("accepts a well-formed config", () => {
    expect(validatePathwayConfig(goodConfig).ok).toBe(true);
  });
  it("rejects an unknown module key", () => {
    const bad = { ...goodConfig, modules: [{ key: "not_a_module", recorded_by: "doctor", frequency: "daily" }] };
    const r = validatePathwayConfig(bad);
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/not a known module/);
  });
  it("rejects an invalid recorder", () => {
    const bad = { ...goodConfig, modules: [{ key: "pain", recorded_by: "hacker", frequency: "daily" }] };
    expect(validatePathwayConfig(bad).ok).toBe(false);
  });
  it("rejects a missing escalation", () => {
    const bad = { ...goodConfig, escalation: { routine: "nurse" } };
    expect(validatePathwayConfig(bad).ok).toBe(false);
  });
});

const goodPlan = {
  clinical_summary: "Post lumbar fusion, day 3.",
  diagnosis: [{ text: "Lumbar spondylolisthesis", provenance: "document" }],
  procedure: { text: "L4-L5 fusion", provenance: "document" },
  medicines: [{ name: "Paracetamol", dose: "1 g", freq: "1-1-1", timing: "After food", note: "", provenance: "document" }],
  investigations: [],
  daily_tasks: [{ time_label: "08:00", discipline: "Nursing", title: "Check wound", detail: "", provenance: "pathway" }],
  therapy_tasks: [],
  diet: [],
  observations: [{ module: "pain", frequency: "daily", recorded_by: "caregiver" }],
  milestones: [],
  precautions: [{ text: "No bending/twisting", provenance: "pathway" }],
  warning_signs: [{ text: "Fever", severity: "urgent" }],
  escalation: { routine: "nurse", urgent: "doctor", emergency: "112/108" },
  education: [],
  review_dates: [],
  missing: ["No physiotherapy plan in the documents"],
};

describe("validatePlanOutput (Stage B)", () => {
  it("accepts a well-formed, provenance-tagged draft", () => {
    expect(validatePlanOutput(goodPlan, ["pain", "medicines"]).ok).toBe(true);
  });
  it("rejects a medicine with no name (AI must copy exactly)", () => {
    const bad = { ...goodPlan, medicines: [{ name: "", dose: "1g", freq: "", timing: "", note: "", provenance: "document" }] };
    expect(validatePlanOutput(bad).ok).toBe(false);
  });
  it("rejects an invented medicine (provenance not document/doctor)", () => {
    const bad = { ...goodPlan, medicines: [{ name: "MysteryDrug", dose: "5mg", freq: "1-0-1", timing: "", note: "", provenance: "ai_structured" }] };
    const r = validatePlanOutput(bad);
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/never invented/);
  });
  it("rejects an invented diagnosis", () => {
    const bad = { ...goodPlan, diagnosis: [{ text: "Diabetes", provenance: "ai_structured" }] };
    expect(validatePlanOutput(bad).ok).toBe(false);
  });
  it("rejects an unexpected top-level key (strict schema)", () => {
    const bad = { ...goodPlan, recovery_score: 87 };
    const r = validatePlanOutput(bad);
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/unexpected key/);
  });
  it("rejects an observation for a module not enabled on the pathway", () => {
    const bad = { ...goodPlan, observations: [{ module: "swelling", frequency: "daily", recorded_by: "caregiver" }] };
    const r = validatePlanOutput(bad, ["pain", "medicines"]);
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/not enabled/);
  });
  it("rejects an observation with an invalid recorder or frequency", () => {
    const bad = { ...goodPlan, observations: [{ module: "pain", frequency: "hourly", recorded_by: "robot" }] };
    const r = validatePlanOutput(bad, ["pain", "medicines"]);
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/recorded_by|frequency/);
  });
  it("rejects a warning sign with a bad severity", () => {
    const bad = { ...goodPlan, warning_signs: [{ text: "Fever", severity: "mild" }] };
    expect(validatePlanOutput(bad, ["pain", "medicines"]).ok).toBe(false);
  });
  it("rejects a missing escalation block", () => {
    const bad = { ...goodPlan, escalation: { routine: "nurse" } };
    const r = validatePlanOutput(bad, ["pain", "medicines"]);
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/escalation/);
  });
  it("rejects a milestone with no name", () => {
    const bad = { ...goodPlan, milestones: [{ key: "x", name: "", by_day: 7 }] };
    expect(validatePlanOutput(bad, ["pain", "medicines"]).ok).toBe(false);
  });
  it("accepts a conflicts array but rejects a non-array conflicts", () => {
    expect(validatePlanOutput({ ...goodPlan, conflicts: ["Two different wound-care instructions"] }, ["pain", "medicines"]).ok).toBe(true);
    expect(validatePlanOutput({ ...goodPlan, conflicts: "nope" }, ["pain", "medicines"]).ok).toBe(false);
  });
});

/* ------------------ D-002: proposed regimen content ------------------------ */

describe("AI-proposed regimen (docs/DECISIONS.md D-002)", () => {
  const base = () => ({
    clinical_summary: "Recovering at home after a total knee replacement.",
    diagnosis: [{ text: "Osteoarthritis, left knee", provenance: "document" }],
    procedure: { text: "Total knee replacement", provenance: "document" },
    medicines: [{ name: "Paracetamol", dose: "500 mg", freq: "1-1-1", timing: "After food", note: "", provenance: "document" }],
    escalation: { routine: "nurse", urgent: "doctor", emergency: "Call 112 or 108" },
  });

  it("accepts regimen content the model proposed where the document was silent", () => {
    const r = validatePlanOutput({
      ...base(),
      diet: [{ text: "High-protein meals to support healing", provenance: "ai_suggested" }],
      therapy_tasks: [{ time_label: "08:00", discipline: "Physiotherapy", title: "Ankle pumps", detail: "20 each side", from_day: 1, through_day: 7, provenance: "ai_suggested" }],
      wound_care: [{ time_label: "09:00", discipline: "Wound care", title: "Check the dressing", detail: "Look for redness", from_day: 1, through_day: 14, provenance: "ai_suggested" }],
      targets: [{ text: "Bend the knee to 90 degrees", by_day: 21, provenance: "ai_suggested" }],
    });
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it("still refuses an invented medicine — facts are not proposable", () => {
    const r = validatePlanOutput({
      ...base(),
      medicines: [{ name: "Enoxaparin", dose: "40 mg", freq: "0-0-1", timing: "", note: "", provenance: "ai_suggested" }],
    });
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/never invented/i);
  });

  it("still refuses an invented diagnosis", () => {
    const r = validatePlanOutput({ ...base(), diagnosis: [{ text: "Deep vein thrombosis", provenance: "ai_suggested" }] });
    expect(r.ok).toBe(false);
  });

  it("rejects a task that ends before it starts", () => {
    const r = validatePlanOutput({
      ...base(),
      therapy_tasks: [{ time_label: "08:00", discipline: "Physiotherapy", title: "Walk", detail: "", from_day: 10, through_day: 3, provenance: "ai_suggested" }],
    });
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/before it starts/i);
  });

  it("rejects a non-integer or zero day offset", () => {
    for (const from_day of [0, -1, 2.5]) {
      const r = validatePlanOutput({
        ...base(),
        daily_tasks: [{ time_label: "08:00", discipline: "Nursing", title: "Check", detail: "", from_day, provenance: "document" }],
      });
      expect(r.ok).toBe(false);
    }
  });

  it("counts unreviewed proposed lines, and ignores document-sourced ones", () => {
    expect(proposedCount({
      diet: [{ text: "a", provenance: "ai_suggested" }, { text: "b", provenance: "document" }],
      therapy_tasks: [{ time_label: "", discipline: "", title: "t", detail: "", provenance: "ai_suggested" }],
      wound_care: [{ time_label: "", discipline: "", title: "w", detail: "", provenance: "doctor" }],
      targets: [{ text: "x", by_day: null, provenance: "ai_suggested" }],
    })).toBe(3);
    expect(proposedCount(null)).toBe(0);
  });
});
