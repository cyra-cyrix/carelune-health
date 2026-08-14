import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Visual-QA harness config. Serves screenshot.html and swaps the data/auth layer
// for local synthetic stubs so the REAL production doctor screens render without
// Supabase, network or credentials. Used only for capturing screenshots — the
// production app is built with the default vite.config.ts and is untouched.
const root = __dirname;

function harnessMocks() {
  return {
    name: "carelune-harness-mocks",
    enforce: "pre" as const,
    resolveId(source: string, importer: string | undefined) {
      // The mocks themselves import the real modules (for types) — don't rewrite those.
      if (importer && importer.includes(`${path.sep}screenshot${path.sep}`)) return null;
      if (source.endsWith("/lib/db")) return path.resolve(root, "src/screenshot/dbMock.tsx");
      if (source.endsWith("/lib/supabase")) return path.resolve(root, "src/screenshot/supabaseStub.ts");
      if (source.endsWith("/auth/AuthProvider") || source.endsWith("/AuthProvider"))
        return path.resolve(root, "src/screenshot/authMock.tsx");
      return null;
    },
  };
}

export default defineConfig({
  plugins: [harnessMocks(), react()],
  // Only crawl the harness page — never the full app / sibling apps, whose screens
  // import db functions the synthetic mock intentionally doesn't provide.
  optimizeDeps: { entries: ["screenshot.html"] },
  // HMR off: the persistent HMR websocket keeps the network "busy", which stalls
  // Chrome's --virtual-time-budget during headless capture.
  server: { port: 5182, host: true, strictPort: true, hmr: false },
});
