# Carelune — Refined Model v2 (DRAFT — founder review)

> **Status: DRAFT for Sujith's sign-off.** This supersedes the physiotherapist‑led /
> sales‑coordinator business model in the July 2026 freeze pack **for business‑model and role
> questions only.** The freeze pack stays read‑only; its **clinical‑safety, boundary, provenance
> and measurement disciplines still apply in full.** Correct anything below before build starts.
> Once approved, this file (not the freeze pack) is the source of truth for roles, pipeline and scope.

## 1. What Carelune is now

A **B2B product sold to rehab centres** to **digitalize discharge continuity**. Carelune owns the
"A‑side" — the software, the workflow, orchestration, visibility, auditability. **Clinical
responsibility stays with the rehab centre's own doctors.** Carelune employs no clinicians,
provides no therapists, and brokers no commerce. One rehab centre = one main (PMR) doctor who owns
the clinical side; Carelune is the digital layer around them.

**Condition‑agnostic.** Not limited to stroke/neuro. Any patient discharged from a rehab centre
uploads their summary; the value is in **turning that summary into a followable SOP + a realistic
90‑day journey** and running the follow‑through — not in any one clinical specialty.

**Onboarding = discharge‑summary upload.** A new patient enters the moment a summary is uploaded.
**Four entry paths, same pipeline:** (a) the **patient self‑onboards** (QR / signup), (b) a **nurse**
uploads, (c) the **duty doctor** uploads, or (d) the **PMR doctor** uploads.

**Reuse, don't rebuild.** The existing professional screens are strong and stay: the **doctor
overview** (meds / diagnostic summary), the **duty‑doctor page**, and the **nurse insight** view.
We extend them for the new pipeline — we do not replace them.

## 2. Actors (6)

| Role | Does |
|---|---|
| **Patient** | Self‑onboards via QR (or is onboarded by a nurse) → **consent** → uploads the **discharge summary** → sees their **90‑day journey** → opts for their own external PT / OT / Speech‑swallow therapist (record only). |
| **Nurse** | Can **onboard** a patient; reviews the AI‑drafted SOP against the summary; later **explains** it to caregiver/family and **monitors** adherence. |
| **Duty Doctor** | **Confirms** the reviewed SOP. *(Label open — see §7.)* |
| **PMR Doctor** | **Clinical owner.** Final edits → **approves** the SOP; runs the **weekly review** and confirms milestone changes. Recommends PT / OT / Speech‑swallow schedules. |
| **Caregiver** | Executes the approved SOP; updates task status, including **via photos**. |
| **Family** | Read‑only **overview**, including the 90‑day journey. |

Physiotherapist is **removed** as an app role. PT / OT / Speech‑swallow are **PMR recommendations**
plus **patient‑sourced external therapists** — not Carelune users.

## 3. The discharge pipeline (the spine)

```
Patient/Nurse onboards → uploads discharge summary (consent)
        │
        ▼
AI drafts a structured SOP from the summary        ← DRAFT only, never active
        │
        ▼
Nurse reviews  →  Duty Doctor confirms  →  PMR edits & approves
        │
        ▼
Nurse explains the SOP to caregiver/family & monitors adherence
        │
        ▼
Caregiver follows the SOP   →   Family read‑only overview
        │
        ▼
Weekly review (PMR): progress in → milestones refined → journey updates
```

- Every transition is **audited**; **PMR is the only approve authority**.
- Nothing reaches the caregiver until PMR approval. Before that the SOP is "in review," never a task.
- The approved SOP feeds the **caregiver Today app we already built** and the **family overview**.

## 4. The 90‑day adaptive journey

The patient and family see a structured **90‑day recovery journey** with milestones.

- Hospitals hand out a **generic** 90‑day plan. Carelune sets **realistic milestones from the actual
  discharge reality**, not a template.
- Milestones start as **approximate long‑term goals**; on **weekly review** they are **refined** to
  match how the patient is actually progressing.
- Achieving one milestone **advances** the journey to the next — the patient gets a felt sense of progress.
- **Guardrail:** the system **projects, tracks, and surfaces divergence** ("ahead of / behind plan")
  and **proposes** milestone adjustments; the **clinician confirms every change** at the weekly review.
  "Automatic" = auto‑*proposed*, never auto‑*applied without a clinician*. Same rule as the SOP.

## 5. Boundaries kept from the freeze pack (non‑negotiable)

- **The AI guardrail — the line that keeps this safe (founder‑confirmed).** Backend AI ("A") is
  **clinical decision *support***: it **guides**. From the discharge summary + the patient's logged
  progress, it derives **suggested draft** plans (specialist/medical, physiotherapy, OT,
  speech‑swallow) and **goal milestones**, grounded in **established standard‑of‑care rehabilitation**
  ("golden standard"). It **does not invent** novel treatments, and it **never approves**. The **PMR
  doctor edits and accepts every item**; nothing is active until the doctor approves. Every AI output
  is labelled *"AI suggestion — pending doctor approval."* In short: **A guides; the doctor decides and
  approves.** "Guides but does not invent" = grounded in recognised rehab standards, never fabricated.
  Condition‑agnostic scope makes this guardrail **more** important, not less.
- Carelune never makes clinical decisions — the centre's doctors do.
- **"Opt any therapist" = a record of the patient's own choice.** No marketplace, referral engine,
  commission, or pharmacy/lab/equipment commerce.
- Every datum carries a **provenance** label; caregiver‑reported data (incl. photos) is never labelled
  "measured." Validated instruments stay separate from operational analytics.
- Emergency copy and support‑hours discipline retained.

## 6. Proposed build order (phase‑by‑phase, founder review after each)

1. **Model + shell refactor** — adopt the 6 roles (Patient in, Physiotherapist out), routing, scope
   panels. Keep the existing doctor/duty‑doctor/nurse screens; wire them to the new pipeline.
2. **Intake / onboarding** — QR → patient login → consent → discharge‑summary upload; nurse‑initiated path.
3. **AI SOP draft** — structure the uploaded summary into a draft SOP, fully labelled/provenance‑tagged.
4. **Review chain** — Nurse review → Duty Doctor confirm → PMR edit & approve, as an audited state machine.
5. **90‑day journey** — realistic milestones from the summary; weekly‑review refinement (clinician‑confirmed).
6. **Caregiver execution** — status updates + **photo** evidence (existing Today app extended); Nurse monitoring.
7. **Family overview** — read‑only, incl. the journey.
8. *(Later, deliberate)* **Real backend** — accounts, storage, PHI handling, and the actual AI extraction.

## 7. Resolved decisions

- **Build target:** real, minimal **Supabase** email/password auth + persistence (no OAuth/OTP).
  Auth foundation is **built and verified**; six per‑role demo accounts seeded (password `carelunedemo`).
- **Scope:** condition‑agnostic — no longer neuro‑only.
- **AI guardrail (§5):** confirmed — A guides/suggests (standard‑of‑care), doctor approves every item.
- **Label:** the medical role shows as **"Duty Doctor."**
- **Patient** is a full login role (self‑signup, own screen, consent/upload, journey view).
- **Onboarding uploaders:** patient (self), nurse, duty doctor, PMR doctor.

### Still open (not blocking Phase 1)

- **Photo status updates** — storage location, visibility, provenance label.
- **Role security hardening** — move role from `user_metadata` to a server‑controlled `profiles`
  table with RLS before production (metadata is not a security boundary).
- **Real AI extraction & file upload** — live model calls + storage bucket (later phase; demo uses
  seeded SOP/journey for now).
