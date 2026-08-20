# Decision record

Founder decisions that **knowingly diverge** from `carelune-freeze-pack/`. `CLAUDE.md`
says the freeze pack wins and that conflicts must be reported rather than silently
resolved — this file is where a resolved conflict is written down, so the code and the
governance documents never drift apart without a trace.

---

## D-001 · Institutional pathway approval removed from the product flow

**Decided:** 2026-08-20, founder · **Status:** implemented (onboarding), in progress (plan studio)

The product had two clinical approvals:

- **A.** The institution approves a Carelune-authored pathway template, once, before
  any plan can be built on it.
- **B.** The treating doctor approves and activates *this patient's* plan
  (migrations `0025_clinical_approval_authority`, `0026_activation_treating_doctor_only`).

**A is removed. B is unchanged and remains the clinical control.**

Rationale: A forced a clinical decision on the platform operator before the institution
had even signed in, then blocked that institution's own doctor behind a second "approve
this template" gate. It was generic rather than patient-specific, and added no safety that
B does not already provide at the point of care.

Consequences:
- The Super Admin no longer assigns pathway packs; the institution declares the
  **recovery departments** it serves during its own setup.
- Institution setup drops the "Programmes" step: Identity → Package → Finish.
- `pathway_packs` / `institution_pathways` remain in the schema but are no longer
  surfaced or required. No data was migrated or dropped — the platform is pre-launch
  with no real institutions.

---

## D-002 · The AI may propose standard-of-care content

**Decided:** 2026-08-20, founder, after the conflict was raised · **Status:** planned (Phase 3)

The freeze pack states the AI "compiles facts/patterns/concerns/questions/draft notes/
approved-content search ONLY — it never proposes treatments, progressions, diet/swallowing
changes, medication changes, referrals or plan changes"
(`03_CARELUNE_FREEZE_V1.md`, mirrored in `CLAUDE.md`).

**That boundary is lifted.** Where a patient's discharge document is silent, the model may
propose standard-of-care content — an exercise progression, a diet schedule, wound-care
steps, monitoring parameters — for the treating doctor to edit and approve.

This was raised as a conflict, including the regulatory exposure for a real-patient pilot,
and the founder chose it deliberately. Recorded here rather than resolved silently.

**Required compensating controls** (all must hold before real patients):

1. AI-proposed items carry provenance `ai_suggested`, distinct from `document` / `doctor`,
   and are visually distinguishable wherever a clinician sees them.
2. A plan cannot be activated while any `ai_suggested` item is unreviewed — the doctor
   must accept, edit or delete each one.
3. No `ai_suggested` content is ever visible to a caregiver or family before activation.
4. The generation prompt keeps its anti-fabrication rules for *facts*: diagnoses,
   medicines, doses and investigations must still come from the document or the doctor,
   never invented. Only regimen and schedule content may be proposed.
5. The freeze pack must be amended upstream, and the clinical lead must sign off, before
   this reaches a real patient.

> **Open:** controls 1–4 are engineering and land with Phase 3. Control 5 is a
> founder/clinical action and is **not** done. `PRELAUNCH_AUDIT.md` Layer 2 (clinical
> safety and governance) remains entirely unchecked.
