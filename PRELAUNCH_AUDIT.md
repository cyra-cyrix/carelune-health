# Carelune — Pre-Launch Test & Audit

Living checklist gating the **real-patient pilot**. Nothing goes live until every
**🔴 blocker** is checked. Review order is by risk: security → clinical safety →
everything else.

**Owners:** 🤖 Claude (code/static) · 👤 you/eng · 🏥 clinical lead · ⚖️ counsel
**Status keys:** `[ ]` todo · `[x]` done · `[~]` partial/needs live env

> Related docs: `PROTOTYPE_READINESS.md` (what this build is/isn't) ·
> `REMOTE_DEPLOYMENT_RUNBOOK.md` (deploy) · `carelune-freeze-pack/` (governance).
> Design/UI rules: see the `carelune-design-system` memory.

---

## Layer 1 — Security & tenant isolation 🔴 (highest risk)

### Static audit — DONE (2026-08-15, 🤖)
- [x] **RLS enabled on all 27 tables**, each with ≥1 policy.
- [x] **No over-permissive PHI policies** — only `using(true)` are read-only on the
      non-PHI clinical catalog (`pathways`, `pathway_packs`, `pathway_versions`,
      `pathway_sources`); institution-specific tables are centre-scoped.
- [x] **`patients`** read = `can_see_patient(id)`; write = staff + `my_centre()`.
- [x] **`profiles`** read = self or same-centre staff; update = self-only;
      column-grants block `role`/`is_admin`/`is_super_admin` escalation.
- [x] **Storage** `patient-docs` bucket is **private**; read gated by
      `can_see_patient`; write staff-only in own centre; 10 MB + PDF/JPEG/PNG.
- [x] **SECURITY DEFINER** helpers (`can_see_patient`, `my_role`, `my_centre`,
      `is_staff`, `is_admin_user`, `register_patient_tx`, `activate_patient_plan`, …)
      all set `search_path`; privileged RPCs revoked from PUBLIC (0011).
- [x] **Edge Functions** all verify `auth.getUser()` (401), enforce role (403),
      scope to caller's centre; `service_role` never client-side; public `registry`
      actions validate the invite token.
- [x] **Client bundle** ships only the publishable/anon key (no `service_role`).

### Live negative testing — TODO before launch 🔴 (👤, needs staging + test accounts)
Static policy review is necessary but **not sufficient**. **Runnable harness:**
`scripts/rls_negative_tests.mjs` seeds two centres + two households, asserts every
denial below, and tears down. Run against staging / the freshly-reset DB:
`SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… SUPABASE_PUBLISHABLE_KEY=… node scripts/rls_negative_tests.mjs`
(exit 0 = isolation held). Covers cross-centre reads, cross-household reads,
caregiver/nurse write-boundary, plan-activation gate, and unauthenticated access.
Manual checks still needed: storage-object URL denial, expired invite token,
platform-admin/admin-users function authz. Prove each **denial**:
- [x] Centre A staff **cannot** read/write Centre B patients, plans, docs, messages. (harness 2026-08-16 ✓)
- [x] Family/caregiver of patient X **cannot** read patient Y (any table, any query). (harness ✓)
- [x] Caregiver/family **cannot** write clinical fields (plan, medications, thresholds,
      approvals) — only their permitted rows (task_logs, readings, med_admin, queries). (harness ✓)
- [x] Nurse/Duty **cannot** activate a plan or edit medications (only PMR/HOD); they can suggest. (harness ✓)
- [ ] Non-super-admin **cannot** call `platform-admin`; non-admin **cannot** call `admin-users`. (manual — not in harness)
- [x] Direct PostgREST calls (bypassing the UI) with a role's JWT respect every rule above. (harness ✓)
- [ ] Storage: fetch another patient's document URL as an unrelated user → denied. (manual — not in harness)
- [ ] Expired/invalid invite token → registration rejected (403). (manual — not in harness)

> **Live RLS harness run 2026-08-16: 14/14 passed** on the reset production DB —
> cross-centre, cross-household, write-boundary, plan-activation gate, unauthenticated.
> Remaining 3 boxes are function-authz / storage-URL / invite-token, not covered by the harness.

### Config & process 🔴
- [ ] Confirm Edge Function `verify_jwt` gateway settings are intentional
      (public functions reachable; private ones keep in-code checks as defense-in-depth).
- [ ] Secrets: `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY` set as function secrets only;
      not in git, not in the client, not in logs.
- [ ] **Standing rule:** any *new* table auto-inherits `authenticated` privileges
      (0003 default grants) — so every new table MUST ship RLS + policies in the same migration.
- [ ] Rate-limiting / abuse protection on public `registry` + AI functions (cost + enumeration).
- [ ] Auth: password policy, email confirmation, session expiry reviewed; `must_reset_password` flow works.

---

## Layer 2 — Clinical safety & governance 🔴 (🏥 + 🤖)
Boundaries from `carelune-freeze-pack/`:
- [ ] AI never proposes treatments/med/diet/referral changes (compiles facts/questions/draft notes only).
- [ ] Family/caregiver "attention" states come **only** from doctor-approved thresholds
      (`reading_thresholds`); never invented. (Verified in code for Family; confirm caregiver/nurse/doctor.)
- [ ] Provenance labels correct; caregiver-reported data never labelled "measured";
      family wording neutral ("Recorded by the care team").
- [ ] Validated instruments (mRS, Barthel) kept separate from operational analytics.
- [ ] Activation gate: only PMR/HOD activates a plan (trigger `enforce_plan_activation`); pending = read-only for others.
- [ ] Emergency copy = institution number → **112 / 108** fallback, verbatim; service hours correct.
- [ ] No fabricated charts/data anywhere; no composite "recovery score".
- [ ] Consent captured + stored before care starts (`consents`, `enforce_consent_grantor`); wording reviewed by 🏥/⚖️.

---

## Layer 3 — Functional QA (role × route) (👤 + 🤖)
On **staging with fictional seed**, run the full recovery loop end-to-end:
- [ ] Register (via link) → doctor builds plan → **activate** → caregiver logs Today/Record/Medicines
      → family sees updates → nurse/duty/doctor act → approvals close.
- [ ] Each role's happy path on every route (Caregiver, Family, Nurse, Duty, PMR/HOD, Admin, Super Admin).
- [ ] Optimistic updates revert on server error; PostgREST schema cache reload after any DDL.
- [ ] Multi-caregiver / multi-household patient behaves correctly.
- [ ] Cross-patient isolation in the UI (unexpanded demo profiles never show another patient's data).

---

## Layer 4 — Data integrity & migrations (👤 + 🤖)
- [ ] All migrations apply cleanly on a **fresh** DB, in order, idempotently.
- [ ] Constraints/unique keys/foreign keys/cascades behave (e.g. `med_admin` unique per med/day/slot).
- [ ] Audit log is append-only; no destructive updates to history.
- [ ] **Backup + restore drill** actually performed on the real project (PITR verified).
- [ ] Seed/reset path for staging is separate from production data.

---

## Layer 5 — Accessibility (WCAG 2.2 AA) · responsive · states (🤖 + 👤)
- [x] **Colour contrast AA** (2026-08-15, 🤖) — audited all token pairs; fixed 4 failures:
      primary buttons + teal text/chips → `brand-800` (3.07→5.97 / 5.39:1); caption token
      `sage-500` darkened (4.45→4.89:1). Vibrant `brand-600` retained for graphics/heroes/rings
      (passes 3:1). sky/coral/warn/good chips + on-navy haze text already pass.
- [~] **Target sizes** (2026-08-15, 🤖) — all interactive controls meet WCAG 2.2 **AA** minimum
      (SC 2.5.8, 24px); kit `Button`/nav ≥44. A few CTAs sit at 41–43px (Family "Send to care team",
      "Start trial", "Call …" emergency link; caregiver disclosure 43) — **passes AA**, short of the
      44px best-practice. Polish follow-up, not a blocker.
- [~] **Responsive / no horizontal scroll** (2026-08-15, 🤖) — verified via harness DOM: Family @375
      and Duty @768 both `scrollWidth === clientWidth`, **0 overflowing elements**; desktop 2-col reflows
      cleanly to tablet. Full role×route sweep still pending on live env.
- [ ] Full keyboard nav + visible focus on every interactive control (focus-visible rings present in kit; needs live tab-order pass).
- [ ] Screen-reader labels on cards, buttons, forms, live regions for async updates.
- [ ] Every screen has proper empty / loading / error / slow-network / offline states.
- [ ] `prefers-reduced-motion` respected.

---

## Layer 6 — Performance & reliability (🤖 + 👤)
- [x] **Code-split the bundle** (2026-08-15, 🤖) — App routes are `React.lazy` + `Suspense`;
      vendor split (React/Supabase) via `manualChunks`. App entry **1,103 kB → 161 kB**
      (gzip 302 → 43); each screen is its own chunk; **pdfjs isolated to the Onboard route**.
      _Verify App routing at runtime on the live env (needs Supabase creds)._
- [ ] Query review: no N+1; indexes cover RLS predicates (`patient_id`, `centre_id`) and common filters.
- [ ] Error tracking (e.g. Sentry) wired for client + Edge Functions.
- [ ] Graceful handling of Supabase/OpenAI timeouts and 5xx; user-visible retry.
- [ ] Realtime/refetch-on-focus doesn't hammer the DB.

---

## Layer 7 — Compliance & operations (⚖️ + 👤)
- [ ] India **DPDP Act** handling of PHI: lawful basis, consent, data-subject rights.
- [ ] Data Processing Agreement with Supabase; data residency reviewed.
- [ ] Data retention + deletion policy defined and implemented.
- [ ] Incident response + breach notification runbook.
- [ ] Rollback plan + monitoring/alerting for the pilot window.
- [ ] Support boundary staffed (coordinator + nursing triage, 8 AM–8 PM IST) and documented.
- [ ] `PROTOTYPE_READINESS.md` gap items closed or explicitly accepted for the pilot.

---

## Go / No-Go gate
Launch only when: **all 🔴 blockers checked**, Layer 1 live negative tests **pass**,
clinical-safety sign-off (🏥), and compliance sign-off (⚖️).

| Layer | Owner | Status |
|---|---|---|
| 1 Security & isolation | 👤🤖 | Static ✅ · live tests pending |
| 2 Clinical safety | 🏥🤖 | pending |
| 3 Functional QA | 👤🤖 | pending |
| 4 Data integrity | 👤 | pending |
| 5 A11y / responsive | 🤖👤 | pending |
| 6 Performance | 🤖👤 | pending |
| 7 Compliance / ops | ⚖️👤 | pending |

_Last updated: 2026-08-15 — security static audit complete._
