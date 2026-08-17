/*
 * Carelune application service worker (app.carelune.in only).
 *
 * Bundled to /sw.js by esbuild during the app build (see scripts/siteAssets.ts).
 * It runs in a WebWorker context, so it is excluded from the DOM typecheck in
 * tsconfig.json; all of its real logic lives in the unit-tested cachePolicy.ts.
 *
 * Guarantees:
 *   • Static shell assets only are cached (cache-first).
 *   • Documents are network-first, so an online clinician always gets the latest
 *     interface; the cached shell is a last-resort offline fallback only.
 *   • Nothing cross-origin (all Supabase API/Auth/Storage/Realtime/Functions) and
 *     nothing API-shaped is ever cached — no PHI at rest, no offline writes.
 *   • On activation, old caches are purged and the new worker takes control, so a
 *     user is never stranded on a stale clinical shell (safe update strategy).
 */
import { classifyRequest, SHELL_CACHE, SHELL_URL } from "./cachePolicy";

const sw = self as unknown as ServiceWorkerGlobalScope;

sw.addEventListener("install", (event: ExtendableEvent) => {
  // Precache the app shell document only. Hashed asset URLs are unknown at author
  // time and are cached lazily on first fetch instead.
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.add(SHELL_URL))
      .then(() => sw.skipWaiting())
      .catch(() => undefined),
  );
});

sw.addEventListener("activate", (event: ExtendableEvent) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== SHELL_CACHE).map((k) => caches.delete(k)));
      await sw.clients.claim();
    })(),
  );
});

sw.addEventListener("message", (event: ExtendableMessageEvent) => {
  if (event.data === "SKIP_WAITING") sw.skipWaiting();
});

sw.addEventListener("fetch", (event: FetchEvent) => {
  const decision = classifyRequest({
    method: event.request.method,
    url: event.request.url,
    mode: event.request.mode,
    destination: event.request.destination,
    swOrigin: sw.location.origin,
  });

  if (decision === "bypass") return; // let the network handle it; never cached
  if (decision === "static") {
    event.respondWith(cacheFirst(event.request));
  } else {
    event.respondWith(networkFirstShell(event.request));
  }
});

async function cacheFirst(request: Request): Promise<Response> {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(SHELL_CACHE);
    void cache.put(request, response.clone());
  }
  return response;
}

async function networkFirstShell(request: Request): Promise<Response> {
  try {
    const response = await fetch(request);
    if (response.ok && (request.mode === "navigate" || request.destination === "document")) {
      // Keep the freshest shell for offline fallback; online always wins.
      const cache = await caches.open(SHELL_CACHE);
      void cache.put(SHELL_URL, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(SHELL_URL);
    return cached ?? Response.error();
  }
}
