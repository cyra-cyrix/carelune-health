/*
 * Retry-on-401 fetch for the Supabase client — the single fix for "the first tap
 * fails, the second one works".
 *
 * THE BUG IT SOLVES
 * -----------------
 * supabase-js resolves every request's Authorization header through:
 *
 *     _getAccessToken() { return (await this._getSessionToken()) ?? this.supabaseKey }
 *
 * If `getSession()` yields null for even a moment — most commonly when the access
 * token expired while the tab or installed PWA was backgrounded and the refresh is
 * still in flight — the client SILENTLY falls back to the publishable key instead
 * of the user's JWT. It does not raise; it just sends the request unauthenticated.
 *
 * With the modern `sb_publishable_…` key format that value is not even a JWT, so:
 *   • Edge Functions are rejected by the gateway (401) before our code runs;
 *   • PostgREST evaluates the request as `anon`, and RLS correctly denies it.
 * Moments later the refresh lands, and an identical second tap succeeds.
 *
 * Installing this wrapper as the client's `global.fetch` fixes PostgREST, Edge
 * Functions and Storage in one place, instead of wrapping every call site.
 *
 * WHY RETRYING IS SAFE FOR NON-IDEMPOTENT WRITES
 * ----------------------------------------------
 * We retry only on 401. A 401 means the request was rejected *before* any handler
 * ran — the gateway refused the token, or RLS denied an anonymous caller — so the
 * server performed no work and there is nothing to duplicate. Every other status,
 * including 403/409/5xx, is returned untouched.
 *
 * Requests to `/auth/v1/` are never retried, so the refresh call itself can never
 * recurse through this wrapper.
 */

/**
 * Shown when a request is still unauthenticated after one refresh and retry. At
 * that point it is a genuine sign-in problem rather than a transient blip, so say
 * so in plain language instead of leaking the gateway's
 * `UNAUTHORIZED_NO_AUTH_HEADER` JSON to a caregiver.
 *
 * Lives here rather than in db.ts so it can be unit-tested — importing db.ts
 * pulls in the Supabase client, which throws when VITE_SUPABASE_* is unset.
 */
export const SESSION_EXPIRED_MESSAGE = "Your session has expired. Please sign in again to continue.";

/** PostgREST codes that mean "the JWT is missing, expired or invalid". */
const AUTH_ERROR_CODES = new Set(["PGRST301", "PGRST302", "401"]);

/** True when a failure is an expired/absent session rather than a real denial. */
export function isSessionExpired(e: unknown): boolean {
  const o = e as { code?: string; status?: number; message?: string } | null;
  if (o?.status === 401) return true;
  if (o?.code && AUTH_ERROR_CODES.has(o.code)) return true;
  return /\bJWT\b.*(expired|invalid)|missing authorization/i.test(o?.message ?? "");
}

/** Resolves a fresh access token, or null when the session cannot be recovered. */
export type RefreshFn = () => Promise<string | null>;

export interface AuthFetchDeps {
  /** The underlying fetch (injected so tests never touch the network). */
  baseFetch: typeof fetch;
  refresh: RefreshFn;
}

/** Supabase's own auth endpoints — refreshing these would recurse. */
const AUTH_PATH = "/auth/v1/";

/** The URL of a request, whatever form the caller passed it in. */
export function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

/**
 * Retry only an unauthenticated rejection, and never the token endpoint itself.
 * Exported so the policy is unit-testable independently of any I/O.
 */
export function shouldRetryWithFreshToken(status: number, url: string): boolean {
  if (status !== 401) return false;
  return !url.includes(AUTH_PATH);
}

/** A copy of `headers` with the bearer token replaced by `token`. */
export function withBearer(headers: HeadersInit | undefined, token: string): Headers {
  const next = new Headers(headers ?? {});
  next.set("Authorization", `Bearer ${token}`);
  return next;
}

/**
 * Wrap `baseFetch` so a 401 triggers one session refresh and one retry carrying
 * the fresh token. Returns the original response when the session cannot be
 * recovered, so callers still see a truthful failure rather than a hang.
 */
export function createAuthFetch({ baseFetch, refresh }: AuthFetchDeps): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    // A Request carries its body as a stream that fetch consumes, so keep a clone
    // for the retry. Plain URL + init callers (every Supabase client) skip this.
    const replay = typeof input === "object" && "clone" in input ? input.clone() : null;

    const first = await baseFetch(input, init);
    if (!shouldRetryWithFreshToken(first.status, requestUrl(input))) return first;

    let token: string | null = null;
    try {
      token = await refresh();
    } catch {
      // A failed refresh is not a new error to report — surface the original 401.
      return first;
    }
    if (!token) return first;

    if (replay) return baseFetch(new Request(replay, { headers: withBearer(replay.headers, token) }));
    return baseFetch(input, { ...init, headers: withBearer(init?.headers, token) });
  };
}
