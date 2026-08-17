import { promises as fs } from "node:fs";
import path from "node:path";

/*
 * Proves the marketing/app separation on the BUILT output. Run after
 * `npm run build`. Exits non-zero (with a report) if any invariant is violated.
 */

const ROOT = process.cwd();
const APP = path.join(ROOT, "dist/app");
const MKT = path.join(ROOT, "dist/marketing");

const results = [];
const ok = (m) => results.push({ pass: true, m });
const bad = (m) => results.push({ pass: false, m });

async function read(p) {
  try { return await fs.readFile(p, "utf8"); } catch { return null; }
}
async function exists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}
async function jsBundle(dir) {
  // Concatenate every emitted JS chunk so a marker in any chunk is caught.
  const assets = path.join(dir, "assets");
  let out = "";
  try {
    for (const f of await fs.readdir(assets)) {
      if (f.endsWith(".js")) out += await read(path.join(assets, f));
    }
  } catch { /* no assets dir */ }
  return out;
}

async function main() {
  // --- No root config can override a site's UI build command / publish dir ---
  // Netlify's repo netlify.toml [build] command/publish takes precedence over a
  // site's UI settings. Since both sites build from this one repo, a root [build]
  // command/publish would force BOTH sites to the same output. Assert none exists.
  const rootToml = await read(path.join(ROOT, "netlify.toml"));
  if (rootToml === null) {
    ok("no root netlify.toml (each Netlify site uses its own UI build command + publish dir)");
  } else {
    /(^|\n)\s*command\s*=/.test(rootToml)
      ? bad("root netlify.toml sets a [build] command that would override both sites")
      : ok("root netlify.toml sets no build command");
    /(^|\n)\s*publish\s*=/.test(rootToml)
      ? bad("root netlify.toml sets a publish dir that would override both sites")
      : ok("root netlify.toml sets no publish dir");
  }

  // --- Both builds exist with their own root document -----------------------
  (await exists(path.join(APP, "index.html"))) ? ok("app: dist/app/index.html exists") : bad("app: dist/app/index.html MISSING");
  (await exists(path.join(MKT, "index.html"))) ? ok("marketing: dist/marketing/index.html exists") : bad("marketing: dist/marketing/index.html MISSING");

  const appJs = await jsBundle(APP);
  const mktJs = await jsBundle(MKT);

  // --- Marketing bundle contains NO app/auth/supabase code ------------------
  for (const marker of ["createClient", "supabase", "resetPasswordForEmail", "AuthProvider", "serviceWorker"]) {
    mktJs.includes(marker) ? bad(`marketing bundle unexpectedly contains "${marker}"`) : ok(`marketing bundle excludes "${marker}"`);
  }
  // A marker unique to the marketing landing (NOT the shared legal/trust module,
  // which the app legitimately imports for its gated LEGAL_* constants).
  const LANDING_MARKER = "One connected care journey";
  // Marketing SHOULD contain the landing (sanity that the right entry built).
  mktJs.includes(LANDING_MARKER) ? ok("marketing bundle contains the landing") : bad("marketing bundle is missing the landing");

  // --- App bundle contains NO marketing landing -----------------------------
  appJs.includes(LANDING_MARKER) ? bad("app bundle unexpectedly contains the marketing landing") : ok("app bundle excludes the marketing landing");

  // --- Marketing exposes no PWA surface -------------------------------------
  (await exists(path.join(MKT, "manifest.webmanifest"))) ? bad("marketing exposes manifest.webmanifest") : ok("marketing has no manifest.webmanifest");
  (await exists(path.join(MKT, "sw.js"))) ? bad("marketing exposes sw.js") : ok("marketing has no sw.js");
  (await exists(path.join(MKT, "icons"))) ? bad("marketing exposes /icons") : ok("marketing has no /icons");

  // --- App exposes the full PWA surface -------------------------------------
  for (const f of ["manifest.webmanifest", "sw.js", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable.png"]) {
    (await exists(path.join(APP, f))) ? ok(`app has ${f}`) : bad(`app is MISSING ${f}`);
  }

  // --- Service worker never references Supabase -----------------------------
  const sw = (await read(path.join(APP, "sw.js"))) ?? "";
  sw.includes("supabase") ? bad("sw.js references supabase") : ok("sw.js has no supabase reference");

  // --- HTML documents: indexing + manifest ----------------------------------
  const appHtml = (await read(path.join(APP, "index.html"))) ?? "";
  const mktHtml = (await read(path.join(MKT, "index.html"))) ?? "";
  appHtml.includes("noindex") ? ok("app index.html is noindex") : bad("app index.html is NOT noindex");
  appHtml.includes("manifest.webmanifest") ? ok("app index.html links the manifest") : bad("app index.html does not link the manifest");
  mktHtml.includes("noindex") ? bad("marketing index.html is noindex (should be indexable)") : ok("marketing index.html is indexable");
  mktHtml.includes('rel="canonical"') && mktHtml.includes("https://carelune.in/") ? ok("marketing index.html has the carelune.in canonical") : bad("marketing index.html canonical missing/wrong");
  mktHtml.includes("manifest.webmanifest") ? bad("marketing index.html links a manifest") : ok("marketing index.html has no manifest link");

  // --- robots / headers / redirects -----------------------------------------
  const appRobots = (await read(path.join(APP, "robots.txt"))) ?? "";
  const mktRobots = (await read(path.join(MKT, "robots.txt"))) ?? "";
  appRobots.includes("Disallow: /") ? ok("app robots.txt disallows all") : bad("app robots.txt does not disallow all");
  /Disallow:\s*$/m.test(mktRobots) ? ok("marketing robots.txt allows indexing") : bad("marketing robots.txt does not allow indexing");

  const appRedir = (await read(path.join(APP, "_redirects"))) ?? "";
  const mktRedir = (await read(path.join(MKT, "_redirects"))) ?? "";
  appRedir.includes("/index.html") ? ok("app _redirects has SPA fallback") : bad("app _redirects missing SPA fallback");
  mktRedir.includes("register=:token") && mktRedir.includes("app.carelune.in") ? ok("marketing _redirects forwards legacy register links to the app") : bad("marketing _redirects missing legacy register forwarding");
  mktRedir.includes("/login") && mktRedir.includes("app.carelune.in/login") ? ok("marketing _redirects forwards /login to the app") : bad("marketing _redirects missing /login forwarding");

  // --- Report ---------------------------------------------------------------
  const fails = results.filter((r) => !r.pass);
  for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.m}`);
  console.log(`\n${results.length - fails.length}/${results.length} checks passed.`);
  if (fails.length) {
    console.error(`\n${fails.length} SEPARATION CHECK(S) FAILED.`);
    process.exit(1);
  }
  console.log("Separation verified.");
}

main();
