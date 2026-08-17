/*
 * Service-worker cache policy — the single source of truth, kept pure so it can
 * be unit-tested and imported by the worker (src/pwa/sw.ts) alike.
 *
 * Clinical-safety rules baked in here:
 *   • Never cache anything cross-origin. All Supabase traffic (REST, Auth,
 *     Realtime, Storage, Edge Functions) is a *different* origin, so it is never
 *     intercepted — no patient records, readings, medicines or messages are ever
 *     stored by the worker, and there are no offline clinical writes.
 *   • Never cache same-origin API-shaped paths either (defence in depth).
 *   • Only content-hashed static shell assets are cache-first; documents are
 *     network-first so a clinician is never served a stale interface while online.
 */

export const SHELL_CACHE = "carelune-app-shell-v1";

/** The offline fallback document (the app start URL). */
export const SHELL_URL = "/";

/** Same-origin path prefixes whose responses are immutable, content-hashed shell assets. */
export const STATIC_CACHE_PREFIXES = ["/assets/", "/fonts/", "/icons/"] as const;

/**
 * Same-origin path prefixes that must NEVER be cached even though they share the
 * origin — anything that could carry auth state or PHI.
 */
export const NEVER_CACHE_PREFIXES = ["/auth/", "/rest/", "/realtime/", "/storage/", "/functions/", "/api/"] as const;

export type CacheDecision = "static" | "navigation" | "bypass";

export interface RequestFacts {
  method: string;
  url: string;
  /** Request.mode, e.g. "navigate". */
  mode?: string;
  /** Request.destination, e.g. "document". */
  destination?: string;
  /** The service worker's own origin (self.location.origin). */
  swOrigin: string;
}

/**
 * Decide how the worker should treat a request:
 *   • "static"     → cache-first (immutable hashed shell asset)
 *   • "navigation" → network-first with cached shell as offline fallback
 *   • "bypass"     → do not intercept; never cache (cross-origin, API, non-GET, PHI)
 */
export function classifyRequest(facts: RequestFacts): CacheDecision {
  if (facts.method !== "GET") return "bypass";

  let u: URL;
  try {
    u = new URL(facts.url);
  } catch {
    return "bypass";
  }

  // Cross-origin (e.g. the Supabase project origin) is never touched.
  if (u.origin !== facts.swOrigin) return "bypass";

  // Same-origin but sensitive/API-shaped path — never cache.
  if (NEVER_CACHE_PREFIXES.some((p) => u.pathname.startsWith(p))) return "bypass";

  // Immutable, content-hashed shell assets — safe to serve cache-first.
  if (STATIC_CACHE_PREFIXES.some((p) => u.pathname.startsWith(p))) return "static";

  // Documents / navigations — network-first, fall back to the cached shell offline.
  if (facts.mode === "navigate" || facts.destination === "document") return "navigation";

  return "bypass";
}
