# Carelune — Demo Guide

**Demonstration prototype — fictional data — not approved for clinical use.**

How to run the Carelune Neuro Continuum guided demo for a stakeholder audience.

---

## 1. Purpose

Show that a physiotherapist-led, coordinator-operated recovery continuity programme can be
run as an **orchestrated, auditable service** — not an exercise-video app, not a virtual
hospital, and not an autonomous clinical decision system.

The demo proves four things:

1. **Distribution** — patients arrive through physiotherapists who keep their patients.
2. **Operations** — one named coordinator carries referral → activation → routing → closure.
3. **Boundaries** — every clinical act has a named, authorised owner; AI never decides.
4. **Evidence** — the pilot produces real operational metrics, cleanly separated from
   validated clinical instruments.

## 2. Audience

- **Investors / advisors** — scenes 1–3, 5–7, 12 carry the business argument.
- **Clinicians (physiotherapists, PM&R, medical)** — scenes 4, 6, 8, 9, 11 carry the
  governance and scope argument. Expect scrutiny on the swallow hold and on AI limits.
- **Referring physiotherapists** — scenes 2, 4, 9. The message is "you keep the patient".
- **Families** — scenes 5, 6, 10 only.

## 3. Running it

```bash
npm install
npm run dev          # http://localhost:5173
```

On the cover, click **Start guided demo**. The presenter bar appears at the foot of the
screen with the scene number, title, presenter notes, transport controls and a 1–12 jump
strip.

| Control | Effect |
|---|---|
| **Next** / **Back** / `→` `←` | Move one scene. Arrow keys are ignored while typing in a field. |
| **1–12 strip** | Jump to any scene. |
| **Notes** | Collapse or expand the presenter notes. |
| **Restart** | Back to scene 1 from the clean fictional seed. |
| **Exit** | Leave the guided path and explore freely by role. |

**How scene state works.** Each scene declares deterministic preparation steps that run
through the same guarded store actions a real user would use. Moving **forward** is
incremental, so anything you did by hand in the current scene survives. Moving **backward**
resets the fictional data and replays preparation from the seed — scenes build on one
another and there is no honest way to un-run a clinical action. Nothing depends on what
anyone did in an earlier browser session, and no scene transition reloads the page.

**Timing.** 8–12 minutes at a steady pace. Scenes 3, 4 and 8 are the interactive ones and
absorb time; if you are short, narrate those instead of clicking through them.

## 4. Scene sequence and presenter notes

The same notes appear in the presenter bar during the demo.

### Scene 1 — The promise · *cover*
- **Seeing:** brand, programme name, family promise, fictional-data warning.
- **Do:** read the promise line aloud, then point at the demonstration warning.
- **Proves:** Carelune Health — Care continues. The first programme keeps the recovery team
  around a patient who has gone home.
- **Don't claim:** not a live or clinically approved product. Everything on screen is fictional.

### Scene 2 — Physiotherapist-led referral · *Lead Physiotherapist*
- **Seeing:** Ravi Kumar referring his own patient into Carelune.
- **Do:** walk the form; stop on the line confirming Ravi remains Lead Physiotherapist.
- **Proves:** acquisition runs through professionals who already hold the relationship.
  Carelune extends Ravi's practice; no hospital procurement is needed to start the pilot.
- **Don't claim:** no hospital or EHR integration. Carelune does not take over the patient.

### Scene 3 — Coordinator onboarding · *Recovery Care Coordinator*
- **Seeing:** Divya's view of a live referral (Joseph Mathew), then explanation, suitability,
  contextual consent, simulated payment, onboarding, activation gates.
- **Do:** record the explanation, run the checklist, grant consents, take the simulated
  payment, tick onboarding. Finish on the activation gates and show they cannot be bypassed.
- **Proves:** one named person owns referral → activation, with an audit trail. A managed
  service, not an app the family is left to work out.
- **Don't claim:** Divya has no clinical authority. The checklist applies pre-approved rules;
  clinical ambiguity routes to the Clinical Operations Lead.

### Scene 4 — Clinical planning · *Lead Physiotherapist*
- **Seeing:** baseline provenance, functional goals, recovery barriers, governed template,
  AI-assisted discovery over approved content, professional personalisation.
- **Do:** show the provenance chips, open a goal, run AI-assisted discovery, select an item,
  personalise dose and schedule, add rationale, approve — watch the plan version increment.
- **Proves:** AI narrows an approved library and drafts; the authorised professional decides,
  personalises and signs. One accountable, versioned plan with a named approver.
- **Don't claim:** AI never proposes treatment, progression, diet change or referral. The
  template and content items are fictional and unsigned.

### Scene 5 — The caregiver's day · *Caregiver*
- **Seeing:** Lakshmi's phone; the plan has become today's priorities with approver,
  assistance and stop conditions.
- **Do:** open a task, show approver / assistance / stop conditions, report an outcome using
  the six states. Point out Divya's name and the published hours.
- **Proves:** a complex multidisciplinary plan arrives as a simple, ordered day with a named
  human to contact.
- **Don't claim:** this is not monitoring. Everything is caregiver-reported; the app does not
  watch the patient.

### Scene 6 — A concern is reported · *Caregiver*
- **Seeing:** the patient-specific daily check-in.
- **Do:** select "Coughing / wet voice" under meals and submit. Show the caregiver
  instruction — stop the meal, sit upright, nothing by mouth, request help — and the
  temporary hold the approved rule places on feeding.
- **Proves:** a safety concern raised at home does not evaporate after discharge. It stops the
  activity, holds the intervention, and reaches a named professional.
- **Don't claim:** no diagnosis, no diet or texture change. The hold comes from a named,
  versioned, human-authored rule — not from AI and not from implicit code behaviour.

### Scene 7 — Coordinator routing · *Recovery Care Coordinator*
- **Seeing:** the exception queue, with provenance, the rule that set the priority, and the
  pilot service target.
- **Do:** open the exception, read the priority source aloud, acknowledge, route to the
  Rehabilitation Nurse with a reason.
- **Proves:** the right issue reaches the right person, with the clock and closure checklist
  visible. Operational routing is tracked separately from clinical resolution.
- **Don't claim:** a pilot service target inside published hours, not a guaranteed response.
  Acknowledging and routing is not clinical resolution.

### Scene 8 — Nursing and the medical boundary · *Rehabilitation Nurse → Medical Clinician*
- **Seeing:** structured triage on an approved pathway — guided observations, red-flag checks,
  approved caregiver education only.
- **Do:** work the observations and red flags, give approved education, record the outcome.
  Then switch to the Medical Clinician to show the consent gate and the prepared summary.
- **Proves:** clinicians open a prepared, relevant summary instead of reconstructing the
  story. Each discipline works inside its own scope.
- **Don't claim:** the nurse does not diagnose, prescribe, or declare swallowing safe. Only
  Speech & Swallow can lift a feeding hold — locked in this demo, unresolved in production.

### Scene 9 — Weekly professional review · *Lead Physiotherapist*
- **Seeing:** execution patterns, goal and barrier status, open holds and referrals, and an
  AI-prepared factual summary with questions.
- **Do:** read the AI summary and note every line is a fact or a question, never a
  suggestion. Record Ravi's own decision with rationale; show the new plan version.
- **Proves:** the professional stays in control between physical visits. Every plan change has
  a named decider, a rationale and a version.
- **Don't claim:** the AI summary is not a recommendation and decides nothing. App adherence
  is not evidence of clinical improvement.

### Scene 10 — Family visibility · *Family / payer*
- **Seeing:** Suresh's read-only view — progress, concerns and what was done, goals, upcoming
  reviews, programme status.
- **Do:** show the scene-6 concern here in plain language with the action taken. Then point
  out what is absent: internal notes, clinical working, any control.
- **Proves:** a remote family member gets genuine confidence and a real audit trail without
  acquiring clinical control.
- **Don't claim:** visibility is not authority. Suresh cannot edit anything.

### Scene 11 — The Day-30 decision · *Lead Physiotherapist*
- **Seeing:** validated assessments shown separately from operational analytics, goal status,
  execution, safety and continuity, caregiver wellbeing.
- **Do:** show that mRS and Barthel sit apart from task completion and never combine. Walk
  the three renewal acts in order: clinical recommendation → family decision → administrative
  activation.
- **Proves:** renewal is evidence-informed and consented, never automatic. Three people, three
  separate acts, enforced by the system.
- **Don't claim:** do not combine these into any single score. Instrument licensing is
  unresolved, so item-level data is deliberately not displayable.

### Scene 12 — Operations and close · *Clinical Operations Lead*
- **Seeing:** pilot operational analytics — exceptions and holds, response and closure times,
  review compliance, safety and audit — labelled "operational analytics, not clinical outcomes".
- **Do:** show the operational picture, then close: physiotherapist-led distribution, one
  coordinator, multidisciplinary pathways, measurable operational proof, three-patient
  Bengaluru pilot before any expansion.
- **Proves:** the pilot produces operational evidence a founder and a clinician can both act on.
- **Don't claim:** none of these are clinical outcomes and none show efficacy. An uncontrolled
  three-patient pilot demonstrates feasibility, engagement, safety and service performance.

## 5. Resetting the demo

**Reset fictional demo** restores the seeded fictional case: patient state, tasks, task
reports, medication records, check-ins, exceptions, holds, referrals, reviews,
programme/renewal status, audit timeline, and the guided-demo position.

- On the **cover**, below the role grid.
- In the **role bar**, top right, when not in the guided demo.
- **Restart** in the presenter bar does the same and returns to scene 1.

Reset restores fictional seed data. No real patient record exists in this prototype, so
nothing is ever deleted. Reloading the page has the same effect — all state is in memory.

## 6. Claims to avoid

Never say, imply, or let a question lead you into:

- 24/7 or continuous clinical cover, monitoring, or a guaranteed response time.
- Any AI clinical claim — that AI recommends, decides, diagnoses, triages, prescribes,
  progresses therapy, or closes an escalation.
- A composite "Carelune Recovery Score", a recovery percentage, or any prediction.
- That Carelune improved recovery, prevented a readmission, or is clinically validated.
- That the platform is integrated with hospitals, EHRs, pharmacies, laboratories, or
  equipment suppliers, or that Carelune sells any of those.
- That app adherence demonstrates clinical improvement.
- That the demo contains real patients, real professionals, or production-ready software.

Safe framings: *pilot service target* · *caregiver reported* · *clinician assessed* ·
*AI-assisted discovery* · *AI-prepared factual summary* · *operational analytics — not
clinical outcomes*.

## 7. Known fictional and clinical limitations

- **All data is fictional.** Patients, professionals, assessments, safety rules, the triage
  pathway, response targets, content items and analytics figures are invented.
- **No clinical sign-off.** Safety rules, the triage pathway and the protocol template await
  review by the Medical Clinician, PM&R Specialist and discipline leads.
- **Instrument licensing unresolved.** mRS and Barthel digital reproduction permission is
  unverified; item-level data is intentionally not displayable.
- **No wall clock.** Timestamps are strings ("Day 12 · now"). SLA states render but are not
  time-driven, so *approaching* / *overdue* / *out-of-hours* never trigger by themselves.
- **One expanded record.** Only Anand Menon has a full clinical record. Other pilot patients
  are deliberately non-clickable and must never display his data.
- **In-memory only.** No backend, no persistence, no authentication. Every reload resets.
- **Simulated throughout.** Payment, renewal activation, video, messaging, notifications and
  media upload are placeholders — nothing is sent, charged, stored or transmitted.
- **Swallow-hold release is locked.** Who may lift a feeding hold in production, and on what
  evidence, is an open clinical decision.
- **No emergency path.** Emergencies are directed to 112/108 and never enter the workflow.

## 8. If something goes wrong mid-demo

- **A screen looks stale or empty** — click the current scene number in the jump strip. A
  backward jump replays that scene's preparation from the clean seed.
- **You clicked too far** — jump back; state is restored deterministically.
- **The state is confusing** — Restart. It takes about a second and loses nothing but position.
- **Someone asks for a feature that isn't there** — say it is out of scope for the pilot and
  point at `PROTOTYPE_READINESS.md`. Do not improvise a capability.
