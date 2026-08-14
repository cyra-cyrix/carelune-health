# Master Claude / Claude Code Prompt

Paste the prompt below into the same Claude Code project that contains the existing demo.

---

You are revising the existing Carelune demo in this project. Treat the following files as the approved July 2026 source of truth:

1. `carelune-freeze-pack/01_GLOBAL_BENCHMARK.md`
2. `carelune-freeze-pack/02_CLINICAL_FOUNDATION.md`
3. `carelune-freeze-pack/03_CARELUNE_FREEZE_V1.md`
4. `carelune-freeze-pack/04_MEASUREMENT_AND_DATA.md`

Read them completely, then read the project’s existing `CLAUDE.md` and the entire current application. If `CLAUDE.md` conflicts with the freeze pack, report the conflict; do not silently choose the older assumption.

## Objective

Transform the current hospital-first “Continuum” concept demo into a coherent **Carelune Neuro Continuum** multi-role demo for a three-patient Bengaluru stroke pilot.

Do not redesign the business model. Do not add features because competitors have them. The competitor benchmark is for patterns and warnings, not a feature checklist.

## Frozen product statement

Carelune is a physiotherapist-led, coordinator-operated, multidisciplinary recovery continuity programme. The referring neuro-physiotherapist remains Lead Physiotherapist. Licensed professionals retain discipline-specific clinical authority. Carelune owns orchestration, caregiver execution, visibility, routing, auditability, and workflow closure.

## Terminology

Use **Medical Clinician**, not “MBBS Doctor,” as the user-facing role label.

Display the fictional lead as:

**Dr. Farhan — Medical Clinician & Clinical Operations Lead**

Do not call this role a rehabilitation physician or PM&R specialist.

## Shared fictional case

- Patient: Anand Menon, 58, Jayanagar, Bengaluru
- Condition: medically stable ischaemic stroke with left hemiparesis
- Lead Physiotherapist: Ravi Kumar
- Recovery Care Coordinator: Divya
- Rehabilitation Nurse: Nisha
- Medical Clinician / Clinical Operations Lead: Dr. Farhan
- PM&R Specialist: Dr. Meera
- Daily caregiver: Lakshmi
- Family/payer: Suresh, living outside India

All roles must read and update one shared demo state. Remove the multi-diagnosis cohort from the guided demo.

## Roles and depth

Deep flows:

1. Caregiver
2. Family/payer (read-only)
3. Lead Physiotherapist
4. Recovery Care Coordinator
5. Rehabilitation Nurse

Moderate flows:

6. Medical Clinician
7. Clinical Operations Lead
8. PM&R Specialist

Architecture only for now:

- Occupational Therapist
- Speech and Swallow Therapist
- Dietitian
- Clinical Psychologist / qualified mental-health professional

Use a generic specialist-referral lifecycle so these roles can be added without new hard-coded workflows.

## Mandatory domain architecture

Create/retain explicit types and shared state for:

- role and permission;
- referral/lead lifecycle;
- patient/program status;
- consent type/status/version;
- payment status;
- functional goal and recovery barrier;
- home environment and equipment;
- governed protocol/template and version;
- content-library item, discipline owner, evidence/approval state;
- patient-specific intervention and delivery mode;
- daily caregiver task and priority;
- task result: completed, partial, unable, refused, unwell, need help;
- patient-specific daily check-in;
- exception priority/status/owner/response target;
- action, follow-up, and closure;
- generic review;
- generic specialist referral;
- direct-visit recommendation/status/note;
- validated assessment result with instrument metadata;
- Carelune operational metric stored separately;
- unified timeline and audit event.

Intervention delivery modes:

- caregiver-guided home task;
- live virtual session;
- recorded video for professional review;
- direct home visit;
- clinic visit;
- hold pending reassessment.

## Clinical and AI boundaries

AI may support approved-content discovery, summaries, draft notes, tagging, translation/captions, and potential contraindication flags. AI may not diagnose, prescribe, assign/approve treatment, modify medication, progress/regress/hold an intervention, declare swallowing safe, or close a clinical escalation.

Keep validated clinical assessments as named instruments with versions and provenance. Do not create a Carelune Recovery Score. Do not combine adherence, Barthel/mRS, mood, goals, or caregiver input into a clinically presented composite.

Label data provenance: clinician-assessed, patient/caregiver/family-reported, device-measured, system-calculated operational metric, AI-drafted, or clinician-confirmed.

## Content-library architecture

Support clinician-governed content for physiotherapy, OT, communication, swallow/feeding, caregiver education, nutrition, and psychological support. Each item needs discipline, goal/domain, intended capability, instructions, personalisable dose fields, assistance, equipment, contraindications, precautions, stop conditions, evidence source, version, author/reviewer, approval/expiry, and observation requirements.

Do not build a large content library or generate clinical videos in this revision. Seed only a few fictional, clearly approved demonstration items.

## Primary guided-demo incident

Use coughing during feeding:

1. caregiver stops the task and selects Need help;
2. exception is created;
3. coordinator routes to the nurse;
4. nurse completes structured triage;
5. Dr. Farhan reviews only if medical escalation is indicated;
6. Lead Physiotherapist is informed;
7. task is held awaiting appropriate swallow/PM&R review;
8. action and closure are recorded.

Do not show an unauthorised diet-texture or treatment change.

## Support and safety language

Coordinator and nursing triage: 8:00 AM–8:00 PM IST, seven days. Medical Clinician: scheduled consultation and same-day escalation where priority and availability permit. No 24/7 or continuous-monitoring promise.

Use this emergency text consistently:

“Carelune is not an emergency service. For severe breathing difficulty, unconsciousness, a new stroke-like symptom, seizure lasting more than five minutes, serious fall, or another emergency, call 112/108 or go to the nearest emergency department immediately.”

## Explicitly excluded

No pharmacy/lab/equipment marketplace, public therapist marketplace, hospital/EHR integration, wearables, computer vision, continuous monitoring, smart TV/camera, autonomous AI, multiple continuums, insurance ERP, or physical-centre management.

## Working method

First inspect the current repository and produce a short implementation delta against the prior audit. Do not repeat the full audit. Identify conflicts between the current code/`CLAUDE.md` and the freeze pack.

Then implement in reviewable phases while preserving a working demo:

### Phase A — Foundation

- Carelune rename and safe wording;
- central navigation and role switcher;
- shared domain types/store and one patient state;
- role-based permission model;
- audit/timeline foundation;
- keep old screens rendering where safe.

### Phase B — Referral and coordinator onboarding

- Lead Physiotherapist referral;
- coordinator pipeline, suitability checklist, consent/payment status;
- caregiver onboarding and plan-activation readiness.

### Phase C — Goals, template/content discovery, and patient plan

- goals/barriers;
- governed template and small content seed;
- AI-assisted content-discovery placeholder with professional approval;
- patient-specific plan and delivery mode;
- plan activation and audit version.

### Phase D — Caregiver and family

- today’s priorities;
- six-state task reporting;
- restricted medication administration record;
- patient-specific Daily Check-in;
- coordinator/help visibility;
- read-only family/payer progress/action view.

### Phase E — Exception and clinical response

- coordinator routing queue;
- nurse triage;
- lightweight Medical Clinician/Clinical Operations screens;
- coughing-during-feeding flow;
- response targets, follow-up, closure, and audit.

### Phase F — Review, progress, referral, and renewal

- Lead Physiotherapist weekly review;
- generic specialist referral and direct-visit recommendation;
- lightweight PM&R review;
- separate validated assessment display and operational analytics;
- Day-30 renew/step-down/complete/refer decision.

### Phase G — Guided demo and quality

- cover with “Start guided demo” and “Explore by role”;
- 8–12-minute scripted path;
- consistent data across roles;
- responsive/accessibility QA;
- typecheck/tests/build.

## Rules for every phase

- Use fictional data only.
- Preserve reusable components; do not retain obsolete assumptions merely because they are coded.
- No destructive rewrite unless you first explain why it is necessary.
- Do not claim production or clinical readiness.
- Show who recommended/approved each clinical item, when, why, and which version.
- Keep caregiver input short and conditional.
- Make the coordinator visible without implying clinical authority.
- Distinguish service/demo needs from future production needs.
- After each phase, run relevant checks and report files changed, flows verified, deviations, and unresolved clinical/legal decisions.
- Stop for review after each phase unless explicitly authorised to continue.

Begin by reading the freeze pack and current project. Then provide the concise delta and implement **Phase A only**.

