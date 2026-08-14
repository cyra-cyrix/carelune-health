/**
 * Store-level permission and safety guards.
 *
 * These are pure functions used by the shared store BEFORE any state change —
 * hiding a button is never the enforcement point. Every guard returns a reason
 * so refusals can be surfaced and audited.
 */
import type {
  ClinicalHold,
  ContentItem,
  ExceptionCase,
  ExceptionPriority,
  Intervention,
  RoleId,
} from "./types";

export interface GuardResult {
  ok: boolean;
  reason: string;
}

const allow = (reason = "Permitted"): GuardResult => ({ ok: true, reason });
const deny = (reason: string): GuardResult => ({ ok: false, reason });

/** Roles that may approve a clinical intervention — only the owning discipline. */
export function canApproveIntervention(
  actorRole: RoleId,
  contentDiscipline: RoleId,
  goalOwnerRole: RoleId
): GuardResult {
  if (actorRole === "coordinator")
    return deny("The Recovery Care Coordinator cannot approve or activate clinical interventions.");
  if (actorRole === "caregiver" || actorRole === "family")
    return deny("Caregivers and family cannot approve clinical interventions.");
  if (contentDiscipline !== actorRole)
    return deny(
      `${roleName(actorRole)} cannot approve ${roleName(contentDiscipline)} interventions — refer to that discipline instead.`
    );
  if (goalOwnerRole !== actorRole)
    return deny(
      `This goal is owned by the ${roleName(goalOwnerRole)} — its interventions must be approved by that discipline.`
    );
  return allow();
}

/** Only approved, in-date content may enter a plan. */
export function contentSelectable(item: ContentItem): GuardResult {
  if (item.approval === "draft") return deny("Draft content cannot enter an active plan.");
  if (item.approval === "expired") return deny("Expired content cannot enter an active plan.");
  return allow();
}

/** Provenance completeness — an intervention may only reach a caregiver with a full chain. */
export function provenanceComplete(iv: Intervention): GuardResult {
  const p = iv.provenance;
  if (!p) return deny("No provenance recorded.");
  const missing: string[] = [];
  if (!iv.ownerRole) missing.push("clinical owner");
  if (!p.sourceVersion) missing.push("source version");
  if (!p.approvedBy) missing.push("approving professional");
  if (!p.approvedAt) missing.push("approval date");
  if (!p.reviewDate) missing.push("review date");
  if (!iv.dose || !iv.frequency) missing.push("patient-specific parameters");
  if (iv.kind === "clinical" && iv.safetyInstructions.length === 0)
    missing.push("stop conditions");
  if (p.sourceKind === "discharge_plan") {
    const d = p.discharge;
    if (!d) missing.push("discharge-plan source record");
    else {
      if (!d.document) missing.push("discharge document");
      if (!d.institution) missing.push("issuing institution");
      if (!d.issuingProfessional) missing.push("issuing professional");
      if (!d.documentDate) missing.push("document date");
      if (d.verificationStatus !== "verified") missing.push("verification status");
      if (!d.transcribedBy) missing.push("transcriber");
      if (!d.confirmedCurrentBy) missing.push("confirmation that it remains current");
    }
  }
  return missing.length === 0
    ? allow()
    : deny(`Incomplete provenance: ${missing.join(", ")}.`);
}

/** Gate for Layer 3: what may appear on the caregiver's schedule. */
export function interventionReachesSchedule(iv: Intervention): GuardResult {
  if (iv.status === "held")
    return deny(iv.holdReason ?? "Intervention is held pending professional review.");
  if (iv.status === "completed") return deny("Intervention is completed.");
  const prov = provenanceComplete(iv);
  if (!prov.ok) return prov;
  return allow();
}

/** Only the Medical Clinician may author medication changes. */
export function canChangeMedication(actorRole: RoleId): GuardResult {
  return actorRole === "medical_clinician"
    ? allow()
    : deny(
        `${roleName(actorRole)} cannot change medication — medication decisions require a documented Medical Clinician consultation.`
      );
}

/** Caregiver medication reporting never modifies the instruction itself. */
export function canRecordMedicationAdministration(actorRole: RoleId): GuardResult {
  return actorRole === "caregiver"
    ? allow("Caregiver records administration only — the instruction is unchanged.")
    : deny("Only the caregiver records administration in this demo.");
}

/** Plan activation is a clinical act. */
export function canActivatePlan(actorRole: RoleId): GuardResult {
  if (actorRole === "coordinator")
    return deny("The Recovery Care Coordinator cannot activate a clinical plan.");
  if (actorRole === "lead_physio" || actorRole === "pmr" || actorRole === "medical_clinician")
    return allow();
  return deny(`${roleName(actorRole)} cannot activate a clinical plan.`);
}

/** AI never adds an intervention — discovery surfaces approved content only. */
export function canAiAddIntervention(): GuardResult {
  return deny(
    "AI-assisted discovery surfaces approved content only. A professional must review, select, personalise and approve."
  );
}

/** Write permissions for role-scoped data. */
export function canWriteCaregiverData(actorRole: RoleId): GuardResult {
  return actorRole === "caregiver"
    ? allow()
    : deny(`${roleName(actorRole)} cannot record caregiver execution data.`);
}

export function canWriteClinicalData(actorRole: RoleId): GuardResult {
  if (actorRole === "family" || actorRole === "caregiver")
    return deny(`${roleName(actorRole)} has read-only access to clinical data.`);
  return allow();
}

/** Family/payer access scope stored at consent time (Phase B). */
export const FAMILY_SCOPE_BLOCKED = [
  "coordinator_private_notes",
  "research_information",
  "suitability_internal",
  "payment_internal_detail",
] as const;
export type FamilyBlockedScope = (typeof FAMILY_SCOPE_BLOCKED)[number];

export function familyMaySee(scope: string): GuardResult {
  return (FAMILY_SCOPE_BLOCKED as readonly string[]).includes(scope)
    ? deny(`Outside the authorised family-access scope: ${scope}.`)
    : allow();
}

/* ---------------- Phase E: holds, priority, triage, consultation, closure ---------------- */

/**
 * Only the roles named on the hold may release it. Caregivers never can.
 *
 * Production hold-release authority is deliberately CONFIGURABLE and remains an
 * unresolved clinical/legal decision. In the guided demo the swallow hold is
 * additionally locked: no role releases it in-app — only a simulated Speech &
 * Swallow review may record a release *recommendation*, and the safe end state
 * is "specialist review arranged; existing verified precautions remain".
 */
export function canReleaseHold(actorRole: RoleId, hold: ClinicalHold): GuardResult {
  if (actorRole === "caregiver" || actorRole === "family")
    return deny("A caregiver or family member cannot release a clinical hold.");
  if (actorRole === "coordinator")
    return deny("The Recovery Care Coordinator cannot release a clinical hold.");
  if (hold.demoReleaseLocked)
    return deny(
      "Demo safety lock: the feeding/swallowing hold is not released in this demo. Only a Speech & Swallow review may recommend release, and production release authority is still under clinical/legal review."
    );
  if (!hold.releasableByRoles.includes(actorRole))
    return deny(
      `${roleName(actorRole)} cannot release this hold — it may be released by: ${hold.releasableByRoles
        .map(roleName)
        .join(", ")}.`
    );
  return allow();
}

/** Only an approved rule or an authorised professional may hold an intervention. */
export function canHoldIntervention(
  actorRole: RoleId,
  source: "approved_rule" | "professional",
  interventionOwnerRole: RoleId
): GuardResult {
  if (source === "approved_rule") return allow("Automatic hold required by an approved rule.");
  if (actorRole === "caregiver" || actorRole === "family")
    return deny("Caregivers and family cannot hold a clinical intervention.");
  if (actorRole === "coordinator")
    return deny("The Recovery Care Coordinator cannot hold a clinical intervention.");
  if (actorRole !== interventionOwnerRole && actorRole !== "medical_clinician" && actorRole !== "clinical_ops")
    return deny(
      `${roleName(actorRole)} cannot hold a ${roleName(interventionOwnerRole)} intervention.`
    );
  return allow();
}

/** Priority is never lowered by the coordinator, and never set by AI. */
export function canChangePriority(
  actorRole: RoleId,
  from: ExceptionPriority,
  to: ExceptionPriority
): GuardResult {
  const rank: Record<ExceptionPriority, number> = {
    emergency: 0,
    same_day_medical: 1,
    same_day_rehab: 2,
    nursing_review: 3,
    operational_followup: 4,
    routine_observation: 5,
  };
  if (actorRole === "coordinator" && rank[to] > rank[from])
    return deny("The Recovery Care Coordinator cannot reduce a clinical priority.");
  if (actorRole === "caregiver" || actorRole === "family")
    return deny(`${roleName(actorRole)} cannot change exception priority.`);
  return allow();
}

export function canAiAssignPriority(): GuardResult {
  return deny(
    "Priority must come from an approved configured rule or an authorised professional decision — never from AI."
  );
}

export function canAiCloseException(): GuardResult {
  return deny("AI cannot close a clinical exception.");
}

/** The nurse works within the approved pathway only. */
export function canApproveSwallowCare(actorRole: RoleId): GuardResult {
  return actorRole === "speech_swallow"
    ? allow()
    : deny(
        `${roleName(actorRole)} cannot approve, change or declare swallowing care safe — that belongs to the Speech & Swallow Therapist.`
      );
}

export function canDiagnose(actorRole: RoleId): GuardResult {
  if (actorRole === "medical_clinician" || actorRole === "clinical_ops") return allow();
  return deny(`${roleName(actorRole)} cannot make or record a diagnosis.`);
}

/** Teleconsultation requires the teleconsultation consent recorded in Phase B. */
export function canStartTeleconsultation(
  actorRole: RoleId,
  teleconsentGranted: boolean
): GuardResult {
  if (actorRole !== "medical_clinician")
    return deny(`${roleName(actorRole)} cannot start a medical teleconsultation.`);
  if (!teleconsentGranted)
    return deny("Teleconsultation consent has not been recorded — consultation cannot start.");
  return allow();
}

/**
 * Clinical resolution requires a clinical role. A coordinator may complete
 * their own operational actions but cannot clinically resolve.
 */
export function canResolveClinicalException(
  actorRole: RoleId,
  exception: ExceptionCase
): GuardResult {
  if (actorRole === "coordinator")
    return deny(
      "The Recovery Care Coordinator can complete operational routing but cannot clinically resolve an exception."
    );
  if (actorRole === "caregiver" || actorRole === "family")
    return deny(`${roleName(actorRole)} cannot resolve a clinical exception.`);
  if (!exception.closure.professionalReview)
    return deny("A professional review must be completed before clinical resolution.");
  return allow();
}

/** Clinical Operations may not silently alter another discipline's intervention. */
export function canAlterOthersIntervention(
  actorRole: RoleId,
  interventionOwnerRole: RoleId
): GuardResult {
  if (actorRole === interventionOwnerRole) return allow();
  return deny(
    `${roleName(actorRole)} cannot alter a ${roleName(interventionOwnerRole)} intervention — request a review by that discipline.`
  );
}

/* ---------------- Phase F: reviews, goals, renewal ---------------- */

/** A plan decision may only be made by the intervention's owning discipline. */
export function canDecidePlanChange(
  actorRole: RoleId,
  interventionOwnerRole: RoleId
): GuardResult {
  if (actorRole === "coordinator")
    return deny("The Recovery Care Coordinator cannot make plan changes.");
  if (actorRole === "caregiver" || actorRole === "family")
    return deny(`${roleName(actorRole)} cannot make plan changes.`);
  if (actorRole !== interventionOwnerRole)
    return deny(
      `${roleName(actorRole)} cannot change a ${roleName(interventionOwnerRole)} intervention — it stays pending until that discipline approves.`
    );
  return allow();
}

/** Goal status is a professional judgement, never inferred from task completion. */
export function canUpdateGoal(actorRole: RoleId, goalOwnerRole: RoleId): GuardResult {
  if (actorRole === "coordinator" || actorRole === "caregiver" || actorRole === "family")
    return deny(`${roleName(actorRole)} cannot change goal status.`);
  if (actorRole !== goalOwnerRole)
    return deny(
      `${roleName(actorRole)} cannot change a goal owned by the ${roleName(goalOwnerRole)}.`
    );
  return allow();
}

export function canAiDecideReview(): GuardResult {
  return deny(
    "AI may summarise facts, patterns and questions only. Progression, regression, intervention change, referral, hold/release and goal achievement are professional decisions."
  );
}

/** Task completion never achieves a goal by itself. */
export function canAutoAchieveGoalFromTasks(): GuardResult {
  return deny(
    "A goal cannot be marked achieved because tasks were completed — it requires a professional judgement with evidence."
  );
}

/** The clinical renewal recommendation is a clinical act. */
export function canRecommendRenewal(actorRole: RoleId): GuardResult {
  if (actorRole === "coordinator")
    return deny(
      "The Recovery Care Coordinator facilitates the renewal discussion but cannot make the clinical recommendation."
    );
  if (actorRole === "caregiver" || actorRole === "family")
    return deny(`${roleName(actorRole)} cannot make a clinical recommendation.`);
  return allow();
}

/** Administrative activation is separate from both recommendation and decision. */
export function canActivateRenewal(
  actorRole: RoleId,
  hasClinicalRecommendation: boolean,
  familyAccepted: boolean
): GuardResult {
  if (actorRole !== "coordinator" && actorRole !== "clinical_ops")
    return deny(`${roleName(actorRole)} cannot administratively activate a renewal.`);
  if (!hasClinicalRecommendation)
    return deny("A clinical recommendation must be recorded before activation.");
  if (!familyAccepted)
    return deny("The family decision must be recorded before activation.");
  return allow();
}

function roleName(r: RoleId): string {
  return r
    .split("_")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(" ");
}

/**
 * Who may declare a patient clinically suitable for the programme.
 *
 * The freeze pack assigns "patient-suitability decisions" to the Clinical
 * Operations Lead; the Medical Clinician may also decide. The coordinator runs
 * the operational checklist and routes clinical ambiguity onward, but must
 * never resolve it — otherwise an operational role would be making an
 * eligibility call about a stroke patient.
 */
export function canDecideSuitability(actorRole: RoleId): GuardResult {
  if (actorRole === "clinical_ops" || actorRole === "medical_clinician") return allow();
  if (actorRole === "coordinator")
    return deny(
      "The Recovery Care Coordinator records the suitability checklist but cannot make the clinical suitability decision."
    );
  return deny("Only the Clinical Operations Lead or Medical Clinician decides clinical suitability.");
}
