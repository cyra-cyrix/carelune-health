# Measurement, Scoring, and Data Framework

## Non-negotiable distinction

Carelune must maintain three separate data classes.

### A. Validated clinical assessments

Named instruments administered and scored exactly according to their manuals by authorised/trained professionals. Store instrument name, version, assessor, mode, date, raw/item data where permitted, score, interpretation source, and licensing status.

### B. Carelune operational analytics

Internally defined measures such as task completion, missed-task reasons, coordinator minutes, response/closure times, review compliance, referral conversion, renewal, and content engagement. These may describe programme operations but are **not clinical outcome scales**.

### C. Carelune descriptive recovery dashboard

A visual presentation of separate validated scores, goals, barriers, execution, safety events, and professional observations. It must not collapse these into a single “Recovery Score” during the pilot.

## Minimum pilot measurement set

Final selection requires PM&R and discipline review plus licence/permission verification. A lean candidate set is:

### Required for every pilot participant

- baseline demographics, stroke date/type, discharge context, key comorbidities;
- clinician-rated global disability: **modified Rankin Scale (mRS)** at baseline and Day 30; consider Day 90;
- functional independence: **Barthel Index** or another locally accepted validated ADL instrument at baseline and Day 30;
- 2–4 patient/family-centred functional goals, with status and professional narrative;
- caregiver readiness/confidence and burden screening using a reviewed instrument or clearly labelled local questionnaire;
- adverse events, emergency referrals, falls, readmissions, and programme pauses.

### Domain-triggered, not universal

- mobility/balance/walking instrument selected by the Lead Physiotherapist according to ability;
- upper-limb motor/function assessment when relevant;
- communication/cognition assessment selected by speech/OT/neuropsychology;
- swallow/feeding screening or assessment only by the appropriate professional and within scope;
- nutrition screening by the dietitian/qualified professional;
- mood/anxiety/caregiver-burden instruments selected by the mental-health/clinical team.

NICE supports multidisciplinary, goal-based rehabilitation, caregiver support, and continued community rehabilitation; assessment selection should follow patient need rather than a universal battery. [NICE NG236](https://www.nice.org.uk/guidance/ng236/chapter/Recommendations)

AHA/ASA performance measures cover assessment, treatment, education, programme attributes, complications, and discharge-setting decisions, reinforcing that quality is broader than one outcome number. [AHA stroke rehabilitation performance measures](https://professional.heart.org/en/science-news/clinical-performance-measures-for-stroke-rehabilitation/top-things-to-know)

## Instrument governance registry

Before any assessment enters the app, record:

- instrument/version and intended population;
- clinical domain and purpose (screening, baseline, outcome, risk, research);
- administrator qualifications/training;
- permitted delivery mode (in-person, video, proxy, self-report);
- validated language/cultural version;
- scoring/manual source;
- copyright, licence, fee, and digital-reproduction permissions;
- interpretation limits and minimal clinically important difference, if established for the population;
- frequency and required response to concerning results;
- whether item-level data may be displayed to caregivers/families.

Do not assume that a widely used scale is free to reproduce digitally. Instruments such as FIM, MoCA, EQ-5D, Stroke Impact Scale, or caregiver/mood measures may have training, licensing, attribution, or digital-use conditions. Verify each directly with its owner before implementation.

## Goal model

Each goal stores:

- patient/family wording (“what matters to me”);
- clinical formulation;
- domain and owner;
- baseline capability;
- target behaviour/function and timeframe;
- supporting interventions;
- barriers and facilitators;
- evidence source (observation, validated assessment, caregiver report, device);
- status: not started, progressing, achieved, revised, held, discontinued;
- review rationale and next step.

Goals are not scores. Goal attainment may be visualised, but any formal Goal Attainment Scaling methodology must be implemented consistently and reviewed for validity/licensing.

## Carelune operational metrics

### Acquisition and revenue

- qualified referrals, contact rate, paid conversion, time-to-activation;
- revenue collected, refunds, professional payout, direct cost, contribution margin;
- repeat-referral rate by physiotherapist.

### Engagement and delivery

- critical-priority completion and reason distribution;
- active days, caregiver time burden, weekly review completion;
- content assigned/started/completed, video-review turnaround;
- direct-visit recommendation and completion.

### Coordination quality

- open exceptions by priority;
- acknowledgement, assignment, action, and closure times;
- overdue professional actions;
- coordinator minutes per patient and first-week versus stable-stage workload;
- reopened issues and handoff failures.

### Safety and governance

- adverse events, emergency directions, readmissions, falls;
- medication discrepancies;
- protocol deviations, expired content, unauthorised actions;
- consent/access changes, privacy incidents, documentation gaps.

## Evidence labels in the UI

Every data point should be labelled as one of:

- clinician-assessed;
- caregiver-reported;
- patient-reported;
- family-reported;
- device-measured;
- system-calculated operational metric;
- AI-drafted, awaiting review;
- clinician-confirmed.

Never use “measured, not guessed” for caregiver-reported data. Never infer clinical improvement from app adherence alone.

## Analytics freeze

During the pilot, do not release:

- a composite Carelune Recovery Score;
- recovery predictions;
- benchmarking clinicians or patients on clinical outcomes;
- AI-generated clinical recommendations;
- causal claims that Carelune improved recovery or prevented readmission.

After adequate data quality and sample size, Carelune may research predictive or composite analytics under a prespecified protocol, ethics/privacy review, and clinical validation plan.

