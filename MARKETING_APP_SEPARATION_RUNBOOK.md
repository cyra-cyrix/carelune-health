# Carelune — Marketing / App PWA Separation Runbook

**Status:** Checkpoint 1 complete (code + build separation implemented and verified
locally). **Nothing here has been deployed.** No DNS, no Netlify site, no remote
Supabase setting has been changed. Execute the phases below, in order, only after
Checkpoint‑1 approval.

**Approved architecture**

| Product | Origin | Build | Publish dir | Indexed | PWA |
|---|---|---|---|---|---|
| Public marketing website | `https://carelune.in` | `npm run build:marketing` | `dist/marketing` | Yes | No |
| Authenticated application (all roles) | `https://app.carelune.in` | `npm run build:app` | `dist/app` | No (`noindex`) | Yes |

One GitHub repo, one Supabase project (`eixndbgphecohmandztq`), two Netlify sites.

---

## 1. What changed in the code (Checkpoint 1)

- **Two entries, two bundles, two output dirs.**
  - App: `index.html` → `src/main.tsx` → `dist/app` (`vite.config.js`).
  - Marketing: `marketing.html` → `src/marketing.tsx` → `dist/marketing`
    (`vite.marketing.config.ts`, run with `--mode marketing`).
- **App no longer bundles the marketing landing.** `AuthGate` routes an
  unauthenticated visitor to sign‑in (never the landing). Verified: the Landing
  component is absent from `dist/app` (`npm run verify:separation`).
- **Marketing bundles no Supabase/auth/app code, no manifest, no service worker.**
  Verified by `verify:separation` (28/28 checks).
- **Central URL config** `src/config/urls.ts` — the only place that knows the two
  origins. Registration links, staff/caregiver invites, and password‑recovery
  redirects all resolve through it.
- **App PWA:** `public/manifest.webmanifest` + `public/icons/*` + a service worker
  built from `src/pwa/sw.ts` to `dist/app/sw.js`. Registered only in the app,
  only in production (`src/main.tsx`). Restrained, dismissible install prompt shown
  **only to signed‑in users** (`src/pwa/InstallPrompt.tsx`, mounted in `App.tsx`).
- **Per‑site static files** (`robots.txt`, `_headers`, `_redirects`) are emitted
  into each publish dir at build time by `scripts/siteAssets.mjs`.

---

## 2. Build commands, outputs, environment variables

```bash
npm run build:app         # → dist/app  (application, PWA, noindex)
npm run build:marketing   # → dist/marketing  (public site, indexable)
npm run build             # both, in sequence
npm run verify:separation # asserts the two bundles are genuinely separate
```

**Environment variables (set per Netlify site → Site configuration → Environment):**

| Variable | App site (`app.carelune.in`) | Marketing site (`carelune.in`) |
|---|---|---|
| `VITE_SUPABASE_URL` | **required** (existing value) | not needed (marketing has no Supabase) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | **required** (existing publishable key) | not needed |
| `VITE_APP_BASE_URL` | **leave UNSET** (falls back to the current origin, i.e. `app.carelune.in`) | `https://app.carelune.in` |
| `VITE_MARKETING_BASE_URL` | `https://carelune.in` (optional; used by the app's "Back to home") | `https://carelune.in` |

> The marketing build already reads `VITE_APP_BASE_URL` from the committed,
> non‑secret `.env.marketing`. A Netlify env var overrides it if the app domain
> ever changes. **Never** put a `service_role` / secret key in either frontend.

---

## 3. Netlify — two deployment targets

Both sites deploy from the **same repo + branch**. **There is intentionally NO root
`netlify.toml` with a `[build]` command/publish.** Netlify's repo `netlify.toml`
takes precedence over a site's UI settings, so a single root build config in a
shared repo would force **both** sites to the same output (e.g. `carelune.in`
publishing the application build). Instead, **each site sets its own build command
and publish directory explicitly in the Netlify UI** (Site configuration → Build &
deploy → Build settings). The Node version is pinned site‑neutrally via `.nvmrc`
(`24`), which cannot override a build command or publish directory.

`npm run verify:separation` asserts the repo has no root build override.

### 3a. Application site (existing site, re‑pointed) — set BOTH in the UI
- Build command: `npm run build:app`
- Publish directory: `dist/app`
- Production domain: `app.carelune.in`
- Env: as table above (Supabase required; `VITE_APP_BASE_URL` unset).
- Headers / redirects / `noindex` / SPA fallback: emitted into `dist/app`.

### 3b. Marketing site (new site) — set BOTH in the UI
- Create a **second** Netlify site from the same GitHub repo.
- Build command: `npm run build:marketing`
- Publish directory: `dist/marketing`
- Production domain: `carelune.in`
- Env: `VITE_APP_BASE_URL=https://app.carelune.in` (+ optional `VITE_MARKETING_BASE_URL`).
- Headers / redirects / indexable `robots.txt` / SPA fallback: emitted into `dist/marketing`.

---

## 4. DNS

> **Never guess the DNS target.** Use the exact value Netlify shows for each site
> under **Domain management → your domain → DNS configuration**.

1. **App subdomain:** add a **CNAME** record `app` → *the exact target Netlify displays
   for the app site* (typically `<site-name>.netlify.app`, or the Netlify‑provided
   load‑balancer value). Do not invent it.
2. **Apex `carelune.in`:** point at the marketing site per Netlify's instructions
   (Netlify DNS, or an `ALIAS`/`ANAME`/apex‑`A` per your DNS provider — use the exact
   record Netlify shows). If the apex currently points at the combined site, cut it
   over to the marketing site during the change window.
3. Wait for propagation + Netlify's automatic TLS (Let's Encrypt) on both hosts.

---

## 5. Supabase remote configuration (prepare; apply at cutover, not in CP1)

No schema, RLS, migration, Storage‑policy or Edge‑Function change is required —
inspection confirmed Edge Functions already send `Access-Control-Allow-Origin: *`,
so no CORS allow‑list change is needed for `app.carelune.in`.

Only **Auth → URL Configuration** needs updating (Dashboard → Authentication → URL
Configuration):

- **Site URL:** `https://app.carelune.in`
- **Redirect allow‑list (add all):**
  - `https://app.carelune.in/login` (password recovery / email confirmation land here)
  - `https://app.carelune.in/**` (covers app paths)
  - `http://localhost:5173/**` (local dev)
  - `http://localhost:4180/**` (local `preview:app`)
  - *(optional)* your Netlify app deploy‑preview pattern, only if you test auth on previews
- Marketing origin (`carelune.in`) does **not** need to be an allowed redirect —
  it never completes an auth flow.

---

## 6. Legacy‑link compatibility (old `carelune.in` URLs)

Emitted into `dist/marketing/_redirects` (primary mechanism), with a belt‑and‑braces
client fallback in `src/marketing.tsx`:

```
/    register=:token    https://app.carelune.in/?register=:token    301!
/login                  https://app.carelune.in/login              301!
/*                      /index.html                                 200
```

- **Old registration links** `https://carelune.in/?register=<TOKEN>` → 301 to
  `https://app.carelune.in/?register=<TOKEN>` — the complete token is preserved
  (Netlify also appends any remaining original query params). Already‑shared links
  keep working.
- **Old sign‑in** `https://carelune.in/login` → 301 to `https://app.carelune.in/login`.
- Newly generated links already point at `app.carelune.in` via `src/config/urls.ts`.

---

## 7. Existing‑session impact (communicate to users)

Browser sessions are **per‑origin**. A user signed in on `carelune.in` will **not**
be automatically signed in on `app.carelune.in`. Accounts and passwords are unchanged
and remain valid — users simply sign in again at `https://app.carelune.in/login`.
No token is transferred across origins (doing so insecurely is explicitly avoided).

---

## 8. Cutover order (execute top to bottom)

1. **Create/connect** the second Netlify site (marketing) from the repo.
2. **Assign** `app.carelune.in` to the application site; `carelune.in` to the marketing site.
3. **Configure DNS/CNAME** using the exact Netlify‑provided targets (§4). Wait for TLS.
4. **Configure environment variables** separately per site (§2).
5. **Update Supabase** Auth URL Configuration (§5).
6. **Deploy the application** site (`build:app` → `dist/app`); confirm it builds green.
7. **Run application acceptance tests** (§9).
8. **Change the marketing "Sign in"** link target — already `app.carelune.in/login`
   via config; just confirm on the live marketing build.
9. **Enable legacy redirects** — deploy the marketing site so its `_redirects` is live.
10. **Verify old registration links** resolve to the app with the token intact.
11. **Rollback** if needed (§10).

---

## 9. Acceptance tests (post‑deploy)

- `carelune.in/` renders the landing; "Sign in" → `app.carelune.in/login`; Calendly CTA intact; `view-source` shows it is indexable with the `carelune.in` canonical and **no** manifest/service worker.
- `app.carelune.in/` (signed out) → sign‑in; `view-source` shows `noindex` + manifest link.
- Sign in as each role: Super Admin, HOD/Admin, Doctor (PMR), Nursing Coordinator, Duty Doctor, Family, Caregiver — each lands in its workspace.
- Family/Caregiver Home Care shows the **institution** identity (no Carelune branding).
- Generate a registration link → it is an `app.carelune.in/?register=…` URL and completes registration.
- Trigger password reset → email link lands on `app.carelune.in` and completes.
- Install the PWA on `app.carelune.in` (Chrome/Android/iOS Safari "Add to Home Screen"); confirm standalone launch, sky theme, and that the install prompt does **not** appear on the marketing site.
- DevTools → Application → Service Workers: confirm the worker is registered on the app only; Cache Storage holds only static shell assets (no Supabase/API/PHI). Old `carelune.in/?register=<TOKEN>` 301s to the app with the token preserved.
- Responsive: 375 px, tablet, desktop — no horizontal overflow on either site.

---

## 10. Rollback

- **Fastest:** in Netlify, **Deploys → Published deploy → Publish** the previous
  known‑good deploy for the affected site (instant, atomic).
- **App regression:** re‑publish the prior combined deploy on the existing site and,
  if the subdomain was cut over, temporarily re‑point `carelune.in` to it.
- **Legacy links:** the marketing `_redirects` is data‑only; reverting the marketing
  deploy removes the forwards without touching the app.
- **DNS:** keep the previous DNS records noted before editing; revert to them if TLS
  or routing misbehaves. **Supabase** Auth URL changes are additive — re‑adding the
  old Site URL restores prior behaviour without data loss.
- Nothing in this checkpoint modifies the database, so **no data migration or restore
  is involved in a rollback.**
