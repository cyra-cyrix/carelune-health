# Unified Carelune Experience — Stage 1 Design Specification

## Purpose

Stage 1 makes the signed-in family/caregiver home screen answer one question within five seconds: **“What should I do today?”** It consolidates the existing Home Care presentation without changing authentication, Supabase, RLS, clinical records, pathway logic, or database write contracts.

This specification covers only the Family/Caregiver Today experience and the design tokens required to build it. Medicines, readings, concerns, doctor workspaces, global navigation, and PWA onboarding remain later stages except where their existing entry points must appear accurately on Today.

## Evidence from the current implementation

- `src/App.tsx` routes both `caregiver` and `family` accounts to `src/screens/home/HomeCare.tsx`; the retired `CaregiverHome` and `FamilyOverview` files are not routed.
- `HomeCare.tsx` owns patient-scoped loading and optimistic writes through the existing functions in `src/lib/db.ts`.
- Task outcomes write to `task_logs` through `setTaskOutcome(patientId, taskId, outcome)`.
- Reading activities first upsert `daily_readings` through `saveReadings`, then mark the matching task occurrence complete through `setTaskOutcome`. No clinical plan or intervention is changed.
- Medicine administration writes only to `med_admin` through `setMedAdmin`; a medicine-shaped care task is guidance that opens Medicines and must not create a second `task_logs` completion.
- The current Today screen repeats the same schedule through a seven-day strip, progress hero, period cards, active stage, previous/next pager, “Next up,” and a complete timeline. The active action can therefore sit far above the final schedule and requires unnecessary scrolling.
- Home Care already has a scoped visual system in `homecare.css`, while the marketing reference uses Manrope, editorial white, one Carelune blue, fine borders, restrained elevation, and semantic colours.

## Frozen product and clinical constraints

- “Today’s priorities” remains a core product pillar.
- One real-world care activity normally receives one digital action.
- A caregiver report updates an occurrence only; it never changes an intervention, medicine prescription, pathway, or clinical plan.
- Caregiver/family data remains explicitly reported data; task completion must not imply clinical improvement.
- Medicine administration remains separate from prescription authority.
- No composite recovery score, recovery prediction, autonomous clinical recommendation, or 24/7 monitoring claim is introduced.
- Existing backend contracts, authentication, Supabase project, migrations, RLS, secrets, role permissions, and deployed application remain untouched.

## Stage 1 experience

### 1. Today header

The page begins with “Today” and the patient’s recovery-day context. Institution identity remains in the existing authenticated top bar, so it is not repeated as a second brand header inside Today.

### 2. Daily summary

A single quiet summary shows:

- the number of scheduled non-medicine care activities recorded today;
- the total number of those activities;
- the next pending activity and its scheduled time;
- a neutral all-recorded state when nothing remains.

This is operational completion only. It must not be labelled recovery progress, adherence, a streak, or a score.

### 3. Active action

The first unrecorded activity is the one expanded action. The existing `ActionStage` continues to render the correct control for that task:

- reading input saves the reading and then records the task occurrence;
- exercise/activity offers the existing permitted outcomes;
- food/feeding stores the existing reading and occurrence result;
- medicine guidance opens Medicines and performs no duplicate task write;
- unknown tasks retain the safe generic outcome control.

Selecting another scheduled activity makes it the active action. Recording an outcome advances to the next unrecorded non-medicine activity.

### 4. Remaining day

Below the active action, one compact schedule lists every other activity once, ordered by parsed time and `sort_order`. Rows show time, activity, discipline, and recorded state. Medicine-shaped rows say “Record in Medicines.” Recorded rows are visually quiet but remain editable. The screen no longer contains separate period cards, “Next up,” and a duplicate full timeline.

### 5. Completion and reassurance

After all recordable activities have an outcome, the summary reads “Today’s scheduled care is recorded.” It avoids confetti, streaks, points, competitive language, or unsupported encouragement about recovery.

### 6. Loading, empty, and error states

- Loading retains the existing non-blocking skeleton surface.
- No linked patient explains that the centre must link the account.
- No active tasks explains that the care team has not scheduled care yet.
- Load failure remains retryable from the Home Care shell.
- Existing action-level save/retry feedback remains visible.

## Foundational design tokens

Stage 1 introduces role-neutral `--cl-*` CSS custom properties for:

- canvas, surface, ink, muted text, line and focus;
- Carelune blue and blue wash;
- positive, attention, and danger semantics;
- small/medium/large radii;
- restrained surface and lifted shadows;
- 44px minimum interactive target.

Home Care maps its existing local variables to these tokens instead of defining a competing palette. Marketing remains functionally separate, and no doctor surface is rethemed during Stage 1.

## Responsive behaviour

- **390px:** one column, 16px gutters, action controls remain at least 44px, bottom navigation remains fixed and safe-area aware.
- **768px:** the same task order with wider reading measure; no desktop-only dashboard composition.
- **1440px:** Home Care remains a focused tablet-width application rather than stretching into a sparse desktop grid.
- No horizontal scrolling is permitted at any target width.

## Accessibility

- One `h1` for Today and ordered `h2` section headings.
- The operational completion summary has a textual accessible equivalent.
- Every schedule row is a real button with an accessible state.
- Active and recorded states are never colour-only.
- Focus-visible treatment uses the shared focus token.
- Reduced-motion behaviour remains in force.

## Component disposition

### Preserve

- `HomeCare` data loading and its existing `src/lib/db.ts` calls.
- `HcProvider`, patient-scoped context, `ActionStage`, medicines routing, bottom navigation, progress, log, and help tabs.
- `setTaskOutcome`, `saveReadings`, `setMedAdmin`, and `clearMedAdmin` write semantics.
- PWA registration and install prompt; redesign is Stage 7.

### Consolidate

- Move Today composition out of the 450-line `HomeCare.tsx` into a focused `HomeCareToday.tsx`.
- Consolidate progress hero, period cards, next-up list, pager, and timeline into one summary, one active action, and one remaining-day list.
- Map Home Care colour/radius/elevation variables to the shared `--cl-*` token foundation.

### Replace in Stage 1

- Replace the current gradient Today hero and seven-day check-in strip with a compact operational summary.
- Replace duplicate day-navigation controls with direct selection from one schedule.
- Replace institution duplication inside Today with a patient/day page header.

### Preserve for later consolidation

- Unrouted legacy `CaregiverHome.tsx` and `FamilyOverview.tsx` remain untouched until the navigation/shared-system stage confirms no test or harness dependency still needs them.
- `HomeCareMedicines`, `HomeCareLog`, `HomeCareProgress`, `HomeCareHelp`, raise-concern flows, doctor workspaces, and `InstallPrompt` are outside Stage 1.

## Verification contract

Stage 1 is complete only when:

1. Pure model tests prove time ordering, pending selection, medicine exclusion from task completion, and all-recorded handling.
2. Component tests prove that each care activity appears once in the remaining-day schedule and medicine actions retain the Medicines handoff.
3. `npm test`, `npm run typecheck`, `npm run build`, and `npm run verify:separation` pass.
4. The real Home Care component renders through the synthetic screenshot harness at approximately 390px, 768px, and 1440px with no horizontal overflow.
5. The screenshots show one active action and one non-duplicated day sequence.
6. No Supabase, migration, RLS, secret, production configuration, deployment, or synthetic QA discharge-summary artifact is changed.
