import { describe, expect, it } from "vitest";
import { parseRecoveryLink } from "./recoveryLink";

const parts = (hash = "", search = "") => ({ hash, search });

describe("recovery link detection", () => {
  it("recognises the implicit-flow recovery hash Supabase actually sends", () => {
    const link = parseRecoveryLink(
      parts("#access_token=abc123&expires_in=3600&refresh_token=xyz&token_type=bearer&type=recovery"),
    );
    expect(link).toEqual({ kind: "recovery" });
  });

  it("recognises a recovery marker in the query string too", () => {
    // Survives a switch of auth flow without a code change.
    expect(parseRecoveryLink(parts("", "?type=recovery"))).toEqual({ kind: "recovery" });
  });

  it("treats an ordinary sign-in URL as no recovery at all", () => {
    expect(parseRecoveryLink(parts("", ""))).toEqual({ kind: "none" });
    expect(parseRecoveryLink(parts("#/patient/today"))).toEqual({ kind: "none" });
    // An email confirmation is a session, not a password reset.
    expect(parseRecoveryLink(parts("#access_token=abc&type=signup"))).toEqual({ kind: "none" });
  });

  it("explains an expired link in plain language", () => {
    const link = parseRecoveryLink(
      parts("#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired"),
    );
    expect(link.kind).toBe("error");
    if (link.kind !== "error") throw new Error("expected an error link");
    expect(link.message).toContain("expired");
    // Never leaks the raw error code to the person reading it.
    expect(link.message).not.toContain("otp_expired");
  });

  it("falls back to the server's description when the code is unfamiliar", () => {
    const link = parseRecoveryLink(parts("#error=server_error&error_description=Something+specific+went+wrong"));
    if (link.kind !== "error") throw new Error("expected an error link");
    expect(link.message).toBe("Something specific went wrong.");
  });

  it("still produces a useful message when the link carries no description", () => {
    const link = parseRecoveryLink(parts("#error=unexpected_failure"));
    if (link.kind !== "error") throw new Error("expected an error link");
    expect(link.message.length).toBeGreaterThan(0);
    expect(link.message).toMatch(/request a new one/i);
  });

  it("reports an error even when a recovery marker is also present", () => {
    // A failed link must never be mistaken for a usable one.
    expect(parseRecoveryLink(parts("#type=recovery&error_code=otp_expired")).kind).toBe("error");
  });
});
