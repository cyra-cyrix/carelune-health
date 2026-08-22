# Carelune — Product, Architecture and UX Audit

**Date:** 22 August 2026
**Branch audited:** `feat/universal-service-engine` @ `2b41ad5`
**Baseline at time of audit:** `npx tsc --noEmit` clean · `npx vitest run` 357 passed (32 files)
**Status:** AUDIT + TARGET DESIGN ONLY. No application code, migration, UI or screen was changed
or removed in producing this document.

---

## 1. Executive assessment

Carelune today is **two complete products sharing one codebase, one database and one login**.

1. **The recovery product** (generation 1). A neuro/rehab discharge programme. It has the deeper
   patient experience — a scheduled day, medicines with dose slots, typed inputs for vitals and
   observations, outcome recording, a doctor-authored plan, thresholds, a family view.
2. **The Universal Service Engine** (generations 2–7). A specialty-free provider/service/package
   engine with AI-drafted configuration, two-level confirmation, frozen enrolment snapshots,
   server-minted invite links and a dynamic check-in. It is architecturally the better product and
   is the one that scales — but its patient experience is **one timeline and one questionnaire**.

The engine was built *beside* the recovery product rather than *underneath* it. The result is the
central finding of this audit:

> **The Universal engine inherited the recovery product's shell but none of its depth, and the
> recovery product holds all the depth but none of the generality.**

Concretely: a patient enrolled through a Universal package gets a subscription, a frozen snapshot,
a programme timeline and a daily check-in. They get **no medicines, no scheduled activities, no
therapy, no feeding, no observations, no measurements, no events, and no professional plan**,
because every one of those capabilities lives in `care_tasks` / `medications` / `daily_readings`,
which are written **only** by `activate_patient_plan` — a rehab-specific pipeline gated behind the
legacy pathway engine and fed by a discharge-summary prompt. This is documented in the repo's own
governance as an open risk (`docs/DECISIONS.md`, D-003 open point 4).

Second finding, equally structural: **the product destroys type information and then guesses it
back.** `generate-plan` emits richly typed clinical content (`medicines`, `therapy_tasks`,
`daily_tasks`, `wound_care`, `observations`, `diet`). `activate_patient_plan` flattens all of it
into two untyped runtime tables — `care_tasks(time_label, discipline, title, detail)` and
`medications(name, dose, freq, timing, note)`. The browser then re-infers the type with regular
expressions: `classifyTask()` in `src/screens/home/hc-kit.tsx:190`, `matchParams()` in
`src/screens/home/ActionStage.tsx:20`, `parseMed()` in `src/screens/home/HomeCareMedicines.tsx:23`,
`taskHour()` in `hc-kit.tsx:118`, and `deriveInputType()` in `src/domain/checkin.ts:47`. Five
independent heuristic classifiers stand between a clinician's instruction and what a caregiver is
shown. **This is the single highest-value thing to fix**, and it is a prerequisite for the richer
home-care experience, not a cleanup task.

Third finding: there is a **large dead demo island** still compiled into the initial bundle. The
original guided-demo store (`src/store/carelune.tsx`, 2,325 lines) and its entire data graph
(`src/domain/types.ts` 1,134 lines, `roles.ts`, `permissions.ts`, `planning.ts` 850 lines, `seed.ts`,
`data/clinical.ts`, `data/hospital.ts`, `data/case.ts`, `data/journey.ts`) are still mounted via
`<CareluneProvider>` in `src/App.tsx:60`, but **no reachable screen consumes them**. The only three
consumers — `WeeklyReview.tsx`, `TemplateGovernance.tsx`, `TemplateView.tsx` — are unreachable.
Separately, `src/screens/intake/Onboard.tsx` is unreachable (no navigation ever sets
`screen === "onboard"`) yet it is the sole importer of `pdfjs-dist`, which ships as a 378 KB chunk
plus a 1.37 MB worker.

The good news, and it is substantial: **the hard parts are already right.** The enrolment snapshot,
the two-level confirmation, the server-minted invite path, the generic check-in store
(`checkin_responses` with four value columns and no specialty column), the refusal to interpret
answers (`src/domain/careActivity.ts`), and the discipline of validating every AI draft against a
closed schema — these are correct, well-tested foundations. The target architecture below **extends
them rather than replacing them**. There is no case for a rewrite.

---

## 2. Current system map

### 2.1 Builds and entry points

| Entry | File | Serves |
|---|---|---|
| Application | `src/main.tsx` → `AuthProvider` → `AuthGate` → `App` | `app.carelune.in` |
| Public registration | `src/main.tsx` (branch on `?register=`) → `RegisterPatient` | rendered **before** the auth gate |
| Marketing | `src/marketing.tsx` → `LandingRedesign` / `Privacy` / `legal` | `carelune.in`, separate Vite build, no Supabase in the graph |
| Screenshot harness | `src/screenshot/main.tsx` | dev-only visual QA; **not** in the production build |

There is **no router**. The app is a role switch (`src/App.tsx:110`) plus per-workspace `useState`
screens. Registration is chosen by a query parameter; everything else by `user_metadata.role`.

### 2.2 Backend surface

- **31 migrations** (`0001`–`0031`). Four architectural eras: core recovery (`0001`–`0012`),
  pathway engine + plan generation (`0013`–`0026`), universal service layer (`0027`–`0029`),
  dynamic check-ins and invites (`0030`–`0031`).
- **8 Edge Functions**: `registry`, `admin-users`, `platform-admin`, `analyse-provider-service`,
  `generate-plan`, `extract-facts`, `structure-discharge`, `transcribe`.
- **12 pgTAP suites** in `supabase/tests/`.

### 2.3 The one decision point

`src/screens/patient/PatientSurface.tsx` is the single fork between the two products:

```
subscription.service_package_id present  →  ProgrammeHome   (Universal)
otherwise                                 →  HomeCare        (legacy recovery)
```

This is a genuinely good piece of design — one fork, no branching below it. It is also the seam the
migration plan in section 15 uses.

---

## 3. User journey map

Legend for the last column: **C**anonical · **T**ransitional · **L**egacy · **D**ead · **Dup**licated.

### 3.1 Super Admin

| Step | Route / component | Data source | Era | Reachable | Verdict |
|---|---|---|---|---|---|
| Console | `screens/platform/SuperAdmin.tsx` | `listOrgs()` | universal | yes | **C** |
| Pause / resume institution | same, `setInstitutionStatus` | `platform-admin` | universal | yes | **C** |
| **"New care provider"** (guided) | `screens/platform/ServiceBuilder.tsx` (1,138 ln) | `analyse-provider-service` → `createProviderService` | universal | yes | **C** |
| AI service understanding | `analyse-provider-service` → `validateServiceDraft` | OpenAI + closed schema | universal | yes | **C** |
| Service configuration + packages | ServiceBuilder steps 3–4 | `ServiceDraft` | universal | yes | **C** |
| Level-1 confirmation | ServiceBuilder step 5 → `platform-admin` | service_role write | universal | yes | **C** |
| Provider admin creation / first login | `createProviderService` + `credentialsText` | `admin-users` | universal | yes | **C** |
| **"Add without setup"** (legacy org) | `SuperAdmin.tsx:160-200`, `createOrg()` | `platform-admin` | recovery | yes | **Dup / T** |

> **Duplication A.** Two provider-creation flows sit side by side on the same screen. "Add without
> setup" creates a `centre` with `pathway_keys: []` and no service; that organisation can only ever
> reach the legacy recovery path. Every new provider should go through the builder.

### 3.2 Provider / clinician (roles `pmr`, `duty_doctor`, `nurse`)

| Step | Route / component | Data source | Era | Reachable | Verdict |
|---|---|---|---|---|---|
| First login (temp password) | `screens/auth/ForcePasswordReset.tsx` | `clearMustReset` | shared | yes | **C** |
| Org first-run setup | `screens/admin/OrgSetup.tsx` | `getStorefront` / `updateStorefront` | recovery | yes (admin, `!setup_complete`) | **T** |
| Service confirmation (Level 2) | `screens/provider/ServiceProgramme.tsx` | `confirm_centre_service` | universal | yes | **C** |
| Awaiting-confirmation banner | `screens/provider/ServiceAwaitingBanner.tsx` | `getCentreServices` | universal | yes | **C** |
| Package pricing | ServiceProgramme → `set_service_package_price` | RPC | universal | yes | **C** |
| **Legacy Programme tab** | `screens/admin/Programme.tsx` | `getStorefront`, `getMyEnabledPacks` | recovery | yes, only when `services.length === 0` | **T** |
| Registration-link generation | `screens/admin/RegistrationLink.tsx` | branches on published services | both | yes | **C** (universal branch) / **T** (legacy branch) |
| Per-package invite mint | `screens/provider/PackageInviteLink.tsx` | `create_service_invite` | universal | yes | **C** |
| Caseload | `screens/pmr/Caseload.tsx` | `listPatients` + `getProgrammeActivity` | both | yes | **C** (needs de-leaking) |
| Patient detail | `screens/pmr/PatientProgress.tsx` (832 ln) | readings, tasks, meds, approvals | recovery-shaped | yes | **T** |
| Latest check-in | `screens/provider/LatestCheckin.tsx` | `checkin_submissions/_responses` | universal | yes | **C** |
| Patient setup | `screens/intake/PatientSetup.tsx` | docs, care team, intake | recovery | yes (`status === "pending"`) | **T** |
| **Programme assignment** | `screens/provider/AssignProgramme.tsx` (embedded in PatientSetup) | `assign_service_package` | universal | yes | **C**, but see Duplication B |
| Plan Studio | `screens/intake/PlanStudio.tsx` (775 ln) | `generate-plan` → `activate_patient_plan` | recovery | yes | **L** |
| **Onboard (manual plan)** | `screens/intake/Onboard.tsx` (491 ln) | `structure-discharge` → `activatePlan` | recovery | **NO** | **D / Dup** |
| Messages / concerns | `HomeCareMessages`, `ConcernInbox`, `RaiseConcern` | `approvals` + `query_messages` | shared | yes | **C** |
| Team management | `screens/admin/Team.tsx` | `admin-users` | shared | yes | **C** |
| Nurse patient | `screens/nurse/NursePatient.tsx` | readings, approvals | recovery | yes | **T** |
| Duty doctor patient | `screens/duty/DutyPatient.tsx` | readings, med suggestions | recovery | yes | **T** |
| Weekly review | `screens/hospital/WeeklyReview.tsx` (510 ln) | in-memory demo store | demo | **NO** | **D** |
| Template governance | `screens/pmr/TemplateGovernance.tsx` | in-memory demo store | demo | **NO** | **D** |
| Template view | `screens/shared/TemplateView.tsx` | in-memory demo store | demo | **NO** | **D** |

> **Duplication B.** There are two ways a patient reaches a Universal programme:
> **(i)** the family opens a package invite link → `register_patient_tx(p_invite_token)` enrols them
> at registration; **(ii)** staff open `PatientSetup` → `AssignProgramme` → `assign_service_package`.
> Both are legitimate and both are needed, but the second is embedded inside a *legacy recovery
> intake screen*, so a Universal provider must walk through discharge-summary upload, pathway
> assignment and care-team fields to reach it.

> **Duplication C.** `Onboard.tsx` and `PlanStudio.tsx` both author and activate a care plan.
> `Onboard` is unreachable and is the only importer of `pdfjs-dist`.

### 3.3 Patient / caregiver / family

Both `caregiver` and `family` roles render `PatientSurface`, which forks:

**Universal branch — `screens/patient/ProgrammeHome.tsx` (467 ln)**

| Tab | Answers | Data source | Verdict |
|---|---|---|---|
| Today | "what is my programme phase, and have I done the check-in?" | frozen `package_snapshot` + `programme_config_snapshot`, `checkin_submissions` | **C**, insufficient |
| Progress | "how far through am I?" | derived day count only | **C**, thin |
| Care | "what did I buy?" | frozen snapshot | **C**, belongs off the daily path |
| Support | "how do I ask?" | `HomeCareMessages` on `approvals` | **C** |
| Check-in flow | `screens/patient/CheckinFlow.tsx` | `submit_programme_checkin` | **C** |

**Legacy branch — `screens/home/HomeCare.tsx` (221 ln shell + 7 tabs)**

| Tab | Component | Data source | Verdict |
|---|---|---|---|
| Today | `HomeCareToday.tsx` + `ActionStage.tsx` | `care_tasks` + `task_logs` | **T** — the best existing UX, wrong foundation |
| Progress | `HomeCareProgress.tsx` | `daily_readings` history + plan milestones | **T** |
| Messages | `HomeCareMessages.tsx` | `approvals` / `query_messages` | **C** (shared with Universal) |
| More | `HomeCareMore.tsx` | — | **T** |
| Medicines | `HomeCareMedicines.tsx` | `medications` + `med_admin` | **T** |
| Log | `HomeCareLog.tsx` | `daily_readings` via `PARAM_CATALOGUE` | **T** |
| Help | `HomeCareHelp.tsx` | plan `review_dates`, `startTrial` | **T** |

**Retired parallel patient surfaces** — `screens/caregiver/CaregiverHome.tsx` (737 ln) and
`screens/family/FamilyOverview.tsx` (723 ln) are reachable **only** from the screenshot harness.
They are the pre-`HomeCare` generation. **D / Dup.**

### 3.4 Public / auth

| Step | Component | Verdict |
|---|---|---|
| Login | `auth/AuthScreen.tsx` + `authView.ts` | **C** |
| Forgot password | `AuthScreen` → `passwordRecoveryRedirectUrl()` | **C** |
| Password recovery | `auth/recoveryLink.ts` + `AuthProvider` + `SetNewPassword` | **C** |
| Legacy registration link | `?register=<centres.invite_token>` → `centre_id_for_token` | **T** |
| Universal registration link | `?register=<service_invites.token>` → `service_invite_for_token` | **C** |
| Registration screen | `screens/register/RegisterPatient.tsx` + `domain/registrationCopy.ts` | **C** |
| Tab title | `screens/register/registrationTitle.ts` + `index.html` guard | **C** |
| PWA install | `pwa/InstallPrompt.tsx`, `pwa/register.ts`, `pwa/sw.ts`, `pwa/cachePolicy.ts` | **C** |
| Provider branding (signed in) | `branding/BrandingProvider.tsx` | **C**, has a white-label defect (§5.6) |
| Marketing | `marketing.tsx` + `screens/marketing/redesign/*` | **C** |
| Marketing (old) | `screens/marketing/Landing.tsx`, `continuity.tsx` | **D** (harness only) |

---

## 4. Canonical / Transitional / Legacy / Dead / Duplicated classification

### CANONICAL — keep and build on

`main.tsx` · `App.tsx` (role router) · `auth/*` · `branding/BrandingProvider` · `config/urls` ·
`lib/supabase` · `lib/authFetch` · `lib/db` (universal half) · `lib/share` · `pwa/*` ·
`components/ui` · `components/system` · `components/RaiseConcern` · `components/ConcernInbox` ·
`domain/appRoles` · `domain/serviceDraft` · `domain/programmeExperience` · `domain/checkin` ·
`domain/careActivity` · `domain/registrationCopy` · `screens/platform/SuperAdmin` (console half) ·
`screens/platform/ServiceBuilder` · `screens/platform/programme-kit` · `screens/provider/*` ·
`screens/admin/Team` · `screens/admin/RegistrationLink` (universal branch) ·
`screens/register/*` · `screens/patient/PatientSurface` · `screens/patient/ProgrammeHome` ·
`screens/patient/CheckinFlow` · `screens/home/HomeCareMessages` · `screens/pmr/Caseload` ·
`screens/pmr/attention-model` · `marketing.tsx` + `screens/marketing/redesign/*`

DB: `centres` · `profiles` · `patients` · `patient_members` · `consents` · `subscriptions` ·
`centre_services` · `service_packages` · `service_invites` · `checkin_submissions` ·
`checkin_responses` · `approvals` · `query_messages` · `patient_documents` · `patient_care_team`

Functions: `registry` · `admin-users` · `platform-admin` · `analyse-provider-service`

### TRANSITIONAL — required while recovery patients exist; do not extend

`screens/home/HomeCare` + `HomeCareToday` + `ActionStage` + `HomeCareMedicines` + `HomeCareLog` +
`HomeCareProgress` + `HomeCareHelp` + `HomeCareMore` + `hc-kit` + `hc-safety` + `today-model` ·
`screens/pmr/PatientProgress` · `screens/nurse/NursePatient` · `screens/duty/DutyPatient` ·
`screens/intake/PatientSetup` · `screens/admin/OrgSetup` · `screens/admin/Programme` ·
`domain/monitoring` · `domain/carePackage` · `RegistrationLink` legacy branch ·
`SuperAdmin` "Add without setup"

DB: `care_tasks` · `task_logs` · `medications` · `med_admin` · `daily_readings` ·
`reading_thresholds` · `daily_updates` · `patient_plans` · `patient_plan_intake` ·
`patient_document_facts`

### LEGACY — belongs to the recovery product, remove after migration

`screens/intake/PlanStudio` · `lib/pathwayValidation` · `domain/pathways` (incl. the
`PathwayPackKey = "spine" | "joint" | "neuro"` enum) · Edge Functions `generate-plan`,
`extract-facts`, `structure-discharge`

DB: `pathway_packs` · `pathways` · `pathway_versions` · `pathway_sources` ·
`institution_pathways` · `institution_pathway_config` · `institution_pathway_versions`

### DEAD / UNREACHABLE — no current user journey reaches these

| Item | Lines | Evidence |
|---|---|---|
| `screens/intake/Onboard.tsx` | 491 | no `setScreen("onboard")` exists in `App.tsx` |
| `screens/hospital/WeeklyReview.tsx` | 510 | zero importers |
| `screens/pmr/TemplateGovernance.tsx` | 108 | zero importers |
| `screens/shared/TemplateView.tsx` | 122 | imported only by TemplateGovernance |
| `store/carelune.tsx` | 2,325 | mounted in App, but every `useCarelune()` caller is dead |
| `domain/types.ts` | 1,134 | consumers: store + dead components only |
| `domain/roles.ts`, `permissions.ts`, `planning.ts`, `seed.ts`, `safety.ts`, `reviews.ts`, `journey.ts`, `caregiver.ts` | ~2,100 | reachable only through the dead store |
| `components/Timeline.tsx`, `RoleScope.tsx`, `exceptions.tsx`, `HospitalHeader.tsx` | ~700 | consumers all dead |
| `data/clinical.ts`, `data/hospital.ts`, `data/journey.ts`, `data/case.ts` | ~900 | store-only or zero importers |
| `screens/caregiver/CaregiverHome.tsx` | 737 | screenshot harness only |
| `screens/family/FamilyOverview.tsx` | 723 | screenshot harness only |
| `screens/marketing/Landing.tsx`, `continuity.tsx` | ~500 | harness only |
| `pdfjs-dist` dependency | 1.75 MB shipped | sole importer is the unreachable `Onboard.tsx` |
| `lib/db` fns: `listPathwayPacks`, `getPackPathways`, `approvePathwayVersion`, `assignGoverningVersion`, `assignPatientPathway`, `markSubscriptionActive`, `saveThreshold`, `setTaskDone` | — | zero non-test callers |

**Approximately 10,000 lines — roughly a third of `src/` — is unreachable.**

### DUPLICATED

| Responsibility | Newer | Older |
|---|---|---|
| Provider creation | `ServiceBuilder` | `SuperAdmin` "Add without setup" |
| Plan authoring | `PlanStudio` | `Onboard` (dead) |
| Patient home | `HomeCare` (7 tabs) | `CaregiverHome` + `FamilyOverview` (dead) |
| Patient → programme | invite-time `register_patient_tx` | staff-time `assign_service_package` |
| Marketing landing | `redesign/LandingRedesign` | `marketing/Landing` (dead) |
| Threshold writing | *(none)* | `saveThreshold` exists, never called — `reading_thresholds` is read but never written |

---

## 5. Legacy leakage findings

Every item below is a place where the Universal product can still behave, or read, like a
recovery-only application.

### 5.1 Hard-coded product assumptions (highest severity)

| # | Location | Finding |
|---|---|---|
| L-1 | `domain/carePackage.ts:13` | `CARE_PACKAGE.name = "30-Day Recovery Continuum"` with 11 fixed, rehab-specific inclusions ("Physiotherapy and mobility tracking", "Doctor-approved recovery plan"). Rendered by `OrgSetup` and `Programme`. **This is the literal string reported as leaking into universal links.** |
| L-2 | `screens/home/hc-kit.tsx:190` `classifyTask()` | A care task's renderer is chosen by regex over `discipline + title + detail`: `/physio\|exercise\|mobil\|walk\|gait\|rom.../`, `/turn\|reposition\|prone/`, `/medicine\|tablet\|dose/`, `/diet\|feed\|swallow/`. A dermatology "apply emollient" task falls to the generic branch; a lactation "feed" task is silently rendered as a rehab meal. |
| L-3 | `domain/monitoring.ts` `PARAM_CATALOGUE` | A fixed 14-parameter catalogue hard-wired to `daily_readings` columns, with options like `"Ryle's tube"`, `"Broken / pressure area"`, `"spasticity"`, `"Walks with aid"`. This is the product's only typed-input vocabulary and it is entirely neuro-rehab. |
| L-4 | `screens/home/HomeCareMedicines.tsx:23` `parseMed()` | Dose schedule inferred by regex from free text: `"1-0-1"` patterns, `/before food\|empty stomach/`, `/sos\|prn\|required/`, `/every N hours/`. There is no structured schedule anywhere in the schema. |
| L-5 | `domain/checkin.ts:47` `deriveInputType()` | A check-in question's input type is inferred from English sentence shape (`/^(are\|is\|do\|did\|have...)/` → yes/no; `/rate\|severity\|score/` → 0–10; else free text). The programme configuration carries **no input schema at all**. |
| L-6 | `domain/pathways.ts:7` | `export type PathwayPackKey = "spine" \| "joint" \| "neuro"` — three specialties in a type. Still compiled (reached via `components/system.tsx` and `lib/pathwayValidation.ts`). |
| L-7 | `supabase/functions/generate-plan/index.ts:90` | System prompt: *"a continuing-care rehabilitation clinician drafting a 30-day home-recovery programme … Day 1 is the discharge day"*, with a deficit→discipline mapping table (weakness → physiotherapy, respiratory → chest physio). Output keys are `therapy_tasks`, `wound_care`, `daily_tasks`. Already flagged in `docs/DECISIONS.md` D-003 open point 4. |
| L-8 | `screens/register/RegisterPatient.tsx:247` | The **public Universal registration form** asks every family for **"Discharged on"** — including a lactation or dermatology registration. `patients.discharged_on`, `journey_start` and `journey_total_days default 90` are recovery concepts imposed on all patients. |

### 5.2 Copy leaking into shared professional screens

These screens render for **Universal** patients too:

- `screens/pmr/Caseload.tsx:223` — heading **"Recovery command centre"**; `:239` "No patients in
  **recovery** yet"; `:237` "waiting for a **recovery plan**".
- `screens/pmr/attention-model.ts:120` — `action = "Build and activate the recovery plan"`;
  `:113` `reason = "Registered and has no recovery plan yet"`. *(Partially compensated:
  `domain/careActivity.ts` `activityCopy()` overrides these for programme patients — good work, but
  the leak remains for a Universal patient whose `status === "pending"`.)*
- `screens/pmr/PatientProgress.tsx:315-319` — "Recovery progressing as expected", "Awaiting recovery
  plan", `condition` falls back to **"Recovery at home"**; `:498` panel titled "Daily care & mobility";
  `:505` filters tasks by `/physio|mobil|therap/`; `:589` `TEAM_LABEL` = "Rehab nurse" /
  "Recovery coordinator"; `:800` role label "Rehab nurse".
- `screens/nurse/NursePatient.tsx:141,326` — same "Recovery at home" / "Rehab nurse".
- `screens/patient/ProgrammeHome.tsx:314` — patient-facing: *"How your **recovery** is going is for
  your care team to judge"* — shown to a mother-and-baby or dermatology patient.
- `screens/admin/OrgSetup.tsx:259` — "N **recovery** departments declared".
- `screens/platform/SuperAdmin.tsx:22` — institution type list includes `rehab_centre`; placeholder
  text "e.g. Sunrise Spine & Rehab".

### 5.3 Component and token names

`RecoveryTrajectory` (`components/clinical.tsx`, used by 6 live screens) and the design token
`tone: "recovery"` (used as the *positive* tone throughout). These are cosmetic but they make
"recovery" the vocabulary of every clinician surface. Rename to `TrendSparkline` and `tone: "good"`.

### 5.4 Role names

`app_role` enum is `patient | caregiver | family | nurse | duty_doctor | pmr`. **`pmr`** =
Physical Medicine & Rehabilitation — a specialty encoded in the platform's primary clinician role,
in the database enum, in RLS predicates (`my_role() = 'pmr'`), in `activate_patient_plan`, and in
`AppRole`. `APP_ROLE_META` already relabels it "Doctor" in the UI, which is the right instinct; the
identifier itself is a schema-level specialty assumption. Note `duty_doctor` and `nurse` are generic
and fine.

### 5.5 Navigation and onboarding

- `OrgSetup` asks a provider to declare **"recovery departments"** from a fixed `DEPARTMENTS` list.
- The legacy `Programme` tab prices exactly one immutable package named "30-Day Recovery Continuum".
- `RegLinkBtn` in `App.tsx:216` is labelled "Registration link" for all orgs, while
  `RegistrationLink` itself correctly renames the heading to "Invite a patient" for Universal orgs —
  the button and the page disagree.

### 5.6 White-label defect (patient-facing)

`branding/BrandingProvider.tsx:79`:

```ts
platformName: org?.display_name?.trim() || "Carelune"
```

It does **not** fall back to `org.name`. The `registry` Edge Function's `org-info` was fixed to fall
back (`display_name || name`), so an institution that set `name` but not `display_name` shows its own
name on the **public invite page** and **"Carelune"** in the top bar of the **signed-in patient app**
(`App.tsx:TopBar`). `ProgrammeHome.tsx:76` even documents this as intended ("the app shell above
already carries the Carelune mark"), which contradicts the white-label rule for patient surfaces.

### 5.7 Data defects found while auditing

| # | Finding |
|---|---|
| DF-1 | **`wound_care` plan items are never delivered.** `generate-plan` emits them, `PlanStudio` renders and approves them, and `activate_patient_plan` (`0026:96`) inserts only `daily_tasks ‖ therapy_tasks`, then `observations`, then `diet`. `wound_care` appears in no `INSERT` and in no patient-facing component. An approved clinical instruction silently reaches nobody. |
| DF-2 | **`reading_thresholds` is read but never written.** `saveThreshold()` has zero callers, yet `HomeCare` and `FamilyOverview` load thresholds and `0024` describes them as *"the ONLY source of family attention status"*. That status can therefore never be set. |
| DF-3 | **No scheduled/actual timestamps anywhere.** `task_logs` has `log_date` + `done_at` (record time). `med_admin` has `log_date` + `slot` + `created_at`. `daily_readings` is one row per day. Nothing records *when something was due* or *when it actually happened* — only the day it was typed in. |
| DF-4 | **`plan.precautions`, `targets`, `milestones`, `warning_signs`, `education`, `review_dates`** are approved in PlanStudio; only `precautions`/`warning_signs` (in `HomeCareLog`), `milestones` (`HomeCareProgress`) and `review_dates` (`HomeCareHelp`) ever surface. `targets` and `education` reach no one. |
| DF-5 | Pre-existing, from `docs/DECISIONS.md` D-003 open point 5: Supabase grants `ALL` (including `TRUNCATE`, which RLS does not filter) on every new `public` table to `authenticated`. `0027`/`0030`/`0031` revoke it for their own tables; `patients`, `subscriptions`, `daily_readings`, `care_tasks`, `medications`, `patient_plans` still carry it. Latent, not live — PostgREST exposes no verb for it — but it should be closed. |

---

## 6. Current data architecture

| Table | Current purpose | Era | Overlaps | In target? | Keep writing? |
|---|---|---|---|---|---|
| `centres` | Organisation + branding + **legacy storefront** (`package_name`, `package_price`, `trial_days`, `invite_token`) | both | storefront columns duplicated by `service_packages` | **Yes** (identity/branding) | Yes for branding; **no** for storefront columns |
| `profiles` | Role + centre mirror for RLS | both | — | **Yes** | Yes |
| `patients` | Clinical record. Carries `discharged_on`, `journey_start`, `journey_total_days=90`, `diagnosis[]`, `pathway_pack_id`, `pathway_version_id` | recovery-shaped | programme dates now also on `subscriptions` | **Yes**, slimmed | Yes; retire the journey/pathway columns |
| `patient_members` | Household ↔ patient link | both | — | **Yes** | Yes |
| `consents` | Consent grants | both | — | **Yes** | Yes |
| `patient_care_team` | doctor/nurse/coordinator per patient | both | — | **Yes** | Yes |
| `patient_documents` | Uploaded clinical documents | recovery | — | **Yes** | Yes |
| `pathway_packs`, `pathways`, `pathway_versions`, `pathway_sources` | Governed template library (spine/joint/neuro) | recovery | superseded by `centre_services.programme_config` | **No** | No |
| `institution_pathways`, `institution_pathway_config`, `institution_pathway_versions` | D-001-removed approval gate; now service_role plumbing only | recovery | — | **No** | No (plumbing only) |
| `centre_services` | The provider's service + `programme_config` + two-level lifecycle | universal | supersedes `pathway_versions` | **Yes — canonical** | Yes |
| `service_packages` | Patient-selectable variants; clinical config frozen post-publication | universal | supersedes `centres` storefront | **Yes — canonical** | Yes |
| `service_invites` | Server-minted per-package tokens | universal | supersedes `centres.invite_token` | **Yes — canonical** | Yes |
| `subscriptions` | **The enrolment record.** One per patient (UNIQUE). Carries the frozen `package_snapshot` + `programme_config_snapshot` | both | — | **Yes — canonical** | Yes |
| `patient_plans` | AI-drafted, doctor-approved plan JSON | recovery | overlaps the target activity definitions | **No** (retain history) | No |
| `patient_plan_intake`, `patient_document_facts` | Plan-generation inputs | recovery | — | **No** (retain history) | No |
| `care_tasks` | Flattened runtime task rows — **untyped** (`time_label`, `discipline`, `title`, `detail`) | recovery | replaced by activity definitions + occurrences | **No** (retain) | No after Phase C |
| `task_logs` | One outcome per task per day | recovery | replaced by the event log | **No** (retain) | No after Phase C |
| `medications` | Name/dose/freq/timing/note — **no structured schedule** | recovery | replaced by `dose` activity definitions | **No** (retain) | No after Phase C |
| `med_admin` | given/missed/skipped per `(med, date, slot)` | recovery | replaced by occurrences + events | **No** (retain) | No after Phase C |
| `daily_readings` | Wide one-row-per-day rehab vitals table | recovery | replaced by measurement/observation events | **No** (retain) | No after Phase C |
| `reading_thresholds` | Doctor-set bounds — **never written** (DF-2) | recovery | — | **Yes, reborn** as generic per-activity attention rules | Rebuild, don't extend |
| `daily_updates` | Free care feed | recovery | overlaps `approvals`/notes | Fold into the event log as `note` events | No |
| `approvals` + `query_messages` | Concerns, queries, med suggestions, replies, read receipts, escalation | both | — | **Yes — canonical** | Yes |
| `checkin_submissions` / `checkin_responses` | Normalised per-answer check-in store | universal | **This is the correct shape** | **Yes — canonical**, generalised into the event model | Yes |

**Rule: no historical clinical data is deleted.** Every table above marked "retain" keeps its rows and
its read path forever; only *new writes* stop.

---

## 7. Problems with the current patient experience

### 7.1 Universal patients (`ProgrammeHome`)

1. **It is a survey, not a care app.** The only thing a patient can *do* is answer a daily
   questionnaire. There is nothing to complete, nothing to record when it happens, and no medicines.
2. **No time of day exists.** "Day 8 of 30" is the finest granularity. A post-discharge day has 15+
   time-anchored moments; the app models none of them.
3. **No adherence is possible.** Nothing is scheduled, so nothing can be missed, so the clinician can
   never know whether care actually happened.
4. **The check-in is a single wall of questions**, typed by regex (L-5), submitted once a day, and
   immutable after. A caregiver who notices something at 15:25 has only the free-text message tab.
5. **"Progress" shows only a percentage of elapsed time.** It measures the calendar, not the patient.
6. **"Care" is a receipt.** Programme name, duration, inclusions and price — onboarding content given
   a permanent slot in a bottom bar a caregiver taps eight times a day.
7. **No professional instructions surface.** `programme_config` may carry education and escalation
   references; `ProgrammeHome` renders neither.

### 7.2 Legacy patients (`HomeCare`)

Materially better — a scheduled day, a "Do this next" stage, typed inputs, dose slots — but:

1. Built on regex classification (L-2, L-3, L-4), so it is correct only for rehab.
2. Seven tabs, four of them behind a "More" menu. `Medicines` — the highest-frequency task in the
   whole product — is two taps deep.
3. Records **outcomes**, not **events**: one row per task per *day*, so "turn the patient every two
   hours" cannot be recorded more than once.
4. `daily_readings` is one row per day, so a vital cannot be recorded twice.
5. `HomeCareLog` is a long form of every applicable parameter — the "giant questionnaire" pattern.

### 7.3 Both

- **No timeline.** Neither surface answers "what just happened / what is now / what is next".
- **No quick capture.** Every recording is a navigation, then a form.
- **No media.** `0030` explicitly defers attachments, correctly noting that reusing
  `patient_documents` would widen professional-only write access to households.
- **Carelune branding leaks** into the patient shell (§5.6).

---

## 8. Target domain architecture

```
                    ┌─────────────────────────────────────────────┐
                    │  PLATFORM (Super Admin)                     │
                    │  service catalogue · AI drafting · Level 1  │
                    └───────────────────┬─────────────────────────┘
                                        │  platform-admin (service_role)
                    ┌───────────────────▼─────────────────────────┐
                    │  centre_services                            │
                    │    programme_config                         │
                    │    + programme_activities  ◄── NEW          │
                    │  service_packages (frozen after publish)    │
                    └───────────────────┬─────────────────────────┘
                                        │  Level 2 · confirm_centre_service
                                        │  create_service_invite / assign_service_package
                    ┌───────────────────▼─────────────────────────┐
                    │  subscriptions  = THE ENROLMENT             │
                    │    package_snapshot                         │
                    │    programme_config_snapshot                │
                    │    + activity_snapshot     ◄── NEW          │
                    │    (immutable after enrolment)              │
                    └──────┬──────────────────────────┬───────────┘
                           │                          │
              materialise  │                          │  author
                           ▼                          ▼
        ┌──────────────────────────────┐   ┌─────────────────────────┐
        │  care_occurrences   ◄── NEW  │   │  care_events    ◄── NEW │
        │  what SHOULD happen          │◄──┤  what DID happen        │
        │  due_at · status · window    │   │  occurred_at · values   │
        └──────────────┬───────────────┘   └───────────┬─────────────┘
                       │                                │
                       └────────────┬───────────────────┘
                                    ▼
                    ┌───────────────────────────────────────┐
                    │  PROFESSIONAL READ MODEL (views/RPC)  │
                    │  FACTUAL ONLY — no scoring, no AI     │
                    │  adherence · missed · latest · concern│
                    └───────────────────────────────────────┘
```

**Four invariants carried forward from the existing architecture:**

1. **The snapshot is the source of truth.** The patient app never reads live configuration.
2. **Nothing is trusted from the browser.** Definitions resolve server-side from the patient's own
   frozen snapshot, exactly as `submit_programme_checkin` resolves question keys today.
3. **The renderer switches on a closed set of interaction types, never on a specialty.**
4. **Facts and interpretation are separate stores.** The platform records what happened; it never
   decides what it means.

---

## 9. Target programme / activity model

### 9.1 Taxonomy

The type describes **the interaction and the shape of the answer** — never the body system. The body
system is a `domain` *label* on the definition, used for grouping and for professional filtering, and
never branched on by any renderer.

| `activity_type` | Interaction | Answer shape | Scheduled? | Examples across specialties |
|---|---|---|---|---|
| `dose` | give → confirm | given / skipped / refused / missed + optional reason | yes | tablet, insulin, topical steroid |
| `task` | do → confirm | done / partial / unable / not-applicable + note | yes | reposition, wound dressing, cord care |
| `exercise` | do → confirm + dosage | done/partial/unable + reps · sets · duration · tolerance | yes | physio, breathing, swallow drills, pelvic floor |
| `intake` | do → record amount | amount + unit + route + tolerance | yes | feed, fluids, breastfeed, ORS |
| `measurement` | record a number | number + unit (+ multi-component, e.g. BP) | either | BP, SpO₂, weight, urine mL, lesion count |
| `observation` | record a coded choice | one/many from configured options + note | either | bowel character, skin state, latch quality |
| `symptom` | record a severity | scale (configured min/max/anchors) + note | either | pain, itch, breathlessness |
| `note` | write freely | text (+ later media) | no | caregiver concern, "coughing during feed" |
| `education` | read → acknowledge | acknowledged at | yes (windowed) | discharge instruction, safe-sleep guidance |
| `checklist` | confirm several | per-item boolean + note | yes | daily safety checks, red-flag review |

Ten types, closed set, ten renderers. Every clinical example in the brief — medicines, feeding,
swallow, physio, OT, speech, mobility, repositioning, urine, bowel, pain, sleep, vitals, symptoms,
caregiver observations, photos, instructions, unexpected concerns — is expressible without a
specialty-named table or column.

### 9.2 The definition

Stored on `centre_services.programme_activities` (jsonb array, validated in the Edge Function like
`ServiceDraft`), and **frozen onto the subscription at enrolment** exactly as packages are.

```jsonc
{
  "key": "morning_meds",                 // stable within the programme
  "activity_type": "dose",
  "domain": "medication",                // label only — never branched on
  "title": "Morning medicines",
  "instructions": "Give with water after breakfast.",
  "recorded_by": ["caregiver", "family"],
  "schedule": {
    "kind": "clock",                     // clock | interval | count_per_day | window | on_demand
    "times": ["09:00"],
    "days": "all",                       // all | weekdays | [1,3,5] | every_n_days:2
    "from_day": 1, "through_day": null,
    "grace_minutes": 120                 // after which the occurrence becomes `missed`
  },
  "input_schema": [
    { "key": "status", "type": "choice",
      "options": ["given", "skipped", "refused"], "required": true },
    { "key": "reason", "type": "text", "required_when": { "status": ["skipped", "refused"] } }
  ],
  "requires_response": false,            // does a professional owe an answer?
  "attention_rule": null                 // §11 — deterministic, provider-approved, optional
}
```

`schedule: null` (or `kind: "on_demand"`) makes the activity a **quick-record event** — it produces
no occurrences and can never be "missed".

### 9.3 Field vocabulary (closed)

`number(unit,min,max,step)` · `integer` · `duration` · `time` · `choice(options)` ·
`multi_choice(options)` · `boolean` · `scale(min,max,low_label,high_label)` · `text(max)` ·
`composite([fields])` (for BP) · `attachment` *(Phase F, not before)*.

A closed vocabulary is what makes server-side validation possible — the same discipline that already
makes `validateServiceDraft` and `validatePathwayConfig` safe.

### 9.4 What replaces the regex classifiers

| Removed heuristic | Replaced by |
|---|---|
| `classifyTask()` | `definition.activity_type` |
| `matchParams()` | `definition.input_schema` |
| `parseMed()` | `definition.schedule` + `input_schema` |
| `taskHour()` | `occurrence.due_at` |
| `deriveInputType()` | `input_schema[].type` |

### 9.5 Scheduled activity vs event — one model or two?

**One definition model, one event log, one separate expectation table.**

- A `care_event` is the universal record of something that happened: `occurred_at` (when it
  happened, patient-local), `recorded_at` (when it was typed), `activity_key`, `activity_type`,
  `definition_snapshot`, `values jsonb`, `note`, `occurrence_id` (nullable).
- A `care_occurrence` exists **only for scheduled activities**: `due_at`, `window_end`, `status`
  (`pending | done | partial | unable | skipped | missed`), `resolved_by_event_id`.

The reason expectations need their own rows is that **`missed` is the absence of an event**, and you
cannot query, count or display an absence cheaply or safely without a row representing the
expectation. Adherence is `count(status='done') / count(*)` over occurrences. An unscheduled event —
urine at 11:12, pain at 15:25, coughing during a feed at 18:10 — simply carries
`occurrence_id = null`, creates no expectation, and can never be "missed".

This gives exactly what the brief asks for: `scheduled_at` (`occurrence.due_at`),
`actual_completed_at` (`event.occurred_at`), `status` (`occurrence.status`) and optional detail
(`event.values`) for scheduled work; and `occurred_at` + type + structured response + note for
events — without two parallel systems.

### 9.6 Medication architecture — the answer is (C), adapt behind a common interface

**Do not create a second medication system, and do not extend the first.**

- `medications` + `med_admin` stay exactly as they are for legacy recovery patients, written by
  `activate_patient_plan` and read by `HomeCareMedicines`. Frozen, not refactored.
- Universal programmes express medicines as `activity_type: "dose"` definitions. A dose activity
  carries what `medications` carries (`name`, `dose`, `route`, `before/after food`, `note`) **plus
  the structured schedule the legacy model never had** — which is what removes `parseMed()`.
- One patient-facing component renders both, taking a normalised `DoseView` produced by two adapters:
  the Universal one from the frozen snapshot, the legacy one from `medications` + `parseMed()`. The
  legacy adapter is the *only* place the regex survives, and it dies with the last legacy patient.

Target UX supported end to end: medicine name · dose · timing · before/after food · scheduled time ·
taken · skipped · **actual timestamp** (`event.occurred_at`, which does not exist today) · optional
reason. **Safest migration:** adapters first (read-only, both sides), new writes for Universal
patients only, and no in-place conversion of any existing medication row — ever.

### 9.7 Therapy / exercise architecture

`activity_type: "exercise"`, with everything specialty-specific carried as configuration:

`instructions` · `schedule` · and an `input_schema` composed from the closed vocabulary —
`integer(reps)`, `integer(sets)`, `duration`, `choice(completion: done/partial/unable)`,
`scale(discomfort)`, `text(feedback)`. Physiotherapy, occupational therapy, speech and swallow
therapy, breathing exercises, walking programmes and home exercise programmes are the *same*
definition with different values. `domain` labels which discipline owns it, for professional
filtering only. Media (`attachment`) slots into the same `input_schema` in Phase F with no model
change.

### 9.8 Feeding / swallow / nutrition — and why lactation reuses the same primitives

Neuro feeding is `activity_type: "intake"`, `domain: "nutrition"`, with an `input_schema` of
`number(amount, mL)` · `choice(route: oral / thickened / NG tube / nil by mouth)` ·
`choice(tolerance)` · `boolean(coughing)` · `text(note)`; a swallow observation is a separate
`observation` activity; a diet instruction is an `education` activity.

A lactation programme uses the *same* primitives with different configuration: `intake` with
`choice(side)` · `duration` · `choice(latch quality)`; `measurement` for infant weight;
`observation` for nappy output; `symptom` for nipple pain. **No table, column, type or component
differs between them.** That is the test the architecture must keep passing.

---

## 10. Target patient information architecture

Three tabs, one persistent record action. Rationale: a caregiver opens this app to *do* and to
*record*; everything else is reference material and does not deserve a permanent slot.

| Tab | Question answered | Primary actions | Data source |
|---|---|---|---|
| **Today** | "What should happen, what just happened, what is next?" | complete an occurrence · quick-record an event · read an instruction | `care_occurrences` (today) + `care_events` (today) + frozen snapshot |
| **History** | "What has been recorded, and how is it trending?" | browse by day · view a past event · see adherence | `care_events`, `care_occurrences` (past) |
| **Care team** | "Who is looking after us and how do I reach them?" | message · raise a concern · emergency copy · see review dates | `approvals` + `query_messages` + snapshot |
| *(Record)* | persistent, not a tab | a sheet listing this programme's on-demand activities | `activity_snapshot` where `schedule == null` |
| *(Programme)* | pushed from Today's header, not a tab | read the plan, phases, inclusions | frozen snapshot |

Mapping from today's tabs: **Today** ← Today · **History** ← Progress (+ Log) · **Care team** ←
Support/Messages (+ Help) · **Programme** ← Care (demoted from the bottom bar) · **Medicines** →
dissolved into Today's timeline, where it belongs.

---

## 11. Professional read model

Strict separation, no AI, no scoring — consistent with `domain/careActivity.ts`, which already
refuses to interpret answers and should be the template for this layer.

**Layer 1 — FACTUAL EVENT STATE (deterministic, derived):**

- latest event per patient (`occurred_at`, activity, values)
- scheduled adherence: `done / total` occurrences in a window, by activity and by domain
- **missed**: occurrences past `due_at + grace_minutes` with no resolving event
- unscheduled events recorded (count and list)
- explicit concerns raised (`approvals` of type `patient_query`, unanswered)
- check-in completion against the configured cadence
- last contact from the care team

Delivered as SQL views + one `patient_care_summary(p_patient, p_from, p_to)` RPC, so the caseload
loads one row per patient instead of N queries. Today `Caseload` already fans out
`getProgrammeActivity` across patient ids — this replaces that.

**Layer 2 — CLINICAL INTERPRETATION (governed, and not in this phase):**

Any statement of the form "this patient is deteriorating" requires a provider-approved,
deterministic `attention_rule` attached to an activity definition and confirmed at Level 2 — the same
gate as the rest of programme configuration. **Nothing is built here in the first phases.** The
professional surface says *what arrived and what did not*, in the provider's own configured words,
and the clinician judges. This is also the correct home for the reborn `reading_thresholds` (DF-2).

---

## 12. Patient UX audit against the stated principles

| Principle | `ProgrammeHome` | `HomeCare` | Required change |
|---|---|---|---|
| mobile-first | ✅ `max-w-[430px]` | ✅ | keep; design at 390 px |
| caregiver usable | ⚠️ speaks to the patient ("your progress") while a caregiver is the operator | ✅ names the patient | one voice: address the operator, name the patient |
| one-handed | ⚠️ primary action mid-scroll | ✅ | actions in the lower third; persistent Record |
| minimal cognitive burden | ❌ a wall of questions | ⚠️ 7 tabs, More menu | 3 tabs, one next action |
| timeline-oriented | ❌ none | ⚠️ ordered list, no NOW anchor | true NOW / NEXT / DONE timeline |
| provider branded | ⚠️ shell shows "Carelune" (§5.6) | ⚠️ same | fix `platformName` fallback |
| calm | ✅ | ⚠️ dense rows | keep ProgrammeHome's restraint |
| clinically serious | ⚠️ reads as a survey | ✅ | activity-driven day |
| fast data entry | ❌ | ⚠️ 2–3 taps | 1 tap to record, 2 to qualify |
| strong hierarchy | ⚠️ every block is an equal white card | ⚠️ | one hero, then quiet rows |
| no dashboard clutter | ✅ | ⚠️ | — |
| no wellness-app feel | ✅ | ✅ | keep |
| no unnecessary charts | ✅ | ⚠️ trend bars on the patient surface | trends belong in History |
| no giant questionnaires | ❌ **the whole Today tab is one** | ⚠️ `HomeCareLog` is one | decompose into per-activity records |

**Per-tab verdict**

- **Today** — replace wholesale. Becomes the care timeline. Keep the greeting, the day/programme
  line and the calm card language; delete the "your check-in" mega-card in favour of a check-in that
  appears in the timeline *at its scheduled time* like everything else.
- **Progress** → **History.** Stop reporting elapsed calendar time as progress. Show what was
  recorded, day by day, plus adherence. Keep the honest disclaimer at `ProgrammeHome.tsx:314`
  (minus the word "recovery").
- **Care** → **Programme**, demoted out of the bottom bar to a push page from Today's header.
- **Support** → **Care team.** Add the frozen escalation/emergency copy and the review cadence
  (currently only in `HomeCareHelp`, legacy-only).

---

## 13. Home-screen wireframe — one architecture, three specialties

Identical components, identical types, identical layout. **Only the frozen configuration differs.**

### A. Neuro rehabilitation

```
┌────────────────────────────────────────── 390px ──┐
│ Punarvas Hospital                          [Prog.]│  ← institution only, never "Carelune"
│                                                   │
│ Good morning, Lakshmi                             │
│ Day 8 · Neurological Rehabilitation                │
│ ▓▓▓▓▓▓░░░░░░░░░░  Week 2 · Building tolerance     │
│                                                   │
│ ── NOW ─────────────────────────────────────────  │
│ ┌───────────────────────────────────────────────┐ │
│ │ 10:00   Physiotherapy — sit-to-stand      ⏱   │ │  ← exercise, due now
│ │ 3 sets of 8, rest 1 min between                │ │
│ │ [ Done ]  [ Partly ]  [ Couldn't ]             │ │
│ └───────────────────────────────────────────────┘ │
│                                                   │
│ ── EARLIER TODAY ───────────────────────────────  │
│ ✓ 09:00  Morning medicines        3 given         │  ← dose
│ ✓ 09:30  Breakfast / feed         Oral · tolerated│  ← intake
│ ! 08:00  Blood pressure           not recorded    │  ← measurement, missed
│                                                   │
│ ── NEXT ────────────────────────────────────────  │
│   11:30  Repositioning — left side                │  ← task
│   13:00  Lunch / feed                             │
│   14:00  Afternoon medicines                      │
│   15:30  Speech & swallow exercises               │
│                                                   │
│ ── RECORD ANYTHING ─────────────────────────────  │  ← on-demand definitions
│ [ Urine ] [ Bowel ] [ Pain ] [ Sleep ]            │
│ [ Feed ] [ Swallow ] [ Something concerns me ]    │
│                                                   │
│ ── YOUR CARE TEAM ──────────────────────────────  │
│ Dr Ravi Kumar · Lead Physiotherapist              │
│ [ Ask your care team ]                            │
│─────────────────────────────────────────────────  │
│   Today          History          Care team       │
└───────────────────────────────────────────────────┘
```

### B. Mother & Baby (lactation)

```
│ Anandam Clinic                             [Prog.]│
│ Good morning, Priya                               │
│ Day 5 · Mother & Baby Continuity                   │
│ ▓▓▓▓░░░░░░░░  Week 1 · Establishing feeding       │
│                                                   │
│ ── NOW ─────────────────────────────────────────  │
│ ┌───────────────────────────────────────────────┐ │
│ │ 10:00   Feed — record this one            ⏱   │ │  ← SAME `intake` renderer
│ │ Either side; note latch and comfort            │ │
│ │ [ Done ]  [ Partly ]  [ Couldn't ]             │ │
│ └───────────────────────────────────────────────┘ │
│ ── EARLIER TODAY ───────────────────────────────  │
│ ✓ 07:00  Feed                     L 12m · settled │
│ ✓ 08:00  Nipple care                              │  ← SAME `task` renderer
│ ! 06:00  Baby weight              not recorded    │  ← SAME `measurement` renderer
│ ── NEXT ────────────────────────────────────────  │
│   13:00  Feed                                     │
│   16:00  Pelvic-floor exercises                   │  ← SAME `exercise` renderer
│   20:00  Safe-sleep instruction                   │  ← SAME `education` renderer
│ ── RECORD ANYTHING ─────────────────────────────  │
│ [ Feed ] [ Nappy ] [ Sleep ] [ Mood ]             │
│ [ Pain ] [ Something concerns me ]                │
│ ── YOUR CARE TEAM ──────────────────────────────  │
│ Dr Meera · Lactation Consultant                   │
│ [ Ask your care team ]                            │
│─────────────────────────────────────────────────  │
│   Today          History          Care team       │
```

### C. Dermatology

```
│ Skin & Laser Institute                     [Prog.]│
│ Good evening, Arjun                               │
│ Day 12 · Chronic Eczema Programme                  │
│ ▓▓▓▓▓▓▓▓░░░░  Phase 2 · Maintenance               │
│                                                   │
│ ── NOW ─────────────────────────────────────────  │
│ ┌───────────────────────────────────────────────┐ │
│ │ 20:00   Evening emollient                     │ │  ← SAME `task` renderer
│ │ Both forearms, within 3 min of bathing         │ │
│ │ [ Done ]  [ Partly ]  [ Couldn't ]             │ │
│ └───────────────────────────────────────────────┘ │
│ ── EARLIER TODAY ───────────────────────────────  │
│ ✓ 08:00  Topical steroid          applied         │  ← SAME `dose` renderer
│ ✓ 08:30  Itch                     4 / 10          │  ← SAME `symptom` renderer
│ ── NEXT ────────────────────────────────────────  │
│   21:00  Trigger checklist                        │  ← SAME `checklist` renderer
│ ── RECORD ANYTHING ─────────────────────────────  │
│ [ Itch ] [ Flare ] [ Sleep ] [ New product ]      │
│ [ Something concerns me ]                         │
│ ── YOUR CARE TEAM ──────────────────────────────  │
│ Dr Farhan · Dermatologist                         │
│ [ Ask your care team ]                            │
│─────────────────────────────────────────────────  │
│   Today          History          Care team       │
```

**No component in any of the three is specialty-aware.** The differences are entirely
`activity_type`, `title`, `instructions`, `schedule` and `input_schema` — all frozen configuration.

---

## 14. Industry-grade UI design brief

**Target quality:** Apple Health's clarity, a first-rate hospital patient app's seriousness, a
modern home-care platform's warmth. Calm, typographic, spacious.

**Layout (390 px first)**
- One column, 20 px gutters, 8 px spacing scale.
- Vertical rhythm by **section**, not by card. Today's default state is a hairline-separated
  timeline on the canvas, not a stack of white boxes.
- **Exactly one elevated surface at a time** — the NOW card. Everything else is a quiet row.
- Bottom bar: 3 items, ≥ 44 px targets, safe-area padding.
- Sticky, compact header after 64 px of scroll: institution + day.

**Typography**
- Display (Bricolage Grotesque) for the greeting and the NOW title only.
- Body (Inter) 15–16 px, `line-height 1.5`; times in tabular numerals.
- Section labels: 10.5 px, uppercase, `tracking .14em`, `sage-400` — this pattern already exists in
  `ProgrammeHome` and is good; keep it.
- Never more than three type sizes visible at once.

**Colour**
- Canvas `mist`; ink `ink`; secondary `sage`.
- Status carries **shape and word first, colour second**: `✓` done · `!` missed · `○` upcoming.
- `good` only for a completed record; `warn` only for a missed scheduled item; `coral` reserved for
  emergency/escalation and nothing else.
- **Never colour-code a clinical value.** A pain of 8 is displayed, not painted red — that would be
  interpretation.

**Interaction**
- One tap to record the expected outcome; a second, optional tap to qualify it.
- Quick-record opens a bottom sheet, never a page; it closes on save and returns to Today.
- Optimistic writes with the existing `useSubmit` single-flight guard (`hc-kit.tsx:80`) — keep it.
- Respect `prefers-reduced-motion`; no decorative animation on a clinical surface.

**Explicitly avoid**
Progress rings as decoration · streaks, badges, congratulation states · AI sparkles · chip walls ·
everything inside a bordered box · charts on Today · forms longer than one screen · emoji as UI.

**Desktop / tablet**
The patient app stays a single 430 px column, centred, on a calm canvas — it is not a dashboard.
Professional screens keep the existing 1100 px workspace.

---

## 15. Provider configuration impact (Service Builder)

The builder today produces: service identity, patient type, entry point, duration, objective, end
condition, monitoring domains, patient questions, care-team suggestions, packages, programme outline.
To create the richer experience it additionally needs:

| Addition | Who proposes | Who confirms | Notes |
|---|---|---|---|
| `programme_activities[]` (§9.2) | AI drafts, operator edits | Super Admin (L1) → designated provider approver (L2) | The main addition |
| `activity_type` + `domain` per activity | AI | both levels | Closed vocabularies, validated server-side |
| `schedule` rules | AI | both levels | Must render as a readable day, not JSON |
| `input_schema` per activity | AI | both levels | Replaces `deriveInputType()` guessing |
| Patient-facing `instructions` | AI | both levels | Governed by D-002 provenance rules |
| `recorded_by` | AI | both levels | Constrains which household role may record |
| `attention_rule` (optional, later) | AI proposes | **provider approver only** | The one field that authorises an operational clinical rule; it must never take effect from an unconfirmed draft |

**New confirmation screen required:** *"This is the patient's day."* Before Level-2 confirmation, the
approver must see the rendered 24-hour timeline a patient would actually receive on day 1, day 14 and
day 30 — not a configuration list. Confirming configuration you cannot picture is how over-burdened
programmes get published. AI may propose every field above; **no AI-drafted rule becomes operational
without both confirmations**, unchanged from D-003.

---

## 16. Migration plan

**No big bang. Legacy recovery patients keep working, untouched, at every phase. No historical data
is deleted at any point.**

| Phase | Scope | Guard |
|---|---|---|
| **0 · Quarantine** | Delete nothing clinical. Add `LEGACY:` header comments to legacy modules; move dead modules behind a `legacy/` boundary; drop `<CareluneProvider>` and the `pdfjs-dist` dependency once the dead island is confirmed unreachable in CI | new `verify:reachability` script; `tsc` + `vitest` green |
| **A · Model** | `0032`: `programme_activities` on `centre_services`; `activity_snapshot` on `subscriptions`; extend the enrolment trigger to freeze it; validator + closed field vocabulary; fixtures for spine / mother-and-baby / dermatology. **No UI, no writes.** | pgTAP: snapshot frozen, immutable, refused when malformed |
| **B · Read** | Render the new Today timeline for **Universal enrolments only**, from the frozen snapshot, **read-only** (occurrences computed client-side, nothing written). The `PatientSurface` fork does the gating — one line | Vitest across all three fixtures; zero specialty branches asserted |
| **C · Write** | `0033`: `care_occurrences` + `care_events`; `record_care_event()` RPC resolving definitions from the patient's own snapshot (the `submit_programme_checkin` pattern); occurrence materialisation | pgTAP authz: cross-centre refused, forged key refused, double-record idempotent |
| **D · Professional read** | Factual views + `patient_care_summary()` RPC; Caseload and patient detail read it for programme patients. **No interpretation.** | pgTAP + Vitest; assert no scoring exists |
| **E · Authoring** | Extend `analyse-provider-service` to draft activities and `platform-admin` to write them; manual authoring in ServiceBuilder first, AI second; Level-1 and Level-2 confirmation unchanged | schema validation both sides; provenance stamped |
| **F · Legacy adapter (optional)** | Read-only adapter projecting `care_tasks`/`medications`/`daily_readings`/`med_admin` into the new event shape so one professional surface serves both. Recovery patients are **never** migrated in place | adapter tests against real legacy fixtures |
| **G · Retire** | Only after zero active legacy patients: stop writing legacy tables, remove legacy screens, remove `generate-plan`/`extract-facts`/`structure-discharge`, remove the pathway engine. Tables and rows stay | explicit go/no-go per organisation |

---

## 17. Technical risks

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R-1 | Occurrence materialisation. Generating rows for every scheduled item × 90 days × N patients | high | Materialise lazily — a rolling window (yesterday, today, tomorrow), created on read by a `SECURITY DEFINER` function. Never a cron, never the whole programme up front |
| R-2 | Time zones. `local_date` is `current_date` (server) today; occurrences need a real patient-local clock | high | Store the patient's IANA zone on `patients`; compute `due_at` as `timestamptz` from local wall time. Fix before Phase C, not after |
| R-3 | The snapshot grows large. Activities are much bigger than packages | medium | Cap counts in the validator, as `LIMITS` already does for `ServiceDraft`; measure the enrolment row size in Phase A |
| R-4 | Schedule changes mid-programme. The enrolment is deliberately immutable | medium | Model a **clinical amendment** as an append-only overlay on the subscription, confirmed by the treating clinician, rather than by mutating the frozen snapshot. Design it in Phase C; do not let it become a hole in the freeze |
| R-5 | Two enrolment paths diverge (Duplication B) | medium | Both must go through `assign_service_package`; `register_patient_tx` should call it rather than inlining the insert |
| R-6 | The regex classifiers still run for legacy patients throughout | medium | Accept it. Do not touch them — they are correct for rehab and heavily used. Freeze, don't refactor |
| R-7 | `wound_care` never delivered (DF-1) | **high, live** | Fix independently and immediately, before any of this. A real patient's approved instruction is being dropped |
| R-8 | `pdfjs-dist` (1.75 MB) shipped for a dead route | low | Remove with `Onboard` in Phase 0 |
| R-9 | Attachments. Photos are explicitly deferred | medium | Keep deferred until Phase F. `0030`'s reasoning still holds: do not widen `patient_documents` write access to households |
| R-10 | No `audit_events` table (D-003 open point 1, outstanding since `0011`) | medium | The event log is append-only and gets most of the way there; the configuration-change audit still needs its own migration |

## 18. UX risks

| # | Risk | Mitigation |
|---|---|---|
| U-1 | **A rich timeline invites clinical inference.** A missed dose beside a pain of 8 looks like a judgement | Display facts only; no colour-coding of values; no composite score. This is the freeze pack's hardest boundary |
| U-2 | Over-configuration. A provider given ten activity types will author forty activities and bury the caregiver | Cap activities per programme; make the builder show the patient's actual day at authoring time; make "what will they see at 09:00?" the confirmation screen |
| U-3 | "Missed" is punitive. A tired caregiver seeing five red items at 22:00 | Grace windows; neutral wording ("not recorded", never "you failed"); no daily score; missed items do not accumulate visually across days |
| U-4 | Losing the legacy depth. `HomeCare` is genuinely good; a generic rewrite could be worse | Port its interaction patterns explicitly — Action Stage, dose rows, `useSubmit`, the bottom sheet — rather than starting from `ProgrammeHome` |
| U-5 | Two patient apps ship at once for a long time | Accept it. The `PatientSurface` fork already contains this cleanly |
| U-6 | Three tabs may under-serve the family (read-only) role | Validate with a family user before Phase B; the family view may need History first, not Today |

## 19. Security implications

| # | Item | Position |
|---|---|---|
| S-1 | Definition resolution must be server-side | `record_care_event()` must resolve `activity_key` from the patient's **own** `activity_snapshot` and reject anything else — exactly as `submit_programme_checkin` derives question keys from position. The browser never sends a definition |
| S-2 | New-table grants | Every new table must `revoke all ... from anon, authenticated` before granting, per the `0027` lesson (TRUNCATE is not filtered by RLS) |
| S-3 | RLS scope | `care_occurrences` / `care_events` use the existing `can_see_patient()` boundary. **No new access class.** Reads for `authenticated`; writes only through the RPC |
| S-4 | Household write authority | A caregiver records; a caregiver never authors a definition, never changes a schedule, never resolves another patient's occurrence |
| S-5 | Immutability | A submitted event is a clinical record. Corrections are **new events referencing the corrected one**, never updates. The check-in already works this way |
| S-6 | Attachments (Phase F) | A household-writable bucket, separate from `patient-docs`, with signed URLs, size/MIME limits and per-patient path scoping. Do not widen the professional document store |
| S-7 | Pre-existing `TRUNCATE` grant (DF-5) | Close with a dedicated hardening migration across `public` before adding more tables |
| S-8 | PHI in logs | Event values are clinical data. No `console.log` of values; Edge Function errors must not echo payloads |
| S-9 | Invite tokens | The `0031` model (server-minted, opaque, revocable, re-validated at read) is correct; extend nothing |

---

## 20. Recommended implementation sequence

| Order | Work | Depends on | Effort | Risk |
|---|---|---|---|---|
| 0 | **Fix DF-1** — `wound_care` never delivered | — | XS | Low, live defect |
| 1 | **De-leak shared professional + patient copy** (§5.2), fix `platformName` fallback (§5.6) | — | S | Low |
| 2 | **Phase 0 quarantine** — remove the dead island and `pdfjs-dist` | reachability check | S | Low |
| 3 | **Phase A** — activity model, validator, snapshot freeze, three fixtures | 2 | M | Medium |
| 4 | **Phase B** — new Today timeline, read-only, Universal only | 3 | M | Medium |
| 5 | **Phase C** — occurrences + events + `record_care_event()` | 4, R-2 | L | High |
| 6 | **Phase D** — factual professional read model | 5 | M | Medium |
| 7 | **Phase E** — authoring in the Service Builder (manual first, AI second) | 3 | L | Medium |
| 8 | **Phase F** — legacy adapter · attachments | 6 | L | Medium |
| 9 | **Phase G** — retire legacy, per organisation | 8 | M | Low |

**Recommended first slice: steps 0 → 1 → 2 → 3 → 4.** That reaches a real, specialty-free care
timeline rendered for Universal patients from frozen configuration, with no new writes and no
migration risk, and it proves the architecture across spine, mother-and-baby and dermatology
fixtures before a single row is written.

---

## 21. Remove / retire plan (do NOT execute now)

**Screens that should eventually disappear:** `Onboard` · `WeeklyReview` · `TemplateGovernance` ·
`TemplateView` · `CaregiverHome` · `FamilyOverview` · `marketing/Landing` + `continuity` ·
`PlanStudio` (after Phase G) · `Programme` (legacy) · the "Add without setup" panel in `SuperAdmin`.

**Components to replace:** `HomeCareToday` + `ActionStage` → activity-type renderers ·
`HomeCareMedicines` → `dose` renderer + legacy adapter · `HomeCareLog` → quick-record sheet ·
`HomeCareProgress` → History · `RecoveryTrajectory` → `TrendSparkline`.

**Constants to delete:** `CARE_PACKAGE` / `CARE_PACKAGE_INCLUDES_TEXT` · `PARAM_CATALOGUE` +
`GROUP_LABEL` · `PathwayPackKey` · `MODULE_REGISTRY` / `RECORDERS` / `FREQUENCIES` ·
`OrgSetup.DEPARTMENTS` · `tone: "recovery"`.

**Duplicated invitation/onboarding paths to collapse:** `centres.invite_token` +
`generateInviteToken()` + `centre_id_for_token()` (legacy orgs only, then gone) · the
`register_patient_tx` inline subscription insert (should call `assign_service_package`).

**Recovery-specific assumptions to isolate behind adapters:** `classifyTask` · `parseMed` ·
`matchParams` · `taskHour` · `patients.discharged_on` / `journey_start` / `journey_total_days` ·
the `pmr` role identifier.

**Routes that should become legacy-only:** `PatientSetup` → `PlanStudio` · the `RegistrationLink`
centre-token branch · the `Programme` tab · `HomeCare` and all seven of its tabs.

**Nothing above is deleted in this task.**

---

## 22. Explicitly NOT to build yet

1. **Any clinical scoring, severity, risk band, deterioration flag or composite index.** Barred by
   the freeze pack and by D-002/D-003. `careActivity.ts` is the standard to hold.
2. **AI reading patient-entered values.** AI may draft *configuration* for human confirmation. It may
   not read a patient's answers and say anything about them.
3. **Attachments / photo / video.** Phase F at the earliest, with a separate bucket.
4. **Migrating existing recovery patients onto the new model.** `enforce_subscription_immutable`
   correctly refuses it today; do not weaken that trigger.
5. **Deleting any legacy table, row or historical plan.**
6. **A generic `generate-plan`.** Do not make the rehab prompt "universal" — write a new
   activity-drafting function and leave `generate-plan` frozen for legacy patients.
7. **Real-time / push notifications / reminders.** They imply a monitoring promise the support
   boundary does not make.
8. **A patient storefront or package browsing.** Household accounts have no read access to
   `centre_services` / `service_packages` by design (D-003 amendment 3).
9. **Wearables, device integration, lab feeds.**
10. **A second messaging system.** `approvals` + `query_messages` already carry concerns, replies,
    read receipts and escalation.
11. **Editing a submitted event.** Corrections are new events.
12. **Custom per-provider renderers or CSS.** The moment one specialty gets its own component, the
    architecture is gone.

---

*End of audit. No implementation performed.*
