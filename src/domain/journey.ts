/**
 * Phase B — referral & coordinator-onboarding constants and seeds.
 * All fictional. The coordinator collects facts and records counselling;
 * clinical judgments route to Dr. Farhan (Clinical Operations Lead).
 */
import type {
  ConsentRequirement,
  ConsentStatus,
  ConsentType,
  Lead,
  LeadStatus,
  SuitabilityAnswer,
} from "./types";

/* ---------------- Pipeline status metadata ---------------- */

export const STATUS_META: Record<LeadStatus, { label: string; nextAction: string; tone: "brand" | "warn" | "good" | "coral" | "sage" }> = {
  new_referral: { label: "New referral", nextAction: "Contact the family (within 1 working day)", tone: "brand" },
  contact_pending: { label: "Contact pending", nextAction: "Call the family", tone: "brand" },
  contact_attempted: { label: "Contact attempted", nextAction: "Retry contact / schedule callback", tone: "warn" },
  family_interested: { label: "Family interested", nextAction: "Complete suitability checklist", tone: "brand" },
  suitability_info_pending: { label: "Suitability info pending", nextAction: "Collect missing information", tone: "warn" },
  clinical_review_required: { label: "Clinical suitability review", nextAction: "Awaiting Dr. Farhan's review", tone: "coral" },
  eligible: { label: "Eligible", nextAction: "Begin consent & payment", tone: "good" },
  not_eligible: { label: "Not eligible", nextAction: "Close respectfully; inform the physiotherapist", tone: "sage" },
  consent_pending: { label: "Consent pending", nextAction: "Record required consents", tone: "brand" },
  payment_pending: { label: "Payment pending", nextAction: "Confirm programme payment", tone: "brand" },
  onboarding_pending: { label: "Onboarding pending", nextAction: "Complete caregiver onboarding", tone: "brand" },
  plan_activation_pending: { label: "Plan activation pending", nextAction: "Awaiting baseline & plan approval (Lead Physiotherapist)", tone: "warn" },
  active: { label: "Active", nextAction: "Routine coordination", tone: "good" },
  lost_declined: { label: "Lost / declined", nextAction: "Record outcome; no further contact", tone: "sage" },
};

/* ---------------- Suitability checklist (facts, not clinical judgment) ---------------- */

export interface SuitabilityItemDef {
  id: string;
  label: string;
  /** Which answer raises a concern for this item. */
  concernIf: SuitabilityAnswer;
  /** Concern requires clinical review by Dr. Farhan. */
  clinical?: boolean;
  /** Concern triggers the pre-approved exclusion rule. */
  exclusionRule?: boolean;
}

export const SUITABILITY_ITEMS: SuitabilityItemDef[] = [
  { id: "adult_stroke", label: "Adult stroke patient", concernIf: "no" },
  { id: "discharged", label: "Medically discharged or preparing for discharge", concernIf: "no" },
  { id: "caregiver", label: "Reliable primary caregiver available", concernIf: "no" },
  { id: "smartphone", label: "Smartphone and internet access at home", concernIf: "no" },
  { id: "geography", label: "Within the Bengaluru pilot geography", concernIf: "no" },
  { id: "lead_physio", label: "Existing Lead Physiotherapist confirmed", concernIf: "no" },
  { id: "documents", label: "Discharge documents available", concernIf: "no" },
  { id: "swallowing", label: "Known swallowing concern", concernIf: "yes", clinical: true },
  { id: "seizure", label: "Known seizure concern", concernIf: "yes", clinical: true },
  { id: "respiratory", label: "Respiratory concern", concernIf: "yes", clinical: true },
  { id: "instability", label: "Current readmission or medical instability", concernIf: "yes", clinical: true, exclusionRule: true },
  { id: "skilled_nursing", label: "Continuous skilled-nursing requirement", concernIf: "yes", clinical: true },
  { id: "home_env", label: "Home environment concerns", concernIf: "yes" },
  { id: "other_clinical", label: "Any other concern requiring clinical review", concernIf: "yes", clinical: true },
];

/* ---------------- Consents ---------------- */

export const CONSENT_META: Record<
  ConsentType,
  { label: string; requirement: ConsentRequirement; when: string }
> = {
  programme_service: {
    label: "Programme / service agreement",
    requirement: "activation",
    when: "Required before programme activation",
  },
  health_data: {
    label: "Health-data processing",
    requirement: "activation",
    when: "Required before programme activation",
  },
  caregiver_authorisation: {
    label: "Caregiver authorisation",
    requirement: "conditional",
    when: "Required when a caregiver will operate the account",
  },
  family_access: {
    label: "Family / payer access",
    requirement: "conditional",
    when: "Required only when a separate family member or payer is given access",
  },
  teleconsultation: {
    label: "Teleconsultation",
    requirement: "pre_teleconsult",
    when: "Required before the first teleconsultation — not before activation",
  },
  photo_video: {
    label: "Photo / video upload",
    requirement: "pre_media",
    when: "Required before capturing or uploading patient media",
  },
  research_optional: {
    label: "Optional research use",
    requirement: "optional",
    when: "Always optional and independent — refusing it never reduces programme access or service quality",
  },
};

/** Sub-scopes the photo/video consent covers (and what it does not). */
export const MEDIA_CONSENT_SCOPES = {
  covers: ["Patient recording / upload by the caregiver", "Professional review of uploaded media"],
  noConsentNeeded: "Caregiver viewing of instructional videos needs no media consent.",
  separatePermission:
    "Reuse of media for education or research requires the separate optional research permission.",
};

export const CONSENT_ORDER: ConsentType[] = [
  "programme_service",
  "health_data",
  "caregiver_authorisation",
  "family_access",
  "teleconsultation",
  "photo_video",
  "research_optional",
];

export const emptyConsents = (): Record<ConsentType, ConsentStatus> => ({
  programme_service: "pending",
  health_data: "pending",
  caregiver_authorisation: "pending",
  family_access: "pending",
  teleconsultation: "pending",
  photo_video: "pending",
  research_optional: "pending",
});

/* ---------------- Caregiver onboarding checklist ---------------- */

export const ONBOARDING_ITEMS: { id: string; label: string }[] = [
  { id: "identity", label: "Caregiver identity confirmed" },
  { id: "app_access", label: "App access activated" },
  { id: "hours", label: "Service hours understood (8 AM–8 PM IST)" },
  { id: "emergency", label: "Emergency boundary acknowledged (112/108 first)" },
  { id: "workflow", label: "Daily workflow demonstrated" },
  { id: "need_help", label: "“Need help” demonstrated" },
  { id: "med_boundary", label: "Medication-record boundary explained (record only, never change)" },
  { id: "family_access", label: "Family access confirmed" },
  { id: "documents", label: "Documents collected" },
  { id: "emergency_dest", label: "Preferred hospital / emergency destination recorded" },
  { id: "first_review", label: "First Lead Physiotherapist review scheduled" },
  { id: "baseline_note", label: "Baseline / plan status noted (pending or completed)" },
];

/* ---------------- Commercial display (no real gateway) ---------------- */

export const PROGRAMME_OFFER = {
  name: "Carelune Neuro Continuum — 30 days",
  priceInr: 5999,
  included: [
    "Named Recovery Care Coordinator",
    "Caregiver setup and training",
    "Lead Physiotherapist-approved recovery plan",
    "Daily priorities and task reporting",
    "One Lead Physiotherapist virtual review each week",
    "Coordinator support and nursing triage, 8 AM–8 PM IST",
    "Progress summary, action timeline, monthly review",
    "Coordination of specialist review when indicated",
  ],
  separatelyBilled: [
    "Physical physiotherapy visits (paid directly to the physiotherapist)",
    "Medical Clinician / PM&R / specialist consultations unless bundled",
    "Speech-swallow, OT, dietitian, psychology services",
    "Equipment, investigations, medicines, home nursing",
  ],
  refundPolicy: "Refund & cancellation policy — placeholder, to be finalised before sale.",
};

/* ---------------- Seed leads ---------------- */

export const seedLeads: Lead[] = [
  {
    id: "lead-anand",
    form: {
      patientName: "Anand Menon",
      age: "58",
      caregiverName: "Lakshmi",
      caregiverPhone: "98xxxxxx01",
      locality: "Jayanagar",
      diagnosis: "Ischaemic stroke · left hemiparesis · medically stable",
      dischargeDate: "27 Jun (discharged)",
      hospital: "Inpatient rehab centre, Bengaluru",
      leadPhysioConfirmed: true,
      familyAgreedContact: true,
      suitability: { medicallyStable: true, reliableCaregiver: true, smartphone: true },
      note: "Existing outpatient; family keen on structured home continuity.",
    },
    status: "active",
    referredAt: "Day −6",
    daysSinceReferral: 18,
    physioName: "Ravi Kumar",
    coordinatorName: "Divya",
    missingInfo: [],
    contactAttempts: [
      { at: "Day −5", outcome: "spoke_to_family", note: "Suresh (son) joined from Dubai; programme explained." },
    ],
    explanation: {
      attendees: "Suresh (son, payer) · Lakshmi (caregiver)",
      inclusionsExplained: true,
      chargesExplained: true,
      hoursExplained: true,
      emergencyBoundaryExplained: true,
      physioContinuityExplained: true,
      familyQuestions: "Asked about weekly review timing and what happens in an emergency.",
      outcome: "interested",
      nextAction: "Suitability checklist",
      recordedAt: "Day −5",
    },
    suitability: {
      answers: {
        adult_stroke: "yes", discharged: "yes", caregiver: "yes", smartphone: "yes",
        geography: "yes", lead_physio: "yes", documents: "yes", swallowing: "yes",
        seizure: "no", respiratory: "no", instability: "no", skilled_nursing: "no",
        home_env: "no", other_clinical: "no",
      },
      outcome: "route_clinical_review",
      recordedAt: "Day −3",
    },
    consents: {
      programme_service: "granted", health_data: "granted", caregiver_authorisation: "granted",
      family_access: "granted", teleconsultation: "granted", photo_video: "granted",
      research_optional: "pending",
    },
    caregiverOperatesAccount: true,
    familyAccess: {
      requested: true,
      authorisedMember: "Suresh (son, payer — Dubai)",
      permittedScope: "Progress summaries, daily execution status, actions taken. No internal coordinator notes.",
      accessStart: "Day 0",
    },
    payment: { state: "paid", date: "Day 0", receiptRef: "CLN-2026-0001" },
    onboarding: Object.fromEntries(ONBOARDING_ITEMS.map((i) => [i.id, true])),
  },
  {
    id: "lead-joseph",
    form: {
      patientName: "Joseph Mathew",
      age: "66",
      caregiverName: "Annie (spouse)",
      caregiverPhone: "97xxxxxx44",
      locality: "Koramangala",
      diagnosis: "Ischaemic stroke · right-side weakness · medically stable",
      dischargeDate: "Expected next week",
      hospital: "—",
      leadPhysioConfirmed: true,
      familyAgreedContact: true,
      suitability: { medicallyStable: true, reliableCaregiver: true, smartphone: true },
      note: "Family evaluating home-care options before discharge.",
    },
    status: "contact_attempted",
    referredAt: "2 days ago",
    daysSinceReferral: 2,
    physioName: "Ravi Kumar",
    coordinatorName: "Divya",
    missingInfo: ["Discharge summary not yet collected"],
    contactAttempts: [{ at: "Yesterday", outcome: "no_answer", note: "Left a message with the son." }],
    consents: emptyConsents(),
    caregiverOperatesAccount: true,
    familyAccess: { requested: false },
    payment: { state: "pending" },
    onboarding: Object.fromEntries(ONBOARDING_ITEMS.map((i) => [i.id, false])),
  },
];
