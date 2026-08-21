import { beforeEach, describe, expect, it, vi } from "vitest";

const supa = vi.hoisted(() => ({
  functions: { invoke: vi.fn() },
  rpc: vi.fn(),
}));
vi.mock("./supabase", () => ({ supabase: supa }));

import { createServiceInvite, getPublicOrgInfo, registerPatient } from "./db";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("the registration link is the only authority", () => {
  it("3. the browser sends the token and never names a package", async () => {
    supa.functions.invoke.mockResolvedValue({ data: { ok: true, patient_name: "P", family_email: "f@t.in" }, error: null });

    await registerPatient({
      token: "opaque-token",
      patient: { full_name: "Synthetic Patient", age: "41", sex: "F", location: "", discharged_on: "" },
      family: { full_name: "Family", email: "f@t.in", password: "secret-1234", phone: "", relation: "spouse" },
    });

    const body = supa.functions.invoke.mock.calls[0][1].body;
    expect(body.token).toBe("opaque-token");
    // Nothing in the request can select or swap a programme.
    const serialised = JSON.stringify(body);
    expect(serialised).not.toMatch(/service_package|package_id|centre_service|centre_id/i);
    expect(Object.keys(body).sort()).toEqual(["action", "family", "patient", "token"]);
  });

  it("2. a service token resolves to that package's own content", async () => {
    supa.functions.invoke.mockResolvedValue({
      data: {
        ok: true, kind: "service",
        institution_name: "Ananya Mother & Baby", service_name: "Mother & Baby Care",
        package_name: "90-Day Feeding Support", positioning: "Fourth trimester support",
        duration_days: 90, checkin_frequency: "Twice daily", review_frequency: "Weekly",
        support_level: "Lactation consultant", includes: ["Feeding log review"],
        monitoring_domains: ["Feeding"], package_price: 14000, currency: "INR", trial_days: 0,
      },
      error: null,
    });

    const info = await getPublicOrgInfo("tok");
    expect(info.kind).toBe("service");
    if (info.kind !== "service") throw new Error("expected a service invitation");
    expect(info.package_name).toBe("90-Day Feeding Support");
    expect(info.duration_days).toBe(90);
    expect(info.includes).toEqual(["Feeding log review"]);
  });

  it("1. a legacy token still resolves to the legacy shape", async () => {
    supa.functions.invoke.mockResolvedValue({
      data: { ok: true, kind: "legacy", institution_name: "Sanjeevani", package_price: 5999, trial_days: 7 },
      error: null,
    });
    const info = await getPublicOrgInfo("tok");
    expect(info.kind).toBe("legacy");
    expect(info.package_price).toBe(5999);
    expect(info.trial_days).toBe(7);
  });

  it("treats a malformed server payload as legacy rather than half-rendering a programme", async () => {
    supa.functions.invoke.mockResolvedValue({ data: { ok: true }, error: null });
    expect((await getPublicOrgInfo("tok")).kind).toBe("legacy");
  });

  it("discards non-string entries in the package's own lists", async () => {
    supa.functions.invoke.mockResolvedValue({
      data: { ok: true, kind: "service", includes: ["Real", 42, null, "  "], monitoring_domains: "nope" },
      error: null,
    });
    const info = await getPublicOrgInfo("tok");
    if (info.kind !== "service") throw new Error("expected a service invitation");
    expect(info.includes).toEqual(["Real"]);
    expect(info.monitoring_domains).toEqual([]);
  });

  it("mints a package link through the guarded RPC, passing only the package", async () => {
    supa.rpc.mockResolvedValue({ data: "tok-abc", error: null });
    await expect(createServiceInvite("pkg-1")).resolves.toBe("tok-abc");
    expect(supa.rpc).toHaveBeenCalledWith("create_service_invite", { p_package: "pkg-1" });
  });

  it("surfaces a refusal from the RPC instead of returning a broken link", async () => {
    supa.rpc.mockResolvedValue({ data: null, error: { message: "That programme is not available" } });
    await expect(createServiceInvite("pkg-1")).rejects.toMatchObject({ message: "That programme is not available" });
  });
});
