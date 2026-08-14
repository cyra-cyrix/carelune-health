/**
 * Carelune domain architecture — Freeze V1 (July 2026).
 *
 * These types are the mandatory architecture from the freeze pack. Phase A
 * ships types + seeds + a shared store; later phases build screens on these
 * shapes instead of inventing new ones. Everything here is fictional demo data
 * territory — no production or clinical readiness is implied.
 */

import type { DaySegment } from "../types";

/* ---------------- Roles & permissions ---------------- */

export type RoleId =
  | "caregiver"
  | "family"
  | "lead_physio"
  | "coordinator"
  | "nurse"
  | "medical_clinician"
  | "clinical_ops"
  | "pmr"
  | "occupational_therapist"
  | "speech_swallow"
  | "dietitian"
  | "psychologist";

/** deep = full demo flow · moderate = lighter workspace · architecture = data model only for now */
export type RoleDepth = "deep" | "moderate" | "architecture";

/* ---------------- Evidence provenance (04_MEASUREMENT) ---------------- */

export type Provenance =
  | "clinician_assessed"
  | "caregiver_reported"
  | "patient_reported"
  | "family_reported"
  | "device_measured"
  | "system_metric"
  | "ai_drafted"
  | "clinician_confirmed";

/* ---------------- Referral / lead lifecycle (Phase B) ---------------- */

export type LeadStatus =
  | "new_referral"
  | "contact_pending"
  | "contact_attempted"
  | "family_interested"
  | "suitability_info_pending"
  | "clinical_review_required"
  | "eligible"
  | "not_eligible"
  | "consent_pending"
  | "payment_pending"
  | "onboarding_pending"
  | "plan_activation_pending"
  | "active"
  | "lost_declined";

export interface ContactAttempt {
  at: string;
  outcome: "no_answer" | "spoke_to_family" | "callback_requested";
  note?: string;
}

/** What the referring physiotherapist submits. Not a medical eligibility decision. */
export interface ReferralForm {
  patientName: string;
  age: string;
  caregiverName: string;
  caregiverPhone: string;
  locality: string; // Bengaluru locality
  diagnosis: string; // stroke diagnosis/status
  dischargeDate: string; // expected or actual
  hospital?: string; // existing treating hospital/centre (optional)
  leadPhysioConfirmed: boolean; // referrer remains Lead Physiotherapist
  familyAgreedContact: boolean;
  suitability: { medicallyStable: boolean; reliableCaregiver: boolean; smartphone: boolean };
  note: string;
}

/** Informed programme counselling record — not a sales CRM. */
export interface ExplanationRecord {
  attendees: string;
  inclusionsExplained: boolean;
  chargesExplained: boolean;
  hoursExplained: boolean;
  emergencyBoundaryExplained: boolean;
  physioContinuityExplained: boolean;
  familyQuestions: string;
  outcome: "interested" | "considering" | "declined";
  nextAction: string;
  recordedAt: string;
}

export type SuitabilityAnswer = "yes" | "no" | "unsure";
export type SuitabilityOutcome =
  | "administratively_ready"
  | "more_info_required"
  | "route_clinical_review"
  | "not_eligible_rule";

export interface SuitabilityRecord {
  answers: Record<string, SuitabilityAnswer>;
  outcome: SuitabilityOutcome;
  recordedAt: string;
}

/**
 * The clinical half of suitability. The coordinator runs the checklist and may
 * route clinical ambiguity onwards; only an authorised clinical role records
 * THIS. Kept separate from `SuitabilityRecord` so an operational checklist can
 * never be mistaken for a clinical determination.
 */
export interface SuitabilityDecision {
  outcome: "accepted" | "declined";
  rationale: string;
  decidedBy: string;
  decidedByRole: RoleId;
  decidedAt: string;
  /** Concerns the coordinator flagged that prompted the review. */
  reviewedConcerns: string[];
}

export interface LeadPayment {
  state: "pending" | "paid" | "waived";
  date?: string;
  receiptRef?: string;
}

export interface Lead {
  id: string;
  form: ReferralForm;
  status: LeadStatus;
  referredAt: string;
  daysSinceReferral: number;
  physioName: string;
  coordinatorName: string;
  missingInfo: string[];
  contactAttempts: ContactAttempt[];
  explanation?: ExplanationRecord;
  suitability?: SuitabilityRecord;
  suitabilityDecision?: SuitabilityDecision;
  consents: Record<ConsentType, ConsentStatus>;
  /** A caregiver will operate the account (makes caregiver authorisation required). */
  caregiverOperatesAccount: boolean;
  familyAccess: FamilyAccessRecord;
  payment: LeadPayment;
  onboarding: Record<string, boolean>;
}

/* ---------------- Patient / program status ---------------- */

export type ProgramStatus =
  | "lead"
  | "onboarding"
  | "active"
  | "paused"
  | "renewal_due"
  | "renewed"
  | "stepped_down"
  | "completed"
  | "referred_out";

/* ---------------- Consent & payment ---------------- */

/** Separate consent statuses — research consent is optional and independent. */
export type ConsentType =
  | "programme_service"
  | "health_data"
  | "caregiver_authorisation"
  | "family_access"
  | "teleconsultation"
  | "photo_video"
  | "research_optional";

/**
 * Contextual consent requirements:
 * - activation: required before programme activation
 * - conditional: required only when the situation applies (family access,
 *   caregiver authorisation when a caregiver operates the account)
 * - pre_teleconsult: required before the first teleconsultation
 * - pre_media: required before capturing/uploading patient media
 * - optional: always optional, independent of care (research)
 */
export type ConsentRequirement =
  | "activation"
  | "conditional"
  | "pre_teleconsult"
  | "pre_media"
  | "optional";

export type ConsentStatus = "pending" | "granted" | "declined" | "withdrawn";

/** Family/payer access record — consent applies only when access is requested. */
export interface FamilyAccessRecord {
  requested: boolean;
  authorisedMember?: string;
  permittedScope?: string;
  accessStart?: string;
  withdrawnDate?: string;
}

export interface ConsentRecord {
  type: ConsentType;
  status: ConsentStatus;
  version: string;
  recordedAt: string;
  recordedBy: string;
}

export type PaymentStatus = "pending" | "paid" | "refunded";

export interface PaymentRecord {
  label: string;
  amountInr: number;
  status: PaymentStatus;
  recordedAt: string;
}

/* ---------------- Baseline (Phase C) ---------------- */

/** Where a baseline datum came from — never invent scores for unassessed fields. */
export type BaselineSource =
  | "clinician_assessed"
  | "caregiver_reported"
  | "discharge_document"
  | "not_assessed"
  | "requires_other_discipline";

export interface BaselineField {
  id: string;
  label: string;
  value: string;
  source: BaselineSource;
  /** For requires_other_discipline — which discipline should assess. */
  discipline?: RoleId;
}

export interface BaselineAssessment {
  fields: BaselineField[];
  assessedBy: string;
  assessorRole: RoleId;
  mode: "in_person" | "video" | "records_review";
  date: string;
  informationSources: string;
}

/* ---------------- Goals & barriers ---------------- */

export type GoalStatus =
  | "not_started"
  | "progressing"
  | "achieved"
  | "revised"
  | "held"
  | "discontinued";

export type GoalPriority = "high" | "medium" | "low";

export interface FunctionalGoal {
  id: string;
  patientWording: string; // "what matters to me"
  clinicalFormulation: string;
  domain: string;
  ownerRole: RoleId; // clinical owner — other disciplines via referral, never assigned by Ravi
  baseline: string;
  target: string;
  timeframe: string;
  priority: GoalPriority;
  status: GoalStatus;
  barrierIds: string[];
  facilitators: string[];
  interventionIds: string[]; // supporting interventions in the active plan
  reviewDate: string;
  evidenceSource: string; // observation, validated assessment, caregiver report…
  revisionRationale?: string;
}

export type BarrierCategory =
  | "medical_stability"
  | "pain"
  | "fatigue"
  | "cognition"
  | "communication"
  | "swallow_feeding"
  | "mood_motivation"
  | "caregiver_confidence"
  | "caregiver_availability"
  | "home_accessibility"
  | "equipment"
  | "financial"
  | "transport"
  | "digital_access"
  | "nutrition"
  | "family_coordination"
  | "other";

/** Structured, non-scored barrier — never collapsed into a numeric risk score. */
export interface RecoveryBarrier {
  id: string;
  category: BarrierCategory;
  label: string;
  source: string; // reporter
  severity: "mild" | "moderate" | "significant";
  ownerRole: RoleId;
  actionRequired: string;
  linkedGoalIds: string[];
  status: "open" | "in_progress" | "resolved";
  reviewDate: string;
  resolutionNote?: string;
}

/* ---------------- Home environment & equipment ---------------- */

export interface HomeEnvironment {
  summary: string;
  notes: string[];
}

export interface EquipmentItem {
  name: string;
  status: "available" | "recommended";
  note?: string;
}

/* ---------------- Layer 1 — governed protocol/template ---------------- */

export type TemplateStatus = "draft" | "approved" | "retired";

export interface TemplateChange {
  version: string;
  date: string;
  by: string;
  note: string;
}

export interface ProtocolTemplate {
  id: string;
  name: string;
  version: string;
  status: TemplateStatus;
  disciplineOwner: RoleId;
  evidenceSource: string; // evidence-references placeholder
  approvedBy: string;
  approvedAt: string;
  reviewDue: string;
  intendedGroup: string;
  inclusion: string[];
  exclusion: string[]; // exclusion / clinical-review triggers
  requiredBaselineDomains: string[];
  activityCategories: string[];
  precautions: string[];
  stopConditions: string[];
  escalationRules: string[];
  indianAdaptationNotes: string[];
  changeHistory: TemplateChange[];
}

/* ---------------- Content library (governed, per-discipline) ---------------- */

export type ContentApproval = "draft" | "approved" | "expired";

export interface ContentItem {
  id: string;
  discipline: RoleId;
  domain: string; // functional goal/domain
  title: string;
  intendedCapability: string; // capability prerequisites
  startingPosition: string;
  performedBy: string; // person performing or assisting
  instructions: string;
  doseFields: string[]; // fields that MUST be personalised per patient
  assistance: string;
  equipment: string[];
  contraindications: string[];
  precautions: string[];
  stopConditions: string[];
  deliveryModesAllowed: DeliveryMode[];
  evidenceSource: string; // evidence-source placeholder
  version: string;
  language: string;
  author: string;
  reviewer: string;
  approval: ContentApproval;
  reviewDue: string;
  observationRequired: boolean; // video/live observation before progression
}

/* ---------------- Layer 2 — patient-specific intervention ---------------- */

export type DeliveryMode =
  | "caregiver_guided"
  | "live_virtual"
  | "recorded_review"
  | "home_visit"
  | "clinic_visit"
  | "hold_reassessment";

/** Where an intervention's clinical authority comes from. */
export type SourceKind = "carelune_content" | "discharge_plan" | "specialist_direction";

/**
 * Discharge-sourced provenance. "Continued from discharge plan" is only
 * acceptable when every field here is present and verified.
 */
export interface DischargeSource {
  document: string;
  institution: string;
  issuingProfessional: string;
  documentDate: string;
  verificationStatus: "verified" | "unverified";
  transcribedBy: string;
  confirmedCurrentBy?: string;
  confirmedCurrentAt?: string;
}

/** Every intervention that reaches a caregiver must carry this in full. */
export interface InterventionProvenance {
  sourceKind: SourceKind;
  sourceVersion: string; // content version or document reference
  approvedBy: string;
  approverRole: RoleId;
  approvedAt: string;
  reviewDate: string;
  discharge?: DischargeSource;
}

/** Clinical treatment vs. non-clinical general education. */
export type InterventionKind = "clinical" | "education";

export interface Intervention {
  id: string;
  goalId: string;
  contentId?: string;
  title: string;
  caregiverTitle: string; // plain-language title for the caregiver
  kind: InterventionKind;
  ownerRole: RoleId; // owning clinical discipline
  deliveryMode: DeliveryMode;
  dose: string;
  frequency: string;
  assistance: string;
  equipment: string[];
  instructions: string;
  whyItMatters: string;
  precautions: string[];
  safetyInstructions: string[]; // stop conditions shown to the caregiver
  scheduleSegment: "Morning" | "Midday" | "Evening";
  scheduleTime: string;
  timeWindow: string;
  priority: TaskPriority;
  priorityReason: string;
  rationale: string;
  status: "active" | "held" | "completed";
  holdReason?: string;
  /** Displayed instead of a task when a verified discharge precaution is held. */
  precautionDisplay?: string;
  addedInVersion: number;
  provenance: InterventionProvenance;
}

/** The patient-specific plan (Layer 2) with full version history. */
export interface PlanVersionEntry {
  version: number;
  at: string;
  by: string;
  change: string;
  rationale: string;
}

export interface PatientPlan {
  version: number;
  status: "draft" | "active" | "superseded";
  templateId: string;
  templateVersion: string;
  interventions: Intervention[];
  approvedBy: string;
  approvedAt: string;
  history: PlanVersionEntry[];
}

/* ---------------- Layer 3 — daily caregiver task & reporting ---------------- */

export type TaskPriority = "safety_critical" | "recovery_priority" | "routine_support";

/** The six frozen execution outcomes. */
export type TaskResultStatus =
  | "completed"
  | "partial"
  | "unable"
  | "refused"
  | "unwell"
  | "need_help";

/**
 * Status of TODAY'S OCCURRENCE of a task — deliberately separate from the
 * status of the underlying clinical intervention. A stopped occurrence never
 * implies the intervention is held.
 */
export type OccurrenceStatus =
  | "scheduled"
  | "completed"
  | "partially_completed"
  | "stopped"
  | "not_completed"
  | "awaiting_review";

export interface TaskReport {
  taskId: string;
  interventionId: string;
  status: TaskResultStatus;
  /** What happened to today's occurrence only. */
  occurrenceStatus: OccurrenceStatus;
  reason?: string; // structured reason code label
  note?: string;
  at: string;
  provenance: Provenance; // caregiver_reported
  /** The approved rule that governed the system's response to this report. */
  ruleId: string;
  ruleVersion: string;
}

/** Layer 3 — a caregiver-facing task derived from an ACTIVE approved intervention. */
export interface ScheduleTask {
  id: string;
  interventionId: string;
  title: string; // simple caregiver-facing title
  goalText: string;
  whyItMatters: string;
  approvedBy: string;
  approverRole: RoleId;
  approvedAt: string;
  planVersion: number;
  lastReviewed: string;
  nextReview: string;
  instructions: string;
  assistance: string;
  equipment: string[];
  dose: string;
  frequency: string;
  stopConditions: string[];
  time: string;
  timeWindow: string;
  segment: DaySegment;
  priority: TaskPriority;
  priorityReason: string;
  ownerRole: RoleId;
  kind: InterventionKind;
  icon: string;
  hasMedia: boolean;
}

/* ---------------- Medication administration record (restricted) ---------------- */

/** Medication information may only come from these verified sources. */
export type MedSourceKind = "discharge_prescription" | "clinician_consultation";

export interface MedSource {
  kind: MedSourceKind;
  reference: string; // document / consultation reference
  sourceDate: string;
  lastVerified: string;
  verifiedBy: string;
}

/** What a caregiver may report — never a dose decision. */
export type MedOutcome = "given" | "not_given" | "refused" | "unwell";

export interface MedAdminRecord {
  medId: string;
  outcome: MedOutcome;
  reason?: string;
  at: string;
  provenance: Provenance; // caregiver_reported
}

/* ---------------- Patient-specific daily check-in ---------------- */

export interface CheckInOption {
  value: string;
  label: string;
  /** Marks an answer that should raise a coordinator/nursing follow-up. */
  concern?: boolean;
  /** Marks an answer that immediately holds a task and creates an exception. */
  urgent?: boolean;
}

export interface CheckInQuestion {
  id: string;
  label: string;
  options: CheckInOption[];
  approvedBy: string; // which professional approved collecting this
}

export interface DailyCheckIn {
  patientId: string;
  questions: CheckInQuestion[];
}

export type CheckInAnswers = Record<string, string>;

/* ---------------- Safety rules & clinical holds ---------------- */

/** An approved, versioned rule. The only source of automatic system behaviour. */
export interface SafetyRule {
  id: string;
  name: string;
  version: string;
  author: string;
  authorRole: RoleId;
  approvedAt: string;
  trigger: string;
  caregiverAction: string;
  /** Whether this rule requires an automatic temporary hold. */
  autoHold: boolean;
  holdInterventionIds: string[];
  reviewOwnerRole: RoleId;
  reviewDeadline: string;
  releasableByRoles: RoleId[];
  priority: ExceptionPriority;
  rationale: string;
}

/**
 * A hold on the underlying clinical intervention. Created only by an approved
 * rule or an authorised clinical owner — never as a side effect of a caregiver
 * report. A caregiver can never release one.
 */
export interface ClinicalHold {
  id: string;
  interventionId: string;
  source: "approved_rule" | "professional";
  ruleId?: string;
  ruleVersion?: string;
  author: string;
  authorRole: RoleId;
  reason: string;
  heldAt: string;
  reviewOwnerRole: RoleId;
  reviewDeadline: string;
  releasableByRoles: RoleId[];
  status: "active" | "released";
  /**
   * Guided-demo safety lock. Production release authority is configurable and
   * still an unresolved clinical/legal decision; while locked, no role releases
   * this hold in-app.
   */
  demoReleaseLocked?: boolean;
  releasedBy?: string;
  releasedByRole?: RoleId;
  releasedAt?: string;
  releaseDecision?: string;
  releaseRationale?: string;
  /** A Speech & Swallow review may record a recommendation without releasing. */
  releaseRecommendation?: string;
  releaseRecommendedBy?: string;
}

/* ---------------- Response-target policy (pilot targets, not guarantees) ---------------- */

export interface ResponseTarget {
  label: string;
  acknowledge: string;
  action: string;
  escalation: string;
  ackMins: number;
  actionMins: number;
}

export interface ResponsePolicy {
  name: string;
  version: string;
  owner: string;
  serviceHours: string;
  outOfHoursRule: string;
  note: string;
  targets: Record<ExceptionPriority, ResponseTarget>;
}

/** Non-colour-dependent SLA state. */
export type SlaState = "within" | "approaching" | "overdue" | "out_of_hours";

/* ---------------- Exceptions, actions, closure ---------------- */

export type ExceptionPriority =
  | "emergency"
  | "same_day_medical"
  | "same_day_rehab"
  | "nursing_review"
  | "operational_followup"
  | "routine_observation";

export type ExceptionStatus =
  | "open"
  | "assigned"
  | "acknowledged"
  | "in_review"
  | "action_taken"
  | "follow_up_pending"
  | "resolved"
  | "reopened"
  | "cancelled_duplicate";

export interface ActionItem {
  id: string;
  description: string;
  ownerRole: RoleId;
  actor?: string;
  status: "open" | "done";
  note?: string;
  at?: string;
  closedAt?: string;
}

export interface Handoff {
  at: string;
  fromRole: RoleId;
  toRole: RoleId;
  by: string;
  reason: string;
}

/** Operational completion is tracked separately from clinical resolution. */
export interface ClosureChecklist {
  coordinatorRouting: boolean;
  professionalReview: boolean;
  familyUpdate: boolean;
  planAcknowledgement: boolean;
  followUp: boolean;
  clinicalResolution: boolean;
}

export type ExceptionTriggerSource = "task" | "check_in" | "medication" | "contact";

export interface ExceptionCase {
  id: string;
  patient: string;
  trigger: string;
  triggerSource: ExceptionTriggerSource;
  source: string; // human-readable source label
  interventionId?: string;
  taskId?: string;
  reporter: string;
  reporterRole: RoleId;
  reporterProvenance: Provenance;
  reason: string;
  priority: ExceptionPriority;
  /** Priority always comes from an approved rule or a named professional. */
  prioritySource: string;
  priorityRuleId?: string;
  priorityRuleVersion?: string;
  status: ExceptionStatus;
  ownerRole: RoleId;
  createdAt: string;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
  responseExpectation: string; // pilot service target wording, never a guarantee
  slaState: SlaState;
  actions: ActionItem[];
  handoffs: Handoff[];
  followUpDate?: string;
  closureCriteria: string;
  closure: ClosureChecklist;
  resolution?: string;
  resolvedBy?: string;
  resolvedByRole?: RoleId;
  reopenReason?: string;
  /** Caregiver/family-visible progress — plain language, never internal notes. */
  latestAction?: string;
  nextStep?: string;
  familyUpdate?: string;
}

/* ---------------- Nursing triage ---------------- */

export interface TriagePathway {
  id: string;
  name: string;
  version: string;
  author: string;
  approvedAt: string;
  scopeNote: string;
  guidedObservations: string[];
  redFlags: string[];
  approvedEducation: string[];
}

export type TriageOutcome =
  | "education_provided"
  | "continue_observation"
  | "route_lead_physio"
  | "route_medical_clinician"
  | "route_emergency"
  | "specialist_referral_required"
  | "unable_to_reach"
  | "follow_up_pending";

export interface TriageRecord {
  id: string;
  exceptionId: string;
  by: string;
  byRole: RoleId;
  at: string;
  pathwayId: string;
  pathwayVersion: string;
  identityConfirmed: boolean;
  contactSuccessful: boolean;
  concernRestated: string;
  observations: Record<string, "yes" | "no" | "unknown">;
  redFlagsPresent: "present" | "absent" | "unknown";
  educationGiven: string[];
  medicalReviewRequired: boolean;
  rehabReviewRequired: boolean;
  emergencyDirectionReinforced: boolean;
  followUpRequired: boolean;
  note: string;
  outcome: TriageOutcome;
}

/* ---------------- Medical consultation ---------------- */

export interface ConsultationRecord {
  id: string;
  exceptionId?: string;
  by: string;
  byRole: RoleId;
  at: string;
  mode: "video" | "phone" | "in_person";
  consentConfirmed: boolean;
  reasonForReview: string;
  assessment: string;
  advice: string;
  medicationDecision?: string;
  disposition: "no_action" | "referral" | "emergency" | "follow_up";
  followUp: string;
}

/* ---------------- Safety events (adverse events, ED visits, pauses) ---------------- */

export type SafetyEventKind =
  | "adverse_event"
  | "emergency_direction"
  | "ed_visit"
  | "readmission"
  | "programme_pause"
  | "programme_resumption"
  | "review_outcome";

export interface SafetyEvent {
  id: string;
  kind: SafetyEventKind;
  exceptionId?: string;
  at: string;
  recordedBy: string;
  recordedByRole: RoleId;
  summary: string;
  /** Only Clinical Operations decides whether this enters adverse-event review. */
  inAdverseReviewQueue: boolean;
  reviewOutcome?: string;
}

/* ---------------- Reviews, specialist referrals, direct visits ---------------- */

/* ---------------- Generic review engine (Phase F) ---------------- */

export type ReviewType =
  | "weekly_rehabilitation"
  | "nursing"
  | "medical"
  | "pmr"
  | "occupational_therapy"
  | "speech_swallow"
  | "dietitian"
  | "psychology_caregiver"
  | "day30_multidisciplinary"
  | "adverse_event"
  | "programme_closure";

/** An authorised professional decision about an intervention. */
export type PlanDecisionKind =
  | "continue"
  | "modify_parameters"
  | "progress"
  | "regress"
  | "temporary_hold"
  | "request_direct_assessment"
  | "discontinue"
  | "replace"
  | "refer_other_discipline";

export interface PlanDecision {
  interventionId: string;
  kind: PlanDecisionKind;
  reason: string;
  evidenceReviewed: string;
  effectiveDate: string;
  nextReviewDate: string;
  decidedBy: string;
  decidedByRole: RoleId;
  caregiverAcknowledgementRequired: boolean;
  newPlanVersion?: number;
}

export interface ReviewRecord {
  id: string;
  patient: string;
  type: ReviewType;
  reason: string;
  reviewer: string;
  reviewerRole: RoleId;
  scheduledDate: string;
  completedDate?: string;
  mode: "video" | "phone" | "in_person" | "records_review";
  evidenceReviewed: string[];
  assessmentsReviewed: string[];
  goalsReviewed: string[];
  barriersReviewed: string[];
  exceptionsReviewed: string[];
  observations: string;
  decisions: PlanDecision[];
  interventionsAffected: string[];
  referralsCreated: string[];
  followUp: string;
  nextReview: string;
  familyCommunication: string;
}

/* ---------------- Goal & barrier review updates ---------------- */

export interface GoalUpdate {
  goalId: string;
  from: GoalStatus;
  to: GoalStatus;
  reviewer: string;
  reviewerRole: RoleId;
  evidenceSource: string;
  rationale: string;
  at: string;
  targetRevision?: string;
  linkedPlanChanges: string[];
  patientFamilyInput?: string;
  nextReview: string;
}

export type BarrierState =
  | "new"
  | "active"
  | "improving"
  | "resolved"
  | "worsened"
  | "referred"
  | "unable_to_address";

export interface BarrierUpdate {
  barrierId: string;
  to: BarrierState;
  source: string;
  ownerRole: RoleId;
  actionTaken: string;
  goalImpact: string;
  followUp: string;
  resolutionRationale?: string;
  at: string;
  by: string;
}

/* ---------------- Assessment governance registry ---------------- */

export interface AssessmentRegistryEntry {
  instrument: string;
  version: string;
  domain: string;
  purpose: "screening" | "baseline" | "outcome" | "risk";
  intendedPopulation: string;
  administratorQualification: string;
  permittedModes: string[];
  language: string;
  scoringSource: string;
  licensingStatus: string; // internal/professional context only
  itemDataDisplayable: boolean;
  interpretationSource: string;
  limitations: string;
  nextDue: string;
}

/* ---------------- Caregiver wellbeing (non-diagnostic) ---------------- */

export interface WellbeingAnswers {
  [domain: string]: string;
}

/* ---------------- Programme state machine ---------------- */

export type ProgrammeState =
  | "onboarding_pending"
  | "plan_activation_pending"
  | "active"
  | "temporarily_paused"
  | "clinical_review_required"
  | "readmitted"
  | "renewal_pending"
  | "renewed"
  | "step_down_active"
  | "completed"
  | "cancelled"
  | "family_declined"
  | "deceased";

export type RenewalDecisionKind =
  | "renew_current"
  | "renew_modified"
  | "step_down"
  | "pause_clinical_review"
  | "complete"
  | "refer_other_service"
  | "readmitted_suspended"
  | "family_declined";

export interface RenewalDecision {
  /** Clinical recommendation, family decision and activation are separate acts. */
  clinicalRecommendation?: string;
  recommendedBy?: string;
  recommendedByRole?: RoleId;
  recommendedKind?: RenewalDecisionKind;
  familyDecision?: "accepted" | "declined" | "undecided";
  familyDecisionBy?: string;
  familyDecisionAt?: string;
  administrativelyActivated?: boolean;
  activatedBy?: string;
  effectiveDate?: string;
  rationale?: string;
}

export type ReferralStatus =
  | "identified"
  | "discussed_with_family"
  | "consent_pending"
  | "accepted"
  | "assigned"
  | "scheduled"
  | "consultation_completed"
  | "recommendation_received"
  | "plan_acknowledgement_pending"
  | "follow_up_pending"
  | "closed"
  | "declined"
  | "cancelled";

export interface SpecialistReferral {
  id: string;
  toDiscipline: RoleId;
  reason: string;
  requestedBy: string;
  requestedByRole: RoleId;
  urgency: ExceptionPriority;
  status: ReferralStatus;
  exceptionId?: string;
  familyAccepted?: boolean;
  scheduledMode?: DeliveryMode;
  separateChargeDisclosed: boolean;
  consultationNoteStatus?: "pending" | "received";
  recommendation?: string;
  planOwnerRole?: RoleId;
  planAcknowledgedBy?: string;
  followUp?: string;
  history: { at: string; by: string; from: ReferralStatus; to: ReferralStatus; note?: string }[];
}

export interface DirectVisitRecommendation {
  id: string;
  byRole: RoleId;
  reason: string;
  status: "recommended" | "scheduled" | "completed";
  note?: string;
}

/* ---------------- Class A: validated assessments · Class B: operational metrics ---------------- */

export interface AssessmentResult {
  instrument: string; // named instrument, never a composite Carelune score
  version: string;
  assessor: string;
  assessorRole: RoleId;
  mode: "in_person" | "video" | "proxy" | "self_report";
  date: string;
  score: string;
  interpretation?: string;
  licensingNote?: string;
  provenance: Provenance;
}

export interface OperationalMetric {
  key: string;
  label: string;
  value: string;
  provenance: "system_metric";
}

/* ---------------- Unified timeline / audit ---------------- */

export type AuditCategory =
  | "referral"
  | "consent"
  | "payment"
  | "onboarding"
  | "assessment"
  | "plan"
  | "task"
  | "medication"
  | "check_in"
  | "exception"
  | "review"
  | "specialist_referral"
  | "communication"
  | "system";

export interface AuditEvent {
  id: string;
  at: string; // demo timestamps, e.g. "Day 12 · 11:40"
  roleId: RoleId;
  actor: string;
  category: AuditCategory;
  summary: string;
  detail?: string;
  provenance: Provenance;
  /** Where the action originated (screen/workflow), when meaningful. */
  source?: string;
  /** State transition, when the action changed a tracked status. */
  before?: string;
  after?: string;
  reason?: string;
}
