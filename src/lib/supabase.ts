import { createClient } from "@supabase/supabase-js";

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

export const supabase = createClient(url, publishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // Needed so password-reset / confirmation redirect links complete the session.
    detectSessionInUrl: true,
  },
});
