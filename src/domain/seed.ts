/**
 * Fictional seed for the shared Carelune demo state — one patient (Anand
 * Menon), one program, one audit trail that every role reads.
 */
import type {
  AssessmentResult,
  AuditEvent,
  ConsentRecord,
  EquipmentItem,
  HomeEnvironment,
  OperationalMetric,
  PaymentRecord,
  ProgramStatus,
} from "./types";

export const programStatus: ProgramStatus = "active";
export const programDay = 12;

// Anand's consent set — research consent is optional and independent of
// programme access (deliberately not opted in, to show the separation).
export const consents: ConsentRecord[] = [
  { type: "programme_service", status: "granted", version: "v1.0", recordedAt: "Day 0", recordedBy: "Divya (coordinator)" },
  { type: "health_data", status: "granted", version: "v1.0", recordedAt: "Day 0", recordedBy: "Divya (coordinator)" },
  { type: "caregiver_authorisation", status: "granted", version: "v1.0", recordedAt: "Day 0", recordedBy: "Divya (coordinator)" },
  { type: "family_access", status: "granted", version: "v1.0", recordedAt: "Day 0", recordedBy: "Divya (coordinator)" },
  { type: "teleconsultation", status: "granted", version: "v1.0", recordedAt: "Day 0", recordedBy: "Divya (coordinator)" },
  { type: "photo_video", status: "granted", version: "v1.0", recordedAt: "Day 0", recordedBy: "Divya (coordinator)" },
  { type: "research_optional", status: "pending", version: "v1.0", recordedAt: "—", recordedBy: "Not opted in · optional" },
];

export const payment: PaymentRecord = {
  label: "Carelune Neuro Continuum · 30-day programme (month 1)",
  amountInr: 5999,
  status: "paid",
  recordedAt: "Day 0",
};

export const homeEnvironment: HomeEnvironment = {
  summary: "Ground-floor flat, Jayanagar, Bengaluru; spouse at home, hired caregiver on weekdays.",
  notes: ["Bathroom grab-rail installed", "Wheelchair access to garden"],
};

export const equipment: EquipmentItem[] = [
  { name: "Wheelchair", status: "available" },
  { name: "Walker", status: "recommended", note: "For assisted standing practice — physio to confirm timing" },
];

// The patient-specific Daily Check-in now lives in domain/caregiver.ts
// (generated from Anand's approved plan). Kept out of the generic seed.

/* ---- Class A: validated assessments (named instruments, never composites) ---- */
export const assessments: AssessmentResult[] = [
  {
    instrument: "Modified Rankin Scale (mRS)",
    version: "standard",
    assessor: "Dr. Farhan",
    assessorRole: "medical_clinician",
    mode: "in_person",
    date: "Day 0",
    score: "4",
    interpretation: "Moderately severe disability at programme start",
    licensingNote: "Demo value — instrument licensing to be verified before production use",
    provenance: "clinician_assessed",
  },
  {
    instrument: "Barthel Index",
    version: "standard",
    assessor: "Ravi Kumar",
    assessorRole: "lead_physio",
    mode: "in_person",
    date: "Day 0",
    score: "50",
    licensingNote: "Demo value — instrument licensing to be verified before production use",
    provenance: "clinician_assessed",
  },
  {
    instrument: "Barthel Index",
    version: "standard",
    assessor: "Ravi Kumar",
    assessorRole: "lead_physio",
    mode: "video",
    date: "Day 11",
    score: "65",
    provenance: "clinician_assessed",
  },
];

/* ---- Class B: Carelune operational metrics (stored separately) ---- */
export const operationalMetrics: OperationalMetric[] = [
  { key: "task_completion_7d", label: "Task completion (7 days)", value: "92%", provenance: "system_metric" },
  { key: "weekly_review", label: "Weekly reviews completed", value: "2 of 2", provenance: "system_metric" },
  { key: "open_exceptions", label: "Open exceptions", value: "0", provenance: "system_metric" },
];

/* ---- Unified audit trail seed (the journey so far) ---- */
export const seedAudit: AuditEvent[] = [
  {
    id: "s1",
    at: "Day −6",
    roleId: "lead_physio",
    actor: "Ravi Kumar",
    category: "referral",
    summary: "Referred Anand Menon to Carelune Neuro Continuum",
    detail: "Existing outpatient; medically stable; reliable caregiver at home.",
    provenance: "clinician_confirmed",
  },
  {
    id: "s2",
    at: "Day −5",
    roleId: "coordinator",
    actor: "Divya",
    category: "communication",
    summary: "Contacted Suresh (son, payer); explained the programme",
    provenance: "system_metric",
  },
  {
    id: "s3",
    at: "Day −3",
    roleId: "coordinator",
    actor: "Divya",
    category: "onboarding",
    summary: "Suitability checklist completed; Dr. Farhan confirmed eligibility",
    provenance: "clinician_confirmed",
  },
  {
    id: "s4",
    at: "Day 0",
    roleId: "coordinator",
    actor: "Divya",
    category: "consent",
    summary: "Service, data-sharing and telehealth consent recorded (v1.0)",
    provenance: "family_reported",
  },
  {
    id: "s5",
    at: "Day 0",
    roleId: "coordinator",
    actor: "Divya",
    category: "payment",
    summary: "₹5,999 · 30-day programme payment recorded",
    provenance: "system_metric",
  },
  {
    id: "s6",
    at: "Day 0",
    roleId: "medical_clinician",
    actor: "Dr. Farhan",
    category: "assessment",
    summary: "Baseline mRS 4 recorded",
    provenance: "clinician_assessed",
  },
  {
    id: "s7",
    at: "Day 0",
    roleId: "lead_physio",
    actor: "Ravi Kumar",
    category: "assessment",
    summary: "Baseline Barthel Index 50 recorded",
    provenance: "clinician_assessed",
  },
  {
    id: "s8",
    at: "Day 1",
    roleId: "coordinator",
    actor: "Divya",
    category: "onboarding",
    summary: "Caregiver onboarding completed — Lakshmi trained on app and safety basics",
    provenance: "system_metric",
  },
  {
    id: "s9",
    at: "Day 1",
    roleId: "lead_physio",
    actor: "Ravi Kumar",
    category: "plan",
    summary: "Patient plan v1 activated from Stroke Home Continuity Pathway v0.2-demo",
    detail: "Goals, dosage, assistance levels and stop conditions personalised by the Lead Physiotherapist.",
    provenance: "clinician_confirmed",
  },
  {
    id: "s10",
    at: "Day 7",
    roleId: "lead_physio",
    actor: "Ravi Kumar",
    category: "review",
    summary: "Weekly review 1 completed — plan continued unchanged",
    provenance: "clinician_confirmed",
  },
  {
    id: "s11",
    at: "Day 10",
    roleId: "medical_clinician",
    actor: "Dr. Farhan",
    category: "medication",
    summary: "Baclofen increased to 10 mg after documented video consultation",
    provenance: "clinician_confirmed",
  },
  {
    id: "s12",
    at: "Day 11",
    roleId: "lead_physio",
    actor: "Ravi Kumar",
    category: "assessment",
    summary: "Barthel Index 65 recorded at weekly review 2",
    provenance: "clinician_assessed",
  },
];
