# Carelune — Implementation Status

Durable implementation facts for the **Carelune Neuro Continuum** demo.
Source of truth for product/clinical scope remains the freeze pack — this file records
only what is *built*. Do not duplicate freeze-pack content here.

- Product freeze: `carelune-freeze-pack/03_CARELUNE_FREEZE_V1.md`
- Measurement/data rules: `carelune-freeze-pack/04_MEASUREMENT_AND_DATA.md`
- Build order & rules: `carelune-freeze-pack/05_CLAUDE_CODE_MASTER_PROMPT.md`

Last updated: end of **Phase G** (guided demo, polish, QA). Phases A–G complete.

Presenter script: `DEMO_GUIDE.md` · Readiness and production gap: `PROTOTYPE_READINESS.md`.

---

## 1. Completed phases

| Phase | Scope | Status |
|---|---|---|
| A | Carelune rename, safe wording, role architecture, shared store, audit foundation | Approved |
| B | Physiotherapist referral, coordinator pipeline, suitability, consent, payment, onboarding, activation gates | Approved |
| C | Baseline, goals, barriers, governed template, content library, AI-assisted discovery, patient plan + versioning | Approved |
| D | Today's priorities, six-state reporting, restricted medication record, Daily Check-in, family read-only, provenance | Approved |
| E | Exception lifecycle, coordinator routing, nursing triage, Medical Clinician consent gate, referral lifecycle, closure, SLA, append-only audit | Approved |
| F | Generic review engine, weekly review, goal/barrier review, assessment registry, Day-30 review, renewal, wellbeing, pilot analytics | Approved |
| G | Guided demo, fictional-demo reset, role-switcher polish, copy/terminology audit, accessibility & responsive QA, route/permission regression | Complete |

Post-phase corrections applied and verified: contextual consent (post-B); AI-suggestion removal, commerce removal, cross-patient isolation (post-C); occurrence-vs-intervention separation, deep-link fix (post-D/E); swallow-hold demo lock, dev-mode probes, Medical Clinician consolidation (post-E).

---

## 2. Architecture

Front-end only. Vite 6 + React 18 + TypeScript 5 (strict) + Tailwind 3.
No router, no state library, no backend, no test runner, no linter.

`index.html` → `src/main.tsx` → `src/App.tsx` (role routing) → `CareluneProvider` → role screens.

All state is in-memory and resets on reload. All data is fictional.

---

## 3. Canonical routes

Hash scheme `#<role>[/sub]`. Parsing and writeback live in **`src/routes.ts`**
(`parseHash` / `hashFor` / `defaultRoute`), extracted from `App.tsx` in Phase G so the
guided demo and the guard suite can target the same routes. A `hashchange` listener in
`App.tsx` applies navigation **without reload**. URL writeback uses `replaceState`
(which does not fire `hashchange` — do not reintroduce a "writing" guard flag).

| Role | Route | Screen |
|---|---|---|
| — | (no hash) | `screens/Cover.tsx` |
| Caregiver | `#caregiver`, `/today` `/meds` `/checkin` `/progress` `/help` `/task` | `home/HomeShell.tsx` + tabs |
| Family / payer | `#family` | `home/FamilyView.tsx` (read-only) |
| Lead Physiotherapist | `#lead_physio` | `hospital/HospitalDashboard.tsx` |
| " | `/patient` | `hospital/PatientDetail.tsx` |
| " | `/plan` | `hospital/WeeklyReview.tsx` |
| " | `/refer` | `hospital/ReferPatient.tsx` |
| " | `/baseline` `/goals` `/planbuilder` `/template` | Baseline, Goals, PlanBuilder, shared/TemplateView |
| " | `/day30` | `shared/Day30Review.tsx` |
| Coordinator | `#coordinator` | `coordinator/Pipeline.tsx` |
| " | `/lead` `/queue` `/day30` | LeadDetail, ActionQueue, Day30Review |
| Rehabilitation Nurse | `#nurse` | `nurse/NurseTriage.tsx` |
| Medical Clinician | `#medical_clinician` | `clinician/MedicalReview.tsx` |
| Clinical Operations | `#clinical_ops`, `/analytics` | ClinicalOps, `analytics/PilotAnalytics.tsx` |
| PM&R Specialist | `#pmr` | `pmr/TemplateGovernance.tsx` |

**Legacy routes preserved as redirects:** `#home[/tab]` → caregiver · `#home/family` → family ·
`#hospital[/detail|/plan]` → lead_physio · `#hospital/consult` and `#medical_clinician/consult`
→ canonical Medical Review.

---

## 4. Medical Clinician workflow (canonical)

`src/screens/clinician/MedicalReview.tsx` is the **single** Medical Clinician experience:
review queue → consent gate → patient summary / medication record / lab trends (view-only) →
nursing-triage summary → existing holds → pre-consult summary (facts + AI **questions only**) →
consultation documentation (mode, assessment, advice, medication decision, disposition) →
resolution.

**Retired — must not be recreated:**
- `src/screens/hospital/Consult.tsx` (duplicate consultation workflow)
- `src/screens/hospital/ReviewPrep.tsx` (superseded by WeeklyReview)
- `src/screens/hospital/PlanApprove.tsx` (AI-authored treatment suggestions)
- `src/screens/home/tabs/Log.tsx` (superseded by Daily Check-in)
- `src/screens/roles/RoleHome.tsx` (placeholder workspaces; all roles now have real screens)

---

## 5. Shared store & domain modules

`src/store/carelune.tsx` — the one shared state (`CareluneProvider` / `useCarelune`).
Every clinical write passes a guard *before* mutation; refusals are audited.
Audit events are appended and `Object.freeze`d (append-only).

| Module | Contents |
|---|---|
| `domain/types.ts` | All domain types (roles, leads, consent, plan, occurrence vs intervention, holds, exceptions, reviews, renewal, programme states) |
| `domain/roles.ts` | `ROLE_META`, `PERMISSIONS`, `SWITCHABLE_ROLES`, `SERVICE_HOURS`, `EMERGENCY_COPY` |
| `domain/permissions.ts` | All pure permission guards (see §6) |
| `domain/journey.ts` | Lead pipeline states, suitability checklist, contextual consent meta, onboarding, programme offer |
| `domain/planning.ts` | Governed template, baseline, goals, barriers, content library, plan v1, discharge source |
| `domain/safety.ts` | Versioned safety rules, response-target policy, nursing triage pathway |
| `domain/caregiver.ts` | Priorities, six report states + reasons, medication outcomes, Daily Check-in, feeding-incident guidance |
| `domain/reviews.ts` | Review types, plan-decision kinds, assessment registry, programme transitions, wellbeing domains |
| `domain/seed.ts` | Consents, payment, assessments, operational metrics, seeded audit trail |

Legacy `src/types.ts` and `src/data/*` retain caregiver/medication/clinical seed shapes still in use.

---

## 6. Role & permission architecture

12 roles; 8 switchable (caregiver, family, lead_physio, coordinator, nurse, medical_clinician,
clinical_ops, pmr). OT / speech_swallow / dietitian / psychologist exist in the data and
referral architecture only.

Guards in `domain/permissions.ts` (all pure, all enforced in the store):
`canApproveIntervention` · `contentSelectable` · `provenanceComplete` · `interventionReachesSchedule` ·
`canChangeMedication` · `canRecordMedicationAdministration` · `canActivatePlan` · `canAiAddIntervention` ·
`canWriteCaregiverData` · `canWriteClinicalData` · `familyMaySee` · `canReleaseHold` · `canHoldIntervention` ·
`canChangePriority` · `canAiAssignPriority` · `canAiCloseException` · `canApproveSwallowCare` · `canDiagnose` ·
`canStartTeleconsultation` · `canResolveClinicalException` · `canAlterOthersIntervention` ·
`canDecidePlanChange` · `canUpdateGoal` · `canAiDecideReview` · `canAutoAchieveGoalFromTasks` ·
`canRecommendRenewal` · `canActivateRenewal` · `transitionAllowed` (in `domain/reviews.ts`).

---

## 7. State machines

**Lead pipeline (14):** new_referral → contact_pending → contact_attempted → family_interested →
suitability_info_pending | clinical_review_required → eligible | not_eligible → consent_pending →
payment_pending → onboarding_pending → plan_activation_pending → active | lost_declined.

**Task occurrence (separate from intervention):** scheduled · completed · partially_completed ·
stopped · not_completed · awaiting_review. A caregiver report changes the **occurrence only**.

**Intervention:** active · held · completed. Held only by an approved versioned rule
(`domain/safety.ts`) or an authorised clinical owner — never as a side effect of a caregiver report.

**Clinical hold:** active · released. Records source (approved_rule | professional), rule id+version,
author, reason, hold time, review owner, review deadline, releasable-by roles, release decision +
rationale. `demoReleaseLocked` locks swallow holds in the guided demo.

**Exception (9):** open · assigned · acknowledged · in_review · action_taken · follow_up_pending ·
resolved · reopened · cancelled_duplicate. Priorities (6): emergency · same_day_medical ·
same_day_rehab · nursing_review · operational_followup · routine_observation — always rule- or
professional-sourced. Closure tracks 6 items separately (operational ≠ clinical resolution).

**Specialist referral (13):** identified · discussed_with_family · consent_pending · accepted ·
assigned · scheduled · consultation_completed · recommendation_received ·
plan_acknowledgement_pending · follow_up_pending · closed · declined · cancelled.

**Plan:** versioned; decisions are continue · modify_parameters · progress · regress ·
temporary_hold · request_direct_assessment · discontinue · replace · refer_other_discipline.

**Review types (11):** weekly_rehabilitation · nursing · medical · pmr · occupational_therapy ·
speech_swallow · dietitian · psychology_caregiver · day30_multidisciplinary · adverse_event ·
programme_closure.

**Programme (13):** onboarding_pending · plan_activation_pending · active · temporarily_paused ·
clinical_review_required · readmitted · renewal_pending · renewed · step_down_active · completed ·
cancelled · family_declined · deceased. Transitions role-gated in `PROGRAMME_TRANSITIONS`;
no single role owns all transitions.

**Renewal — three separate guarded acts:** clinical recommendation → family decision →
administrative activation. Never automatic.

---

## 8. Seeded fictional case

Patient **Anand Menon**, 58, Jayanagar Bengaluru; medically stable ischaemic stroke, left
hemiparesis; Day 12 at home.

Team: **Ravi Kumar** Lead Physiotherapist · **Divya** Recovery Care Coordinator ·
**Nisha** Rehabilitation Nurse · **Dr. Farhan** Medical Clinician & Clinical Operations Lead ·
**Dr. Meera** PM&R Specialist · **Lakshmi** caregiver · **Suresh** family/payer (outside India).

Plan v1: 5 active interventions (4 physiotherapy + 1 nursing education) reach the caregiver
schedule; feeding (`iv4`) and communication (`iv7`) are **held** pending Speech & Swallow review.
Second pipeline lead: Joseph Mathew. Other pilot patients (Fatima, Devi) are non-clickable
"Demo profile not expanded" — they must never display Anand's record.

---

## 9. Guard tests

`_guards.test.ts` at the project root — **98 assertions** (52 at Phase F, extended in
Phase G). Covers discipline approval, content/provenance gating, medication authority, hold
release, priority, consent, closure, plan/goal ownership, renewal separation, programme
transitions, safety-rule integrity, **route parsing and hash round-tripping (including all
legacy redirects), and guided-demo scene/prep integrity**.

```bash
npx tsx ./_guards.test.ts
```

The file now lives in the repo: it adds no dependency (`tsx` runs via `npx`), and
`tsconfig.json` includes only `src/**`, so it is outside both the typecheck and the Vite
build. Content gating checks `ContentItem.approval` — *not* `.status`, which is a different
field and will silently pass.

---

## 10. Commands

```bash
npm run dev        # Vite dev server, port 5173
npx tsc --noEmit   # the ONLY real type-check
npm run build      # production build (esbuild — does NOT type-check)
```

Current results: `tsc --noEmit` clean · `npm run build` succeeds (~484 kB JS / ~129 kB gzip) ·
`npx tsx ./_guards.test.ts` — 98/98 assertions pass.

---

## 11. Developer mode

Enabled with `?dev=1` (e.g. `http://localhost:5173/?dev=1#coordinator/queue`); state
`devMode` on the store.

Gates **only** the blocked-action probe buttons ("Try: lower priority", "Try: release clinical
hold", nurse out-of-scope probes) in ActionQueue, NurseTriage and Day30Review. In normal mode
these are hidden — users simply never receive actions they cannot perform. All store-level
guards run regardless of dev mode.

---

## 11a. Guided demo (Phase G)

`src/demo/scenes.ts` — the 12-scene narrative. Each `Scene` declares its route, a presenter
note (`seeing` / `doThis` / `proves` / `dontClaim`) and optional `prepare` steps.

`src/demo/GuidedDemo.tsx` — `DemoDirector` (state preparation) and `PresenterBar` (controls).

**Scene routes:** 1 cover · 2 `lead_physio/refer` · 3 `coordinator/lead` (lead-joseph) ·
4 `lead_physio/planbuilder` · 5 `caregiver/today` · 6 `caregiver/checkin` ·
7 `coordinator/queue` · 8 `nurse` · 9 `lead_physio/plan` · 10 `family` ·
11 `lead_physio/day30` · 12 `clinical_ops/analytics`.

**Preparation contract — do not weaken these:**

- A `prepare` step is a single store call, driven through the same guarded actions a user
  would use. Nothing bypasses a permission guard.
- **One step per effect tick.** Store actions such as `acknowledgeException` read current
  state; two dependent steps in one tick would make the second act on a stale snapshot.
- Every step must be **idempotent** — the director replays 1..N after a reset.
- `DemoDirector` keys its effect on `ran` and advances with `setRan(ran + 1)` (absolute, not
  functional), guarded by a `claimed` ref. **Do not remove the dependency array or revert to
  a functional update** — without both, provider re-renders re-fired step 0 repeatedly while
  the accumulated updates skipped later indices, and scene prep silently dropped steps.

**Navigation semantics:** forward is incremental (manual presenter actions survive);
backward resets the store and replays from the seed, because scenes build on one another.

## 11b. Fictional-demo reset

`storeKey` state in `App.tsx` is the reset mechanism: bumping it remounts
`CareluneProvider`, returning every piece of state to its seed. It is **not** a page reload.

Guided-demo position (`scene`) lives *above* the provider, so a reset never loses the
presenter's place. Reset is reachable from the cover, from the role bar (outside the guided
demo), and via **Restart** in the presenter bar. It is always labelled as a fictional-demo
reset — never as deletion.

## 11c. Phase G corrections applied

- **Copy:** removed "Phase C" from coordinator activation-gate copy; replaced raw `iv*` ids
  with `interventionTitle()` (store) / `seedInterventionTitle()` (static) in ClinicalOps,
  MedicalReview, NurseTriage, WeeklyReview, Goals and three audit-log strings; formatted
  underscore state ids on the family-facing TaskDetail and WeeklyReview; fixed truncated
  "Neuro Continuum" branding in PatientDetail; deleted the dead `refill` export and the
  unused `Lab` icon.
- **Accessibility:** `text-sage-400` is no longer a text colour anywhere (2.8:1 → `sage-600`
  at 7.3:1, ~55 sites); darkened `warn-600` and `coral-600` so priority and SLA badges clear
  4.5:1; raised low-opacity white text on brand backgrounds; added `<main>` to all 20
  professional screens plus FamilyView, TaskDetail and ReferPatient; added an `sr-only` `h1`
  to `HomeShell` and promoted 17 `eyebrow` section titles to `<h2>`; fixed a heading-level
  jump in Goals; gave `TrendBars` a `role="img"` text alternative; added an `sr-only`
  completion status to the family priority list; fixed two sub-44px targets in Meds; made the
  language toggle reachable below 400px; added roving-tabindex + arrow-key support to the
  three `role="radiogroup"` controls (`RadioGroup` / `radioTabIndex` in `components/ui.tsx`);
  moved focus into `ReportSheet` when it replaces the task body.
- **Layout:** capped the PlanBuilder goal `<select>`, which pushed the page sideways at
  mobile widths.
- **Routing:** the hash writeback now carries the query string. A bare `#hash` is a relative
  URL and silently dropped `?dev=1`, so the first navigation disabled developer mode for the
  rest of the session (the store re-reads `window.location.search` on every reset).

## 12. Known demo limitations

- In-memory state only; every reload resets the demo. "Reset fictional demo" does the same
  deliberately, without a reload.
- No wall clock — timestamps are strings ("Day 12 · now"); SLA states render but are not
  time-driven, so `approaching` / `overdue` / `out_of_hours` never trigger automatically.
- Only Anand has an expanded record; other pilot patients are intentionally non-clickable.
- Emergency-priority exceptions exist in the model but no seeded flow produces one
  (emergencies are directed to 112/108, not into the workflow).
- Analytics figures are fictional constants except live counts derived from store state.
- Media, video and messaging are placeholders; no upload, call, SMS or notification.
- No payment gateway; renewal activation is simulated.
- Deep-linking works live, but a mid-session role switch resets sub-screen state.
- Home tabs are not written back to the hash (`#caregiver/checkin` loads correctly but the
  URL settles on `#caregiver`).
- Guided-demo scene position is not persisted in the URL, so it is not shareable.

---

## 13. Unresolved clinical / legal decisions

1. **Swallow-hold release authority in production** — who may release and on what evidence.
   Locked in the demo (`demoReleaseLocked`).
2. **Instrument licensing** — mRS and Barthel digital reproduction permission unverified;
   `ASSESSMENT_REGISTRY.licensingStatus` is `UNRESOLVED`; item-level data not displayable.
3. All safety rules, triage pathway, response targets, template and content items are
   **fictional** pending Dr. Farhan / Dr. Meera / discipline-lead sign-off.
4. Caregiver-wellbeing escalation thresholds (when a support need becomes a psychology referral).
5. Step-down package definition and month-two pricing.
6. Whether family-access consent is waivable when no remote family member exists.
7. Which daily-signal items belong in the patient-specific Daily Check-in for the stroke pilot.

---

## 14. Must not be recreated

- Files listed in §4 (Consult, ReviewPrep, PlanApprove, Log, RoleHome).
- Hospital-first framing, hospital revenue KPIs, "Hospital console".
- AI-authored treatment suggestions, progressions, referrals or plan changes.
- Pharmacy / laboratory / equipment ordering, refill requests, marketplace.
- 24/7 or continuous-monitoring promises; "guaranteed response".
- A composite Carelune Recovery Score, recovery percentage or prediction.
- Multi-diagnosis cohort in the guided demo.
- Any writing path that lets caregiver or family mutate clinical data.
- The `writingHash` guard flag in `App.tsx` routing (broke hash navigation).
- A dependency-free `useEffect` in `DemoDirector`, or a functional `setRan` update — either
  reintroduces skipped scene-preparation steps (see §11a).
- `text-sage-400` as a text colour (fails contrast at 2.8:1 on the light canvas).
- Raw internal ids (`iv4`, `exc-1`) or unformatted underscore state names in user-visible
  copy or audit-log strings.

---

## 15. Phase G — delivered against scope

Phase G = **guided demo and quality**
(per [`carelune-freeze-pack/05_CLAUDE_CODE_MASTER_PROMPT.md`](carelune-freeze-pack/05_CLAUDE_CODE_MASTER_PROMPT.md)):

1. ✅ Cover with "Start guided demo" and "Explore by role".
2. ✅ 12-scene, 8–12-minute scripted path across the existing screens on the seeded Anand case.
3. ✅ Consistent data across roles, prepared deterministically per scene (§11a) — no scene
   transition reloads the page, and no scene depends on an earlier browser session.
4. ✅ Responsive and accessibility QA across all professional screens at 360 / 375 / 430 px and
   desktop: no horizontal overflow, no caregiver/family target under 44 px, landmarks and
   heading outlines corrected, contrast palette fixed (§11c).
5. ✅ Final typecheck, build and full guard-suite re-run (§9, §10).

No new clinical capability, no new roles and no scope expansion were introduced in Phase G.

**Phase G is approved.** The next phase is production-MVP work, which is out of scope for this
prototype — see [`PROTOTYPE_READINESS.md`](PROTOTYPE_READINESS.md) §4 and §5 before starting it.
