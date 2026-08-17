import { describe, expect, it, vi } from "vitest";
import { buildBody, canSubmit, encodeForm, FORM_NAME, submitEnquiry, validateEnquiry } from "./enquiry";

const okDoctor = { name: "Dr A", email: "a@clinic.in", mobile: "9000000000", volume: "20", mrn: "KA/12345" };
const okOrg = { name: "Ms B", email: "b@hospital.in", mobile: "9000000000", volume: "40", org: "City Hospital" };

describe("enquiry — Netlify form naming", () => {
  it("uses the required form name in the config and the POST body", () => {
    expect(FORM_NAME).toBe("carelune-enquiry");
    expect(buildBody(okDoctor, "doctor")["form-name"]).toBe("carelune-enquiry");
    // (the static, Netlify-detectable HTML form + honeypot + fields are asserted
    //  against the built output in scripts/verify-separation.mjs)
  });
});

describe("enquiry — validation", () => {
  it("flags missing required fields and missing consent", () => {
    const { ok, errors } = validateEnquiry({}, "doctor", false);
    expect(ok).toBe(false);
    expect(errors).toHaveProperty("name");
    expect(errors).toHaveProperty("email");
    expect(errors).toHaveProperty("mobile");
    expect(errors).toHaveProperty("consent");
  });
  it("rejects a malformed email", () => {
    expect(validateEnquiry({ ...okDoctor, email: "not-an-email" }, "doctor", true).errors).toHaveProperty("email");
  });
  it("rejects a non-numeric mobile number such as 'test'", () => {
    expect(validateEnquiry({ ...okDoctor, mobile: "test" }, "doctor", true).errors).toHaveProperty("mobile");
    expect(validateEnquiry({ ...okDoctor, mobile: "12345" }, "doctor", true).errors).toHaveProperty("mobile"); // too short
    expect(validateEnquiry({ ...okDoctor, mobile: "+91 90000 00000" }, "doctor", true).errors).not.toHaveProperty("mobile");
  });
  it("requires a positive number of patients per month", () => {
    expect(validateEnquiry({ ...okDoctor, volume: "" }, "doctor", true).errors).toHaveProperty("volume");
    expect(validateEnquiry({ ...okDoctor, volume: "test" }, "doctor", true).errors).toHaveProperty("volume");
    expect(validateEnquiry({ ...okDoctor, volume: "0" }, "doctor", true).errors).toHaveProperty("volume");
    expect(validateEnquiry({ ...okDoctor, volume: "-5" }, "doctor", true).errors).toHaveProperty("volume");
    expect(validateEnquiry({ ...okDoctor, volume: "25" }, "doctor", true).errors).not.toHaveProperty("volume");
  });
  it("requires the medical registration number for an individual doctor", () => {
    expect(validateEnquiry({ ...okDoctor, mrn: "" }, "doctor", true).errors).toHaveProperty("mrn");
  });
  it("requires the organisation for a clinic/hospital", () => {
    expect(validateEnquiry({ ...okOrg, org: "" }, "org", true).errors).toHaveProperty("org");
  });
  it("passes a complete doctor / org submission with consent", () => {
    expect(validateEnquiry(okDoctor, "doctor", true).ok).toBe(true);
    expect(validateEnquiry(okOrg, "org", true).ok).toBe(true);
  });
});

describe("enquiry — submission", () => {
  it("succeeds only on an ok response, POSTing url-encoded data to the same origin with the form name", async () => {
    const fetchMock = vi.fn(async () => new Response("", { status: 200 }));
    const body = buildBody(okDoctor, "doctor");
    await expect(submitEnquiry(body, fetchMock as unknown as typeof fetch)).resolves.toBe("success");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit & { headers: Record<string, string> }];
    expect(url).toBe("/");
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    expect(init.body).toContain("form-name=carelune-enquiry");
    expect(init.body).toContain(encodeForm({ email: okDoctor.email }));
  });

  it("fails (throws) on a non-ok response, so the UI keeps the entered data", async () => {
    const fetchMock = vi.fn(async () => new Response("", { status: 500 }));
    await expect(submitEnquiry(buildBody(okDoctor, "doctor"), fetchMock as unknown as typeof fetch)).rejects.toThrow();
  });

  it("fails (throws) on a network error", async () => {
    const fetchMock = vi.fn(async () => { throw new TypeError("network"); });
    await expect(submitEnquiry(buildBody(okDoctor, "doctor"), fetchMock as unknown as typeof fetch)).rejects.toThrow();
  });

  it("never includes patient-style fields in the body", () => {
    const body = buildBody(okDoctor, "doctor");
    for (const k of Object.keys(body)) {
      expect(k).not.toMatch(/patient|diagnosis|dob|aadhaar/i);
    }
  });
});

describe("enquiry — duplicate prevention", () => {
  it("blocks submitting while a request is already in flight", () => {
    expect(canSubmit("idle")).toBe(true);
    expect(canSubmit("error")).toBe(true);
    expect(canSubmit("loading")).toBe(false);
  });
});
