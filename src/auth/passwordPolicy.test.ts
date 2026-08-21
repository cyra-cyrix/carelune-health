import { describe, expect, it } from "vitest";
import { MIN_PASSWORD_LENGTH, validateNewPassword } from "./passwordPolicy";

describe("new-password validation", () => {
  it("accepts a matching pair that clears the length floor", () => {
    expect(validateNewPassword("correct-horse", "correct-horse")).toBeNull();
  });

  it("rejects a mismatched confirmation", () => {
    const problem = validateNewPassword("correct-horse", "correct-hoarse");
    expect(problem).toBe("The two passwords don't match.");
  });

  it("rejects a password below the minimum length", () => {
    const short = "a".repeat(MIN_PASSWORD_LENGTH - 1);
    expect(validateNewPassword(short, short)).toMatch(new RegExp(`${MIN_PASSWORD_LENGTH} characters`));
  });

  it("asks for a password before it asks about the confirmation", () => {
    // Otherwise an empty form reports a confusing "don't match".
    expect(validateNewPassword("", "")).toBe("Enter a new password.");
    expect(validateNewPassword("   ", "   ")).toBe("Enter a new password.");
  });

  it("asks for the confirmation when only the first field is filled", () => {
    expect(validateNewPassword("correct-horse", "")).toBe("Re-enter the password to confirm it.");
  });

  it("compares the passwords exactly — whitespace is significant", () => {
    expect(validateNewPassword("correct-horse ", "correct-horse")).toBe("The two passwords don't match.");
  });
});
