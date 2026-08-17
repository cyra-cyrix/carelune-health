import { afterEach, describe, expect, it, vi } from "vitest";
import { appBaseUrl, appUrl, legacyForwardTarget, loginUrl, marketingBaseUrl, passwordRecoveryRedirectUrl, registerUrl } from "./urls";

// Runs in the default node environment (no `window`), so with no env override the
// helpers fall back to the hardcoded production defaults — the exact behaviour a
// server-side or misconfigured build must have.
afterEach(() => vi.unstubAllEnvs());

describe("central URL config", () => {
  it("uses VITE_APP_BASE_URL when set, trimming any trailing slash", () => {
    vi.stubEnv("VITE_APP_BASE_URL", "https://app.carelune.in/");
    expect(appBaseUrl()).toBe("https://app.carelune.in");
  });

  it("falls back to the production app origin when unset and no window", () => {
    expect(appBaseUrl()).toBe("https://app.carelune.in");
  });

  it("resolves the marketing origin the same way", () => {
    vi.stubEnv("VITE_MARKETING_BASE_URL", "https://carelune.in");
    expect(marketingBaseUrl()).toBe("https://carelune.in");
    vi.unstubAllEnvs();
    expect(marketingBaseUrl()).toBe("https://carelune.in");
  });

  it("builds absolute app URLs and normalises a missing leading slash", () => {
    vi.stubEnv("VITE_APP_BASE_URL", "https://app.carelune.in");
    expect(appUrl("/login")).toBe("https://app.carelune.in/login");
    expect(appUrl("login")).toBe("https://app.carelune.in/login");
    expect(appUrl()).toBe("https://app.carelune.in/");
  });

  it("points sign-in and password recovery at the app login page", () => {
    vi.stubEnv("VITE_APP_BASE_URL", "https://app.carelune.in");
    expect(loginUrl()).toBe("https://app.carelune.in/login");
    expect(passwordRecoveryRedirectUrl()).toBe("https://app.carelune.in/login");
  });

  it("encodes the token in a registration link", () => {
    vi.stubEnv("VITE_APP_BASE_URL", "https://app.carelune.in");
    expect(registerUrl("abc 123/&x")).toBe("https://app.carelune.in/?register=abc%20123%2F%26x");
  });
});

describe("legacy marketing → app forwarding (client fallback)", () => {
  const at = (pathname: string, search = "", hash = "") => {
    vi.stubEnv("VITE_APP_BASE_URL", "https://app.carelune.in");
    return legacyForwardTarget({ pathname, search, hash });
  };

  it("forwards /login (preserving any query, e.g. a recovery token)", () => {
    expect(at("/login")).toBe("https://app.carelune.in/login");
    expect(at("/login", "?type=recovery&token=xyz")).toBe("https://app.carelune.in/login?type=recovery&token=xyz");
  });

  it("forwards a registration link with just the token", () => {
    expect(at("/", "?register=TOK123")).toBe("https://app.carelune.in/?register=TOK123");
  });

  it("preserves the ENTIRE query string when a registration URL carries extra params", () => {
    expect(at("/", "?register=TOK123&utm_source=wa&ref=partner")).toBe(
      "https://app.carelune.in/?register=TOK123&utm_source=wa&ref=partner",
    );
  });

  it("preserves the hash fragment too", () => {
    expect(at("/", "?register=TOK123", "#step2")).toBe("https://app.carelune.in/?register=TOK123#step2");
  });

  it("leaves ordinary marketing pages in place (no forward)", () => {
    expect(at("/")).toBeNull();
    expect(at("/", "?utm_source=wa")).toBeNull();
    expect(at("/about")).toBeNull();
  });
});
