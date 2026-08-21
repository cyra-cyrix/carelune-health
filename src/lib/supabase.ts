// FIRST, deliberately: creating the client below starts auth-js's session
// detection, which reads the password-recovery hash and then erases it from the
// URL. Importing this module here guarantees the link is captured before that
// can happen, whatever order anything else imports things in.
import "../auth/recoveryLink";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createAuthFetch } from "./authFetch";

/**
 * The one Supabase client for the app. Uses the client-safe *publishable* key
 * (Vite inlines it into the bundle — never reference the service_role key here).
 * Configure via `.env.local` (see `.env.example`).
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

if (!url || !publishableKey) {
  throw new Error(
    "Missing Supabase config. Copy .env.example to .env.local and set " +
      "VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY, then restart `npm run dev`.",
  );
}

/*
 * Session recovery (see ./authFetch for the full explanation).
 *
 * supabase-js falls back to the publishable key whenever `getSession()` is
 * momentarily null — typically when the access token expired while the tab or
 * installed PWA was backgrounded. The request then goes out unauthenticated and
 * is rejected with a 401, which is what made the FIRST tap of every CTA fail
 * while an identical second tap succeeded.
 *
 * `authFetch` turns that into one refresh + one retry, so the user never sees it.
 * The refresh is deduplicated: a burst of parallel 401s triggers a single token
 * request rather than one per in-flight call.
 */
let client: SupabaseClient | null = null;
let inFlightRefresh: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (!client) return null;
  if (!inFlightRefresh) {
    inFlightRefresh = client.auth
      .refreshSession()
      .then(({ data, error }) => (error ? null : (data.session?.access_token ?? null)))
      .catch(() => null)
      .finally(() => {
        inFlightRefresh = null;
      });
  }
  return inFlightRefresh;
}

client = createClient(url, publishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // Needed so password-reset / confirmation redirect links complete the session.
    detectSessionInUrl: true,
  },
  global: {
    fetch: createAuthFetch({
      // Bind to preserve the platform's own `this` (undici/whatwg fetch).
      baseFetch: (input, init) => fetch(input, init),
      refresh: refreshAccessToken,
    }),
  },
});

export const supabase = client;
