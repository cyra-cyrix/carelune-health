# Carelune — Prototype Readiness

**Demonstration prototype — fictional data — not approved for clinical use.**

What this build is honestly ready for, what it is not, and what production would require.
Status at the end of Phase G.

---

## 1. Ready for stakeholder demonstration ✅

The build can be shown to investors, advisors, referring physiotherapists, clinicians and
prospective families, with the fictional-data framing stated up front.

- 12-scene guided demo with deterministic state preparation and no dependence on a previous
  browser session.
- Eight role experiences: caregiver, family/payer, Lead Physiotherapist, Recovery Care
  Coordinator, Rehabilitation Nurse, Medical Clinician, Clinical Operations Lead, PM&R
  Specialist.
- One coherent fictional case (Anand Menon, Day 12) consistent across every role.
- Fictional-demo watermark on every professional screen; demonstration warning on the cover.
- Deep-linkable routes with legacy redirects; navigation applies without a page reload.
- Reset that restores the seeded fictional case, labelled as fictional-demo reset.
- Responsive at 360 / 375 / 430px and desktop with no horizontal overflow.

## 2. Ready for workflow validation ✅

The build is good enough to sit with a real physiotherapist, coordinator or nurse and ask
*"is this the right sequence, the right fields, the right owner?"* — the workflow logic is
real even though the data is not.

- Lead pipeline (14 states) from referral to activation, with activation gates the
  coordinator cannot bypass.
- Contextual consent, suitability checklist, simulated payment, caregiver onboarding.
- Three-layer plan structure — goals above interventions above tasks — with plan versioning
  and named approval.
- Six-state caregiver reporting, with occurrence status kept separate from intervention status.
- Exception lifecycle (9 states, 6 priorities) with routing, response targets, and closure
  tracked as six separate items where operational closure ≠ clinical resolution.
- Nursing triage on a versioned pathway; Medical Clinician consultation behind a consent gate.
- Specialist referral lifecycle (13 states).
- Generic review engine, Day-30 multidisciplinary review, and three-act renewal.
- Append-only audit trail with provenance labels on every datum.
- 98 pure-function guard assertions covering discipline authority, medication authority, hold
  release, priority, consent, closure, goal ownership, renewal separation, programme
  transitions, route parsing and guided-demo integrity.

**What workflow validation will still not tell you:** whether the clinical content is correct,
whether the safety rules are safe, or whether the response targets are achievable at scale.

## 3. NOT ready for real patient use ⛔

**This build must not touch a real patient, a real caregiver, or real health data.**

| Gap | Consequence |
|---|---|
| No backend, database or persistence | Every reload loses everything. No record exists. |
| No authentication or authorisation | Anyone with the URL is every role. Permission guards are UX logic, not security. |
| No encryption, access logging or data-retention policy | Cannot lawfully hold health data. |
| All clinical content is fictional and unsigned | Safety rules, triage pathway, template and content items have no clinical approval. |
| Instrument licensing unverified | mRS / Barthel digital reproduction permission is unresolved. |
| No wall clock | SLA states never trigger. Nothing escalates on time because nothing knows the time. |
| No notifications | Nobody is told anything. Every handoff assumes someone is looking at the screen. |
| No emergency handling | Emergencies are directed to 112/108 and deliberately never enter the workflow. |
| Payment, video, messaging, media are simulated | Nothing is charged, transmitted or stored. |
| One expanded patient record | The system has never been exercised with a real caseload. |

## 4. Production MVP requirements

Roughly in dependency order. This is a scope list, not an estimate.

**Platform**
1. Backend service, database, and a migration path — the domain types in `src/domain/types.ts`
   are the intended schema.
2. Authentication with per-role authorisation enforced server-side. The guards in
   `domain/permissions.ts` must be re-implemented on the server; the client copy becomes UX only.
3. Encryption at rest and in transit, access logging, session management, data retention and
   deletion, and a lawful basis for processing health data.
4. Real timestamps and a scheduler, so response targets, review due dates and hold review
   deadlines actually elapse and escalate.
5. Notifications (push / SMS / email) with delivery tracking, respecting service hours.
6. Audit trail persisted immutably, exportable for clinical governance review.

**Clinical**
7. Sign-off on every safety rule, the triage pathway, response targets, the protocol template
   and each content item, by the accountable discipline lead.
8. Instrument licensing verified in writing before any validated assessment ships.
9. A defined swallow-hold release authority and evidence standard (see §5.1).
10. Clinical incident, adverse-event and complaint procedures, with named responsible people.
11. Professional indemnity and scope-of-practice confirmation for every participating discipline.

**Operational**
12. Multi-patient caseload with real load testing on coordinator workload.
13. Media handling — consented capture, storage, retention and deletion — if video review ships.
14. Real payment, invoicing, refunds and professional payout reconciliation.
15. Onboarding and training material for coordinators and referring physiotherapists.
16. Support escalation path for out-of-hours contact attempts.

**Explicitly out of scope for the MVP** (per the freeze pack): public professional
marketplace, hospital/EHR integration, pharmacy/laboratory/equipment commerce, wearables or
continuous monitoring, a proprietary outcome score, autonomous AI treatment, multiple clinical
continuums, physical-centre operations, and insurance/payer workflows.

## 5. Unresolved clinical, legal and privacy issues

### 5.1 Clinical

1. **Swallow-hold release authority.** Who may lift a feeding hold, on what evidence, and
   within what timeframe. Locked in the demo (`demoReleaseLocked`); unresolved in production.
   This is the single highest-risk open decision in the model.
2. **All safety rules are fictional** and require sign-off before any real use.
3. **Caregiver-wellbeing escalation thresholds** — when a support need becomes a psychology
   referral, and who decides.
4. **Daily check-in content** — which items belong in the patient-specific check-in for the
   stroke pilot, and who owns each one.
5. **Step-down package definition** and what clinical criteria justify it.
6. **Out-of-hours deterioration** — the model directs emergencies to 112/108, but the boundary
   between "call the coordinator tomorrow" and "call 112 now" needs clinical wording tested
   with real caregivers.

### 5.2 Legal and regulatory

7. **Instrument licensing** — mRS, Barthel, and any caregiver-burden or mood instrument may
   carry training, licensing, attribution or digital-use conditions. Verify with each owner.
8. **Regulatory classification** — whether the orchestration platform is a medical device in
   any target market, given that approved rules place clinical holds automatically.
9. **Professional liability allocation** between Carelune, the Lead Physiotherapist and each
   consulting discipline when a rule-sourced hold is placed or a routing fails.
10. **Teleconsultation compliance** with the applicable Indian telemedicine practice
    guidelines, including identity verification and prescription rules.
11. **Terms of service and clinical disclaimers** for family payers, especially payers outside
    India.

### 5.3 Privacy

12. **Family-access consent** — whether it is waivable when no remote family member exists,
    and how scope withdrawal propagates to already-visible data.
13. **Cross-border access** — a payer in Dubai viewing Indian health data, and what that
    implies for lawful transfer.
14. **Caregiver-operated accounts** — the caregiver is not the patient; the authorisation
    chain, and what happens when a caregiver changes.
15. **Data subject rights** — access, correction, export and erasure against an append-only
    audit trail.
16. **Media consent** — separate consent for capture, storage, review and retention, if video
    review ships.

## 6. Honest summary

This is a **credible, internally consistent prototype of a service model**. Its value is that
the workflow, the role boundaries and the audit discipline are real and can be interrogated by
a clinician today. Its limitation is that everything underneath — data, storage, identity,
timing, and clinical content — is simulated.

Do not let a good demo be mistaken for a working service. The gap between this build and
something that may touch one real patient is the whole of §4 and §5.
