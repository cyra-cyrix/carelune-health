import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";

/*
 * One Vite plugin that owns the per-site static output, so the marketing/app
 * separation (PWA, robots, security headers, redirects) is defined in exactly one
 * place. Use `siteAssets({ target: "app" })` in the application build and
 * `siteAssets({ target: "marketing" })` in the marketing build.
 *
 *   APP        → builds /sw.js from src/pwa/sw.ts (esbuild), keeps the PWA manifest
 *                + icons (copied from public/), noindex robots + security headers,
 *                SPA fallback.
 *   MARKETING  → renames marketing.html → index.html, DELETES any PWA manifest /
 *                icons / sw.js that public/ copied in (so the marketing site never
 *                exposes them), indexable robots, security headers, SPA fallback +
 *                legacy-link redirects that forward old app URLs to the app origin.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const SW_SOURCE = path.resolve(here, "../src/pwa/sw.ts");

const SECURITY_HEADERS = [
  "  X-Content-Type-Options: nosniff",
  "  X-Frame-Options: SAMEORIGIN",
  "  Referrer-Policy: strict-origin-when-cross-origin",
];

const IMMUTABLE = [
  "/assets/*",
  "  Cache-Control: public, max-age=31536000, immutable",
  "/fonts/*",
  "  Cache-Control: public, max-age=31536000, immutable",
];

function appHeaders() {
  return [
    "/*",
    ...SECURITY_HEADERS,
    // The application must never be indexed.
    "  X-Robots-Tag: noindex, nofollow",
    ...IMMUTABLE,
    // The worker + manifest must always revalidate so updates ship promptly.
    "/sw.js",
    "  Cache-Control: no-cache",
    "/manifest.webmanifest",
    "  Cache-Control: no-cache",
    "  Content-Type: application/manifest+json",
    "",
  ].join("\n");
}

function marketingHeaders() {
  return ["/*", ...SECURITY_HEADERS, ...IMMUTABLE, ""].join("\n");
}

const APP_ROBOTS = "# The Carelune application must never be indexed.\nUser-agent: *\nDisallow: /\n";
const MARKETING_ROBOTS = "# Public marketing site — indexable.\nUser-agent: *\nDisallow:\n";

const APP_REDIRECTS = "# Application SPA fallback — every non-asset path serves index.html.\n/*    /index.html    200\n";

function marketingRedirects(appBase) {
  const base = appBase.replace(/\/+$/, "");
  return [
    "# Legacy-link compatibility: forward old application URLs that still hit the",
    "# marketing origin to the app, preserving the complete token/query string.",
    "# (Netlify also appends any remaining original query params to 301 targets.)",
    `/    register=:token    ${base}/?register=:token    301!`,
    `/login    ${base}/login    301!`,
    "",
    "# Marketing SPA fallback.",
    "/*    /index.html    200",
    "",
  ].join("\n");
}

async function rm(target) {
  await fs.rm(target, { recursive: true, force: true });
}

export function siteAssets({ target, appBaseUrl }) {
  const isApp = target === "app";
  return {
    name: `carelune-site-assets:${target}`,
    apply: "build",
    async writeBundle(options) {
      const outDir = options.dir;
      if (!outDir) return;

      // Per-site robots + headers + redirects.
      await fs.writeFile(path.join(outDir, "robots.txt"), isApp ? APP_ROBOTS : MARKETING_ROBOTS);
      await fs.writeFile(path.join(outDir, "_headers"), isApp ? appHeaders() : marketingHeaders());
      await fs.writeFile(
        path.join(outDir, "_redirects"),
        isApp ? APP_REDIRECTS : marketingRedirects(appBaseUrl ?? "https://app.carelune.in"),
      );

      if (isApp) {
        // Build the service worker to /sw.js (bundles cachePolicy.ts, no hash so
        // the scope is stable at the origin root).
        await esbuild({
          entryPoints: [SW_SOURCE],
          outfile: path.join(outDir, "sw.js"),
          bundle: true,
          format: "iife",
          platform: "browser",
          target: "es2020",
          minify: true,
          legalComments: "none",
        });
      } else {
        // Marketing: give the site a root index.html and strip anything PWA that
        // public/ copied in, so the marketing origin never exposes the manifest,
        // icons or a service worker.
        const built = path.join(outDir, "marketing.html");
        try {
          await fs.rename(built, path.join(outDir, "index.html"));
        } catch {
          /* if Vite already emitted index.html, nothing to do */
        }
        await rm(path.join(outDir, "manifest.webmanifest"));
        await rm(path.join(outDir, "icons"));
        await rm(path.join(outDir, "sw.js"));
      }
    },
  };
}
