import { describe, expect, it } from "vitest";
import { computeAuthView } from "./authView";

const LEGAL = ["/privacy", "/terms"] as const;
const base = {
  loading: false,
  hasSession: false,
  passwordRecovery: false,
  recoveryError: false,
  path: "/",
  legalReady: false,
  legalPaths: LEGAL,
};

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

  it("holds a recovery session on the reset screen instead of the Super Admin console", () => {
    // The recovery link produces a genuine session; only the recovery flag keeps
    // the app out of reach. This is the exact bug seen on hosted staging.
    expect(computeAuthView({ ...base, hasSession: true, passwordRecovery: true })).toBe("recovery");
    // …and once the reset completes, normal routing resumes.
    expect(computeAuthView({ ...base, hasSession: true, passwordRecovery: false })).toBe("app");
  });

  it("explains an expired or invalid recovery link instead of showing the app", () => {
    expect(computeAuthView({ ...base, recoveryError: true })).toBe("recovery-error");
    // Even with a session present, the dead link is explained rather than ignored.
    expect(computeAuthView({ ...base, recoveryError: true, hasSession: true })).toBe("recovery-error");
    // It also wins over the loading splash, so there is no unexplained spinner.
    expect(computeAuthView({ ...base, recoveryError: true, loading: true })).toBe("recovery-error");
  });

  it("renders a legal page only when the legal layer is published", () => {
    expect(computeAuthView({ ...base, path: "/privacy", legalReady: false })).toBe("signin");
    expect(computeAuthView({ ...base, path: "/privacy", legalReady: true })).toBe("legal");
    // A published legal page renders even for a signed-in user.
    expect(computeAuthView({ ...base, path: "/terms", legalReady: true, hasSession: true })).toBe("legal");
  });
});
