import { describe, expect, it } from "vitest";
import {
  LIMITS,
  durationLabel,
  periodsForPackage,
  validateServiceDraft,
  type ServiceDraft,
} from "./serviceDraft";
import { LACTATION_DRAFT, SPINE_DRAFT } from "./serviceDraft.fixtures";

/** A deep clone so a test can corrupt one field without leaking to the next. */
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

describe("validateServiceDraft — accepts well-formed model replies", () => {
  it("accepts the spine draft and keeps its structure", () => {
    const result = validateServiceDraft(clone(SPINE_DRAFT));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.suggested_services).toHaveLength(2);
    expect(result.draft.suggested_services[0].suggested_packages).toHaveLength(3);
    expect(result.draft.suggested_services[0].programme_outline).toHaveLength(4);
  });

  it("accepts the lactation draft through the same validator", () => {
    const result = validateServiceDraft(clone(LACTATION_DRAFT));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const service = result.draft.suggested_services[0];
    expect(service.monitoring_domains).toContain("Emotional wellbeing");
    expect(service.suggested_packages.length).toBeGreaterThanOrEqual(LIMITS.minPackages);
  });

  it("accepts a service with no fixed duration", () => {
    const draft = clone(SPINE_DRAFT);
    draft.suggested_services[0].typical_duration_days = null;
    expect(validateServiceDraft(draft).ok).toBe(true);
  });

  it("drops keys the model invented outside the schema", () => {
    const draft = clone(SPINE_DRAFT) as ServiceDraft & Record<string, unknown>;
    draft.medication_plan = [{ name: "Tramadol", dose: "50mg" }];
    (draft.suggested_services[0] as unknown as Record<string, unknown>).emergency_threshold = "BP < 90";
    const result = validateServiceDraft(draft);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(JSON.stringify(result.draft)).not.toContain("Tramadol");
    expect(JSON.stringify(result.draft)).not.toContain("emergency_threshold");
  });
});

describe("validateServiceDraft — rejects malformed model output", () => {
  const rejects = (mutate: (d: ServiceDraft) => unknown, expected: RegExp) => {
    const draft = clone(SPINE_DRAFT);
    const result = validateServiceDraft(mutate(draft) ?? draft);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join(" | ")).toMatch(expected);
  };

  it("rejects a non-object reply", () => {
    expect(validateServiceDraft("Here is your service!").ok).toBe(false);
    expect(validateServiceDraft(null).ok).toBe(false);
    expect(validateServiceDraft([]).ok).toBe(false);
  });

  it("rejects a missing provider summary", () => {
    rejects((d) => { d.provider_summary = "   "; }, /provider_summary/);
  });

  it("rejects a reply with no services", () => {
    rejects((d) => { d.suggested_services = []; }, /at least one service/i);
  });

  it("rejects a service missing its objective", () => {
    rejects((d) => { d.suggested_services[0].objective = ""; }, /objective is required/);
  });

  it("rejects a service with no monitoring areas", () => {
    rejects((d) => { d.suggested_services[0].monitoring_domains = []; }, /monitoring_domains/);
  });

  it("rejects a service with no patient questions", () => {
    rejects((d) => { d.suggested_services[0].suggested_patient_inputs = []; }, /suggested_patient_inputs/);
  });

  it("rejects fewer than three packages", () => {
    rejects((d) => { d.suggested_services[0].suggested_packages.pop(); }, /at least 3 options/);
  });

  it("rejects a package with a non-numeric duration", () => {
    rejects(
      (d) => { (d.suggested_services[0].suggested_packages[0] as unknown as Record<string, unknown>).duration_days = "30 days"; },
      /duration_days must be a whole number/,
    );
  });

  it("rejects a package with a negative duration", () => {
    rejects((d) => { d.suggested_services[0].suggested_packages[1].duration_days = -60; }, /duration_days/);
  });

  it("rejects an empty programme outline", () => {
    rejects((d) => { d.suggested_services[0].programme_outline = []; }, /programme_outline/);
  });

  it("rejects prose where a list was required", () => {
    rejects(
      (d) => { (d.suggested_services[0] as unknown as Record<string, unknown>).monitoring_domains = "Pain, walking, wound"; },
      /monitoring_domains/,
    );
  });

  it("rejects text beyond the stored length cap", () => {
    rejects((d) => { d.suggested_services[0].name = "x".repeat(LIMITS.shortText + 1); }, /name is required/);
  });

  it("reports every problem at once rather than the first", () => {
    const draft = clone(SPINE_DRAFT);
    draft.provider_summary = "";
    draft.suggested_services[0].objective = "";
    draft.suggested_services[0].monitoring_domains = [];
    const result = validateServiceDraft(draft);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.length).toBeGreaterThanOrEqual(3);
  });
});

describe("periodsForPackage", () => {
  const service = SPINE_DRAFT.suggested_services[0];
  const all = service.suggested_packages;

  it("gives the longest package the whole outline", () => {
    const complete = all.find((p) => p.duration_days === 90)!;
    expect(periodsForPackage(service.programme_outline, complete, all)).toHaveLength(4);
  });

  it("narrows a shorter package to the early part of the programme", () => {
    const essential = all.find((p) => p.duration_days === 30)!;
    const periods = periodsForPackage(service.programme_outline, essential, all);
    expect(periods.length).toBeLessThan(service.programme_outline.length);
    expect(periods[0].period_label).toBe("Week 1");
  });

  it("always renders at least one period", () => {
    const tiny = { ...all[0], duration_days: 1 };
    expect(periodsForPackage(service.programme_outline, tiny, all).length).toBeGreaterThanOrEqual(1);
  });

  it("works identically for the lactation service", () => {
    const lact = LACTATION_DRAFT.suggested_services[0];
    const longest = lact.suggested_packages.find((p) => p.duration_days === 90)!;
    expect(periodsForPackage(lact.programme_outline, longest, lact.suggested_packages)).toHaveLength(4);
  });
});

describe("durationLabel", () => {
  it("reads weeks back when the duration divides cleanly", () => {
    expect(durationLabel(84)).toBe("12 weeks");
  });
  it("falls back to days", () => {
    expect(durationLabel(30)).toBe("30 days");
  });
  it("says nothing for an open-ended service", () => {
    expect(durationLabel(null)).toBeNull();
  });
});
