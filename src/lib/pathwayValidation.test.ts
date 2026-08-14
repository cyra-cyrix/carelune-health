import { describe, it, expect } from "vitest";
import { validatePathwayConfig, validatePlanOutput } from "./pathwayValidation";

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
});
