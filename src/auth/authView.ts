/*
 * The pure routing decision for the application's AuthGate, extracted so it can
 * be unit-tested in a node environment (this repo's jsdom + React render tests
 * are unreliable under the Deno-managed node_modules). AuthGate composes this
 * with the URL-normalisation effects and the actual screens.
 *
 * On the APPLICATION domain there is deliberately no "landing" view: an
 * unauthenticated visitor always resolves to "signin".
 */
export type AuthView = "loading" | "legal" | "recovery" | "signin" | "app";

export interface AuthState {
  loading: boolean;
  hasSession: boolean;
  passwordRecovery: boolean;
  path: string;
  legalReady: boolean;
  legalPaths: readonly string[];
}

export function computeAuthView(s: AuthState): AuthView {
  // Published legal/trust pages render independently of auth.
  if (s.legalReady && s.legalPaths.includes(s.path)) return "legal";
  if (s.loading) return "loading";
  if (s.passwordRecovery) return "recovery";
  if (!s.hasSession) return "signin";
  return "app";
}
