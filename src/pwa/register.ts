/*
 * Service-worker registration for the APPLICATION build only. Called from
 * src/main.tsx behind `import.meta.env.PROD` so dev never registers a worker (and
 * the marketing build never imports this module at all).
 *
 * Safe update strategy: when a new worker is installed while an old one controls
 * the page, we tell it to activate immediately (SKIP_WAITING) and reload once on
 * controllerchange — a clinician is never left interacting with a stale shell.
 *
 * Logout safety: the worker only ever caches static shell assets (never PHI or
 * any Supabase response — see cachePolicy.ts), so there is no sensitive content
 * to retain across sign-out.
 */
export function registerServiceWorker(): void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        // A worker already waiting (e.g. from a previous visit) → activate it now.
        reg.waiting?.postMessage("SKIP_WAITING");
        reg.addEventListener("updatefound", () => {
          const next = reg.installing;
          if (!next) return;
          next.addEventListener("statechange", () => {
            if (next.state === "installed" && navigator.serviceWorker.controller) {
              next.postMessage("SKIP_WAITING");
            }
          });
        });
      })
      .catch(() => {
        // The PWA is a progressive enhancement; a registration failure must never
        // break the app.
      });
  });
}
