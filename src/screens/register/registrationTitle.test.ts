import { describe, expect, it } from "vitest";
import { APP_TITLE, NEUTRAL_TITLE, registrationTitle } from "./registrationTitle";
import type { PublicOrgInfo } from "../../lib/db";

const legacy = (over: Partial<PublicOrgInfo> = {}): PublicOrgInfo =>
  ({ kind: "legacy", institution_name: "Punarvas Hospital", logo_url: null,
     package_price: 5999, trial_days: 7, ...over } as PublicOrgInfo);

const universal = (over: Record<string, unknown> = {}): PublicOrgInfo =>
  ({ kind: "service", institution_name: "Punarvas Hospital", logo_url: null,
     package_price: 18000, trial_days: 0, service_name: "Neurological Rehabilitation Programme",
     package_name: "Standard Neurological Rehab Package", positioning: null, duration_days: 60,
     checkin_frequency: null, review_frequency: null, support_level: null,
     includes: [], monitoring_domains: [], currency: "INR", ...over } as PublicOrgInfo);

describe("registration tab title", () => {
  it("names the institution once the organisation resolves", () => {
    expect(registrationTitle(legacy(), false)).toBe("Punarvas Hospital — Patient Registration");
  });

  it("names the programme for a universal invitation", () => {
    expect(registrationTitle(universal(), false)).toBe(
      "Punarvas Hospital — Neurological Rehabilitation Programme",
    );
  });

  it("falls back to the package name when the service has none", () => {
    expect(registrationTitle(universal({ service_name: null }), false)).toBe(
      "Punarvas Hospital — Standard Neurological Rehab Package",
    );
  });

  it("stays neutral while the organisation is still loading", () => {
    expect(registrationTitle(null, true)).toBe(NEUTRAL_TITLE);
    // Even if stale data is present, loading wins.
    expect(registrationTitle(legacy(), true)).toBe(NEUTRAL_TITLE);
  });

  it("stays neutral when the lookup failed or the organisation has no name", () => {
    expect(registrationTitle(null, false)).toBe(NEUTRAL_TITLE);
    expect(registrationTitle(legacy({ institution_name: null }), false)).toBe(NEUTRAL_TITLE);
    expect(registrationTitle(legacy({ institution_name: "   " }), false)).toBe(NEUTRAL_TITLE);
  });

  it("never puts the platform name in a patient-facing title", () => {
    const titles = [
      registrationTitle(null, true),
      registrationTitle(null, false),
      registrationTitle(legacy(), false),
      registrationTitle(universal(), false),
      registrationTitle(legacy({ institution_name: null }), false),
    ];
    for (const t of titles) expect(t).not.toContain(APP_TITLE);
  });
});
