/**
 * Phase F — review engine metadata, assessment governance registry, programme
 * state machine and the non-diagnostic caregiver support check-in.
 *
 * All fictional demonstration content. Assessment entries reference named
 * instruments but never reproduce copyrighted forms or item text.
 */
import type {
  AssessmentRegistryEntry,
  PlanDecisionKind,
  ProgrammeState,
  ReviewType,
  RoleId,
} from "./types";

export const REVIEW_TYPE_META: Record<ReviewType, { label: string; ownerRole: RoleId }> = {
  weekly_rehabilitation: { label: "Weekly rehabilitation review", ownerRole: "lead_physio" },
  nursing: { label: "Nursing review", ownerRole: "nurse" },
  medical: { label: "Medical review", ownerRole: "medical_clinician" },
  pmr: { label: "PM&R review", ownerRole: "pmr" },
  occupational_therapy: { label: "OT review", ownerRole: "occupational_therapist" },
  speech_swallow: { label: "Speech & Swallow review", ownerRole: "speech_swallow" },
  dietitian: { label: "Dietitian review", ownerRole: "dietitian" },
  psychology_caregiver: { label: "Psychology / caregiver-wellbeing review", ownerRole: "psychologist" },
  day30_multidisciplinary: { label: "Day-30 multidisciplinary review", ownerRole: "lead_physio" },
  adverse_event: { label: "Adverse-event review", ownerRole: "clinical_ops" },
  programme_closure: { label: "Programme closure review", ownerRole: "clinical_ops" },
};

export const PLAN_DECISION_META: Record<
  PlanDecisionKind,
  { label: string; needsCaregiverAck: boolean }
> = {
  continue: { label: "Continue unchanged", needsCaregiverAck: false },
  modify_parameters: { label: "Modify parameters", needsCaregiverAck: true },
  progress: { label: "Progress", needsCaregiverAck: true },
  regress: { label: "Regress", needsCaregiverAck: true },
  temporary_hold: { label: "Temporarily hold", needsCaregiverAck: true },
  request_direct_assessment: { label: "Request direct assessment", needsCaregiverAck: false },
  discontinue: { label: "Discontinue", needsCaregiverAck: true },
  replace: { label: "Replace", needsCaregiverAck: true },
  refer_other_discipline: { label: "Refer to another discipline", needsCaregiverAck: false },
};

/* ---------------- Assessment governance registry ---------------- */

export const ASSESSMENT_REGISTRY: AssessmentRegistryEntry[] = [
  {
    instrument: "Modified Rankin Scale (mRS)",
    version: "standard",
    domain: "Global disability",
    purpose: "outcome",
    intendedPopulation: "Adults after stroke",
    administratorQualification: "Trained clinician",
    permittedModes: ["in_person", "video", "proxy"],
    language: "English (demo)",
    scoringSource: "Published scale — manual not reproduced here",
    licensingStatus: "UNRESOLVED — digital reproduction permission to be verified before production",
    itemDataDisplayable: false,
    interpretationSource: "Clinician interpretation only",
    limitations: "Single global measure; insensitive to small functional change.",
    nextDue: "Day 30",
  },
  {
    instrument: "Barthel Index",
    version: "standard",
    domain: "Functional independence (ADL)",
    purpose: "outcome",
    intendedPopulation: "Adults with impaired independence",
    administratorQualification: "Trained physiotherapist / clinician",
    permittedModes: ["in_person", "video"],
    language: "English (demo)",
    scoringSource: "Published scale — manual not reproduced here",
    licensingStatus: "UNRESOLVED — digital reproduction permission to be verified before production",
    itemDataDisplayable: false,
    interpretationSource: "Clinician interpretation only",
    limitations: "Ceiling effect; does not capture communication or mood.",
    nextDue: "Day 30",
  },
];

/* ---------------- Programme state machine ---------------- */

export const PROGRAMME_STATE_LABEL: Record<ProgrammeState, string> = {
  onboarding_pending: "Onboarding pending",
  plan_activation_pending: "Plan activation pending",
  active: "Active",
  temporarily_paused: "Temporarily paused",
  clinical_review_required: "Clinical review required",
  readmitted: "Readmitted",
  renewal_pending: "Renewal pending",
  renewed: "Renewed",
  step_down_active: "Step-down active",
  completed: "Completed",
  cancelled: "Cancelled",
  family_declined: "Family declined",
  deceased: "Deceased",
};

/**
 * Permitted transitions with the roles allowed to perform them. No single role
 * can move a patient through every clinical and commercial state.
 */
export const PROGRAMME_TRANSITIONS: {
  from: ProgrammeState;
  to: ProgrammeState;
  roles: RoleId[];
  requires?: string;
}[] = [
  { from: "onboarding_pending", to: "plan_activation_pending", roles: ["coordinator"] },
  { from: "plan_activation_pending", to: "active", roles: ["lead_physio"], requires: "Baseline recorded and plan approved" },
  { from: "active", to: "clinical_review_required", roles: ["nurse", "medical_clinician", "clinical_ops", "lead_physio"] },
  { from: "active", to: "temporarily_paused", roles: ["medical_clinician", "clinical_ops"], requires: "Clinical decision" },
  { from: "clinical_review_required", to: "active", roles: ["medical_clinician", "clinical_ops"] },
  { from: "temporarily_paused", to: "active", roles: ["medical_clinician", "clinical_ops"] },
  { from: "active", to: "readmitted", roles: ["clinical_ops", "medical_clinician"] },
  { from: "active", to: "renewal_pending", roles: ["coordinator"], requires: "Day-30 review scheduled" },
  { from: "renewal_pending", to: "renewed", roles: ["coordinator"], requires: "Clinical recommendation + family acceptance recorded" },
  { from: "renewal_pending", to: "step_down_active", roles: ["coordinator"], requires: "Clinical recommendation + family acceptance recorded" },
  { from: "renewal_pending", to: "completed", roles: ["coordinator", "lead_physio"], requires: "Clinical recommendation recorded" },
  { from: "renewal_pending", to: "family_declined", roles: ["coordinator"] },
  { from: "renewal_pending", to: "cancelled", roles: ["clinical_ops"] },
];

export function transitionAllowed(from: ProgrammeState, to: ProgrammeState, role: RoleId) {
  const t = PROGRAMME_TRANSITIONS.find((x) => x.from === from && x.to === to);
  if (!t) return { ok: false, reason: `No permitted transition ${from} → ${to}.` };
  if (!t.roles.includes(role))
    return {
      ok: false,
      reason: `${role.replace(/_/g, " ")} cannot move the programme ${from} → ${to}. Permitted: ${t.roles.join(", ")}.`,
    };
  return { ok: true, reason: t.requires ?? "Permitted" };
}

/* ---------------- Caregiver support check-in (NOT a diagnosis) ---------------- */

export const WELLBEING_LABEL = "Caregiver support check-in — not a diagnosis.";

export const WELLBEING_DOMAINS: {
  id: string;
  prompt: string;
  options: { value: string; label: string; concern?: boolean }[];
}[] = [
  {
    id: "confidence",
    prompt: "How confident do you feel managing the plan?",
    options: [
      { value: "confident", label: "Confident" },
      { value: "mostly", label: "Mostly confident" },
      { value: "unsure", label: "Often unsure", concern: true },
    ],
  },
  {
    id: "fatigue",
    prompt: "How tired are you?",
    options: [
      { value: "ok", label: "Managing" },
      { value: "tired", label: "Quite tired", concern: true },
      { value: "exhausted", label: "Exhausted", concern: true },
    ],
  },
  {
    id: "sleep",
    prompt: "Is your own sleep disturbed?",
    options: [
      { value: "no", label: "Not really" },
      { value: "sometimes", label: "Sometimes" },
      { value: "often", label: "Most nights", concern: true },
    ],
  },
  {
    id: "training",
    prompt: "Would more training help?",
    options: [
      { value: "no", label: "No, I'm ok" },
      { value: "maybe", label: "Maybe" },
      { value: "yes", label: "Yes please", concern: true },
    ],
  },
  {
    id: "backup",
    prompt: "Do you have backup support if you need a break?",
    options: [
      { value: "yes", label: "Yes" },
      { value: "limited", label: "Limited", concern: true },
      { value: "none", label: "None", concern: true },
    ],
  },
  {
    id: "strain",
    prompt: "How are you feeling in yourself?",
    options: [
      { value: "ok", label: "Ok" },
      { value: "stretched", label: "Stretched", concern: true },
      { value: "struggling", label: "Struggling", concern: true },
    ],
  },
  {
    id: "talk",
    prompt: "Would you like someone to talk to?",
    options: [
      { value: "no", label: "Not now" },
      { value: "yes", label: "Yes please", concern: true },
    ],
  },
];
