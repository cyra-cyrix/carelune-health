# Stage 1 Family Today Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the repetitive Family/Caregiver Today composition with one operational summary, one active care action, and one ordered daily schedule while preserving every existing database write contract.

**Architecture:** `HomeCare.tsx` remains the patient-scoped data shell and delegates Today rendering to a focused `HomeCareToday.tsx`. Pure functions in `today-model.ts` derive ordering, counts, active selection, and row state from existing `CareTaskRow` and `TaskOutcome` values. Shared `--cl-*` variables establish the visual foundation and Home Care aliases them without retheming other roles.

**Tech Stack:** React 18, TypeScript, Vite 6, Vitest 4, Testing Library, Tailwind 3, scoped CSS, existing Supabase data-access helpers.

**Spec:** `docs/superpowers/specs/2026-08-18-unified-carelune-experience-design.md`

## Global Constraints

- Do not modify Supabase migrations, RLS policies, secrets, production configuration, or deployed applications.
- Do not change the signatures or semantics of `setTaskOutcome`, `saveReadings`, `setMedAdmin`, or `clearMedAdmin`.
- Medicine-shaped care tasks never write a duplicate `task_logs` completion.
- Care completion is an operational record, never a recovery score or clinical-improvement claim.
- No new runtime dependency is permitted in Stage 1.
- The synthetic QA discharge-summary files outside the repository remain untouched and untracked.

---

### Task 1: Derive a single Today model

**Files:**
- Create: `src/screens/home/today-model.ts`
- Create: `src/screens/home/today-model.test.ts`

**Interfaces:**
- Consumes: `CareTaskRow`, `TaskOutcome`, `classifyTask`, and `taskHour`.
- Produces: `TodayModel`, `buildTodayModel(tasks, outcomes, selectedId)`, and `nextSelectionAfterRecord(tasks, outcomes, currentId)`.

- [ ] **Step 1: Write failing model tests**

Create literal fixtures that prove:

```ts
expect(buildTodayModel(tasks, outcomes, null).ordered.map((item) => item.task.id))
  .toEqual(["early", "same-order-first", "same-order-second", "late"]);
expect(model.recordableTotal).toBe(3);
expect(model.recordedCount).toBe(1);
expect(model.active?.task.id).toBe("early");
expect(model.rows.filter((row) => row.task.id === "medicine")[0]?.destination)
  .toBe("medicines");
```

Also prove that a selected recorded task remains selectable and that an all-recorded day returns `active: null` unless the user explicitly selected a task.

- [ ] **Step 2: Run the model test and verify RED**

Run: `npm test -- src/screens/home/today-model.test.ts`

Expected: FAIL because `today-model.ts` does not exist.

- [ ] **Step 3: Implement the smallest pure model**

Use explicit types:

```ts
export type TodayItem = {
  task: CareTaskRow;
  kind: TaskKind;
  outcome: TaskOutcome | null;
  destination: "today" | "medicines";
};

export type TodayModel = {
  ordered: TodayItem[];
  active: TodayItem | null;
  rows: TodayItem[];
  recordableTotal: number;
  recordedCount: number;
  allRecorded: boolean;
};
```

Sort by `taskHour`, then `sort_order`, then original input position for stable ordering. Exclude medicine-shaped tasks only from task completion counts, never from the schedule.

- [ ] **Step 4: Run the model test and verify GREEN**

Run: `npm test -- src/screens/home/today-model.test.ts`

Expected: the new test file passes.

### Task 2: Replace duplicated Today composition

**Files:**
- Create: `src/screens/home/HomeCareToday.tsx`
- Create: `src/screens/home/HomeCareToday.test.tsx`
- Modify: `src/screens/home/HomeCare.tsx`

**Interfaces:**
- Consumes: `useHc()`, `buildTodayModel`, `nextSelectionAfterRecord`, `ActionStage`, `HcIcon`, and `niceTime`.
- Produces: exported `HomeCareToday` component used by the `today` tab.

- [ ] **Step 1: Write failing component tests**

Render the real component inside `HcProvider` with complete literal `HcData`. Assert observable behaviour:

```tsx
expect(screen.getByRole("heading", { level: 1, name: "Today" })).toBeTruthy();
expect(screen.getByText("1 of 3 recorded")).toBeTruthy();
expect(screen.getAllByText("Evening walk")).toHaveLength(1);
fireEvent.click(screen.getByRole("button", { name: /Morning medicines/ }));
expect(screen.getByRole("button", { name: "Open Medicines" })).toBeTruthy();
```

The duplicate-content assertion must target the daily schedule region, not repeated text intentionally shown in the active action heading.

- [ ] **Step 2: Run the component test and verify RED**

Run: `npm test -- src/screens/home/HomeCareToday.test.tsx`

Expected: FAIL because `HomeCareToday` does not exist.

- [ ] **Step 3: Implement the focused Today component**

Build these semantic regions:

```tsx
<main className="hc-today">
  <header className="hc-today-head">...</header>
  <section aria-labelledby="today-summary-title">...</section>
  <section aria-labelledby="today-action-title"><ActionStage ... /></section>
  <section aria-labelledby="today-schedule-title">...</section>
</main>
```

Use one compact schedule below the active action. Rows select their task; medicine rows use the existing `ActionStage` handoff and do not directly call a write. Recorded rows include text such as “Recorded: Done,” not colour alone.

- [ ] **Step 4: Replace the inline Today implementation**

In `HomeCare.tsx`, import `HomeCareToday` and render it for `tab === "today"`. Remove only the obsolete inline `Header`, `WeekStrip`, `TodayTab`, period-card, pager, next-up, and duplicate timeline code and their now-unused imports. Keep the shell, data loading, mutators, tabs, bottom navigation, loading/error/empty states, and all later-stage tab components unchanged.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `npm test -- src/screens/home/today-model.test.ts src/screens/home/HomeCareToday.test.tsx`

Expected: both files pass with no unhandled promise warnings.

### Task 3: Establish shared tokens and finish the responsive surface

**Files:**
- Modify: `src/index.css`
- Modify: `src/screens/home/homecare.css`

**Interfaces:**
- Consumes: existing self-hosted Manrope and Inter font declarations.
- Produces: stable `--cl-*` custom properties and scoped Today styles.

- [ ] **Step 1: Add the role-neutral token foundation**

Add shared custom properties under `:root`:

```css
--cl-canvas: #f7f9fc;
--cl-surface: #ffffff;
--cl-ink: #0a0d12;
--cl-muted: #5f6b78;
--cl-line: #e2e9f1;
--cl-blue: #168bff;
--cl-blue-strong: #0e6fdb;
--cl-blue-wash: #eef5ff;
--cl-positive: #167a58;
--cl-attention: #9a5b00;
--cl-danger: #c9372c;
--cl-target: 44px;
```

Include radii and the two restrained shadows defined by the spec. Do not rename or remove Tailwind tokens in this stage.

- [ ] **Step 2: Map Home Care variables to shared tokens**

Replace duplicated literal palette values at the top of `.hc` with `var(--cl-*)` aliases. Preserve semantics: blue is navigation/action, green is recorded/positive, amber is attention, red is danger.

- [ ] **Step 3: Replace obsolete Today CSS with the new hierarchy**

Remove selectors used only by the retired week strip, period cards, previous/next pager, next-up block, and duplicate timeline. Add styles for the Today page header, operational summary, active-action frame, and schedule rows. Ensure all row buttons and interactive controls meet `min-height: var(--cl-target)`.

- [ ] **Step 4: Run focused tests, typecheck, and production build**

Run:

```bash
npm test -- src/screens/home/today-model.test.ts src/screens/home/HomeCareToday.test.tsx
npm run typecheck
npm run build
```

Expected: all commands exit 0.

### Task 4: Full regression and visual evidence

**Files:**
- Modify only if the evidence reveals a Stage 1 defect: `src/screens/home/HomeCareToday.tsx`, `src/screens/home/homecare.css`, or their tests.
- Create screenshots under: `docs/screenshots/unified-carelune-stage-1/`

**Interfaces:**
- Consumes: the existing `vite.screenshot.config.ts` synthetic harness at `screenshot.html?screen=home&role=caregiver&tab=today`.
- Produces: 390px, 768px, and 1440px PNG evidence.

- [ ] **Step 1: Run the full automated verification serially**

Run:

```bash
npm test
npm run typecheck
npm run build
npm run verify:separation
```

Expected baseline minimums: 7 existing test files / 55 existing tests plus the new Stage 1 tests; typecheck exit 0; app and marketing builds exit 0; separation 33/33.

- [ ] **Step 2: Start the synthetic screenshot harness**

Run: `npx vite --config vite.screenshot.config.ts`

Open: `http://127.0.0.1:5182/screenshot.html?screen=home&role=caregiver&tab=today`

- [ ] **Step 3: Capture one bounded responsive review**

Capture full-page screenshots at viewport widths/heights:

- 390 × 844
- 768 × 1024
- 1440 × 1000

Check for horizontal overflow, clipped bottom navigation, repeated schedule rows, sub-44px actions, loss of active-action controls, and excessive desktop stretching.

- [ ] **Step 4: Apply one evidence-led correction batch if required**

For any functional defect, first add or update a failing test and verify RED. Apply the minimum fix, run the focused test to GREEN, then capture one confirmation screenshot set. Stop after that bounded confirmation round.

- [ ] **Step 5: Re-run fresh final verification**

Run the full commands from Step 1 again after the final code change. Record exact counts, exit codes, bundle status, screenshots, and remaining risks in the Stage 1 handoff. Do not deploy, merge, push, or begin Stage 2.
