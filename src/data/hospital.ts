import type { PatientRow } from "../types";

// Ravi Kumar's Carelune caseload — the Bengaluru pilot: three medically stable
// adult stroke patients he referred and continues to lead. Array order = triage
// order (alert → warn → good), rendered as-is.
export const cohort: PatientRow[] = [
  {
    id: "p2",
    name: "Fatima Sheikh",
    age: 64,
    condition: "Stroke · dysphagia",
    location: "Shivajinagar, Bengaluru",
    dayAtHome: 9,
    caretaker: "Rekha",
    family: "Imran (son, Bengaluru)",
    adherence: 61,
    status: "warn",
    alerts: ["Repositioning missed 3× in 24h", "Thickened-feed posture not reported"],
    barthel: 40,
    barthelPrev: 42,
  },
  {
    id: "p1",
    name: "Anand Menon",
    age: 58,
    condition: "Ischaemic stroke · L-side weakness",
    location: "Jayanagar, Bengaluru",
    dayAtHome: 12,
    caretaker: "Lakshmi",
    family: "Suresh (son, Dubai)",
    adherence: 92,
    status: "good",
    alerts: [],
    barthel: 65,
    barthelPrev: 50,
  },
  {
    id: "p3",
    name: "Devi Nair",
    age: 52,
    condition: "Ischaemic stroke · aphasia",
    location: "Basavanagudi, Bengaluru",
    dayAtHome: 5,
    caretaker: "Suma",
    family: "Nair family (in-home)",
    adherence: 88,
    status: "good",
    alerts: [],
    barthel: 70,
    barthelPrev: 68,
  },
];

// Review-by-exception, made quantitative for a 3-patient pilot: this answers
// "will this bury the physiotherapist in reviews?"
export const planLoad = {
  ranWithoutReview: 11,
  totalPlanItems: 14,
  needReview: 3,
};

// Pre-consult summary for the Medical Clinician's screen — AI-drafted from
// caregiver-reported home logs, always awaiting professional review.
export const consultBrief = {
  patient: "Anand Menon",
  snapshot: [
    { k: "Day at home", v: "12" },
    { k: "Task completion (7d)", v: "92%" },
    { k: "Barthel (clinician)", v: "50 → 65" },
    { k: "Last consult", v: "6 days ago" },
  ],
  sinceLast: [
    "Naming-card success fell 80% → 55% over 4 days — flagged for speech review",
    "Fluid intake under the 2L target on 3 of 4 days (avg 1.4L)",
    "Left-shoulder ROM improved to 0–110°, pain ≤ 2/10 for 7 sessions",
    "Mood steady (4/5) · sleep averaging 7.2h · no falls, no skin redness reported",
  ],
  redFlags: [
    "Possible early dysphagia change — one wet-voice episode reported Tuesday lunch",
    "HbA1c rising 7.1 → 7.8% — glycaemic control slipping at home",
  ],
  // AI-drafted QUESTIONS for the clinician to consider — never proposals.
  questions: [
    "Is the HbA1c trend (7.1 → 7.8%) something you want to address at this consultation?",
    "Given the Tuesday coughing episode, is the current feeding guidance still appropriate?",
    "Fluid intake is below target on most days — is a medical cause worth excluding?",
  ],
};

// Weekly review preparation for the Lead Physiotherapist — AI may compile
// facts, missed-task patterns, caregiver-reported concerns and questions to
// consider. It must NOT propose treatments, progressions, referrals or plan
// changes; any decision originates from Ravi with his rationale, audited.
export const reviewPrep = {
  patient: "Anand Menon",
  periodFacts: [
    // system-calculated from the shared record
    "Task completion 92% over the last 7 days (44 of 48 scheduled tasks reported)",
    "Left-shoulder ROM: 7 consecutive sessions completed; caregiver-reported pain ≤ 2/10",
    "Fluid intake reported below the 2 L target on 3 of the last 4 days (avg 1.4 L)",
  ],
  missedPatterns: [
    "Afternoon repositioning missed twice this week — both times on outing days",
    "Naming-card practice reported 'partial' on 4 of the last 5 days (success 80% → 55%)",
  ],
  caregiverConcerns: [
    "One coughing episode during Tuesday lunch with wet-sounding voice — reported by Lakshmi",
    "Lakshmi asks whether the garden outing can move earlier; Anand tires after 6 PM",
  ],
  questions: [
    // AI-drafted, awaiting the professional's own judgment
    "Does the naming-card decline need another discipline's opinion, in your view?",
    "Is the current feeding guidance still appropriate after Tuesday's episode?",
    "Do you want to reassess ROM dosage at this review, given 7 tolerant sessions?",
  ],
};
