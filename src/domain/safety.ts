/**
 * Fictional, versioned safety rules, response-target policy and triage pathway.
 *
 * These are DEMONSTRATION artefacts pending clinical sign-off. They exist so
 * that automatic behaviour in the demo (temporary holds, priority assignment,
 * response targets) always has a named, versioned, human-authored source —
 * never an AI or an implicit code decision.
 */
import type { ResponsePolicy, SafetyRule, TriagePathway } from "./types";

export const SAFETY_RULES: SafetyRule[] = [
  {
    id: "rule-swallow-cough",
    name: "Coughing or wet voice during feeding",
    version: "v0.1-demo",
    author: "Dr. Farhan (Medical Clinician & Clinical Operations Lead)",
    authorRole: "medical_clinician",
    approvedAt: "Before Day 0",
    trigger: "Caregiver reports coughing or a wet-sounding voice at a meal",
    caregiverAction:
      "Stop the meal, sit upright, give nothing by mouth, and request help immediately.",
    autoHold: true,
    holdInterventionIds: ["iv4"],
    reviewOwnerRole: "nurse",
    reviewDeadline: "Same day, within service hours",
    releasableByRoles: ["speech_swallow", "medical_clinician"],
    priority: "same_day_medical",
    rationale:
      "Possible aspiration risk. The rule requires a temporary hold on feeding until an authorised professional reviews. It does not diagnose and does not change diet texture.",
  },
  {
    id: "rule-fatigue-refusal",
    name: "Fatigue, refusal or mild unwell report",
    version: "v0.1-demo",
    author: "Dr. Meera (PM&R Specialist)",
    authorRole: "pmr",
    approvedAt: "Before Day 0",
    trigger: "Caregiver reports partial completion, refusal, or feeling mildly unwell",
    caregiverAction: "Stop this session and report. Continue the rest of the day as planned.",
    autoHold: false,
    holdInterventionIds: [],
    reviewOwnerRole: "coordinator",
    reviewDeadline: "Next working day, within service hours",
    releasableByRoles: [],
    priority: "routine_observation",
    rationale:
      "A single missed or partial session is expected in recovery. It creates a review item; it does NOT suspend future scheduled tasks.",
  },
  {
    id: "rule-need-help",
    name: "Caregiver requests help on a task",
    version: "v0.1-demo",
    author: "Dr. Farhan (Medical Clinician & Clinical Operations Lead)",
    authorRole: "medical_clinician",
    approvedAt: "Before Day 0",
    trigger: "Caregiver selects 'I need help' on a task",
    caregiverAction: "Stop the task if you are unsure and wait for the care team.",
    autoHold: false,
    holdInterventionIds: [],
    reviewOwnerRole: "coordinator",
    reviewDeadline: "Same day, within service hours",
    releasableByRoles: [],
    priority: "operational_followup",
    rationale:
      "Most help requests are practical. Today's occurrence stops; the underlying intervention continues unless a professional decides otherwise.",
  },
  {
    id: "rule-unwell",
    name: "Patient reported unwell",
    version: "v0.1-demo",
    author: "Dr. Farhan (Medical Clinician & Clinical Operations Lead)",
    authorRole: "medical_clinician",
    approvedAt: "Before Day 0",
    trigger: "Caregiver reports the patient seems unwell",
    caregiverAction:
      "Stop this task, keep him comfortable, and use the emergency numbers if he is seriously unwell.",
    autoHold: false,
    holdInterventionIds: [],
    reviewOwnerRole: "nurse",
    reviewDeadline: "Same day, within service hours",
    releasableByRoles: [],
    priority: "nursing_review",
    rationale:
      "Today's occurrence stops and a nursing review is raised. The intervention itself is not globally held — only an authorised professional, or a rule that says so, may hold it.",
  },
];

export const ruleById = (id: string) => SAFETY_RULES.find((r) => r.id === id);

/** Maps a caregiver report to its governing approved rule. */
export function ruleForReport(status: string, isFeedingContext: boolean): SafetyRule {
  if (isFeedingContext && (status === "unwell" || status === "need_help"))
    return SAFETY_RULES[0];
  if (status === "unwell") return SAFETY_RULES[3];
  if (status === "need_help") return SAFETY_RULES[2];
  return SAFETY_RULES[1];
}

/* ---------------- Response-target policy (pilot service targets) ---------------- */

export const RESPONSE_POLICY: ResponsePolicy = {
  name: "Carelune pilot response targets",
  version: "v0.1-demo",
  owner: "Sujith (Product & Business) with Dr. Farhan (Clinical Operations)",
  serviceHours: "8:00 AM–8:00 PM IST, seven days",
  outOfHoursRule:
    "Targets pause outside service hours and resume at 8:00 AM. Emergencies never wait for Carelune — call 112/108.",
  note: "Pilot service target — an operational goal, not a clinical guarantee.",
  targets: {
    emergency: {
      label: "Emergency",
      acknowledge: "Immediate — caregiver directed to 112/108",
      action: "Operational documentation same day",
      escalation: "Clinical Operations Lead notified immediately",
      ackMins: 0,
      actionMins: 60,
    },
    same_day_medical: {
      label: "Same-day medical review",
      acknowledge: "30 minutes (within service hours)",
      action: "Same day",
      escalation: "Escalate to Clinical Operations Lead if unmet",
      ackMins: 30,
      actionMins: 480,
    },
    same_day_rehab: {
      label: "Same-day rehabilitation review",
      acknowledge: "60 minutes (within service hours)",
      action: "Same day",
      escalation: "Escalate to Lead Physiotherapist, then Clinical Operations",
      ackMins: 60,
      actionMins: 480,
    },
    nursing_review: {
      label: "Nursing review",
      acknowledge: "60 minutes (within service hours)",
      action: "Same day",
      escalation: "Escalate to Medical Clinician if unmet",
      ackMins: 60,
      actionMins: 480,
    },
    operational_followup: {
      label: "Operational follow-up",
      acknowledge: "4 hours (within service hours)",
      action: "Next working day",
      escalation: "Coordinator lead review",
      ackMins: 240,
      actionMins: 1440,
    },
    routine_observation: {
      label: "Routine observation",
      acknowledge: "Next working day",
      action: "At the next scheduled review",
      escalation: "Reviewed at the weekly review",
      ackMins: 1440,
      actionMins: 10080,
    },
  },
};

/* ---------------- Fictional nursing triage pathway ---------------- */

export const TRIAGE_PATHWAY: TriagePathway = {
  id: "pathway-swallow-concern",
  name: "Feeding / swallowing concern — nursing triage (demo)",
  version: "v0.1-demo",
  author: "Dr. Farhan (Medical Clinician & Clinical Operations Lead)",
  approvedAt: "Before Day 0",
  scopeNote:
    "Structured information gathering and approved caregiver education only. The nurse does not diagnose, does not prescribe, and does not approve or change swallow care.",
  guidedObservations: [
    "Is he fully awake and sitting upright?",
    "Is his breathing comfortable now, at rest?",
    "Did the coughing settle after stopping the meal?",
    "Any wet or gurgly voice when he speaks now?",
    "Any fever, or has this happened before today?",
  ],
  redFlags: [
    "Struggling to breathe or noisy breathing at rest",
    "Blue or grey lips or face",
    "Choking that did not clear",
    "Unresponsive or very difficult to wake",
    "New chest pain",
  ],
  approvedEducation: [
    "Keep him fully upright for at least 30 minutes after any meal.",
    "Give nothing by mouth until the specialist review is completed.",
    "Watch for fever, new cough or breathlessness and report it.",
    "Use 112/108 immediately if breathing becomes difficult.",
  ],
};
