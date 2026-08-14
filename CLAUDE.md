# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Read these three first, in this order:**
> 1. **[`CARELUNE_IMPLEMENTATION_STATUS.md`](CARELUNE_IMPLEMENTATION_STATUS.md)** (project root) —
>    what is actually built: completed phases A–G, canonical routes, state machines, the guided-demo
>    contract, guard tests, known limitations, and retired files that must not be recreated.
> 2. **[`carelune-freeze-pack/03_CARELUNE_FREEZE_V1.md`](carelune-freeze-pack/03_CARELUNE_FREEZE_V1.md)**
>    — frozen product, roles, boundaries, offer.
> 3. **[`carelune-freeze-pack/04_MEASUREMENT_AND_DATA.md`](carelune-freeze-pack/04_MEASUREMENT_AND_DATA.md)**
>    — measurement, provenance and analytics rules.
>
> Also in the project root: **[`DEMO_GUIDE.md`](DEMO_GUIDE.md)** (presenter script, claims to avoid)
> and **[`PROTOTYPE_READINESS.md`](PROTOTYPE_READINESS.md)** (what this build is and is not ready
> for, and the production-MVP gap).
>
> **This file supersedes all earlier "Continuum"/hospital-first guidance.** The product is
> **Carelune Health**; the July 2026 **freeze pack is the single source of truth** for brand,
> business model, clinical boundaries and scope. It now lives **in this project** at
> `carelune-freeze-pack/`:
> [README](carelune-freeze-pack/README.md) ·
> [01_GLOBAL_BENCHMARK](carelune-freeze-pack/01_GLOBAL_BENCHMARK.md) ·
> [02_CLINICAL_FOUNDATION](carelune-freeze-pack/02_CLINICAL_FOUNDATION.md) ·
> [03_CARELUNE_FREEZE_V1](carelune-freeze-pack/03_CARELUNE_FREEZE_V1.md) ·
> [04_MEASUREMENT_AND_DATA](carelune-freeze-pack/04_MEASUREMENT_AND_DATA.md) ·
> [05_CLAUDE_CODE_MASTER_PROMPT](carelune-freeze-pack/05_CLAUDE_CODE_MASTER_PROMPT.md).
> If anything here conflicts with the freeze pack, the freeze pack wins — report the conflict,
> don't silently pick either.
>
> These files are a verbatim copy taken on 21 July 2026 from the upstream authoring location
> (`~/.codex/.chatgpt-projects/g-p-6a311b7e4d5881919377989fe0da4f5d/carelune-freeze-pack/`).
> Treat the in-project copy as read-only: if the freeze pack is revised upstream, re-copy it
> rather than editing it here.
>
> **Second, unrelated app in this repo:** `cyrix-discovery/` (Cyrix Healthcare org-discovery platform,
> dev port 5174) has its own CLAUDE.md, design language and dependencies. Never mix code, data or
> design tokens between the two apps. Everything below is about the Carelune demo only.

## What This Is

**Carelune Health — "Care continues."** First programme: **Carelune Neuro Continuum — Recovery
beyond discharge.** A multi-role interactive demo (fictional data only, no production or clinical
readiness claimed) of a physiotherapist-led, coordinator-operated, multidisciplinary recovery
continuity programme for a three-patient Bengaluru pilot of **medically stable adult stroke
patients**. Family promise: "Bring the patient home without losing the recovery team."

### Frozen model essentials (from the freeze pack)

- **Physiotherapist-led acquisition**: patients enter through their existing neuro-physiotherapist,
  who **remains Lead Physiotherapist** (demo persona: Ravi Kumar). Carelune never takes over the patient.
- **Carelune owns orchestration** — caregiver execution, visibility, routing, auditability, workflow
  closure — **never autonomous clinical decisions**. Each licensed discipline keeps its clinical authority.
- **Roles/personas**: Lakshmi (caregiver) · Suresh (family/payer, read-only) · Ravi Kumar (Lead
  Physiotherapist) · Divya (Recovery Care Coordinator — no clinical authority) · Nisha
  (Rehabilitation Nurse) · **Dr. Farhan — "Medical Clinician & Clinical Operations Lead"** (the
  user-facing medical role label is **Medical Clinician**, never "MBBS Doctor" or PM&R) · Dr. Meera
  (PM&R Specialist). OT/speech-swallow/dietitian/psychologist exist in the data architecture only.
- **Hard boundaries — never reintroduce**: 24/7 clinical promises · continuous monitoring · autonomous
  AI (AI compiles facts/patterns/concerns/questions/draft notes/approved-content search ONLY — it never
  proposes treatments, progressions, diet/swallowing changes, medication changes, referrals or plan
  changes) · pharmacy/lab/equipment commerce or marketplace · hospital-first framing or hospital
  revenue KPIs · a composite "Carelune Recovery Score".
- **Measurement discipline**: validated instruments (mRS, Barthel — named, versioned, with assessor)
  stay strictly separate from Carelune operational analytics (task completion, SLA times). Every
  datum carries a provenance label (`Provenance` type). Never label caregiver-reported data
  "measured"; family/caregiver surfaces use neutral wording ("Recorded by the Lead Physiotherapist");
  instrument-licensing caveats appear only in internal/professional context.
- **Support boundary**: coordinator + nursing triage 8:00 AM–8:00 PM IST, 7 days. Use the frozen
  emergency copy verbatim from `EMERGENCY_COPY` in `src/domain/roles.ts` (112/108).
- **Commercials**: family pays ₹5,999/month (30-day programme); physical physio visits paid directly
  to the professional, no Carelune commission.

### Working method

Implementation proceeds **phase by phase (A–G per 05_CLAUDE_CODE_MASTER_PROMPT) and stops for
founder review after each phase.** Phase A (foundation: rename, roles, shared store, audit) is done
and approved. Do not build ahead of the current phase, do not add features because competitors have
them, and keep a working demo at every step.

## Commands

Stack: **Vite 6 + React 18 + TypeScript 5 (strict) + Tailwind 3**. No router, no state-management
library, no test runner, no linter.

```bash
npm install        # install deps
npm run dev        # Vite dev server on port 5173
npm run build      # production build to dist/ (esbuild — does NOT type-check)
npm run preview    # serve the built bundle
npx tsc --noEmit   # the ONLY real type-check — dev/build will not catch TS errors
```

- `tsconfig.json` is strict incl. `noUnusedLocals`/`noUnusedParameters`; removing an import's last
  use breaks the typecheck, so clean removals atomically.
- **Tailwind gotcha:** editing `tailwind.config.js` requires restarting the dev server.
- **Vite gotcha (historical):** Vite resolves `.jsx` before `.tsx` for extensionless imports — never
  create a `.jsx` next to a `.tsx` of the same basename.

## Architecture

Front-end-only demo. `index.html` → `src/main.tsx` → `App`. No backend; all data is typed fictional seed.

- `src/domain/types.ts` — the **mandatory Carelune domain architecture** (roles, permissions,
  lead lifecycle, consent/payment, goals/barriers, 3-layer protocol structure, content-library items,
  interventions + 6 delivery modes, 6-state task results, exceptions/actions, reviews, specialist
  referrals, validated assessments, operational metrics, audit events). Build new features on these
  shapes; don't invent parallel ones.
- `src/domain/roles.ts` — `ROLE_META` (personas, owns/cannot), `PERMISSIONS` flags, `SWITCHABLE_ROLES`,
  `SERVICE_HOURS`, `EMERGENCY_COPY` (use these constants; never re-type the safety copy).
- `src/domain/seed.ts` — one shared fictional case (Anand Menon, Day 12) + the seeded audit trail.
- `src/store/carelune.tsx` — **the one shared demo state** (`CareluneProvider`/`useCarelune`): task
  reports, medication record, signals, follow-ups, exceptions, audit log. Every role reads/updates
  this store; every material action appends an `AuditEvent`. Never re-localise this state into screens.
- `src/App.tsx` — role-based navigation: cover (`role === null`) → `RoleBar` role switcher → per-role
  screens. Hash routes `#<role>[/sub]` (legacy `#home`/`#hospital` aliases still map). Hash is parsed
  once at load and written back on navigation.
- `src/screens/` — `Cover.tsx` (role doors) · `home/` (caregiver phone app: HomeShell + Today/Meds/
  Log/Progress/Help tabs + TaskDetail/FamilyView; max-width 430px, no desktop grids) · `hospital/`
  (professional desktop screens: caseload, PatientDetail, ReviewPrep, Consult — folder name is
  legacy, these are Lead-Physio/Medical-Clinician workspaces) · `roles/RoleHome.tsx` (workspace
  preview for roles whose full flows arrive in later phases).
- `src/components/` — `ui.tsx` primitives (Icon set, LoopMark, BrandLockup, ProgressRing, TrendBars,
  Card) · `Timeline.tsx` (**`ProvChip` provenance labels + unified audit timeline — use these for any
  data display**) · `HospitalHeader.tsx` (persona-aware professional header + `riskStyles`).
- Only Anand (`p1`) has an expanded clinical record. **Fatima/Devi must never display Anand's data**
  — their dashboard cards are non-clickable "Demo profile not expanded" until separate fictional
  records exist.

## Design language

Tokens live in `tailwind.config.js` (names stable across rethemes): `mist` lavender canvas · `ink`
navy · `brand` indigo (600 actions, 500 gradients) · `sage` muted text · `good` green **only** for
positive/recovery signals · `warn` amber · `coral` **only** for emergency/at-risk. Fonts: Bricolage
Grotesque (display) · Inter (body) · Newsreader italic (rare human lines). Loaded via Google Fonts in
`index.html`. Accessibility floor: semantic landmarks, `aria-labelledby` cards, focus-visible rings,
`prefers-reduced-motion`, ≥44px targets. `ProgressRing` hardcodes two hexes that must track
`mist-200`/`brand-600`; the favicon/theme-color in `index.html` hardcode brand hexes.

## Verifying changes visually

- Preferred: browser-preview MCP tooling (`.claude/launch.json` → `punarvaas-dev` config, port 5173).
  The pane sometimes serves stale frames/refs after interactions — verify via DOM state
  (`javascript_tool`) when screenshots look wrong.
- Headless fallback: `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new
  --screenshot=<path> --window-size=1280,1500 http://localhost:5173/` (min width ~500px is clamped).
