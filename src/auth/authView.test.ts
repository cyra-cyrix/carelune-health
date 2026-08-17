import { describe, expect, it } from "vitest";
import { computeAuthView } from "./authView";

const LEGAL = ["/privacy", "/terms"] as const;
const base = { loading: false, hasSession: false, passwordRecovery: false, path: "/", legalReady: false, legalPaths: LEGAL };

describe("AuthGate routing decision (application domain)", () => {
  it("sends an unauthenticated visitor to sign-in — never a landing — for any non-legal path", () => {
    expect(computeAuthView({ ...base, path: "/" })).toBe("signin");
    expect(computeAuthView({ ...base, path: "/login" })).toBe("signin");
    expect(computeAuthView({ ...base, path: "/anything" })).toBe("signin");
  });

  it("shows the app once a session exists", () => {
    expect(computeAuthView({ ...base, hasSession: true })).toBe("app");
  });

  it("shows the splash while loading", () => {
    expect(computeAuthView({ ...base, loading: true })).toBe("loading");
  });

  it("shows set-new-password during password recovery, ahead of the session check", () => {
    expect(computeAuthView({ ...base, hasSession: true, passwordRecovery: true })).toBe("recovery");
  });

  it("renders a legal page only when the legal layer is published", () => {
    expect(computeAuthView({ ...base, path: "/privacy", legalReady: false })).toBe("signin");
    expect(computeAuthView({ ...base, path: "/privacy", legalReady: true })).toBe("legal");
    // A published legal page renders even for a signed-in user.
    expect(computeAuthView({ ...base, path: "/terms", legalReady: true, hasSession: true })).toBe("legal");
  });
});
