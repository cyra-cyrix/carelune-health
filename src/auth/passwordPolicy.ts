/*
 * The rules for choosing a new password, kept pure so both the copy and the
 * thresholds are unit-testable without rendering a form.
 *
 * Deliberately modest: a length floor and a confirmation match. Carelune does
 * not impose character-class rules — they push people towards predictable
 * substitutions without materially improving strength — and Supabase remains
 * the authority on anything it rejects server-side.
 */

/** Minimum length for a password the person chooses themselves. */
export const MIN_PASSWORD_LENGTH = 8;

export const PASSWORD_RULE_HINT = `At least ${MIN_PASSWORD_LENGTH} characters.`;

/**
 * Returns a human-readable problem with the pair, or null when it is acceptable.
 * The order matters: complain about the password itself before the match, so a
 * short password isn't reported as a mismatch while it is still being typed.
 */
export function validateNewPassword(password: string, confirm: string): string | null {
  if (password.trim().length === 0) return "Enter a new password.";
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (confirm.length === 0) return "Re-enter the password to confirm it.";
  if (password !== confirm) return "The two passwords don't match.";
  return null;
}
