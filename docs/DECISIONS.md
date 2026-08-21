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

---

## D-003 · Provider services sit ABOVE the pathway engine, with two confirmations

**Decided:** 2026-08-20, founder · **Amended:** 2026-08-21, founder (four amendments,
below) · **Status:** schema drafted and verified on local Supabase (`0027`); not
applied to hosted; no application code written

### What was decided

The Carelune pathway engine is **kept as-is and is not renamed**. `pathways`,
`pathway_sources` and `pathway_versions` remain the reusable Carelune **template
library**: they are already versioned, immutable once approved, referenced by
`patients.pathway_version_id` and `patient_plans.pathway_version_id`, and read
server-side by the `generate-plan` Edge Function.

A **provider-specific layer is introduced above it**:

```
centre (workspace / organisation)
  -> centre_service      "Dr Vivek Post-operative Spine Recovery"
     -> service_package  "30-Day Essential" / "60-Day Guided" / "90-Day Complete"
        -> subscription  (existing table — the MVP enrollment)
           -> patient_plan (existing — the doctor-approved plan of record)
```

A `centre_service` **may** originate from a Carelune `pathway` / `pathway_version`,
but it represents the service *that customer actually runs*. Two providers can build
the same Spine template into entirely different services, packages and prices, and a
provider with no matching template can configure a service from scratch.

`subscriptions` (0009) remains the enrollment mechanism and will be **extended**, not
duplicated. No `patient_enrollments` table is created.

### Governance

1. **D-001 stands.** Institutions do not approve generic Carelune pathway templates.
   `institution_pathways` is not used as an approval gate anywhere in this layer, and
   the old institution pathway-approval UI is not restored.
2. **Super Admin is the only service configurator in MVP.** All configuration writes
   go through the existing `platform-admin` Edge Function on the service_role path.
   No RLS policy grants a browser client insert/update on the new tables.
3. **AI may draft** provider services, packages and programme configuration. Drafted
   rows carry `source_provenance = 'ai_drafted'` plus the model and timestamp;
   provenance is stored, not merely rendered.
4. **Level 1 — Super Admin confirmation.** The Super Admin confirms the structured
   configuration; the service moves to `pending_provider_confirmation`.
5. **Level 2 — the designated provider approver.** Each service names its **Service
   Owner / Provider Clinical Approver** in
   `centre_services.provider_approver_profile_id`, and only that person may confirm
   it. `confirm_centre_service(service_id)` verifies that the caller belongs to the
   service's centre, is the designated approver for that service, and that the
   service is `pending_provider_confirmation` — nothing else. Being an organisation
   administrator confers no confirmation authority. Because designation *is* the
   authority, designation itself is constrained: the approver must be a clinical
   staff profile (`nurse` / `duty_doctor` / `pmr`) of the same centre, and a service
   cannot move to `pending_provider_confirmation` with nobody named. The
   confirmation never touches `institution_pathways`.
6. **Per-patient approval is unchanged and separate.** The treating doctor still
   approves and activates each patient's plan (0025, 0026). Publishing a service
   authorises *enrollment*, never care.

### Why this is not the D-001 gate returning

D-001 removed an approval that was **generic** (a platform-authored template),
**pre-signup** (demanded before the institution had even logged in), and **blocking**
(it stood between an institution's own doctor and their own patient). Level 2 is
none of those: it is a named clinician confirming configuration that was written *for
them* and describes *their own* service, after onboarding, and it blocks only the
enrollment of patients into a service nobody at the provider has read yet.

### Amendments of 2026-08-21

1. **Level-2 approver is designated, not inferred.** The earlier draft required
   "organisation admin + clinical role". Replaced by the designated-approver model in
   governance point 5. A practice manager who administers the workspace cannot sign
   off clinical programme configuration, and the responsible clinician does not need
   administrator rights to do so.
2. **Package clinical configuration is frozen after publication.** `service_packages`
   carry clinically meaningful configuration, not just a price. Once the parent
   service is published, `duration_days`, `monitoring_domains`, `checkin_frequency`,
   `review_frequency`, `support_level`, `milestones` and `includes` are immutable,
   and a published service cannot gain a new package at all. Changing any of them
   requires a new service revision, confirmed again at both levels. Commercial fields
   (price, currency, trial days, positioning, ordering, status) stay editable.
   Patients already enrolled get a second layer of protection from the 0028
   subscription snapshots.
3. **No household table access.** Household accounts — patient, caregiver, family —
   have **no** direct SELECT on `centre_services` or `service_packages`, at any
   status. Reads are same-centre staff only. In 0028 a patient may read only the
   service/package information frozen into their own subscription. Public or
   storefront visibility, if it is needed later, must be a deliberately scoped
   RPC/token endpoint rather than broad table RLS.
4. **Custom services are not production-ready end to end.** See open point 4.

### Open points

1. **No immutable audit trail yet.** Auditability rests on the stamped columns
   (`configured_by`, `confirmed_by_platform_*`, `confirmed_by_provider_*`,
   `source_provenance`). The `audit_events` table has been outstanding since 0011.
2. **Programme content governance.** D-002's compensating controls apply unchanged
   to any AI-drafted programme content that reaches a patient surface.
3. **Template-origin plumbing.** `enforce_patient_pathway` (0015) still requires a
   patient's `pathway_version_id` to come with an institution-enabled
   `pathway_pack_id`. For a template-origin service the `platform-admin` function
   must write that `institution_pathways` row as service_role plumbing at
   configuration time. It must never resurface as a provider-facing approval screen —
   that is the D-001 gate.
4. **`generate-plan` is not yet service-aware — required before the first
   non-recovery custom service goes live.** `generate-plan` technically accepts a
   patient with no pathway version, but its prompt is rehab/recovery-oriented, so a
   custom service such as lactation must NOT be described as production-ready today.
   Before that first service is enrolled, `generate-plan` must resolve the patient's
   `subscription -> service_package -> centre_service -> programme_config` and use a
   service-aware/generic prompt, while retaining the existing strict server-side
   validation and provenance rules (medicines, diagnoses, doses and investigations
   still never invented). Tracked for 0028+.
5. **Platform-wide table-wipe grant (pre-existing, found while verifying 0027).**
   Supabase's base setup grants ALL on every new `public` table to
   `authenticated`, which includes the table-emptying privilege — and that
   privilege is not filtered by RLS. `0027` revokes ALL and re-grants only SELECT
   for its own two tables, but `patients`, `patient_plans`, `subscriptions`,
   `daily_readings` and the rest still carry it for `authenticated`. PostgREST's
   verbs do not expose it today, so this is latent rather than live, but it
   should be closed by a dedicated hardening migration across the public schema.

---

## D-004 · Carelune platform fee is 20%

**Decided:** 2026-08-20, founder · **Status:** applies to `service_packages` from
`0027`; the legacy 30% surfaces change in `0029`

The platform fee is **20%**, replacing the 30% currently implemented in
`centres.platform_fee_pct`, `institution_pathway_config.platform_fee_pct` and the
`enforce_pathway_config()` trigger (which hard-codes `30`), and documented in
`docs/COMMERCIAL_MODEL.md`.

Unchanged by this decision:

- the provider owns the patient-facing price;
- the fee is **server-held** — never accepted from a browser client;
- the fee is informational in the product; there is no in-app money movement.

The platform is pre-launch with no live institutions, so existing rows are
backfilled rather than versioned. Once real contracts exist, a fee change must
become a dated, per-organisation term instead of a column default.

Backfill note for `0029`: `enforce_pathway_config()` rewrites `platform_fee_pct`
back to the old value for any caller that is not `service_role`, so the backfill
UPDATE must run under `set local "request.jwt.claims" to '{"role":"service_role"}'`
or it will silently revert itself.
