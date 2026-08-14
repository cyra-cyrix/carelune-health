/**
 * Phase D — caregiver-facing definitions: priorities, the six report states with
 * structured reasons, the restricted medication outcomes, and the
 * patient-specific Daily Check-in (generated from Anand's approved plan).
 *
 * Caregivers are never asked to diagnose. Concern answers route to people.
 */
import type { DailyCheckIn, MedOutcome, TaskPriority, TaskResultStatus } from "./types";

/* ---------------- Priorities ---------------- */

export const PRIORITY_META: Record<
  TaskPriority,
  { label: string; cls: string; dot: string; rank: number }
> = {
  safety_critical: {
    label: "Safety critical",
    cls: "bg-coral-100 text-coral-600 ring-1 ring-coral-200",
    dot: "bg-coral-500",
    rank: 0,
  },
  recovery_priority: {
    label: "Recovery priority",
    cls: "bg-brand-50 text-brand-700 ring-1 ring-brand-100",
    dot: "bg-brand-500",
    rank: 1,
  },
  routine_support: {
    label: "Routine support",
    cls: "bg-mist-200 text-sage-600",
    dot: "bg-sage-400",
    rank: 2,
  },
};

/* ---------------- Six report states ---------------- */

export const REPORT_META: Record<
  TaskResultStatus,
  { label: string; short: string; cls: string; needsReason: boolean }
> = {
  completed: { label: "Completed", short: "Done", cls: "bg-good-500 text-white", needsReason: false },
  partial: { label: "Partly done", short: "Partly", cls: "bg-warn-100 text-warn-600 ring-1 ring-warn-500/20", needsReason: true },
  unable: { label: "Could not do it", short: "Unable", cls: "bg-mist-200 text-sage-600", needsReason: true },
  refused: { label: "He did not want to", short: "Refused", cls: "bg-mist-200 text-sage-600", needsReason: true },
  unwell: { label: "He seems unwell", short: "Unwell", cls: "bg-coral-100 text-coral-600 ring-1 ring-coral-200", needsReason: true },
  need_help: { label: "I need help", short: "Help", cls: "bg-coral-500 text-white", needsReason: true },
};

/** Structured reasons — short, plain, never a diagnosis. */
export const REPORT_REASONS: Partial<Record<TaskResultStatus, string[]>> = {
  partial: [
    "He was tired",
    "He had pain",
    "We did fewer repetitions",
    "I found it difficult",
    "Not enough time",
    "Other",
  ],
  unable: [
    "He could not do it",
    "Equipment not available",
    "I was not available",
    "Instructions were unclear",
    "The room was not suitable",
    "Held by the care team",
    "Other",
  ],
  refused: [
    "He was tired",
    "He was uncomfortable",
    "He seemed anxious",
    "He did not understand",
    "He did not want to continue",
    "Other",
  ],
  unwell: [
    "Coughing or wet voice",
    "Breathing seems different",
    "More sleepy than usual",
    "Pain that is new or worse",
    "He was sick / vomited",
    "Something else worries me",
  ],
  need_help: [
    "I am not sure how to do this safely",
    "Something happened during the task",
    "He seems different today",
    "Equipment or setup problem",
    "I have a question about the plan",
    "Something else",
  ],
};

/* ---------------- Medication (restricted record) ---------------- */

export const MED_OUTCOME_META: Record<MedOutcome, { label: string; cls: string; needsReason: boolean }> = {
  given: { label: "Given", cls: "bg-good-500 text-white", needsReason: false },
  not_given: { label: "Not given", cls: "bg-mist-200 text-sage-600", needsReason: true },
  refused: { label: "He refused", cls: "bg-mist-200 text-sage-600", needsReason: false },
  unwell: { label: "He seems unwell", cls: "bg-coral-100 text-coral-600", needsReason: false },
};

export const MED_NOT_GIVEN_REASONS = [
  "Medicine not available",
  "He was sleeping",
  "I was not available",
  "Instruction unclear",
  "Withheld on the care team's written instruction",
  "Other",
];

/* ---------------- Patient-specific Daily Check-in ---------------- */

/**
 * Generated from Anand's approved plan. Vitals are deliberately absent: they
 * appear only when the plan includes them with recorded equipment, caregiver
 * training, and a clinician-defined frequency and threshold.
 */
export const dailyCheckIn: DailyCheckIn = {
  patientId: "p1",
  questions: [
    {
      id: "alertness",
      label: "How awake is he today?",
      approvedBy: "Dr. Farhan (Medical Clinician)",
      options: [
        { value: "usual", label: "Usual" },
        { value: "sleepy", label: "More sleepy", concern: true },
        { value: "difficult", label: "Difficult to wake", urgent: true },
      ],
    },
    {
      id: "pain",
      label: "Pain today",
      approvedBy: "Ravi Kumar (Lead Physiotherapist)",
      options: [
        { value: "none", label: "None" },
        { value: "mild", label: "Mild" },
        { value: "moderate", label: "Moderate", concern: true },
        { value: "severe", label: "Severe", urgent: true },
      ],
    },
    {
      id: "feeding",
      label: "How did meals go?",
      approvedBy: "Dr. Farhan · pending Speech & Swallow review",
      options: [
        { value: "usual", label: "Usual" },
        { value: "ate_less", label: "Ate less", concern: true },
        { value: "difficulty", label: "Difficulty", concern: true },
        { value: "coughing", label: "Coughing / wet voice", urgent: true },
        { value: "held", label: "Feeding currently held" },
      ],
    },
    {
      id: "fluids",
      label: "Drinks, compared with usual",
      approvedBy: "Nisha (Rehabilitation Nurse)",
      options: [
        { value: "usual", label: "Usual" },
        { value: "less", label: "Less than usual", concern: true },
        { value: "unable", label: "Unable to drink", urgent: true },
      ],
    },
    {
      id: "bowel",
      label: "Bowels",
      approvedBy: "Nisha (Rehabilitation Nurse)",
      options: [
        { value: "no_concern", label: "No concern" },
        { value: "none_today", label: "No bowel movement", concern: true },
        { value: "other", label: "Other concern", concern: true },
      ],
    },
    {
      id: "urine",
      label: "Passing urine",
      approvedBy: "Nisha (Rehabilitation Nurse)",
      options: [
        { value: "no_concern", label: "No concern" },
        { value: "reduced", label: "Reduced", concern: true },
        { value: "unusual", label: "Unusual colour or smell", concern: true },
        { value: "other", label: "Other concern", concern: true },
      ],
    },
    {
      id: "sleep",
      label: "Sleep last night",
      approvedBy: "Ravi Kumar (Lead Physiotherapist)",
      options: [
        { value: "good", label: "Good" },
        { value: "disturbed", label: "Disturbed" },
        { value: "very_poor", label: "Very poor", concern: true },
      ],
    },
    {
      id: "mood",
      label: "Mood and taking part",
      approvedBy: "Ravi Kumar (Lead Physiotherapist)",
      options: [
        { value: "engaged", label: "Engaged" },
        { value: "low", label: "Low participation", concern: true },
        { value: "refused", label: "Refused activities", concern: true },
        { value: "distressed", label: "Distressed", concern: true },
      ],
    },
    {
      id: "new_concern",
      label: "Anything new worrying you?",
      approvedBy: "Divya (Recovery Care Coordinator)",
      options: [
        { value: "none", label: "Nothing new" },
        { value: "breathing", label: "Breathing", urgent: true },
        { value: "skin", label: "Skin / redness", concern: true },
        { value: "swelling", label: "Swelling", concern: true },
        { value: "behaviour", label: "Behaviour change", concern: true },
        { value: "other", label: "Something else", concern: true },
      ],
    },
  ],
};

/* ---------------- Approved safe wording for the feeding incident ---------------- */

/**
 * The demo's approved rule text for a coughing/wet-voice report. It stops the
 * task, states no diagnosis, suggests no texture or treatment change, and
 * carries the emergency boundary.
 */
export const FEEDING_INCIDENT_GUIDANCE = {
  headline: "Stop feeding for now",
  steps: [
    "Stop the meal. Do not try again until the care team replies.",
    "Sit him fully upright and stay with him until his breathing settles.",
    "Keep his mouth clear. Do not give thickened drinks, water or medicines by mouth until you hear back.",
  ],
  noChangeNote:
    "We have not changed his diet or his feeding plan. Only the speech and swallow specialist can do that.",
};
