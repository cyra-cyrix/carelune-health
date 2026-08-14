import type { RoleDepth, RoleId } from "./types";

/* ---------------- Personas (shared fictional case, Freeze V1) ---------------- */

export interface Persona {
  name: string;
  roleLabel: string;
  initials: string;
}

/* ---------------- Permission model ---------------- */

export type PermissionFlag =
  | "report_tasks"
  | "record_medication_given"
  | "raise_help_request"
  | "view_progress"
  | "route_exceptions"
  | "onboard_and_schedule"
  | "nursing_triage"
  | "caregiver_education"
  | "modify_rehab_plan"
  | "weekly_review"
  | "recommend_specialist_referral"
  | "document_medical_consultation"
  | "prescribe_after_consultation"
  | "close_clinical_escalation"
  | "approve_protocol_versions"
  | "view_full_record"
  | "view_audit_timeline";

export const PERMISSION_LABEL: Record<PermissionFlag, string> = {
  report_tasks: "Report task outcomes",
  record_medication_given: "Record medication given",
  raise_help_request: "Raise a help request",
  view_progress: "View progress summaries",
  route_exceptions: "Route exceptions & track closure",
  onboard_and_schedule: "Onboard, schedule & follow up",
  nursing_triage: "Structured nursing triage",
  caregiver_education: "Caregiver education (approved pathways)",
  modify_rehab_plan: "Create & modify the physiotherapy plan",
  weekly_review: "Conduct the weekly review",
  recommend_specialist_referral: "Recommend specialist referral",
  document_medical_consultation: "Document medical consultations",
  prescribe_after_consultation: "Medication decisions after documented consultation",
  close_clinical_escalation: "Close clinical escalations",
  approve_protocol_versions: "Approve protocol/template versions",
  view_full_record: "View the full patient record",
  view_audit_timeline: "View the audit timeline",
};

export interface RolePermissions {
  readOnly: boolean;
  flags: PermissionFlag[];
}

export const PERMISSIONS: Record<RoleId, RolePermissions> = {
  caregiver: {
    readOnly: false,
    flags: ["report_tasks", "record_medication_given", "raise_help_request", "view_progress"],
  },
  family: { readOnly: true, flags: ["view_progress"] },
  lead_physio: {
    readOnly: false,
    flags: [
      "modify_rehab_plan",
      "weekly_review",
      "recommend_specialist_referral",
      "view_full_record",
      "view_audit_timeline",
    ],
  },
  coordinator: {
    readOnly: false,
    flags: ["route_exceptions", "onboard_and_schedule", "view_audit_timeline"],
  },
  nurse: {
    readOnly: false,
    flags: ["nursing_triage", "caregiver_education", "view_full_record", "view_audit_timeline"],
  },
  medical_clinician: {
    readOnly: false,
    flags: [
      "document_medical_consultation",
      "prescribe_after_consultation",
      "close_clinical_escalation",
      "view_full_record",
      "view_audit_timeline",
    ],
  },
  clinical_ops: {
    readOnly: false,
    flags: ["close_clinical_escalation", "view_full_record", "view_audit_timeline"],
  },
  pmr: {
    readOnly: false,
    flags: [
      "approve_protocol_versions",
      "recommend_specialist_referral",
      "view_full_record",
      "view_audit_timeline",
    ],
  },
  // Architecture-only in this revision: exist in the role/data model and the
  // generic specialist-referral lifecycle; no dedicated workspace yet.
  occupational_therapist: { readOnly: false, flags: ["recommend_specialist_referral"] },
  speech_swallow: { readOnly: false, flags: ["recommend_specialist_referral"] },
  dietitian: { readOnly: false, flags: ["recommend_specialist_referral"] },
  psychologist: { readOnly: false, flags: ["recommend_specialist_referral"] },
};

/* ---------------- Role metadata ---------------- */

export interface RoleMeta {
  label: string;
  depth: RoleDepth;
  persona?: Persona;
  /** What this role owns (from the freeze pack). */
  owns: string[];
  /** Hard boundaries worth showing on-screen. */
  cannot: string[];
  /** Which phase builds the full workspace. */
  phase?: string;
}

export const ROLE_META: Record<RoleId, RoleMeta> = {
  caregiver: {
    label: "Caregiver",
    depth: "deep",
    persona: { name: "Lakshmi", roleLabel: "Daily caregiver", initials: "L" },
    owns: [
      "Follow today's priorities from the activated plan",
      "Report each task: completed, partial, unable, refused, unwell, or need help",
      "Record medication given (administration record only)",
      "Report difficulties and request help",
    ],
    cannot: ["Change the plan or medication", "Interpret clinical symptoms"],
  },
  family: {
    label: "Family / payer",
    depth: "deep",
    persona: { name: "Suresh", roleLabel: "Son · payer (outside India)", initials: "S" },
    owns: ["See execution, progress and actions taken (read-only)", "Renewal decision each month"],
    cannot: ["Edit any clinical or operational data"],
  },
  lead_physio: {
    label: "Lead Physiotherapist",
    depth: "deep",
    persona: { name: "Ravi Kumar", roleLabel: "Lead Physiotherapist", initials: "RK" },
    owns: [
      "Rehabilitation assessment and the patient-specific physiotherapy plan",
      "Weekly virtual review; progression, regression, or hold",
      "Physical reassessment decisions and direct-visit recording",
      "Recommend nursing, Medical Clinician, PM&R or specialist review",
    ],
    cannot: ["Make medical/medication decisions", "Decide outside physiotherapy scope"],
  },
  coordinator: {
    label: "Recovery Care Coordinator",
    depth: "deep",
    persona: { name: "Divya", roleLabel: "Recovery Care Coordinator", initials: "D" },
    owns: [
      "Referral intake, family contact and conversion support",
      "Consent, records, caregiver onboarding and app setup",
      "Scheduling, engagement exceptions, routing and follow-up",
      "SLA tracking and workflow closure",
    ],
    cannot: [
      "Diagnose, prescribe or give medication advice",
      "Select or change clinical protocols independently",
      "Interpret clinical symptoms independently",
    ],
    phase: "Phase B",
  },
  nurse: {
    label: "Rehabilitation Nurse",
    depth: "deep",
    persona: { name: "Nisha", roleLabel: "Rehabilitation Nurse", initials: "N" },
    owns: [
      "Structured nursing triage during published hours (8 AM–8 PM IST)",
      "Caregiver education within approved pathways",
      "Red-flag identification, documentation and escalation to Dr. Farhan",
    ],
    cannot: ["Prescribe", "Independently change treatment"],
    phase: "Phase E",
  },
  medical_clinician: {
    label: "Medical Clinician",
    depth: "moderate",
    persona: {
      name: "Dr. Farhan",
      roleLabel: "Medical Clinician & Clinical Operations Lead",
      initials: "F",
    },
    owns: [
      "Medical assessment and advice via documented consultation",
      "Medication decisions after a documented consultation",
      "Medical escalations during published availability",
    ],
    cannot: ["Promise 24/7 availability", "Apply changes without a documented consultation"],
    phase: "Phase E",
  },
  clinical_ops: {
    label: "Clinical Operations Lead",
    depth: "moderate",
    persona: {
      name: "Dr. Farhan",
      roleLabel: "Medical Clinician & Clinical Operations Lead",
      initials: "F",
    },
    owns: [
      "Clinical governance, SOP approval and audit",
      "Adverse-event review and patient-suitability decisions",
      "Nurse supervision and PM&R coordination",
    ],
    cannot: ["Override discipline-specific clinical ownership"],
    phase: "Phase E",
  },
  pmr: {
    label: "PM&R Specialist",
    depth: "moderate",
    persona: { name: "Dr. Meera", roleLabel: "PM&R Specialist", initials: "DM" },
    owns: [
      "Protocol/template governance and version approval",
      "Complex rehabilitation strategy and multidisciplinary review",
      "Selected patient consultation (separately billed)",
    ],
    cannot: ["Replace the Lead Physiotherapist's plan ownership"],
    phase: "Phase F",
  },
  occupational_therapist: {
    label: "Occupational Therapist",
    depth: "architecture",
    owns: ["ADLs, upper-limb function, cognition/task adaptation, home environment"],
    cannot: [],
  },
  speech_swallow: {
    label: "Speech & Swallow Therapist",
    depth: "architecture",
    owns: ["Communication and swallowing/feeding interventions"],
    cannot: [],
  },
  dietitian: {
    label: "Dietitian",
    depth: "architecture",
    owns: ["Individual nutrition assessment and plan"],
    cannot: [],
  },
  psychologist: {
    label: "Clinical Psychologist",
    depth: "architecture",
    owns: ["Patient adjustment, mood, behaviour, caregiver/family support"],
    cannot: [],
  },
};

/** Roles that appear in the role switcher (deep + moderate). */
export const SWITCHABLE_ROLES: RoleId[] = [
  "caregiver",
  "family",
  "lead_physio",
  "coordinator",
  "nurse",
  "medical_clinician",
  "clinical_ops",
  "pmr",
];

/** Architecture-only roles, shown as a note on the cover. */
export const ARCHITECTURE_ROLES: RoleId[] = [
  "occupational_therapist",
  "speech_swallow",
  "dietitian",
  "psychologist",
];

/* ---------------- Frozen support & safety copy ---------------- */

export const SERVICE_HOURS = "8:00 AM–8:00 PM IST, all seven days";

export const EMERGENCY_COPY =
  "Carelune is not an emergency service. For severe breathing difficulty, unconsciousness, a new stroke-like symptom, seizure lasting more than five minutes, serious fall, or another emergency, call 112/108 or go to the nearest emergency department immediately.";
