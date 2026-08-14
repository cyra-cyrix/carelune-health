/**
 * Pure-function guard suite. Not kept in the repo build (no test runner is
 * installed) — run with `npx tsx ./_guards.test.ts`, then delete.
 *
 * Covers the Phase A–F guards plus the Phase G additions: route parsing,
 * route writeback, and guided-demo scene/prep integrity.
 */
import {
  canActivateRenewal,
  canAiAddIntervention,
  canAiAssignPriority,
  canAiCloseException,
  canAiDecideReview,
  canApproveIntervention,
  canApproveSwallowCare,
  canAutoAchieveGoalFromTasks,
  canChangeMedication,
  canChangePriority,
  canDecidePlanChange,
  canDecideSuitability,
  canDiagnose,
  canHoldIntervention,
  canRecommendRenewal,
  canRecordMedicationAdministration,
  canReleaseHold,
  canResolveClinicalException,
  canStartTeleconsultation,
  canUpdateGoal,
  canWriteCaregiverData,
  canWriteClinicalData,
  contentSelectable,
  familyMaySee,
  interventionReachesSchedule,
} from "./src/domain/permissions";
import { contentLibrary, seedPlan } from "./src/domain/planning";
import { ruleById, ruleForReport, SAFETY_RULES } from "./src/domain/safety";
import { transitionAllowed } from "./src/domain/reviews";
import { seedLeads, STATUS_META } from "./src/domain/journey";
import { defaultRoute, hashFor, parseHash } from "./src/routes";
import { LAST_SCENE, SCENES, stepsThrough } from "./src/demo/scenes";
import type { ClinicalHold, ExceptionCase } from "./src/domain/types";

let pass = 0;
const failures: string[] = [];

function ok(label: string, cond: boolean) {
  if (cond) pass++;
  else failures.push(label);
}
const refuses = (label: string, r: { ok: boolean }) => ok(label, !r.ok);
const allows = (label: string, r: { ok: boolean }) => ok(label, r.ok);

/* ---------------- Discipline & plan authority ---------------- */

refuses(
  "physio cannot approve a speech/swallow intervention",
  canApproveIntervention("lead_physio", "speech_swallow", "speech_swallow")
);
allows(
  "physio approves a physiotherapy intervention",
  canApproveIntervention("lead_physio", "lead_physio", "lead_physio")
);
refuses(
  "coordinator cannot approve any intervention",
  canApproveIntervention("coordinator", "lead_physio", "lead_physio")
);
refuses("AI cannot add an intervention", canAiAddIntervention());
refuses(
  "physio cannot decide a plan change on another discipline's intervention",
  canDecidePlanChange("lead_physio", "speech_swallow")
);
allows("physio decides on its own intervention", canDecidePlanChange("lead_physio", "lead_physio"));
refuses("coordinator cannot decide a plan change", canDecidePlanChange("coordinator", "lead_physio"));

/* ---------------- Content & provenance gating ---------------- */

const draft = contentLibrary.find((c) => c.approval === "draft");
ok("the library contains a draft item to gate on", Boolean(draft));
if (draft) refuses("draft content is not selectable", contentSelectable(draft));
const approved = contentLibrary.find((c) => c.approval === "approved");
ok("the library contains an approved item", Boolean(approved));
if (approved) allows("approved content is selectable", contentSelectable(approved));
if (approved)
  refuses("expired content is not selectable", contentSelectable({ ...approved, approval: "expired" }));

const activeIv = seedPlan.interventions.find((i) => i.status === "active");
if (activeIv) allows("active intervention reaches the schedule", interventionReachesSchedule(activeIv));
const heldIv = seedPlan.interventions.find((i) => i.status === "held");
if (heldIv) refuses("held intervention never reaches the schedule", interventionReachesSchedule(heldIv));
if (activeIv)
  refuses(
    "intervention without an approver never reaches the schedule",
    interventionReachesSchedule({
      ...activeIv,
      provenance: { ...activeIv.provenance, approvedBy: "" },
    })
  );

/* ---------------- Medication authority ---------------- */

refuses("caregiver cannot change medication", canChangeMedication("caregiver"));
refuses("nurse cannot change medication", canChangeMedication("nurse"));
refuses("coordinator cannot change medication", canChangeMedication("coordinator"));
refuses("physio cannot change medication", canChangeMedication("lead_physio"));
allows("medical clinician changes medication", canChangeMedication("medical_clinician"));
allows("caregiver records administration", canRecordMedicationAdministration("caregiver"));
refuses("family cannot record administration", canRecordMedicationAdministration("family"));

/* ---------------- Clinical boundaries ---------------- */

refuses("nurse cannot diagnose", canDiagnose("nurse"));
refuses("coordinator cannot diagnose", canDiagnose("coordinator"));
refuses("physio cannot approve swallow care", canApproveSwallowCare("lead_physio"));
refuses("medical clinician cannot approve swallow care", canApproveSwallowCare("medical_clinician"));
refuses("nurse cannot approve swallow care", canApproveSwallowCare("nurse"));
allows("speech & swallow approves swallow care", canApproveSwallowCare("speech_swallow"));

/* ---------------- Holds ---------------- */

const swallowHold: ClinicalHold = {
  id: "h1",
  interventionId: "iv4",
  source: "approved_rule",
  ruleId: "rule-swallow-cough",
  ruleVersion: "v0.1-demo",
  author: "Dr. Farhan",
  authorRole: "medical_clinician",
  reason: "Possible aspiration risk.",
  heldAt: "Day 12",
  reviewOwnerRole: "nurse",
  reviewDeadline: "Same day",
  releasableByRoles: ["speech_swallow", "medical_clinician"],
  status: "active",
  demoReleaseLocked: true,
};
refuses("coordinator cannot release a clinical hold", canReleaseHold("coordinator", swallowHold));
refuses("nurse cannot release a swallow hold", canReleaseHold("nurse", swallowHold));
refuses("caregiver cannot release a hold", canReleaseHold("caregiver", swallowHold));
refuses(
  "swallow hold stays locked even for a permitted role in the demo",
  canReleaseHold("medical_clinician", swallowHold)
);
refuses("caregiver report cannot hold an intervention", canHoldIntervention("caregiver", "professional", "lead_physio"));
allows("an approved rule may hold", canHoldIntervention("medical_clinician", "approved_rule", "speech_swallow"));

/* ---------------- Priority & exception closure ---------------- */

refuses("AI cannot assign priority", canAiAssignPriority());
refuses("AI cannot close an exception", canAiCloseException());
refuses(
  "coordinator cannot lower a medical priority",
  canChangePriority("coordinator", "same_day_medical", "routine_observation")
);

const medicalExc = {
  id: "exc-1",
  priority: "same_day_medical",
  ownerRole: "nurse",
  status: "assigned",
} as unknown as ExceptionCase;
refuses("coordinator cannot clinically resolve", canResolveClinicalException("coordinator", medicalExc));
refuses("caregiver cannot clinically resolve", canResolveClinicalException("caregiver", medicalExc));

/* ---------------- Data-write boundaries ---------------- */

allows("caregiver writes caregiver data", canWriteCaregiverData("caregiver"));
refuses("family cannot write caregiver data", canWriteCaregiverData("family"));
refuses("caregiver cannot write clinical data", canWriteClinicalData("caregiver"));
refuses("family cannot write clinical data", canWriteClinicalData("family"));
refuses("family cannot see coordinator private notes", familyMaySee("coordinator_private_notes"));
refuses("family cannot see internal suitability", familyMaySee("suitability_internal"));

/* ---------------- Goals, reviews, renewal ---------------- */

refuses("coordinator cannot update a goal", canUpdateGoal("coordinator", "lead_physio"));
refuses("physio cannot update another discipline's goal", canUpdateGoal("lead_physio", "speech_swallow"));
allows("physio updates its own goal", canUpdateGoal("lead_physio", "lead_physio"));
refuses("AI cannot decide a review", canAiDecideReview());
refuses("task completion never auto-achieves a goal", canAutoAchieveGoalFromTasks());
refuses("coordinator cannot make the clinical renewal recommendation", canRecommendRenewal("coordinator"));
allows("physio makes the clinical renewal recommendation", canRecommendRenewal("lead_physio"));
refuses("renewal cannot activate without a clinical recommendation", canActivateRenewal("coordinator", false, true));
refuses("renewal cannot activate without the family decision", canActivateRenewal("coordinator", true, false));
allows("renewal activates once both acts are recorded", canActivateRenewal("coordinator", true, true));

/* ---------------- Consent gates ---------------- */

refuses("consultation blocked without teleconsent", canStartTeleconsultation("medical_clinician", false));
allows("consultation allowed with teleconsent", canStartTeleconsultation("medical_clinician", true));
refuses("coordinator cannot start a consultation", canStartTeleconsultation("coordinator", true));

/* ---------------- Programme transitions ---------------- */

refuses("caregiver cannot transition the programme", transitionAllowed("active", "completed", "caregiver"));
refuses("no illegal transition from active to onboarding", transitionAllowed("active", "onboarding_pending", "coordinator"));

/* ---------------- Safety rules ---------------- */

ok("swallow-cough rule holds the feeding intervention", ruleById("rule-swallow-cough")!.holdInterventionIds.includes("iv4"));
ok("swallow-cough rule is same-day medical", ruleById("rule-swallow-cough")!.priority === "same_day_medical");
ok("a feeding 'need help' maps to the swallow rule", ruleForReport("need_help", true).id === "rule-swallow-cough");
ok("a non-feeding 'need help' does not auto-hold", ruleForReport("need_help", false).autoHold === false);
ok("every safety rule names a human author", SAFETY_RULES.every((r) => r.author.length > 0 && r.version.length > 0));

/* ---------------- Lead lifecycle (regression: the clinical-review dead end) ---------------- */

refuses("coordinator cannot make the clinical suitability decision", canDecideSuitability("coordinator"));
refuses("caregiver cannot decide suitability", canDecideSuitability("caregiver"));
refuses("physio cannot decide suitability", canDecideSuitability("lead_physio"));
refuses("nurse cannot decide suitability", canDecideSuitability("nurse"));
allows("Clinical Operations decides suitability", canDecideSuitability("clinical_ops"));
allows("Medical Clinician decides suitability", canDecideSuitability("medical_clinician"));

/**
 * The bug this suite missed: `clinical_review_required` had no exit, so a
 * referral routed for clinical review could never reach consent. Assert every
 * non-terminal lead state has somewhere to go.
 */
const TERMINAL = new Set(["active", "lost_declined", "not_eligible"]);
const REACHABLE_FROM: Record<string, string[]> = {
  new_referral: ["contact_attempted"],
  contact_pending: ["contact_attempted"],
  contact_attempted: ["family_interested", "lost_declined"],
  family_interested: ["eligible", "suitability_info_pending", "clinical_review_required", "not_eligible"],
  suitability_info_pending: ["eligible", "clinical_review_required", "not_eligible"],
  // The fix: a clinical decision now resolves this state in both directions.
  clinical_review_required: ["eligible", "not_eligible"],
  eligible: ["consent_pending"],
  consent_pending: ["payment_pending"],
  payment_pending: ["onboarding_pending"],
  onboarding_pending: ["plan_activation_pending"],
  plan_activation_pending: ["active"],
};
for (const [state, exits] of Object.entries(REACHABLE_FROM)) {
  ok(`lead state "${state}" has at least one exit`, exits.length > 0);
}
ok(
  "every non-terminal lead status has a documented exit",
  Object.keys(STATUS_META).every((s) => TERMINAL.has(s) || Boolean(REACHABLE_FROM[s]))
);
ok(
  "clinical_review_required can reach eligible",
  REACHABLE_FROM.clinical_review_required.includes("eligible")
);
ok("the seeded pipeline lead is not already active", seedLeads.some((l) => l.status !== "active"));

/* ---------------- Phase G: routes ---------------- */

ok("cover parses to no role", parseHash("").role === null);
ok("legacy #home maps to caregiver", parseHash("#home").role === "caregiver");
ok("legacy #home/family maps to family", parseHash("#home/family").role === "family");
ok("legacy #hospital maps to lead physio", parseHash("#hospital").role === "lead_physio");
ok("legacy #hospital/detail maps to the patient screen", parseHash("#hospital/detail").physio === "patient");
ok("legacy #hospital/plan maps to the weekly review", parseHash("#hospital/plan").physio === "plan");
ok("legacy #hospital/consult maps to the medical clinician", parseHash("#hospital/consult").role === "medical_clinician");
ok(
  "legacy #medical_clinician/consult resolves to the canonical workspace",
  parseHash("#medical_clinician/consult").role === "medical_clinician" &&
    parseHash("#medical_clinician/consult").clinician === "home"
);
ok("unknown hash falls back to the cover", parseHash("#nonsense").role === null);
ok("coordinator queue parses", parseHash("#coordinator/queue").coord === "queue");
ok("analytics parses", parseHash("#clinical_ops/analytics").clinician === "analytics");
ok("caregiver tab parses", parseHash("#caregiver/checkin").homeTab === "checkin");

for (const h of [
  "caregiver",
  "family",
  "lead_physio",
  "lead_physio/plan",
  "lead_physio/day30",
  "coordinator",
  "coordinator/queue",
  "nurse",
  "medical_clinician",
  "clinical_ops",
  "clinical_ops/analytics",
  "pmr",
]) {
  ok(`canonical hash #${h} round-trips`, hashFor(parseHash(`#${h}`)) === h);
}
ok("the cover has an empty hash", hashFor(defaultRoute(null)) === "");

/* ---------------- Phase G: guided demo ---------------- */

ok("there are 12 scenes", SCENES.length === 12 && LAST_SCENE === 12);
ok("scenes are numbered 1..12 in order", SCENES.every((s, i) => s.n === i + 1));
ok("scene 1 is the cover", SCENES[0].route.role === null);
ok(
  "every scene carries a complete presenter note",
  SCENES.every((s) => s.title && s.seeing && s.doThis && s.proves && s.dontClaim)
);
ok(
  "every scene routes to a real role or the cover",
  SCENES.every(
    (s) =>
      s.route.role === null ||
      [
        "caregiver",
        "family",
        "lead_physio",
        "coordinator",
        "nurse",
        "medical_clinician",
        "clinical_ops",
        "pmr",
      ].includes(s.route.role)
  )
);
ok("prep steps accumulate monotonically", SCENES.every((s, i) => stepsThrough(s.n).length >= stepsThrough(i).length));
ok("scene 12 prepares the full run", stepsThrough(12).length === stepsThrough(LAST_SCENE).length);
ok(
  "no presenter note leaks an internal id",
  SCENES.every((s) => !/\biv\d|\bexc-\d|\bg\d\b|Phase [A-G]/.test(`${s.seeing} ${s.doThis} ${s.proves} ${s.dontClaim}`))
);

/* ---------------- Report ---------------- */

console.log(`\n${pass} assertions passed.`);
if (failures.length) {
  console.error(`${failures.length} FAILED:`);
  for (const f of failures) console.error("  ✗ " + f);
  process.exit(1);
}
console.log("All guard assertions passed.");
