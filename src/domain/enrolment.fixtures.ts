/*
 * Frozen enrolments, exactly as 0028 writes them onto a subscription.
 * TEST/REVIEW INPUT ONLY — no production code path imports this file.
 *
 * Two patients on deliberately unlike services. If a change makes the patient
 * surface render the first well and the second badly, the architecture is what
 * needs revisiting, not the fixture.
 */
import type { SubscriptionRow } from "../lib/db";

const base = {
  status: "active" as const,
  trial_days: 0,
  trial_ends: null,
  pay_mode: "pay_at_centre",
  platform_fee_pct_snapshot: 20,
  currency_snapshot: "INR",
};

/** DEMO A — Anand, eight days into a 60-day spine recovery programme. */
export const SPINE_ENROLMENT: SubscriptionRow = {
  ...base,
  id: "sub-spine",
  patient_id: "patient-anand",
  plan_name: "Standard Recovery",
  price: 18000,
  price_snapshot: 18000,
  started_at: "2026-08-14T04:30:00.000Z",
  centre_service_id: "svc-spine",
  service_package_id: "pkg-standard",
  package_snapshot: {
    service_name: "Post-operative Spine Recovery",
    name: "Standard Recovery",
    positioning: "Longer monitoring with structured milestones.",
    duration_days: 60,
    monitoring_domains: ["Pain and comfort", "Walking and mobility", "Wound recovery", "Exercise adherence"],
    checkin_frequency: "Three times a week",
    review_frequency: "Weekly review by your surgeon",
    support_level: "Coordinator support on working days",
    includes: ["Recovery check-ins", "Wound photo review", "Weekly summary for your surgeon"],
    milestones: ["Comfortable basic mobility", "Walking without support"],
    typical_duration_days: 84,
  },
  programme_config_snapshot: {
    monitoring_domains: ["Pain and comfort", "Walking and mobility", "Wound recovery", "Exercise adherence", "Neurological concerns"],
    patient_inputs: [
      { label: "How is your back or leg pain today?", reason: "Pain trend is the earliest signal recovery is off track." },
      { label: "How far did you walk today?", reason: "Walking distance is the clearest functional measure." },
      { label: "How does the wound look today?", reason: "Redness or discharge needs the surgeon quickly." },
      { label: "Did you complete your exercises?", reason: "Adherence explains a slow recovery before anything else." },
      { label: "Any new numbness or weakness?", reason: "New neurological symptoms need same-day contact." },
    ],
    care_team: ["Spine surgeon", "Physiotherapist"],
    programme_outline: [
      { period_label: "Week 1", focus: "Early recovery", checkin_frequency: "Daily",
        monitoring_domains: ["Pain and comfort", "Wound recovery"], milestones: ["Comfortable basic mobility"] },
      { period_label: "Weeks 2–4", focus: "Building recovery", checkin_frequency: "Three times a week",
        monitoring_domains: ["Walking and mobility", "Exercise adherence"], milestones: ["Walking without support"] },
      { period_label: "Weeks 5–8", focus: "Functional recovery", checkin_frequency: "Twice a week",
        monitoring_domains: ["Daily function", "Remaining symptoms"], milestones: ["Return to daily activities"] },
    ],
  },
};

/** DEMO B — Priya, three weeks into mother-and-baby support. */
export const LACTATION_ENROLMENT: SubscriptionRow = {
  ...base,
  id: "sub-lactation",
  patient_id: "patient-priya",
  plan_name: "Guided Mother & Baby Support",
  price: 16000,
  price_snapshot: 16000,
  started_at: "2026-07-31T04:30:00.000Z",
  centre_service_id: "svc-lactation",
  service_package_id: "pkg-guided",
  package_snapshot: {
    service_name: "Mother & Baby Postpartum Support",
    name: "Guided Mother & Baby Support",
    positioning: "Support covering rest and wellbeing alongside feeding.",
    duration_days: 60,
    monitoring_domains: ["Feeding experience", "Latch or feeding difficulty", "Breast comfort", "Baby feeding observations", "Rest"],
    checkin_frequency: "Five times a week",
    review_frequency: "Weekly review by your lactation consultant",
    support_level: "Lactation consultant, with a dietitian when needed",
    includes: ["Daily feeding check-ins", "Latch guidance", "Weekly summary for your consultant"],
    milestones: ["Comfortable latch", "Feeding established"],
    typical_duration_days: 84,
  },
  programme_config_snapshot: {
    monitoring_domains: ["Feeding experience", "Latch or feeding difficulty", "Breast comfort", "Baby feeding observations", "Rest", "Nutrition and hydration", "Emotional wellbeing"],
    patient_inputs: [
      { label: "How did feeding go today?", reason: "Your own experience is the measure of this programme." },
      { label: "Is the latch comfortable?", reason: "Pain on latching is the most common reason feeding stops early." },
      { label: "How many feeds and wet nappies did your baby have?", reason: "The clearest home sign that feeding is enough." },
      { label: "How much rest did you manage?", reason: "Rest shapes both supply and how you are coping." },
      { label: "How are you feeling in yourself today?", reason: "Emotional wellbeing decides when we bring in more support." },
    ],
    care_team: ["Lactation consultant", "Dietitian when needed"],
    programme_outline: [
      { period_label: "Week 1", focus: "Establishing feeding", checkin_frequency: "Daily",
        monitoring_domains: ["Feeding experience", "Latch or feeding difficulty"], milestones: ["Comfortable latch"] },
      { period_label: "Weeks 2–4", focus: "Settling into a rhythm", checkin_frequency: "Five times a week",
        monitoring_domains: ["Breast comfort", "Rest"], milestones: ["Feeding established"] },
      { period_label: "Weeks 5–8", focus: "Your recovery and wellbeing", checkin_frequency: "Three times a week",
        monitoring_domains: ["Nutrition and hydration", "Emotional wellbeing"], milestones: ["Feeling supported"] },
    ],
  },
};

/** A legacy recovery subscription — no service enrolment at all. */
export const LEGACY_SUBSCRIPTION: SubscriptionRow = {
  id: "sub-legacy",
  patient_id: "patient-sarita",
  status: "trial",
  plan_name: "30-Day Recovery Continuum",
  price: 5999,
  trial_days: 7,
  trial_ends: "2026-08-28",
  pay_mode: "pay_at_centre",
  started_at: "2026-08-21T04:30:00.000Z",
  service_package_id: null,
  centre_service_id: null,
  package_snapshot: null,
  programme_config_snapshot: null,
  price_snapshot: null,
  platform_fee_pct_snapshot: null,
  currency_snapshot: null,
};
