/**
 * Shared demo state — one patient, one record, read and updated by every role.
 *
 * Enforcement lives here, not in the UI: every clinical write passes through a
 * guard in `domain/permissions.ts` first, and refusals are audited.
 */
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type {
  ActionItem,
  AuditCategory,
  AuditEvent,
  CheckInAnswers,
  ClinicalHold,
  ConsentStatus,
  ConsentType,
  ConsultationRecord,
  ContactAttempt,
  DeliveryMode,
  ExceptionCase,
  ExceptionPriority,
  ExceptionStatus,
  ExplanationRecord,
  FamilyAccessRecord,
  Intervention,
  Lead,
  LeadStatus,
  MedAdminRecord,
  MedOutcome,
  OccurrenceStatus,
  PatientPlan,
  Provenance,
  ReferralForm,
  ReferralStatus,
  RoleId,
  SafetyEvent,
  SafetyEventKind,
  BarrierState,
  BarrierUpdate,
  DirectVisitRecommendation,
  GoalStatus,
  GoalUpdate,
  PlanDecision,
  ProgrammeState,
  RenewalDecision,
  RenewalDecisionKind,
  ReviewRecord,
  ScheduleTask,
  SpecialistReferral,
  WellbeingAnswers,
  SuitabilityRecord,
  TaskReport,
  TaskResultStatus,
  TemplateStatus,
  TriageRecord,
} from "../domain/types";
import { medSchedule } from "../data/clinical";
import { programDay, seedAudit } from "../domain/seed";
import {
  CONSENT_META,
  emptyConsents,
  ONBOARDING_ITEMS,
  seedLeads,
  STATUS_META,
  SUITABILITY_ITEMS,
} from "../domain/journey";
import { contentLibrary, goals, protocolTemplate, seedPlan } from "../domain/planning";
import { dailyCheckIn, FEEDING_INCIDENT_GUIDANCE } from "../domain/caregiver";
import { RESPONSE_POLICY, ruleById, ruleForReport, TRIAGE_PATHWAY } from "../domain/safety";
import { ROLE_META } from "../domain/roles";
import { transitionAllowed, WELLBEING_DOMAINS } from "../domain/reviews";
import {
  canActivateRenewal,
  canApproveIntervention,
  canDecideSuitability,
  canChangePriority,
  canDecidePlanChange,
  canRecommendRenewal,
  canUpdateGoal,
  canHoldIntervention,
  canRecordMedicationAdministration,
  canReleaseHold,
  canResolveClinicalException,
  canStartTeleconsultation,
  canWriteCaregiverData,
  contentSelectable,
  interventionReachesSchedule,
  type GuardResult,
} from "../domain/permissions";

export interface LogInput {
  roleId: RoleId;
  actor: string;
  category: AuditCategory;
  summary: string;
  detail?: string;
  provenance: Provenance;
  source?: string;
  before?: string;
  after?: string;
  reason?: string;
}

/** Activation gates — the coordinator cannot bypass these. */
export interface ActivationReadiness {
  requiredConsents: boolean;
  payment: boolean;
  onboarding: boolean;
  physioConfirmed: boolean;
  baselineRecorded: boolean;
  planApproved: boolean;
}

/**
 * Contextual consent gate for activation: programme/service + health-data
 * always; caregiver authorisation when a caregiver operates the account;
 * family access only when access is requested. Teleconsultation and media
 * consents gate their own first use, not activation. Research never gates.
 */
export function activationConsentsGranted(lead: Lead): boolean {
  const c = lead.consents;
  if (c.programme_service !== "granted" || c.health_data !== "granted") return false;
  if (lead.caregiverOperatesAccount && c.caregiver_authorisation !== "granted") return false;
  if (lead.familyAccess.requested && c.family_access !== "granted") return false;
  return true;
}

/** What a professional supplies when adding an approved content item to the plan. */
export interface PlanAdditionInput {
  contentId: string;
  goalId: string;
  dose: string;
  frequency: string;
  assistance: string;
  deliveryMode: DeliveryMode;
  scheduleSegment: "Morning" | "Midday" | "Evening";
  scheduleTime: string;
  rationale: string;
  extraSafetyNote?: string;
  caregiverTitle?: string;
}

/** Terminal exception states — used for dedup and queue filtering. */
export const isClosed = (s: ExceptionStatus) =>
  s === "resolved" || s === "cancelled_duplicate";

const ROLE_LABEL = (r: RoleId) => ROLE_META[r].label;

/**
 * The single lead that owns this build's one expanded clinical record.
 * Everything patient-specific in this store is still global — replacing this
 * constant with per-patient records is the patient-scoped-state work.
 */
const EXPANDED_RECORD_LEAD = "lead-anand";

const DISCIPLINE_ICON: Partial<Record<RoleId, string>> = {
  lead_physio: "🦵",
  occupational_therapist: "✋",
  speech_swallow: "🗣️",
  nurse: "🩺",
};

export interface CareluneStore {
  programDay: number;
  /* ---- Layer 3: caregiver execution ---- */
  schedule: ScheduleTask[];
  heldInterventions: Intervention[];
  taskReports: Record<string, TaskReport>;
  reportTask: (
    task: ScheduleTask,
    status: TaskResultStatus,
    reason?: string,
    note?: string
  ) => GuardResult;
  doneCount: number;
  priorities: ScheduleTask[];
  restOfDay: ScheduleTask[];
  /* ---- Medication administration record ---- */
  medRecords: Record<string, MedAdminRecord>;
  recordMedication: (medId: string, outcome: MedOutcome, reason?: string) => GuardResult;
  /* ---- Daily check-in ---- */
  checkIn: CheckInAnswers;
  submitCheckIn: (answers: CheckInAnswers) => void;
  checkInSubmitted: boolean;
  /* ---- Exceptions, holds & follow-ups ---- */
  exceptions: ExceptionCase[];
  holds: ClinicalHold[];
  activeHoldFor: (interventionId: string) => ClinicalHold | undefined;
  /** Human label for an intervention — never render a raw `iv4`-style id. */
  interventionTitle: (interventionId: string) => string;
  releaseHold: (
    holdId: string,
    actorRole: RoleId,
    actor: string,
    decision: string,
    rationale: string
  ) => GuardResult;
  holdInterventionByProfessional: (
    interventionId: string,
    actorRole: RoleId,
    actor: string,
    reason: string
  ) => GuardResult;
  acknowledgeException: (id: string, actorRole: RoleId, actor: string) => GuardResult;
  routeException: (
    id: string,
    toRole: RoleId,
    actorRole: RoleId,
    actor: string,
    reason: string
  ) => GuardResult;
  changeExceptionPriority: (
    id: string,
    to: ExceptionPriority,
    actorRole: RoleId,
    actor: string,
    reason: string
  ) => GuardResult;
  addExceptionAction: (
    id: string,
    description: string,
    actorRole: RoleId,
    actor: string,
    familyVisible?: string
  ) => void;
  completeClosureItem: (id: string, key: keyof ExceptionCase["closure"], actorRole: RoleId, actor: string) => GuardResult;
  resolveException: (
    id: string,
    actorRole: RoleId,
    actor: string,
    resolution: string
  ) => GuardResult;
  reopenException: (id: string, actorRole: RoleId, actor: string, reason: string) => void;
  triageRecords: TriageRecord[];
  recordTriage: (rec: Omit<TriageRecord, "id" | "at" | "pathwayId" | "pathwayVersion">) => GuardResult;
  consultations: ConsultationRecord[];
  recordConsultation: (
    rec: Omit<ConsultationRecord, "id" | "at" | "consentConfirmed">,
    actorRole: RoleId
  ) => GuardResult;
  safetyEvents: SafetyEvent[];
  recordSafetyEvent: (
    kind: SafetyEventKind,
    summary: string,
    actorRole: RoleId,
    actor: string,
    opts?: { exceptionId?: string; inAdverseReviewQueue?: boolean }
  ) => void;
  setAdverseReview: (eventId: string, inQueue: boolean, outcome: string, actor: string) => void;
  advanceReferral: (
    id: string,
    to: ReferralStatus,
    actorRole: RoleId,
    actor: string,
    note?: string
  ) => void;
  /* ---- Phase F: reviews, goals, barriers, renewal, wellbeing ---- */
  reviews: ReviewRecord[];
  recordReview: (r: Omit<ReviewRecord, "id">, actorRole: RoleId) => GuardResult;
  goalStates: Record<string, GoalStatus>;
  goalUpdates: GoalUpdate[];
  updateGoal: (u: Omit<GoalUpdate, "at">, actorRole: RoleId) => GuardResult;
  barrierStates: Record<string, BarrierState>;
  barrierUpdates: BarrierUpdate[];
  updateBarrier: (u: Omit<BarrierUpdate, "at">, actorRole: RoleId) => GuardResult;
  applyPlanDecision: (d: Omit<PlanDecision, "newPlanVersion">, actorRole: RoleId) => GuardResult;
  programmeState: ProgrammeState;
  transitionProgramme: (to: ProgrammeState, actorRole: RoleId, actor: string, reason: string) => GuardResult;
  renewal: RenewalDecision;
  recommendRenewal: (
    kind: RenewalDecisionKind,
    recommendation: string,
    actorRole: RoleId,
    actor: string
  ) => GuardResult;
  recordFamilyRenewalDecision: (decision: "accepted" | "declined" | "undecided", by: string) => void;
  activateRenewal: (actorRole: RoleId, actor: string, effectiveDate: string) => GuardResult;
  wellbeing: WellbeingAnswers;
  submitWellbeing: (answers: WellbeingAnswers) => void;
  directVisits: DirectVisitRecommendation[];
  recommendDirectVisit: (reason: string, actorRole: RoleId, actor: string) => void;
  teleconsentGranted: boolean;
  /** Developer/testing mode — gates blocked-action probes out of the guided demo. */
  devMode: boolean;
  setDevMode: (v: boolean) => void;
  recommendHoldRelease: (holdId: string, by: string, recommendation: string) => void;
  followUps: ActionItem[];
  addFollowUp: (description: string, source: { roleId: RoleId; actor: string }) => void;
  /* ---- Referral / onboarding journey (Phase B) ---- */
  leads: Lead[];
  submitReferral: (form: ReferralForm) => string;
  recordContactAttempt: (leadId: string, attempt: Omit<ContactAttempt, "at">) => void;
  recordExplanation: (leadId: string, record: Omit<ExplanationRecord, "recordedAt">) => void;
  recordSuitability: (leadId: string, record: Omit<SuitabilityRecord, "recordedAt">) => void;
  /** Clinical suitability decision — Clinical Operations / Medical Clinician only. */
  decideSuitability: (
    leadId: string,
    outcome: "accepted" | "declined",
    rationale: string,
    actorRole: RoleId,
    actor: string
  ) => GuardResult;
  beginConsent: (leadId: string) => void;
  setConsent: (leadId: string, type: ConsentType, status: ConsentStatus) => void;
  setFamilyAccess: (leadId: string, record: FamilyAccessRecord) => void;
  recordPayment: (leadId: string) => void;
  toggleOnboarding: (leadId: string, itemId: string) => void;
  activationReadiness: (lead: Lead) => ActivationReadiness;
  /* ---- Clinical planning (Phase C) ---- */
  plan: PatientPlan;
  approvePlanAddition: (input: PlanAdditionInput, actorRole: RoleId) => GuardResult;
  logDiscovery: (kind: "surfaced" | "reviewed" | "selected", detail: string) => void;
  specialistReferrals: SpecialistReferral[];
  createSpecialistReferral: (
    toDiscipline: RoleId,
    reason: string,
    source: string,
    opts?: { exceptionId?: string; requestedBy?: string; requestedByRole?: RoleId }
  ) => void;
  templateGovernanceStatus: TemplateStatus;
  templateNotes: { at: string; by: string; note: string }[];
  setTemplateGovernanceStatus: (s: TemplateStatus, note: string) => void;
  addTemplateNote: (note: string) => void;
  /* ---- Audit ---- */
  audit: AuditEvent[];
  log: (e: LogInput) => void;
}

const Ctx = createContext<CareluneStore | null>(null);

/** Derive a caregiver task from an approved, active intervention. */
function toTask(iv: Intervention, planVersion: number): ScheduleTask {
  const goal = goals.find((g) => g.id === iv.goalId);
  return {
    id: `t-${iv.id}`,
    interventionId: iv.id,
    title: iv.caregiverTitle,
    goalText: goal ? goal.patientWording : iv.title,
    whyItMatters: iv.whyItMatters,
    approvedBy: iv.provenance.approvedBy,
    approverRole: iv.provenance.approverRole,
    approvedAt: iv.provenance.approvedAt,
    planVersion,
    lastReviewed: iv.provenance.approvedAt,
    nextReview: iv.provenance.reviewDate,
    instructions: iv.instructions,
    assistance: iv.assistance,
    equipment: iv.equipment,
    dose: iv.dose,
    frequency: iv.frequency,
    stopConditions: iv.safetyInstructions,
    time: iv.scheduleTime,
    timeWindow: iv.timeWindow,
    segment: iv.scheduleSegment,
    priority: iv.priority,
    priorityReason: iv.priorityReason,
    ownerRole: iv.ownerRole,
    kind: iv.kind,
    icon: DISCIPLINE_ICON[iv.ownerRole] ?? "📋",
    hasMedia: iv.kind === "clinical",
  };
}

export function CareluneProvider({ children }: { children: ReactNode }) {
  const [plan, setPlan] = useState<PatientPlan>(seedPlan);
  const [taskReports, setTaskReports] = useState<Record<string, TaskReport>>({});
  const [medRecords, setMedRecords] = useState<Record<string, MedAdminRecord>>(() => {
    const seeded: Record<string, MedAdminRecord> = {};
    for (const m of medSchedule) {
      if (m.state === "taken")
        seeded[m.id] = {
          medId: m.id,
          outcome: "given",
          at: `Day ${programDay} · ${m.time}`,
          provenance: "caregiver_reported",
        };
    }
    return seeded;
  });
  const [checkIn, setCheckIn] = useState<CheckInAnswers>({});
  const [checkInSubmitted, setCheckInSubmitted] = useState(false);
  const [exceptions, setExceptions] = useState<ExceptionCase[]>([]);
  const [holds, setHolds] = useState<ClinicalHold[]>([]);
  const [triageRecords, setTriageRecords] = useState<TriageRecord[]>([]);
  const [consultations, setConsultations] = useState<ConsultationRecord[]>([]);
  const [safetyEvents, setSafetyEvents] = useState<SafetyEvent[]>([]);
  const [followUps, setFollowUps] = useState<ActionItem[]>([]);
  const [audit, setAudit] = useState<AuditEvent[]>(seedAudit);
  const [leads, setLeads] = useState<Lead[]>(seedLeads);
  const [specialistReferrals, setSpecialistReferrals] = useState<SpecialistReferral[]>([
    {
      id: "sr-seed",
      toDiscipline: "speech_swallow",
      reason: "Swallow reassessment required before any Carelune feeding plan (baseline Day 0).",
      requestedBy: "Ravi Kumar",
      requestedByRole: "lead_physio",
      urgency: "same_day_rehab",
      status: "identified",
      separateChargeDisclosed: true,
      planOwnerRole: "speech_swallow",
      history: [
        {
          at: "Day 0",
          by: "Ravi Kumar",
          from: "identified",
          to: "identified",
          note: "Raised at baseline; feeding plan cannot be authored by Carelune until reviewed.",
        },
      ],
    },
  ]);
  /* Phase F state */
  const [reviews, setReviews] = useState<ReviewRecord[]>([]);
  const [goalStates, setGoalStates] = useState<Record<string, GoalStatus>>(() =>
    Object.fromEntries(goals.map((g) => [g.id, g.status]))
  );
  const [goalUpdates, setGoalUpdates] = useState<GoalUpdate[]>([]);
  const [barrierStates, setBarrierStates] = useState<Record<string, BarrierState>>({});
  const [barrierUpdates, setBarrierUpdates] = useState<BarrierUpdate[]>([]);
  const [programmeState, setProgrammeState] = useState<ProgrammeState>("active");
  const [renewal, setRenewal] = useState<RenewalDecision>({});
  const [wellbeing, setWellbeing] = useState<WellbeingAnswers>({});
  const [directVisits, setDirectVisits] = useState<DirectVisitRecommendation[]>([]);
  const [devMode, setDevMode] = useState(
    typeof window !== "undefined" && window.location.search.includes("dev=1")
  );
  const [templateGovernanceStatus, setTemplateStatusState] = useState<TemplateStatus>(
    protocolTemplate.status
  );
  const [templateNotes, setTemplateNotes] = useState<{ at: string; by: string; note: string }[]>([]);

  /**
   * Append-only audit. Existing entries are frozen so no code path (and no
   * user action) can edit history — only append.
   */
  const log = (e: LogInput) => {
    setAudit((prev) => [
      ...prev,
      Object.freeze({ id: `evt-${prev.length + 1}`, at: `Day ${programDay} · now`, ...e }),
    ]);
  };

  /** Teleconsultation consent, read from the Phase-B consent record. */
  const teleconsentGranted =
    leads.find((l) => l.id === "lead-anand")?.consents.teleconsultation === "granted";

  /* ---------------- Layer 3 derivation (guarded) ---------------- */

  const activeHoldFor = (interventionId: string) =>
    holds.find((h) => h.interventionId === interventionId && h.status === "active");

  /**
   * Internal ids never reach a screen or the audit timeline — a caregiver,
   * family member or clinician should read "Assisted meal" and not "iv4".
   */
  const interventionTitle = (interventionId: string) =>
    plan.interventions.find((i) => i.id === interventionId)?.title ?? "Intervention";

  /** Reachable = authored active AND complete provenance AND no active hold. */
  const reachable = (iv: Intervention) =>
    interventionReachesSchedule(iv).ok &&
    !holds.some((h) => h.interventionId === iv.id && h.status === "active");

  const schedule = useMemo(
    () =>
      plan.interventions
        .filter(reachable)
        .map((iv) => toTask(iv, plan.version))
        .sort((a, b) => a.time.localeCompare(b.time)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plan, holds]
  );

  const heldInterventions = useMemo(
    () => plan.interventions.filter((iv) => !reachable(iv)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plan, holds]
  );

  const doneCount = useMemo(
    () =>
      schedule.filter((t) => taskReports[t.id] && taskReports[t.id].status === "completed").length,
    [schedule, taskReports]
  );

  const priorities = useMemo(() => {
    const rank = { safety_critical: 0, recovery_priority: 1, routine_support: 2 } as const;
    return [...schedule]
      .filter((t) => !taskReports[t.id])
      .sort((a, b) => rank[a.priority] - rank[b.priority] || a.time.localeCompare(b.time))
      .slice(0, 3);
  }, [schedule, taskReports]);

  const restOfDay = useMemo(
    () => schedule.filter((t) => !priorities.some((p) => p.id === t.id)),
    [schedule, priorities]
  );

  /* ---------------- Exceptions ---------------- */

  /** Create an exception. Priority ALWAYS comes from an approved rule or a professional. */
  const createException = (input: {
    trigger: string;
    triggerSource: ExceptionCase["triggerSource"];
    source: string;
    interventionId?: string;
    taskId?: string;
    reason: string;
    ruleId: string;
    reporter?: string;
    reporterRole?: RoleId;
  }): string | null => {
    const rule = ruleById(input.ruleId);
    if (!rule) return null;
    let createdId: string | null = null;
    setExceptions((prev) => {
      // One open exception per source — never duplicate.
      if (prev.some((e) => e.source === input.source && !isClosed(e.status))) return prev;
      const id = `exc-${prev.length + 1}`;
      createdId = id;
      const target = RESPONSE_POLICY.targets[rule.priority];
      return [
        ...prev,
        {
          id,
          patient: "Anand Menon",
          trigger: input.trigger,
          triggerSource: input.triggerSource,
          source: input.source,
          interventionId: input.interventionId,
          taskId: input.taskId,
          reporter: input.reporter ?? "Lakshmi",
          reporterRole: input.reporterRole ?? "caregiver",
          reporterProvenance: "caregiver_reported",
          reason: input.reason,
          priority: rule.priority,
          prioritySource: `Approved rule: ${rule.name}`,
          priorityRuleId: rule.id,
          priorityRuleVersion: rule.version,
          status: "open",
          ownerRole: "coordinator",
          createdAt: `Day ${programDay} · now`,
          responseExpectation: `Pilot service target — acknowledge ${target.acknowledge}; ${target.action}. ${RESPONSE_POLICY.serviceHours}.`,
          slaState: "within",
          actions: [],
          handoffs: [],
          closureCriteria:
            rule.autoHold
              ? "Authorised professional review completed, family updated, and the hold decision recorded by a role permitted to release it."
              : "Professional review completed and family updated.",
          closure: {
            coordinatorRouting: false,
            professionalReview: false,
            familyUpdate: false,
            planAcknowledgement: false,
            followUp: false,
            clinicalResolution: false,
          },
          latestAction: "Received by Carelune",
          nextStep: "Coordinator will acknowledge and route",
        },
      ];
    });
    if (createdId) {
      log({
        roleId: input.reporterRole ?? "caregiver",
        actor: input.reporter ?? "Lakshmi",
        category: "exception",
        summary: `Help request received — ${input.source}`,
        detail: `${input.reason}. Priority ${rule.priority.replace(/_/g, " ")} set by approved rule ${rule.name} ${rule.version}.`,
        provenance: "caregiver_reported",
        source: "Caregiver app",
        after: "Open · awaiting coordinator routing",
        reason: `Rule ${rule.id} ${rule.version}`,
      });
    }
    return createdId;
  };

  /**
   * Create a clinical hold on the underlying intervention. Only an approved
   * rule or an authorised professional may do this — never a caregiver report.
   */
  const createHold = (opts: {
    interventionId: string;
    source: "approved_rule" | "professional";
    ruleId?: string;
    author: string;
    authorRole: RoleId;
    reason: string;
    reviewOwnerRole: RoleId;
    reviewDeadline: string;
    releasableByRoles: RoleId[];
  }): GuardResult => {
    const iv = plan.interventions.find((i) => i.id === opts.interventionId);
    if (!iv) return { ok: false, reason: "Unknown intervention." };
    const guard = canHoldIntervention(opts.authorRole, opts.source, iv.ownerRole);
    if (!guard.ok) return guard;
    if (holds.some((h) => h.interventionId === opts.interventionId && h.status === "active"))
      return { ok: true, reason: "Already held." };

    const rule = opts.ruleId ? ruleById(opts.ruleId) : undefined;
    setHolds((prev) => [
      ...prev,
      {
        id: `hold-${prev.length + 1}`,
        interventionId: opts.interventionId,
        source: opts.source,
        ruleId: rule?.id,
        ruleVersion: rule?.version,
        author: opts.author,
        authorRole: opts.authorRole,
        reason: opts.reason,
        heldAt: `Day ${programDay} · now`,
        reviewOwnerRole: opts.reviewOwnerRole,
        reviewDeadline: opts.reviewDeadline,
        releasableByRoles: opts.releasableByRoles,
        status: "active",
        // Guided-demo safety lock for feeding/swallowing holds.
        demoReleaseLocked: opts.releasableByRoles.includes("speech_swallow"),
      },
    ]);
    log({
      roleId: opts.authorRole,
      actor: opts.author,
      category: "plan",
      summary: `Temporary clinical hold placed — ${iv.title}`,
      detail: `${opts.reason} Review owner: ${ROLE_LABEL(opts.reviewOwnerRole)}. Release permitted by: ${opts.releasableByRoles.map(ROLE_LABEL).join(", ") || "—"}.`,
      provenance: "clinician_confirmed",
      source: rule ? `Approved rule ${rule.name} ${rule.version}` : "Professional decision",
      before: "Active",
      after: "Held",
      reason: rule ? `${rule.id} ${rule.version}` : undefined,
    });
    return { ok: true, reason: "Hold created" };
  };

  const releaseHold = (
    holdId: string,
    actorRole: RoleId,
    actor: string,
    decision: string,
    rationale: string
  ): GuardResult => {
    const hold = holds.find((h) => h.id === holdId);
    if (!hold) return { ok: false, reason: "Unknown hold." };
    if (hold.status === "released") return { ok: false, reason: "Hold already released." };
    const guard = canReleaseHold(actorRole, hold);
    if (!guard.ok) {
      log({
        roleId: actorRole,
        actor,
        category: "plan",
        summary: `Blocked: attempt to release clinical hold on ${interventionTitle(hold.interventionId)}`,
        detail: guard.reason,
        provenance: "system_metric",
        source: "Hold guard",
      });
      return guard;
    }
    setHolds((prev) =>
      prev.map((h) =>
        h.id === holdId
          ? {
              ...h,
              status: "released" as const,
              releasedBy: actor,
              releasedByRole: actorRole,
              releasedAt: `Day ${programDay} · now`,
              releaseDecision: decision,
              releaseRationale: rationale,
            }
          : h
      )
    );
    log({
      roleId: actorRole,
      actor,
      category: "plan",
      summary: `Clinical hold released — ${interventionTitle(hold.interventionId)}`,
      detail: `${decision}. ${rationale}`,
      provenance: "clinician_confirmed",
      source: "Hold release",
      before: "Held",
      after: "Active",
      reason: rationale,
    });
    return { ok: true, reason: "Released" };
  };

  /**
   * A Speech & Swallow review may record a release RECOMMENDATION without
   * releasing the hold. The demo never invents an assessment outcome, never
   * states a diet texture, and never declares feeding safe.
   */
  const recommendHoldRelease = (holdId: string, by: string, recommendation: string) => {
    const hold = holds.find((h) => h.id === holdId);
    if (!hold) return;
    setHolds((prev) =>
      prev.map((h) =>
        h.id === holdId
          ? { ...h, releaseRecommendation: recommendation, releaseRecommendedBy: by }
          : h
      )
    );
    log({
      roleId: "speech_swallow",
      actor: by,
      category: "review",
      summary: `Speech & Swallow recommendation recorded — ${interventionTitle(hold.interventionId)}`,
      detail: `${recommendation} The hold remains in place; existing verified precautions remain in effect.`,
      provenance: "clinician_confirmed",
      source: "Speech & Swallow review (simulated)",
      after: "Hold retained · recommendation recorded",
    });
  };

  const holdInterventionByProfessional = (
    interventionId: string,
    actorRole: RoleId,
    actor: string,
    reason: string
  ): GuardResult => {
    const iv = plan.interventions.find((i) => i.id === interventionId);
    if (!iv) return { ok: false, reason: "Unknown intervention." };
    return createHold({
      interventionId,
      source: "professional",
      author: actor,
      authorRole: actorRole,
      reason,
      reviewOwnerRole: iv.ownerRole,
      reviewDeadline: "Next scheduled review",
      releasableByRoles: [iv.ownerRole, "medical_clinician"],
    });
  };

  /* ---------------- Caregiver reporting ---------------- */

  /** Maps a caregiver report to today's OCCURRENCE status only. */
  const occurrenceFor = (status: TaskResultStatus): OccurrenceStatus =>
    status === "completed"
      ? "completed"
      : status === "partial"
        ? "partially_completed"
        : status === "unwell" || status === "need_help"
          ? "stopped"
          : "not_completed";

  const reportTask = (
    task: ScheduleTask,
    status: TaskResultStatus,
    reason?: string,
    note?: string
  ): GuardResult => {
    const guard = canWriteCaregiverData("caregiver");
    if (!guard.ok) return guard;

    const isFeeding =
      task.ownerRole === "speech_swallow" || /meal|feed|swallow/i.test(task.title);
    const rule = ruleForReport(status, isFeeding);
    const occurrence = occurrenceFor(status);

    setTaskReports((prev) => ({
      ...prev,
      [task.id]: {
        taskId: task.id,
        interventionId: task.interventionId,
        status,
        occurrenceStatus: occurrence,
        reason,
        note,
        at: `Day ${programDay} · now`,
        provenance: "caregiver_reported",
        ruleId: rule.id,
        ruleVersion: rule.version,
      },
    }));

    log({
      roleId: "caregiver",
      actor: "Lakshmi",
      category: "task",
      summary: `${task.title} — reported ${status.replace(/_/g, " ")}`,
      detail: [reason, note].filter(Boolean).join(" · ") || undefined,
      provenance: "caregiver_reported",
      source: "Today's priorities",
      before: "Scheduled",
      after: `Occurrence: ${occurrence.replace(/_/g, " ")}`,
      reason: `Governed by ${rule.name} ${rule.version}`,
    });

    if (status === "need_help" || status === "unwell") {
      createException({
        trigger: `Caregiver reported "${status.replace(/_/g, " ")}"`,
        triggerSource: "task",
        source: `Task: ${task.title}`,
        interventionId: task.interventionId,
        taskId: task.id,
        reason: reason ?? "Caregiver requested help",
        ruleId: rule.id,
      });
      // The underlying intervention is held ONLY when the approved rule says so.
      if (rule.autoHold && rule.holdInterventionIds.includes(task.interventionId)) {
        createHold({
          interventionId: task.interventionId,
          source: "approved_rule",
          ruleId: rule.id,
          author: `${rule.author} (via ${rule.name} ${rule.version})`,
          authorRole: rule.authorRole,
          reason: rule.rationale,
          reviewOwnerRole: rule.reviewOwnerRole,
          reviewDeadline: rule.reviewDeadline,
          releasableByRoles: rule.releasableByRoles,
        });
      }
    }
    return { ok: true, reason: `Occurrence ${occurrence}` };
  };

  /* ---------------- Medication administration ---------------- */

  const recordMedication = (medId: string, outcome: MedOutcome, reason?: string): GuardResult => {
    const guard = canRecordMedicationAdministration("caregiver");
    if (!guard.ok) return guard;
    const med = medSchedule.find((m) => m.id === medId);
    setMedRecords((prev) => ({
      ...prev,
      [medId]: {
        medId,
        outcome,
        reason,
        at: `Day ${programDay} · now`,
        provenance: "caregiver_reported",
      },
    }));
    log({
      roleId: "caregiver",
      actor: "Lakshmi",
      category: "medication",
      summary: `${med ? `${med.name} ${med.dose}` : medId} — ${outcome.replace(/_/g, " ")}`,
      detail: reason
        ? `${reason}. Administration record only — the prescription is unchanged.`
        : "Administration record only — the prescription is unchanged.",
      provenance: "caregiver_reported",
      source: "Medication record",
    });
    // Operational follow-up only — never an automatic medical monitoring claim.
    if (outcome === "not_given" || outcome === "refused") {
      addFollowUp(
        `Medication reported ${outcome.replace(/_/g, " ")} — ${med?.name ?? medId}${reason ? ` (${reason})` : ""}`,
        { roleId: "caregiver", actor: "Lakshmi" }
      );
    }
    if (outcome === "unwell") {
      createException({
        trigger: "Patient reported unwell at medication time",
        triggerSource: "medication",
        source: `Medication: ${med?.name ?? medId}`,
        reason: "Caregiver reported the patient seems unwell at medication time.",
        ruleId: "rule-unwell",
      });
    }
    return { ok: true, reason: "Recorded" };
  };

  /* ---------------- Daily check-in ---------------- */

  const submitCheckIn = (answers: CheckInAnswers) => {
    setCheckIn(answers);
    setCheckInSubmitted(true);
    const concerns: string[] = [];
    let urgent = false;
    for (const q of dailyCheckIn.questions) {
      const chosen = q.options.find((o) => o.value === answers[q.id]);
      if (!chosen) continue;
      if (chosen.urgent) {
        urgent = true;
        concerns.push(`${q.label}: ${chosen.label}`);
      } else if (chosen.concern) {
        concerns.push(`${q.label}: ${chosen.label}`);
      }
    }
    log({
      roleId: "caregiver",
      actor: "Lakshmi",
      category: "check_in",
      summary: `Daily check-in submitted${concerns.length ? ` — ${concerns.length} item(s) flagged` : " — no concerns"}`,
      detail: concerns.join(" · ") || undefined,
      provenance: "caregiver_reported",
      source: "Daily check-in",
    });
    if (concerns.length > 0) {
      addFollowUp(`Check-in flagged: ${concerns.join(" · ")}`, {
        roleId: "caregiver",
        actor: "Lakshmi",
      });
    }
    // Coughing / wet voice — the approved swallow rule applies: it stops the
    // occurrence, raises a same-day medical-priority exception, AND requires a
    // temporary hold on the feeding intervention (rule-sourced, not automatic
    // code behaviour). Other urgent answers raise a nursing review with no hold.
    const coughing = answers.feeding === "coughing";
    if (coughing || urgent) {
      const rule = ruleById(coughing ? "rule-swallow-cough" : "rule-unwell")!;
      createException({
        trigger: coughing
          ? "Coughing / wet voice reported at a meal"
          : "Urgent concern reported at check-in",
        triggerSource: "check_in",
        source: coughing
          ? "Check-in: coughing / wet voice at a meal"
          : "Check-in: urgent concern reported",
        interventionId: coughing ? "iv4" : undefined,
        reason: concerns.join(" · ") || "Urgent concern reported at check-in",
        ruleId: rule.id,
      });
      if (rule.autoHold) {
        for (const ivId of rule.holdInterventionIds) {
          createHold({
            interventionId: ivId,
            source: "approved_rule",
            ruleId: rule.id,
            author: `${rule.author} (via ${rule.name} ${rule.version})`,
            authorRole: rule.authorRole,
            reason: rule.rationale,
            reviewOwnerRole: rule.reviewOwnerRole,
            reviewDeadline: rule.reviewDeadline,
            releasableByRoles: rule.releasableByRoles,
          });
        }
      }
    }
  };

  /* ---------------- Exception lifecycle (Phase E) ---------------- */

  const patchException = (id: string, patch: (e: ExceptionCase) => ExceptionCase) =>
    setExceptions((prev) => prev.map((e) => (e.id === id ? patch(e) : e)));

  const acknowledgeException = (id: string, actorRole: RoleId, actor: string): GuardResult => {
    const exc = exceptions.find((e) => e.id === id);
    if (!exc) return { ok: false, reason: "Unknown exception." };
    patchException(id, (e) => ({
      ...e,
      status: e.status === "open" ? "acknowledged" : e.status,
      acknowledgedAt: `Day ${programDay} · now`,
      acknowledgedBy: actor,
      latestAction: "Coordinator acknowledged your request",
      nextStep: "Routing to the right professional",
    }));
    log({
      roleId: actorRole,
      actor,
      category: "exception",
      summary: `Acknowledged — ${exc.source}`,
      provenance: "system_metric",
      source: "Coordinator action queue",
      before: exc.status,
      after: "acknowledged",
    });
    return { ok: true, reason: "Acknowledged" };
  };

  const routeException = (
    id: string,
    toRole: RoleId,
    actorRole: RoleId,
    actor: string,
    reason: string
  ): GuardResult => {
    const exc = exceptions.find((e) => e.id === id);
    if (!exc) return { ok: false, reason: "Unknown exception." };
    patchException(id, (e) => ({
      ...e,
      ownerRole: toRole,
      status: "assigned",
      handoffs: [
        ...e.handoffs,
        { at: `Day ${programDay} · now`, fromRole: e.ownerRole, toRole, by: actor, reason },
      ],
      closure: { ...e.closure, coordinatorRouting: true },
      latestAction: `Routed to the ${ROLE_LABEL(toRole)}`,
      nextStep: `${ROLE_LABEL(toRole)} will review`,
    }));
    log({
      roleId: actorRole,
      actor,
      category: "exception",
      summary: `Routed to ${ROLE_LABEL(toRole)} — ${exc.source}`,
      detail: reason,
      provenance: "system_metric",
      source: "Approved routing pathway",
      before: `Owner: ${ROLE_LABEL(exc.ownerRole)}`,
      after: `Owner: ${ROLE_LABEL(toRole)}`,
      reason,
    });
    return { ok: true, reason: "Routed" };
  };

  const changeExceptionPriority = (
    id: string,
    to: ExceptionPriority,
    actorRole: RoleId,
    actor: string,
    reason: string
  ): GuardResult => {
    const exc = exceptions.find((e) => e.id === id);
    if (!exc) return { ok: false, reason: "Unknown exception." };
    const guard = canChangePriority(actorRole, exc.priority, to);
    if (!guard.ok) {
      log({
        roleId: actorRole,
        actor,
        category: "exception",
        summary: `Blocked: priority change attempt on ${exc.source}`,
        detail: guard.reason,
        provenance: "system_metric",
        source: "Priority guard",
      });
      return guard;
    }
    patchException(id, (e) => ({
      ...e,
      priority: to,
      prioritySource: `${ROLE_LABEL(actorRole)} decision — ${actor}`,
      priorityRuleId: undefined,
      priorityRuleVersion: undefined,
    }));
    log({
      roleId: actorRole,
      actor,
      category: "exception",
      summary: `Priority changed — ${exc.source}`,
      detail: reason,
      provenance: "clinician_confirmed",
      source: "Professional decision",
      before: exc.priority,
      after: to,
      reason,
    });
    return { ok: true, reason: "Priority updated" };
  };

  const addExceptionAction = (
    id: string,
    description: string,
    actorRole: RoleId,
    actor: string,
    familyVisible?: string
  ) => {
    patchException(id, (e) => ({
      ...e,
      status: e.status === "assigned" || e.status === "acknowledged" ? "in_review" : e.status,
      actions: [
        ...e.actions,
        {
          id: `act-${e.actions.length + 1}`,
          description,
          ownerRole: actorRole,
          actor,
          status: "done",
          at: `Day ${programDay} · now`,
        },
      ],
      latestAction: familyVisible ?? description,
      familyUpdate: familyVisible ?? e.familyUpdate,
    }));
    log({
      roleId: actorRole,
      actor,
      category: "exception",
      summary: `Action recorded — ${description}`,
      provenance: "clinician_confirmed",
      source: "Exception workflow",
    });
  };

  const completeClosureItem = (
    id: string,
    key: keyof ExceptionCase["closure"],
    actorRole: RoleId,
    actor: string
  ): GuardResult => {
    const exc = exceptions.find((e) => e.id === id);
    if (!exc) return { ok: false, reason: "Unknown exception." };
    // Clinical resolution is not an operational checkbox.
    if (key === "clinicalResolution") {
      const guard = canResolveClinicalException(actorRole, exc);
      if (!guard.ok) return guard;
    }
    patchException(id, (e) => ({ ...e, closure: { ...e.closure, [key]: true } }));
    log({
      roleId: actorRole,
      actor,
      category: "exception",
      summary: `Closure step complete: ${String(key)} — ${exc.source}`,
      provenance: "system_metric",
      source: "Closure checklist",
      after: String(key),
    });
    return { ok: true, reason: "Recorded" };
  };

  const resolveException = (
    id: string,
    actorRole: RoleId,
    actor: string,
    resolution: string
  ): GuardResult => {
    const exc = exceptions.find((e) => e.id === id);
    if (!exc) return { ok: false, reason: "Unknown exception." };
    const guard = canResolveClinicalException(actorRole, exc);
    if (!guard.ok) {
      log({
        roleId: actorRole,
        actor,
        category: "exception",
        summary: `Blocked: clinical resolution attempt on ${exc.source}`,
        detail: guard.reason,
        provenance: "system_metric",
        source: "Closure guard",
      });
      return guard;
    }
    patchException(id, (e) => ({
      ...e,
      status: "resolved",
      resolution,
      resolvedBy: actor,
      resolvedByRole: actorRole,
      closure: { ...e.closure, clinicalResolution: true },
      latestAction: "Care team completed their review",
      nextStep: "No further action needed unless symptoms return",
    }));
    log({
      roleId: actorRole,
      actor,
      category: "exception",
      summary: `Clinically resolved — ${exc.source}`,
      detail: resolution,
      provenance: "clinician_confirmed",
      source: "Clinical resolution",
      before: exc.status,
      after: "resolved",
      reason: resolution,
    });
    return { ok: true, reason: "Resolved" };
  };

  const reopenException = (id: string, actorRole: RoleId, actor: string, reason: string) => {
    const exc = exceptions.find((e) => e.id === id);
    if (!exc) return;
    patchException(id, (e) => ({
      ...e,
      status: "reopened",
      reopenReason: reason,
      closure: { ...e.closure, clinicalResolution: false },
      latestAction: "Reopened — the team is looking again",
    }));
    log({
      roleId: actorRole,
      actor,
      category: "exception",
      summary: `Reopened — ${exc.source}`,
      detail: reason,
      provenance: "clinician_confirmed",
      source: "Reopen",
      before: exc.status,
      after: "reopened",
      reason,
    });
  };

  /* ---------------- Nursing triage ---------------- */

  const recordTriage = (
    rec: Omit<TriageRecord, "id" | "at" | "pathwayId" | "pathwayVersion">
  ): GuardResult => {
    if (rec.byRole !== "nurse")
      return { ok: false, reason: "Only the Rehabilitation Nurse records nursing triage." };
    setTriageRecords((prev) => [
      ...prev,
      {
        ...rec,
        id: `tri-${prev.length + 1}`,
        at: `Day ${programDay} · now`,
        pathwayId: TRIAGE_PATHWAY.id,
        pathwayVersion: TRIAGE_PATHWAY.version,
      },
    ]);
    log({
      roleId: "nurse",
      actor: rec.by,
      category: "exception",
      summary: `Nursing triage completed — outcome: ${rec.outcome.replace(/_/g, " ")}`,
      detail: `Red flags ${rec.redFlagsPresent}. ${rec.note}`,
      provenance: "clinician_confirmed",
      source: `${TRIAGE_PATHWAY.name} ${TRIAGE_PATHWAY.version}`,
      after: rec.outcome,
    });
    patchException(rec.exceptionId, (e) => ({
      ...e,
      status: "action_taken",
      closure: { ...e.closure, professionalReview: true },
      latestAction: "A nurse spoke with you and documented the review",
      nextStep:
        rec.outcome === "specialist_referral_required"
          ? "Specialist review being arranged"
          : "Follow-up as advised",
    }));
    return { ok: true, reason: "Triage recorded" };
  };

  /* ---------------- Medical consultation ---------------- */

  const recordConsultation = (
    rec: Omit<ConsultationRecord, "id" | "at" | "consentConfirmed">,
    actorRole: RoleId
  ): GuardResult => {
    const guard = canStartTeleconsultation(actorRole, teleconsentGranted);
    if (!guard.ok) {
      log({
        roleId: actorRole,
        actor: rec.by,
        category: "review",
        summary: "Blocked: consultation could not start",
        detail: guard.reason,
        provenance: "system_metric",
        source: "Consent guard",
      });
      return guard;
    }
    setConsultations((prev) => [
      ...prev,
      { ...rec, id: `con-${prev.length + 1}`, at: `Day ${programDay} · now`, consentConfirmed: true },
    ]);
    log({
      roleId: actorRole,
      actor: rec.by,
      category: "review",
      summary: `Medical consultation documented — ${rec.disposition.replace(/_/g, " ")}`,
      detail: `${rec.assessment} · Advice: ${rec.advice}${rec.medicationDecision ? ` · Medication: ${rec.medicationDecision}` : ""}`,
      provenance: "clinician_confirmed",
      source: "Medical Clinician workspace (teleconsultation consent confirmed)",
    });
    if (rec.exceptionId) {
      patchException(rec.exceptionId, (e) => ({
        ...e,
        status: "action_taken",
        closure: { ...e.closure, professionalReview: true },
        latestAction: "The doctor reviewed and documented advice",
      }));
    }
    return { ok: true, reason: "Consultation recorded" };
  };

  /* ---------------- Specialist referrals ---------------- */

  const advanceReferral = (
    id: string,
    to: ReferralStatus,
    actorRole: RoleId,
    actor: string,
    note?: string
  ) => {
    setSpecialistReferrals((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              status: to,
              history: [
                ...r.history,
                { at: `Day ${programDay} · now`, by: actor, from: r.status, to, note },
              ],
            }
          : r
      )
    );
    const ref = specialistReferrals.find((r) => r.id === id);
    log({
      roleId: actorRole,
      actor,
      category: "specialist_referral",
      summary: `Referral ${to.replace(/_/g, " ")} — ${ref ? ROLE_LABEL(ref.toDiscipline) : id}`,
      detail: note,
      provenance: "clinician_confirmed",
      source: "Specialist referral lifecycle",
      before: ref?.status,
      after: to,
    });
  };

  /* ---------------- Safety events ---------------- */

  const recordSafetyEvent = (
    kind: SafetyEventKind,
    summary: string,
    actorRole: RoleId,
    actor: string,
    opts?: { exceptionId?: string; inAdverseReviewQueue?: boolean }
  ) => {
    setSafetyEvents((prev) => [
      ...prev,
      {
        id: `sev-${prev.length + 1}`,
        kind,
        exceptionId: opts?.exceptionId,
        at: `Day ${programDay} · now`,
        recordedBy: actor,
        recordedByRole: actorRole,
        summary,
        inAdverseReviewQueue: opts?.inAdverseReviewQueue ?? false,
      },
    ]);
    log({
      roleId: actorRole,
      actor,
      category: "system",
      summary: `Safety event recorded: ${kind.replace(/_/g, " ")}`,
      detail: summary,
      provenance: "clinician_confirmed",
      source: "Safety event register",
    });
  };

  const setAdverseReview = (eventId: string, inQueue: boolean, outcome: string, actor: string) => {
    setSafetyEvents((prev) =>
      prev.map((e) =>
        e.id === eventId ? { ...e, inAdverseReviewQueue: inQueue, reviewOutcome: outcome } : e
      )
    );
    log({
      roleId: "clinical_ops",
      actor,
      category: "system",
      summary: `Adverse-event review ${inQueue ? "opened" : "closed"} — ${eventId}`,
      detail: outcome,
      provenance: "clinician_confirmed",
      source: "Clinical Operations",
      after: inQueue ? "in adverse-event review queue" : "not an adverse event",
    });
  };

  /* ---------------- Phase F: reviews, goals, barriers, renewal ---------------- */

  const recordReview = (r: Omit<ReviewRecord, "id">, actorRole: RoleId): GuardResult => {
    if (actorRole === "coordinator")
      return { ok: false, reason: "The Recovery Care Coordinator cannot author a clinical review." };
    setReviews((prev) => [...prev, { ...r, id: `rev-${prev.length + 1}` }]);
    log({
      roleId: actorRole,
      actor: r.reviewer,
      category: "review",
      summary: `${r.type.replace(/_/g, " ")} review completed`,
      detail: `${r.observations} · ${r.decisions.length} plan decision(s) · next review ${r.nextReview}`,
      provenance: "clinician_confirmed",
      source: "Review engine",
      after: "Review completed",
    });
    return { ok: true, reason: "Review recorded" };
  };

  const updateGoal = (u: Omit<GoalUpdate, "at">, actorRole: RoleId): GuardResult => {
    const goal = goals.find((g) => g.id === u.goalId);
    if (!goal) return { ok: false, reason: "Unknown goal." };
    const guard = canUpdateGoal(actorRole, goal.ownerRole);
    if (!guard.ok) {
      log({
        roleId: actorRole,
        actor: u.reviewer,
        category: "review",
        summary: `Blocked: goal status change attempt on ${u.goalId}`,
        detail: guard.reason,
        provenance: "system_metric",
        source: "Goal guard",
      });
      return guard;
    }
    setGoalStates((prev) => ({ ...prev, [u.goalId]: u.to }));
    setGoalUpdates((prev) => [...prev, { ...u, at: `Day ${programDay} · now` }]);
    log({
      roleId: actorRole,
      actor: u.reviewer,
      category: "review",
      summary: `Goal ${u.goalId} — ${u.from} → ${u.to}`,
      detail: `${u.rationale} · evidence: ${u.evidenceSource}`,
      provenance: "clinician_confirmed",
      source: "Goal review",
      before: u.from,
      after: u.to,
      reason: u.rationale,
    });
    return { ok: true, reason: "Goal updated" };
  };

  const updateBarrier = (u: Omit<BarrierUpdate, "at">, actorRole: RoleId): GuardResult => {
    if (actorRole === "caregiver" || actorRole === "family")
      return { ok: false, reason: "Only professionals update barrier status." };
    setBarrierStates((prev) => ({ ...prev, [u.barrierId]: u.to }));
    setBarrierUpdates((prev) => [...prev, { ...u, at: `Day ${programDay} · now` }]);
    log({
      roleId: actorRole,
      actor: u.by,
      category: "review",
      summary: `Barrier ${u.barrierId} — ${u.to}`,
      detail: `${u.actionTaken} · goal impact: ${u.goalImpact}`,
      provenance: "clinician_confirmed",
      source: "Barrier review",
      after: u.to,
    });
    return { ok: true, reason: "Barrier updated" };
  };

  /** Apply an authorised plan decision — creates a new plan version. */
  const applyPlanDecision = (
    d: Omit<PlanDecision, "newPlanVersion">,
    actorRole: RoleId
  ): GuardResult => {
    const iv = plan.interventions.find((i) => i.id === d.interventionId);
    if (!iv) return { ok: false, reason: "Unknown intervention." };
    const guard = canDecidePlanChange(actorRole, iv.ownerRole);
    if (!guard.ok) {
      log({
        roleId: actorRole,
        actor: d.decidedBy,
        category: "plan",
        summary: `Blocked: plan change attempt on ${iv.title}`,
        detail: guard.reason,
        provenance: "system_metric",
        source: "Plan decision guard",
      });
      return guard;
    }
    const version = plan.version + 1;
    setPlan((p) => ({
      ...p,
      version,
      interventions: p.interventions.map((i) =>
        i.id === d.interventionId
          ? {
              ...i,
              status:
                d.kind === "discontinue"
                  ? ("completed" as const)
                  : d.kind === "temporary_hold"
                    ? ("held" as const)
                    : i.status,
              holdReason: d.kind === "temporary_hold" ? d.reason : i.holdReason,
              provenance: { ...i.provenance, reviewDate: d.nextReviewDate },
            }
          : i
      ),
      history: [
        ...p.history,
        {
          version,
          at: `Day ${programDay}`,
          by: d.decidedBy,
          change: `${d.kind.replace(/_/g, " ")}: ${iv.title}`,
          rationale: d.reason,
        },
      ],
    }));
    if (d.kind === "temporary_hold") {
      createHold({
        interventionId: d.interventionId,
        source: "professional",
        author: d.decidedBy,
        authorRole: actorRole,
        reason: d.reason,
        reviewOwnerRole: iv.ownerRole,
        reviewDeadline: d.nextReviewDate,
        releasableByRoles: [iv.ownerRole, "medical_clinician"],
      });
    }
    log({
      roleId: actorRole,
      actor: d.decidedBy,
      category: "plan",
      summary: `Plan v${version} — ${d.kind.replace(/_/g, " ")}: ${iv.title}`,
      detail: `${d.reason} · evidence: ${d.evidenceReviewed} · effective ${d.effectiveDate} · next review ${d.nextReviewDate}${d.caregiverAcknowledgementRequired ? " · caregiver acknowledgement required" : ""}`,
      provenance: "clinician_confirmed",
      source: "Review — plan decision",
      before: `Plan v${plan.version}`,
      after: `Plan v${version}`,
      reason: d.reason,
    });
    return { ok: true, reason: `Plan v${version}` };
  };

  const transitionProgramme = (
    to: ProgrammeState,
    actorRole: RoleId,
    actor: string,
    reason: string
  ): GuardResult => {
    const res = transitionAllowed(programmeState, to, actorRole);
    if (!res.ok) {
      log({
        roleId: actorRole,
        actor,
        category: "system",
        summary: `Blocked: programme transition ${programmeState} → ${to}`,
        detail: res.reason,
        provenance: "system_metric",
        source: "Programme state machine",
      });
      return res;
    }
    const before = programmeState;
    setProgrammeState(to);
    log({
      roleId: actorRole,
      actor,
      category: "system",
      summary: `Programme state: ${before} → ${to}`,
      detail: reason,
      provenance: "system_metric",
      source: "Programme state machine",
      before,
      after: to,
      reason,
    });
    return { ok: true, reason: "Transitioned" };
  };

  const recommendRenewal = (
    kind: RenewalDecisionKind,
    recommendation: string,
    actorRole: RoleId,
    actor: string
  ): GuardResult => {
    const guard = canRecommendRenewal(actorRole);
    if (!guard.ok) {
      log({
        roleId: actorRole,
        actor,
        category: "review",
        summary: "Blocked: renewal recommendation attempt",
        detail: guard.reason,
        provenance: "system_metric",
        source: "Renewal guard",
      });
      return guard;
    }
    setRenewal((r) => ({
      ...r,
      recommendedKind: kind,
      clinicalRecommendation: recommendation,
      recommendedBy: actor,
      recommendedByRole: actorRole,
    }));
    log({
      roleId: actorRole,
      actor,
      category: "review",
      summary: `Clinical renewal recommendation: ${kind.replace(/_/g, " ")}`,
      detail: recommendation,
      provenance: "clinician_confirmed",
      source: "Day-30 review",
    });
    return { ok: true, reason: "Recommendation recorded" };
  };

  const recordFamilyRenewalDecision = (
    decision: "accepted" | "declined" | "undecided",
    by: string
  ) => {
    setRenewal((r) => ({
      ...r,
      familyDecision: decision,
      familyDecisionBy: by,
      familyDecisionAt: `Day ${programDay}`,
    }));
    log({
      roleId: "coordinator",
      actor: "Divya",
      category: "communication",
      summary: `Family renewal decision recorded: ${decision}`,
      detail: `Decision by ${by}. Separate from the clinical recommendation.`,
      provenance: "family_reported",
      source: "Renewal discussion",
      after: decision,
    });
  };

  const activateRenewal = (actorRole: RoleId, actor: string, effectiveDate: string): GuardResult => {
    const guard = canActivateRenewal(
      actorRole,
      !!renewal.clinicalRecommendation,
      renewal.familyDecision === "accepted"
    );
    if (!guard.ok) {
      log({
        roleId: actorRole,
        actor,
        category: "payment",
        summary: "Blocked: renewal activation attempt",
        detail: guard.reason,
        provenance: "system_metric",
        source: "Renewal activation guard",
      });
      return guard;
    }
    setRenewal((r) => ({ ...r, administrativelyActivated: true, activatedBy: actor, effectiveDate }));
    log({
      roleId: actorRole,
      actor,
      category: "payment",
      summary: "Renewal administratively activated (simulated)",
      detail: `Effective ${effectiveDate}. Clinical recommendation and family decision recorded separately.`,
      provenance: "system_metric",
      source: "Renewal activation",
    });
    return { ok: true, reason: "Activated" };
  };

  const submitWellbeing = (answers: WellbeingAnswers) => {
    setWellbeing(answers);
    const concerns: string[] = [];
    for (const d of WELLBEING_DOMAINS) {
      const chosen = d.options.find((o) => o.value === answers[d.id]);
      if (chosen?.concern) concerns.push(`${d.prompt} → ${chosen.label}`);
    }
    log({
      roleId: "caregiver",
      actor: "Lakshmi",
      category: "check_in",
      summary: `Caregiver support check-in submitted${concerns.length ? ` — ${concerns.length} support need(s)` : ""}`,
      detail: concerns.join(" · ") || undefined,
      provenance: "caregiver_reported",
      source: "Caregiver support check-in (non-diagnostic)",
    });
    if (concerns.length > 0) {
      addFollowUp(`Caregiver support need: ${concerns.join(" · ")}`, {
        roleId: "caregiver",
        actor: "Lakshmi",
      });
    }
  };

  const recommendDirectVisit = (reason: string, actorRole: RoleId, actor: string) => {
    setDirectVisits((prev) => [
      ...prev,
      { id: `dv-${prev.length + 1}`, byRole: actorRole, reason, status: "recommended" },
    ]);
    log({
      roleId: actorRole,
      actor,
      category: "review",
      summary: "Direct visit recommended",
      detail: `${reason} Physical visits are arranged and paid directly to the professional — Carelune takes no commission.`,
      provenance: "clinician_confirmed",
      source: "Direct-visit recommendation",
    });
  };

  /* ---------------- Follow-ups ---------------- */

  function addFollowUp(description: string, source: { roleId: RoleId; actor: string }) {
    setFollowUps((prev) => [
      ...prev,
      { id: `fu-${prev.length + 1}`, description, ownerRole: "coordinator", status: "open" },
    ]);
    log({
      roleId: source.roleId,
      actor: source.actor,
      category: "communication",
      summary: `Reported to coordinator: ${description}`,
      detail: "Added to Divya's follow-up list.",
      provenance: source.roleId === "caregiver" ? "caregiver_reported" : "clinician_confirmed",
      source: "Caregiver app",
    });
  }

  /* ---------------- Phase B: referral / onboarding journey ---------------- */

  const patchLead = (leadId: string, patch: (l: Lead) => Lead) =>
    setLeads((prev) => prev.map((l) => (l.id === leadId ? patch(l) : l)));

  const moveStatus = (
    lead: Lead,
    to: LeadStatus,
    who: { roleId: RoleId; actor: string },
    source: string,
    reason?: string
  ) => {
    patchLead(lead.id, (l) => ({ ...l, status: to }));
    log({
      roleId: who.roleId,
      actor: who.actor,
      category: "referral",
      summary: `${lead.form.patientName}: ${STATUS_META[lead.status].label} → ${STATUS_META[to].label}`,
      provenance: "system_metric",
      source,
      before: STATUS_META[lead.status].label,
      after: STATUS_META[to].label,
      reason,
    });
  };

  const submitReferral = (form: ReferralForm): string => {
    const id = `lead-${leads.length + 1}-${form.patientName.toLowerCase().replace(/[^a-z]/g, "").slice(0, 8)}`;
    const lead: Lead = {
      id,
      form,
      status: "new_referral",
      referredAt: "Just now",
      daysSinceReferral: 0,
      physioName: "Ravi Kumar",
      coordinatorName: "Divya",
      missingInfo: ["Discharge summary not yet collected"],
      contactAttempts: [],
      consents: emptyConsents(),
      caregiverOperatesAccount: true,
      familyAccess: { requested: false },
      payment: { state: "pending" },
      onboarding: Object.fromEntries(ONBOARDING_ITEMS.map((i) => [i.id, false])),
    };
    setLeads((prev) => [lead, ...prev]);
    log({
      roleId: "lead_physio",
      actor: "Ravi Kumar",
      category: "referral",
      summary: `Referred ${form.patientName} to Carelune Neuro Continuum`,
      detail: `${form.diagnosis} · ${form.locality} · caregiver ${form.caregiverName}. Ravi remains Lead Physiotherapist.`,
      provenance: "clinician_confirmed",
      source: "Refer a patient",
      after: "New referral",
    });
    log({
      roleId: "coordinator",
      actor: "System",
      category: "communication",
      summary: `Notification sent to Divya (coordinator): new referral — ${form.patientName}`,
      provenance: "system_metric",
      source: "Referral intake",
    });
    return id;
  };

  const recordContactAttempt = (leadId: string, attempt: Omit<ContactAttempt, "at">) => {
    const lead = leads.find((l) => l.id === leadId);
    if (!lead) return;
    patchLead(leadId, (l) => ({
      ...l,
      contactAttempts: [...l.contactAttempts, { ...attempt, at: "Just now" }],
    }));
    log({
      roleId: "coordinator",
      actor: "Divya",
      category: "communication",
      summary: `Contact attempt for ${lead.form.patientName}: ${attempt.outcome.replace(/_/g, " ")}`,
      detail: attempt.note,
      provenance: "system_metric",
      source: "Referral pipeline",
    });
    if (lead.status === "new_referral" || lead.status === "contact_pending") {
      moveStatus({ ...lead }, "contact_attempted", { roleId: "coordinator", actor: "Divya" }, "Referral pipeline");
    }
  };

  const recordExplanation = (leadId: string, record: Omit<ExplanationRecord, "recordedAt">) => {
    const lead = leads.find((l) => l.id === leadId);
    if (!lead) return;
    patchLead(leadId, (l) => ({ ...l, explanation: { ...record, recordedAt: "Just now" } }));
    log({
      roleId: "coordinator",
      actor: "Divya",
      category: "communication",
      summary: `Programme explanation recorded for ${lead.form.patientName} — outcome: ${record.outcome}`,
      detail: `Attendees: ${record.attendees}. Next: ${record.nextAction}`,
      provenance: "family_reported",
      source: "Programme explanation record",
    });
    moveStatus(
      { ...lead },
      record.outcome === "declined" ? "lost_declined" : record.outcome === "interested" ? "family_interested" : "contact_attempted",
      { roleId: "coordinator", actor: "Divya" },
      "Programme explanation record"
    );
  };

  const recordSuitability = (leadId: string, record: Omit<SuitabilityRecord, "recordedAt">) => {
    const lead = leads.find((l) => l.id === leadId);
    if (!lead) return;
    patchLead(leadId, (l) => ({ ...l, suitability: { ...record, recordedAt: "Just now" } }));
    const next: LeadStatus =
      record.outcome === "administratively_ready"
        ? "eligible"
        : record.outcome === "more_info_required"
          ? "suitability_info_pending"
          : record.outcome === "route_clinical_review"
            ? "clinical_review_required"
            : "not_eligible";
    log({
      roleId: "coordinator",
      actor: "Divya",
      category: "onboarding",
      summary: `Suitability checklist recorded for ${lead.form.patientName} — ${record.outcome.replace(/_/g, " ")}`,
      detail:
        record.outcome === "route_clinical_review"
          ? "Clinical ambiguity routed to Dr. Farhan (Clinical Operations Lead)."
          : record.outcome === "not_eligible_rule"
            ? "Based on a pre-approved exclusion rule — not an independent clinical judgment."
            : undefined,
      provenance: "system_metric",
      source: "Suitability checklist",
    });
    moveStatus({ ...lead }, next, { roleId: "coordinator", actor: "Divya" }, "Suitability checklist");
  };


  /**
   * Closes the loop the coordinator opens with "route to clinical review".
   *
   * Without this a lead routed for clinical review was stranded: `eligible` was
   * only ever reachable from the coordinator's own checklist, so the referral
   * could never progress to consent. Accepting moves it to `eligible`;
   * declining ends the journey at `not_eligible`.
   */
  const decideSuitability = (
    leadId: string,
    outcome: "accepted" | "declined",
    rationale: string,
    actorRole: RoleId,
    actor: string
  ): GuardResult => {
    const lead = leads.find((l) => l.id === leadId);
    if (!lead) return { ok: false, reason: "Unknown referral." };
    if (lead.status !== "clinical_review_required")
      return { ok: false, reason: "This referral is not awaiting a clinical suitability review." };

    const guard = canDecideSuitability(actorRole);
    if (!guard.ok) {
      log({
        roleId: actorRole,
        actor,
        category: "onboarding",
        summary: `Blocked: clinical suitability decision attempt for ${lead.form.patientName}`,
        detail: guard.reason,
        provenance: "system_metric",
        source: "Suitability decision guard",
      });
      return guard;
    }

    const concerns = Object.entries(lead.suitability?.answers ?? {})
      .filter(([id, a]) => {
        const item = SUITABILITY_ITEMS.find((i) => i.id === id);
        return item?.clinical && a === item.concernIf;
      })
      .map(([id]) => SUITABILITY_ITEMS.find((i) => i.id === id)?.label ?? id);

    patchLead(leadId, (l) => ({
      ...l,
      suitabilityDecision: {
        outcome,
        rationale,
        decidedBy: actor,
        decidedByRole: actorRole,
        decidedAt: `Day ${programDay}`,
        reviewedConcerns: concerns,
      },
    }));
    log({
      roleId: actorRole,
      actor,
      category: "onboarding",
      summary: `Clinical suitability ${outcome} — ${lead.form.patientName}`,
      detail: `${rationale}${concerns.length ? ` · Concerns reviewed: ${concerns.join(", ")}` : ""}`,
      provenance: "clinician_confirmed",
      source: "Clinical suitability review (demonstration — not a clinical determination)",
      before: "Clinical suitability review",
      after: outcome === "accepted" ? "Eligible" : "Not eligible",
      reason: rationale,
    });
    moveStatus(
      { ...lead },
      outcome === "accepted" ? "eligible" : "not_eligible",
      { roleId: actorRole, actor },
      "Clinical suitability review",
      rationale
    );
    return { ok: true, reason: outcome === "accepted" ? "Eligible" : "Not eligible" };
  };

  const beginConsent = (leadId: string) => {
    const lead = leads.find((l) => l.id === leadId);
    if (!lead || lead.status !== "eligible") return;
    moveStatus(lead, "consent_pending", { roleId: "coordinator", actor: "Divya" }, "Consent & payment");
  };

  const setConsent = (leadId: string, type: ConsentType, status: ConsentStatus) => {
    const lead = leads.find((l) => l.id === leadId);
    if (!lead) return;
    patchLead(leadId, (l) => ({ ...l, consents: { ...l.consents, [type]: status } }));
    log({
      roleId: "coordinator",
      actor: "Divya",
      category: "consent",
      summary: `${CONSENT_META[type].label}: ${status} — ${lead.form.patientName}`,
      provenance: "family_reported",
      source: "Consent record (simulated, v1.0)",
    });
    const updatedLead: Lead = { ...lead, consents: { ...lead.consents, [type]: status } };
    if (activationConsentsGranted(updatedLead) && lead.status === "consent_pending") {
      moveStatus(
        { ...lead },
        "payment_pending",
        { roleId: "coordinator", actor: "Divya" },
        "Consent record",
        "All activation-required consents recorded. Teleconsultation and media consents gate their own first use."
      );
    }
  };

  const setFamilyAccess = (leadId: string, record: FamilyAccessRecord) => {
    const lead = leads.find((l) => l.id === leadId);
    if (!lead) return;
    patchLead(leadId, (l) => ({ ...l, familyAccess: record }));
    log({
      roleId: "coordinator",
      actor: "Divya",
      category: "consent",
      summary: record.requested
        ? `Family access requested for ${lead.form.patientName} — ${record.authorisedMember ?? "member TBC"}`
        : `Family access marked not required for ${lead.form.patientName}`,
      detail: record.requested
        ? `Scope: ${record.permittedScope ?? "—"} · start: ${record.accessStart ?? "on activation"}${record.withdrawnDate ? ` · withdrawn: ${record.withdrawnDate}` : ""}`
        : "Programme can activate without family-access consent.",
      provenance: "family_reported",
      source: "Consent record",
    });
  };

  const recordPayment = (leadId: string) => {
    const lead = leads.find((l) => l.id === leadId);
    if (!lead || lead.payment.state === "paid") return;
    patchLead(leadId, (l) => ({
      ...l,
      payment: { state: "paid", date: "Today", receiptRef: `CLN-2026-${String(1000 + leads.length)}` },
    }));
    log({
      roleId: "coordinator",
      actor: "Divya",
      category: "payment",
      summary: `₹5,999 programme payment recorded (simulated) — ${lead.form.patientName}`,
      provenance: "system_metric",
      source: "Payment status",
    });
    if (lead.status === "payment_pending") {
      moveStatus({ ...lead }, "onboarding_pending", { roleId: "coordinator", actor: "Divya" }, "Payment status");
    }
  };

  const toggleOnboarding = (leadId: string, itemId: string) => {
    const lead = leads.find((l) => l.id === leadId);
    if (!lead) return;
    const nowDone = !lead.onboarding[itemId];
    patchLead(leadId, (l) => ({ ...l, onboarding: { ...l.onboarding, [itemId]: nowDone } }));
    const item = ONBOARDING_ITEMS.find((i) => i.id === itemId);
    log({
      roleId: "coordinator",
      actor: "Divya",
      category: "onboarding",
      summary: `Onboarding: ${item?.label ?? itemId} ${nowDone ? "completed" : "reopened"} — ${lead.form.patientName}`,
      provenance: "system_metric",
      source: "Caregiver onboarding checklist",
    });
    const allDone = ONBOARDING_ITEMS.every((i) => (i.id === itemId ? nowDone : lead.onboarding[i.id]));
    if (allDone && lead.status === "onboarding_pending") {
      moveStatus(
        { ...lead },
        "plan_activation_pending",
        { roleId: "coordinator", actor: "Divya" },
        "Caregiver onboarding checklist",
        "Awaiting baseline assessment and plan approval by the Lead Physiotherapist."
      );
    }
  };

  const activationReadiness = (lead: Lead): ActivationReadiness => ({
    requiredConsents: activationConsentsGranted(lead),
    payment: lead.payment.state === "paid" || lead.payment.state === "waived",
    onboarding: ONBOARDING_ITEMS.every((i) => lead.onboarding[i.id]),
    physioConfirmed: lead.form.leadPhysioConfirmed,
    // KNOWN LIMITATION (blocker 2): only one patient has an expanded clinical
    // record in this build, so these two gates are still an identity test. A
    // newly referred patient therefore reaches `eligible` and can complete
    // consent/payment/onboarding, but cannot ACTIVATE until per-patient
    // baselines and plans exist. That is the patient-scoped-state work.
    baselineRecorded: lead.id === EXPANDED_RECORD_LEAD,
    planApproved: lead.id === EXPANDED_RECORD_LEAD && Boolean(plan.approvedAt),
  });

  /* ---------------- Phase C: planning, referrals, governance ---------------- */

  /** Audit trail for AI-assisted discovery — surfacing is not drafting. */
  const logDiscovery = (kind: "surfaced" | "reviewed" | "selected", detail: string) => {
    const summary =
      kind === "surfaced"
        ? "AI-assisted content surfaced"
        : kind === "reviewed"
          ? "Professional reviewed surfaced content"
          : "Professional selected content";
    log({
      roleId: "lead_physio",
      actor: kind === "surfaced" ? "Carelune (AI-assisted discovery)" : "Ravi Kumar",
      category: "plan",
      summary,
      detail,
      provenance: kind === "surfaced" ? "system_metric" : "clinician_confirmed",
      source: "Approved-content discovery",
    });
  };

  const approvePlanAddition = (input: PlanAdditionInput, actorRole: RoleId): GuardResult => {
    const content = contentLibrary.find((c) => c.id === input.contentId);
    if (!content) return { ok: false, reason: "Unknown content item." };
    const goal = goals.find((g) => g.id === input.goalId);
    if (!goal) return { ok: false, reason: "Unknown goal." };

    const selectable = contentSelectable(content);
    if (!selectable.ok) {
      log({
        roleId: actorRole,
        actor: "Ravi Kumar",
        category: "plan",
        summary: `Blocked: cannot add ${content.title}`,
        detail: selectable.reason,
        provenance: "system_metric",
        source: "Plan builder guard",
      });
      return selectable;
    }
    const permitted = canApproveIntervention(actorRole, content.discipline, goal.ownerRole);
    if (!permitted.ok) {
      log({
        roleId: actorRole,
        actor: "Ravi Kumar",
        category: "plan",
        summary: `Blocked: cannot approve ${content.title}`,
        detail: permitted.reason,
        provenance: "system_metric",
        source: "Plan builder guard",
      });
      return permitted;
    }

    const version = plan.version + 1;
    const ivId = `iv-${version}-${content.id}`;
    const safety = [
      ...content.stopConditions,
      ...(input.extraSafetyNote ? [input.extraSafetyNote] : []),
    ];
    const intervention: Intervention = {
      id: ivId,
      goalId: input.goalId,
      contentId: content.id,
      title: content.title,
      caregiverTitle: input.caregiverTitle?.trim() || content.title,
      kind: "clinical",
      ownerRole: content.discipline,
      deliveryMode: input.deliveryMode,
      dose: input.dose,
      frequency: input.frequency,
      assistance: input.assistance,
      equipment: content.equipment,
      instructions: content.instructions,
      whyItMatters: goal.patientWording,
      precautions: content.precautions,
      safetyInstructions: safety,
      scheduleSegment: input.scheduleSegment,
      scheduleTime: input.scheduleTime,
      timeWindow: `${input.scheduleSegment} · around ${input.scheduleTime}`,
      priority: "recovery_priority",
      priorityReason: `Supports: ${goal.clinicalFormulation}`,
      rationale: input.rationale,
      status: "active",
      addedInVersion: version,
      provenance: {
        sourceKind: "carelune_content",
        sourceVersion: `Content ${content.id} ${content.version} · Pathway ${protocolTemplate.version}`,
        approvedBy: "Ravi Kumar",
        approverRole: actorRole,
        approvedAt: `Day ${programDay}`,
        reviewDate: "Day 14",
      },
    };

    // Provenance completeness is re-checked at the schedule gate; refuse early
    // if the derived intervention could not lawfully reach the caregiver.
    const gate = interventionReachesSchedule(intervention);
    if (!gate.ok) return gate;

    setPlan((p) => ({
      ...p,
      version,
      interventions: [...p.interventions, intervention],
      approvedAt: `Day ${programDay}`,
      history: [
        ...p.history,
        {
          version,
          at: `Day ${programDay}`,
          by: "Ravi Kumar",
          change: `Added: ${content.title} (${content.version})`,
          rationale: input.rationale,
        },
      ],
    }));

    log({
      roleId: actorRole,
      actor: "Ravi Kumar",
      category: "plan",
      summary: "Professional personalised the intervention",
      detail: `${content.title}: ${input.dose}, ${input.frequency} · ${input.assistance} · ${input.scheduleSegment} ${input.scheduleTime}`,
      provenance: "clinician_confirmed",
      source: "Plan builder",
    });
    log({
      roleId: actorRole,
      actor: "Ravi Kumar",
      category: "plan",
      summary: `Professional approved — plan v${version} active`,
      detail: `${content.title} · source ${content.id} ${content.version} · pathway ${protocolTemplate.version} · review Day 14.`,
      provenance: "clinician_confirmed",
      source: "Plan builder",
      before: `Plan v${plan.version}`,
      after: `Plan v${version}`,
      reason: input.rationale,
    });
    return { ok: true, reason: `Plan v${version} active` };
  };

  const createSpecialistReferral = (
    toDiscipline: RoleId,
    reason: string,
    source: string,
    opts?: { exceptionId?: string; requestedBy?: string; requestedByRole?: RoleId }
  ) => {
    const by = opts?.requestedBy ?? "Ravi Kumar";
    setSpecialistReferrals((prev) => {
      const existing = prev.find(
        (r) => r.toDiscipline === toDiscipline && r.status !== "closed" && r.status !== "cancelled"
      );
      // Link an existing open referral to the incident that re-raised it.
      if (existing)
        return prev.map((r) =>
          r.id === existing.id && opts?.exceptionId && !r.exceptionId
            ? {
                ...r,
                exceptionId: opts.exceptionId,
                reason,
                history: [
                  ...r.history,
                  {
                    at: `Day ${programDay} · now`,
                    by,
                    from: r.status,
                    to: r.status,
                    note: `Linked to ${opts.exceptionId}: ${reason}`,
                  },
                ],
              }
            : r
        );
      return [
        ...prev,
        {
          id: `sr-${prev.length + 1}`,
          toDiscipline,
          reason,
          requestedBy: by,
          requestedByRole: opts?.requestedByRole ?? "lead_physio",
          urgency: "same_day_rehab",
          status: "identified",
          exceptionId: opts?.exceptionId,
          separateChargeDisclosed: true,
          planOwnerRole: toDiscipline,
          history: [
            { at: `Day ${programDay} · now`, by, from: "identified", to: "identified", note: reason },
          ],
        },
      ];
    });
    log({
      roleId: "lead_physio",
      actor: "Ravi Kumar",
      category: "specialist_referral",
      summary: `Specialist referral recommended — ${toDiscipline.replace(/_/g, " ")}`,
      detail: `${reason} Divya will coordinate scheduling; the specialist owns any resulting intervention.`,
      provenance: "clinician_confirmed",
      source,
    });
  };

  const setTemplateGovernanceStatus = (s: TemplateStatus, note: string) => {
    const before = templateGovernanceStatus;
    setTemplateStatusState(s);
    setTemplateNotes((prev) => [...prev, { at: `Day ${programDay}`, by: "Dr. Meera", note }]);
    log({
      roleId: "pmr",
      actor: "Dr. Meera",
      category: "plan",
      summary: `Simulated governance status: ${s} — ${protocolTemplate.name} ${protocolTemplate.version}`,
      detail: `${note} Clinical-use status is unchanged: demonstration only — not approved for real patient care.`,
      provenance: "clinician_confirmed",
      source: "Template governance",
      before,
      after: s,
    });
  };

  const addTemplateNote = (note: string) => {
    setTemplateNotes((prev) => [...prev, { at: `Day ${programDay}`, by: "Dr. Meera", note }]);
    log({
      roleId: "pmr",
      actor: "Dr. Meera",
      category: "plan",
      summary: `Governance note added — ${protocolTemplate.name}`,
      detail: note,
      provenance: "clinician_confirmed",
      source: "Template governance",
    });
  };

  const store: CareluneStore = {
    programDay,
    schedule,
    heldInterventions,
    taskReports,
    reportTask,
    doneCount,
    priorities,
    restOfDay,
    medRecords,
    recordMedication,
    checkIn,
    submitCheckIn,
    checkInSubmitted,
    exceptions,
    holds,
    activeHoldFor,
    interventionTitle,
    releaseHold,
    holdInterventionByProfessional,
    acknowledgeException,
    routeException,
    changeExceptionPriority,
    addExceptionAction,
    completeClosureItem,
    resolveException,
    reopenException,
    triageRecords,
    recordTriage,
    consultations,
    recordConsultation,
    safetyEvents,
    recordSafetyEvent,
    setAdverseReview,
    advanceReferral,
    reviews,
    recordReview,
    goalStates,
    goalUpdates,
    updateGoal,
    barrierStates,
    barrierUpdates,
    updateBarrier,
    applyPlanDecision,
    programmeState,
    transitionProgramme,
    renewal,
    recommendRenewal,
    recordFamilyRenewalDecision,
    activateRenewal,
    wellbeing,
    submitWellbeing,
    directVisits,
    recommendDirectVisit,
    teleconsentGranted,
    devMode,
    setDevMode,
    recommendHoldRelease,
    followUps,
    addFollowUp,
    leads,
    submitReferral,
    recordContactAttempt,
    recordExplanation,
    recordSuitability,
    decideSuitability,
    beginConsent,
    setConsent,
    setFamilyAccess,
    recordPayment,
    toggleOnboarding,
    activationReadiness,
    plan,
    approvePlanAddition,
    logDiscovery,
    specialistReferrals,
    createSpecialistReferral,
    templateGovernanceStatus,
    templateNotes,
    setTemplateGovernanceStatus,
    addTemplateNote,
    audit,
    log,
  };

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useCarelune(): CareluneStore {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useCarelune must be used inside CareluneProvider");
  return ctx;
}

export { FEEDING_INCIDENT_GUIDANCE };
