import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { siteAssets } from "./scripts/siteAssets.mjs";

/*
 * The MARKETING build (carelune.in). Entry is marketing.html → src/marketing.tsx
 * (landing + legal only — no auth, no Supabase, no application code). Output is
 * dist/marketing, wholly separate from the application build (vite.config.js →
 * dist/app).
 *
 * Run with `--mode marketing` so Vite loads `.env.marketing`, which supplies
 * VITE_APP_BASE_URL — baked into the bundle so the "Sign in" link points at the
 * application origin even though this site is served from carelune.in.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const appBaseUrl = env.VITE_APP_BASE_URL || "https://app.carelune.in";

  return {
    plugins: [react(), siteAssets({ target: "marketing", appBaseUrl })],
    build: {
      outDir: "dist/marketing",
      rollupOptions: {
        input: path.resolve(__dirname, "marketing.html"),
        output: {
          manualChunks: { react: ["react", "react-dom"] },
        },
      },
    },
  };
});
