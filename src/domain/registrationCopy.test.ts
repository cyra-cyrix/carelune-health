import { describe, expect, it } from "vitest";
import { registrationCopy } from "./registrationCopy";
import { CARE_PACKAGE } from "./carePackage";
import type { PublicOrgInfo, PublicServiceInfo } from "../lib/db";

const LEGACY: PublicOrgInfo = {
  kind: "legacy",
  institution_name: "Sanjeevani Spine",
  package_price: 5999,
  trial_days: 7,
};

/** Builds a universal invitation payload. No specialty knowledge anywhere. */
const service = (over: Partial<PublicServiceInfo>): PublicServiceInfo => ({
  kind: "service",
  institution_name: "Sanjeevani Spine",
  package_price: 18000,
  trial_days: 0,
  service_name: "Spine Recovery",
  package_name: "60-Day Guided",
  positioning: "Structured spine recovery after surgery",
  duration_days: 60,
  checkin_frequency: "Daily",
  review_frequency: "Fortnightly",
  support_level: "Coordinator + physiotherapist",
  includes: ["Home exercise plan", "Progress reviews"],
  monitoring_domains: ["Pain", "Walking"],
  currency: "INR",
  ...over,
});

const MOTHER_BABY = service({
  institution_name: "Ananya Mother & Baby",
  service_name: "Mother & Baby Care",
  package_name: "90-Day Feeding Support",
  positioning: "Feeding and settling support through the fourth trimester",
  duration_days: 90,
  checkin_frequency: "Twice daily",
  review_frequency: "Weekly",
  support_level: "Lactation consultant on call",
  includes: ["Feeding log review", "Latch guidance", "Sleep and settling guidance"],
  monitoring_domains: ["Feeding", "Weight gain", "Maternal wellbeing"],
  package_price: 14000,
});

const DERMATOLOGY = service({
  institution_name: "Clearskin Dermatology",
  service_name: "Acne Programme",
  package_name: "12-Week Clear Skin",
  positioning: "A guided course for persistent acne",
  duration_days: 84,
  checkin_frequency: "Weekly photo check-in",
  review_frequency: "Every three weeks",
  support_level: "Dermatologist review",
  includes: ["Photo tracking", "Routine adjustments by your dermatologist"],
  monitoring_domains: ["Lesion count", "Skin irritation"],
  package_price: 9000,
});

/** The legacy programme's vocabulary, which must never leak into a universal one. */
const RECOVERY_BOILERPLATE = /recovery|medicine|physiotherap|discharge summary|30-Day Recovery Continuum/i;

const allText = (o: ReturnType<typeof registrationCopy>) =>
  [o.eyebrow, o.programmeName, o.durationLabel, o.positioning ?? "", o.intro, o.successNote, o.consentTail,
   ...o.includes, ...o.facts.flatMap((f) => [f.label, f.value])].join(" | ");

describe("registration screen copy", () => {
  it("1. a legacy invitation still renders the legacy recovery registration, unchanged", () => {
    const c = registrationCopy(LEGACY);
    expect(c.programmeName).toBe(CARE_PACKAGE.name);
    expect(c.programmeName).toBe("30-Day Recovery Continuum");
    expect(c.durationLabel).toBe(CARE_PACKAGE.durationLabel);
    expect(c.includes).toEqual([...CARE_PACKAGE.includes]);
    expect(c.eyebrow).toBe("Recovery programme");
    // The exact wording families have been reading all along.
    expect(c.intro).toBe(
      "Enter the patient's details and create your own login. You'll follow their recovery from here.",
    );
    expect(c.successNote).toBe("Your care team will prepare the recovery plan.");
    expect(c.consentTail).toContain("discharge summary");
    // A legacy invitation has no per-package facts to show.
    expect(c.facts).toEqual([]);
  });

  it("9. a null/unresolved invitation falls back to the legacy flow, unchanged", () => {
    expect(registrationCopy(null).programmeName).toBe(CARE_PACKAGE.name);
    expect(registrationCopy(null).includes).toEqual([...CARE_PACKAGE.includes]);
  });

  it("2. a universal package invitation renders that provider's own programme", () => {
    const c = registrationCopy(service({}));
    expect(c.programmeName).toBe("60-Day Guided");
    expect(c.eyebrow).toBe("Spine Recovery");
    expect(c.durationLabel).toBe("60-day programme");
    expect(c.positioning).toBe("Structured spine recovery after surgery");
    expect(c.includes).toEqual(["Home exercise plan", "Progress reviews"]);
    // Never the legacy programme.
    expect(c.programmeName).not.toBe(CARE_PACKAGE.name);
    expect(allText(c)).not.toContain("30-Day Recovery Continuum");
  });

  it("2b. shows the rhythm and support the provider actually configured", () => {
    const c = registrationCopy(service({}));
    const labels = c.facts.map((f) => f.label);
    expect(labels).toEqual(["What this programme follows", "Check-ins", "Professional review", "Support"]);
    expect(c.facts.find((f) => f.label === "Check-ins")?.value).toBe("Daily");
    expect(c.facts.find((f) => f.label === "What this programme follows")?.value).toBe("Pain · Walking");
  });

  it("2c. omits any rhythm the package leaves unconfigured, rather than inventing one", () => {
    const c = registrationCopy(
      service({ checkin_frequency: null, review_frequency: "  ", support_level: null, monitoring_domains: [] }),
    );
    expect(c.facts).toEqual([]);
    expect(c.includes.length).toBeGreaterThan(0);
  });

  it("7. a Mother & Baby package carries no recovery boilerplate", () => {
    const c = registrationCopy(MOTHER_BABY);
    expect(c.programmeName).toBe("90-Day Feeding Support");
    expect(c.durationLabel).toBe("90-day programme");
    expect(allText(c)).not.toMatch(RECOVERY_BOILERPLATE);
    // It says what the provider configured instead.
    expect(allText(c)).toContain("Feeding");
    expect(allText(c)).toContain("Lactation consultant on call");
  });

  it("8. a Dermatology package carries no recovery boilerplate", () => {
    const c = registrationCopy(DERMATOLOGY);
    expect(c.programmeName).toBe("12-Week Clear Skin");
    expect(c.durationLabel).toBe("84-day programme");
    expect(allText(c)).not.toMatch(RECOVERY_BOILERPLATE);
    expect(allText(c)).toContain("Weekly photo check-in");
    expect(allText(c)).toContain("Dermatologist review");
  });

  it("renders all three specialties through the same fields — no specialty branch exists", () => {
    const shapes = [service({}), MOTHER_BABY, DERMATOLOGY].map(registrationCopy);
    for (const c of shapes) {
      expect(typeof c.programmeName).toBe("string");
      expect(c.programmeName.length).toBeGreaterThan(0);
      expect(c.durationLabel).toMatch(/^\d+-day programme$/);
      expect(Array.isArray(c.facts)).toBe(true);
      expect(c.intro).toBe(
        "Enter the patient's details and create your own login. You'll follow their programme from here.",
      );
    }
    // Each one is genuinely different — the words come from the package.
    expect(new Set(shapes.map((c) => c.programmeName)).size).toBe(3);
  });

  it("never exposes internal vocabulary, ids or the platform fee", () => {
    const text = allText(registrationCopy(MOTHER_BABY));
    expect(text).not.toMatch(/platform fee|20%|package_id|service_package|uuid|snapshot|\{|\}/i);
  });
});
