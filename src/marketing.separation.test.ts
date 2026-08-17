import { afterEach, describe, expect, it, vi } from "vitest";
import { loginUrl } from "./config/urls";

afterEach(() => vi.unstubAllEnvs());

describe("marketing separation", () => {
  it("imports the landing WITHOUT pulling in Supabase/auth", async () => {
    // src/lib/supabase throws at import time when VITE_SUPABASE_* is unset. This
    // test runs with no such env, so a clean import proves the landing's module
    // graph contains no Supabase/auth/application code.
    const mod = await import("./screens/marketing/Landing");
    expect(typeof mod.default).toBe("function");
  });

  it("resolves the marketing sign-in link to the configured app origin", () => {
    vi.stubEnv("VITE_APP_BASE_URL", "https://app.carelune.in");
    expect(loginUrl()).toBe("https://app.carelune.in/login");
  });
});
