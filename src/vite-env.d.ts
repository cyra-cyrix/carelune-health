/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Supabase project URL (client-safe). */
  readonly VITE_SUPABASE_URL?: string;
  /** Supabase publishable (anon) key — never the service_role key. */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  /** Authenticated app origin, e.g. https://app.carelune.in. See src/config/urls.ts. */
  readonly VITE_APP_BASE_URL?: string;
  /** Public marketing origin, e.g. https://carelune.in. See src/config/urls.ts. */
  readonly VITE_MARKETING_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
