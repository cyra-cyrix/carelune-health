/*
 * The pure routing decision for the application's AuthGate, extracted so it can
 * be unit-tested in a node environment (this repo's jsdom + React render tests
 * are unreliable under the Deno-managed node_modules). AuthGate composes this
 * with the URL-normalisation effects and the actual screens.
 *
 * On the APPLICATION domain there is deliberately no "landing" view: an
 * unauthenticated visitor always resolves to "signin".
 */
export type AuthView = "loading" | "legal" | "recovery" | "recovery-error" | "signin" | "app";

export interface AuthState {
  loading: boolean;
  hasSession: boolean;
  passwordRecovery: boolean;
  /** The recovery link itself was expired or malformed. */
  recoveryError: boolean;
  path: string;
  legalReady: boolean;
  legalPaths: readonly string[];
}

export function computeAuthView(s: AuthState): AuthView {
  // Published legal/trust pages render independently of auth.
  if (s.legalReady && s.legalPaths.includes(s.path)) return "legal";
  // A dead reset link is explained immediately — ahead of the splash, so the
  // person is never left watching a spinner resolve into an unexplained
  // sign-in screen.
  if (s.recoveryError) return "recovery-error";
  if (s.loading) return "loading";
  // Recovery outranks the session check: the link DOES create a real session,
  // so without this the app would happily route a Super Admin to the console.
  if (s.passwordRecovery) return "recovery";
  if (!s.hasSession) return "signin";
  return "app";
}
