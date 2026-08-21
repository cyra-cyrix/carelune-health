/*
 * Password-recovery link detection.
 *
 * Why this module exists
 * ---------------------
 * The Supabase client is created with `detectSessionInUrl: true`, so auth-js
 * reads the recovery link's hash during its own async `initialize()`, emits
 * `PASSWORD_RECOVERY`, and then *strips the hash* with `history.replaceState`.
 * `AuthProvider` subscribes to `onAuthStateChange` from a `useEffect`, which
 * only runs after React mounts — by then the event has usually already fired
 * and the URL is clean. The provider therefore never learned it was a recovery
 * session, saw a perfectly valid session, and routed straight to the role
 * workspace (a Super Admin landed on the console with no chance to set a
 * password). Locally the race happened to be won; hosted it was lost.
 *
 * The fix is to stop depending on that race. Module evaluation is synchronous
 * and always completes before any promise continuation, so reading
 * `window.location` here captures the link before auth-js can erase it. The
 * `PASSWORD_RECOVERY` subscription stays as a second, independent signal.
 *
 * Parsing is a pure function so it can be unit-tested without a browser.
 */

export type RecoveryLink =
  | { kind: "none" }
  | { kind: "recovery" }
  | { kind: "error"; message: string };

/** The parts of a URL a recovery redirect can carry its parameters in. */
export interface UrlParts {
  hash: string;
  search: string;
}

/*
 * Supabase uses the implicit flow (auth-js's default), so a recovery link lands
 * as `#access_token=…&type=recovery`, and a dead one as
 * `#error=access_denied&error_code=otp_expired&error_description=…`.
 * Query-string equivalents are read too, so the detection survives a flow
 * change without a code change.
 */
const FRIENDLY_ERRORS: Record<string, string> = {
  otp_expired:
    "This password reset link has expired. Reset links are only valid for a short time — please request a new one.",
  access_denied:
    "This password reset link is no longer valid. It may already have been used, or a newer link may have replaced it.",
};

const GENERIC_ERROR =
  "This password reset link is not valid. Please request a new one from the sign-in page.";

export function parseRecoveryLink(parts: UrlParts): RecoveryLink {
  const hash = new URLSearchParams((parts.hash ?? "").replace(/^#/, ""));
  const query = new URLSearchParams(parts.search ?? "");
  const read = (key: string) => hash.get(key) ?? query.get(key);

  // A failed link carries an error instead of tokens. Report it rather than
  // dropping the person on a sign-in screen with no explanation.
  const code = read("error_code");
  const error = read("error");
  if (code || error) {
    const friendly = FRIENDLY_ERRORS[code ?? ""] ?? FRIENDLY_ERRORS[error ?? ""];
    // `error_description` arrives percent-encoded with "+" for spaces;
    // URLSearchParams decodes both.
    const described = read("error_description")?.trim();
    return { kind: "error", message: friendly ?? (described ? `${described}.` : GENERIC_ERROR) };
  }

  if (read("type") === "recovery") return { kind: "recovery" };
  return { kind: "none" };
}

/* ----------------------- the load-time capture ---------------------------- */

let captured: RecoveryLink = { kind: "none" };

/** Parse `parts` and remember the verdict. Called once at load; also the test seam. */
export function captureRecoveryLink(parts: UrlParts): RecoveryLink {
  captured = parseRecoveryLink(parts);
  return captured;
}

/** What the URL said when the app loaded. */
export function capturedRecoveryLink(): RecoveryLink {
  return captured;
}

/** Forget the captured link, once recovery is finished or the error dismissed. */
export function clearCapturedRecoveryLink(): void {
  captured = { kind: "none" };
}

// Runs at import time — synchronously, ahead of auth-js's async URL handling.
if (typeof window !== "undefined" && window.location) {
  captureRecoveryLink(window.location);
}
