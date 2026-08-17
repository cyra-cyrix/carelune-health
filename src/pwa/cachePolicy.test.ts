import { describe, expect, it } from "vitest";
import { classifyRequest, NEVER_CACHE_PREFIXES } from "./cachePolicy";

const APP = "https://app.carelune.in";
const SUPABASE = "https://eixndbgphecohmandztq.supabase.co";

const req = (url: string, extra: Partial<Parameters<typeof classifyRequest>[0]> = {}) =>
  classifyRequest({ method: "GET", url, swOrigin: APP, ...extra });

describe("service-worker cache policy", () => {
  it("caches only same-origin, content-hashed shell assets", () => {
    expect(req(`${APP}/assets/index-abc123.js`)).toBe("static");
    expect(req(`${APP}/assets/index-abc123.css`)).toBe("static");
    expect(req(`${APP}/fonts/manrope.woff2`)).toBe("static");
    expect(req(`${APP}/icons/icon-192.png`)).toBe("static");
  });

  it("treats documents/navigations as network-first", () => {
    expect(req(`${APP}/`, { mode: "navigate" })).toBe("navigation");
    expect(req(`${APP}/login`, { destination: "document" })).toBe("navigation");
  });

  it("NEVER caches cross-origin Supabase traffic (REST, auth, storage, functions, realtime)", () => {
    expect(req(`${SUPABASE}/rest/v1/patients?select=*`)).toBe("bypass");
    expect(req(`${SUPABASE}/auth/v1/token`)).toBe("bypass");
    expect(req(`${SUPABASE}/storage/v1/object/patient-docs/x.pdf`)).toBe("bypass");
    expect(req(`${SUPABASE}/functions/v1/registry`)).toBe("bypass");
    expect(req(`${SUPABASE}/realtime/v1/websocket`)).toBe("bypass");
  });

  it("NEVER caches same-origin API-shaped paths (defence in depth)", () => {
    for (const p of NEVER_CACHE_PREFIXES) {
      expect(req(`${APP}${p}anything`)).toBe("bypass");
    }
  });

  it("never intercepts non-GET requests (no offline clinical writes)", () => {
    expect(req(`${APP}/assets/index.js`, { method: "POST" })).toBe("bypass");
    expect(req(`${SUPABASE}/rest/v1/med_admin`, { method: "POST" })).toBe("bypass");
    expect(classifyRequest({ method: "DELETE", url: `${SUPABASE}/rest/v1/med_admin`, swOrigin: APP })).toBe("bypass");
  });

  it("bypasses unparseable URLs safely", () => {
    expect(req("not a url")).toBe("bypass");
  });
});
