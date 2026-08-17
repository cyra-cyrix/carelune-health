/**
 * The ONE source of truth for the two Carelune product origins and every URL we
 * generate that crosses between them (sign-in, patient registration, password
 * recovery). Never hardcode "carelune.in" or "app.carelune.in" anywhere else —
 * import from here so a domain change is a one-line edit.
 *
 * Resolution rules
 * ----------------
 * • `VITE_APP_BASE_URL` / `VITE_MARKETING_BASE_URL` (build-time env, set per
 *   Netlify site) win when present. This is the architecture: base URLs are a
 *   build input, not runtime hostname sniffing.
 * • The MARKETING build bakes `VITE_APP_BASE_URL` (see vite.marketing.config.ts)
 *   so its "Sign in" link points at the app origin even though it is served from
 *   carelune.in.
 * • The APP build leaves `VITE_APP_BASE_URL` unset on purpose, so app-internal
 *   links (registration, password recovery) fall back to the *current* origin —
 *   which is app.carelune.in in production and localhost/preview elsewhere, so
 *   generated links always work in the environment that created them.
 */

const DEFAULT_APP_BASE = "https://app.carelune.in";
const DEFAULT_MARKETING_BASE = "https://carelune.in";

const trimTrailingSlash = (s: string) => s.replace(/\/+$/, "");

function readEnv(value: string | undefined): string | null {
  const raw = value?.trim();
  return raw && raw.length > 0 ? trimTrailingSlash(raw) : null;
}

/** The authenticated application origin (no trailing slash). */
export function appBaseUrl(): string {
  const env = readEnv(import.meta.env.VITE_APP_BASE_URL);
  if (env) return env;
  if (typeof window !== "undefined" && window.location?.origin) return window.location.origin;
  return DEFAULT_APP_BASE;
}

/** The public marketing origin (no trailing slash). */
export function marketingBaseUrl(): string {
  const env = readEnv(import.meta.env.VITE_MARKETING_BASE_URL);
  if (env) return env;
  if (typeof window !== "undefined" && window.location?.origin) return window.location.origin;
  return DEFAULT_MARKETING_BASE;
}

/** Absolute URL under the application origin for `path` (defaults to "/"). */
export function appUrl(path = "/"): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${appBaseUrl()}${p}`;
}

/** The application sign-in page. */
export const loginUrl = (): string => appUrl("/login");

/** A patient-registration link for `token` (opens the family registration flow). */
export const registerUrl = (token: string): string => appUrl(`/?register=${encodeURIComponent(token)}`);

/**
 * Where Supabase password-recovery / email-confirmation links should land. It
 * must be an allow-listed redirect URL in the Supabase dashboard. We send users
 * to the app sign-in page; AuthProvider detects the PASSWORD_RECOVERY event and
 * shows "set a new password" regardless of the path.
 */
export const passwordRecoveryRedirectUrl = (): string => appUrl("/login");

/**
 * Client-side legacy-link fallback for the marketing origin. If an old app URL
 * (a registration link, or `/login`) still lands on carelune.in, compute the
 * equivalent app URL — swapping ONLY the origin and preserving the entire path,
 * query string AND hash (so a registration token plus any additional query
 * parameters survive intact). Returns null when the URL is a normal marketing
 * page that should stay put.
 */
export function legacyForwardTarget(loc: { pathname: string; search: string; hash: string }): string | null {
  let hasRegister = false;
  try {
    hasRegister = new URLSearchParams(loc.search).has("register");
  } catch {
    hasRegister = false;
  }
  if (!hasRegister && loc.pathname !== "/login") return null;
  return `${appBaseUrl()}${loc.pathname}${loc.search}${loc.hash}`;
}
