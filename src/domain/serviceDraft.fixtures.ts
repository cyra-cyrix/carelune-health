/*
 * Synthetic model replies used by tests and by the visual review of the service
 * builder. TEST/REVIEW INPUT ONLY — no production code path imports this file,
 * and nothing in the builder branches on which fixture it is rendering.
 *
 * The two fixtures are deliberately as unlike each other as the product allows:
 * a solo surgeon's post-operative recovery service, and a lactation
 * consultant's mother-and-baby service whose subject includes a dependent. If a
 * change makes the builder render the first well and the second badly, the
 * architecture — not the fixture — is what needs revisiting.
 */
import type { ServiceDraft } from "./serviceDraft";

/** DEMO A — Dr Vivek Spine Care (solo spine surgeon). */
export const SPINE_DRAFT: ServiceDraft = {
  provider_summary:
    "Dr Vivek is a solo spine surgeon who follows adults after lumbar decompression, fusion and related spine procedures. Patients are usually followed for six to twelve weeks after discharge, with attention to pain, walking, wound recovery, prescribed exercise and any new neurological concern.",
  suggested_services: [
    {
      name: "Post-operative Spine Recovery",
      summary:
        "Continuing follow-up at home after spine surgery, so recovery is visible between clinic visits and problems that need the surgeon are noticed early.",
      patient_type: "Adults following lumbar decompression, fusion or related spine surgery",
      entry_point: "Discharge from hospital after spine surgery",
      typical_duration_days: 84,
      objective:
        "Support recovery at home and identify problems that require professional attention.",
      end_condition:
        "The patient is walking comfortably, the wound has healed and the surgeon closes the follow-up.",
      monitoring_domains: ["Pain", "Walking and mobility", "Wound recovery", "Exercise adherence", "Neurological concerns"],
      suggested_patient_inputs: [
        { label: "How is your back or leg pain today?", reason: "Pain trend is the earliest signal that recovery is off track." },
        { label: "How far did you walk today?", reason: "Walking distance is the clearest functional measure after spine surgery." },
        { label: "How does the wound look today?", reason: "Redness, swelling or discharge needs the surgeon's attention quickly." },
        { label: "Did you complete your prescribed exercises?", reason: "Adherence explains a slow recovery before anything else is investigated." },
        { label: "Any new numbness, weakness or bladder difficulty?", reason: "New neurological symptoms are the reason to contact the surgeon the same day." },
      ],
      care_team_suggestions: ["Treating spine surgeon", "Physiotherapist", "Care coordinator"],
      suggested_packages: [
        {
          name: "Essential Recovery",
          positioning: "Focused monitoring through the early recovery period.",
          duration_days: 30,
          monitoring_domains: ["Pain", "Walking and mobility", "Wound recovery"],
          checkin_frequency: "Daily",
          review_frequency: "Weekly surgeon review",
          support_level: "Coordinator support on working days",
          includes: ["Daily recovery check-in", "Wound photo review", "Weekly progress summary for the surgeon"],
          milestones: ["Comfortable basic mobility", "Wound healing without concern"],
        },
        {
          name: "Guided Recovery",
          positioning: "Longer monitoring with structured milestones and professional follow-up.",
          duration_days: 60,
          monitoring_domains: ["Pain", "Walking and mobility", "Wound recovery", "Exercise adherence"],
          checkin_frequency: "Daily for two weeks, then five times a week",
          review_frequency: "Weekly surgeon review",
          support_level: "Coordinator support on working days, physiotherapy check-ins",
          includes: ["Everything in Essential Recovery", "Guided exercise progression", "Physiotherapy review points"],
          milestones: ["Comfortable basic mobility", "Walking without support", "Exercise programme progressing"],
        },
        {
          name: "Complete Recovery",
          positioning: "Extended support through functional recovery and return to normal activity.",
          duration_days: 90,
          monitoring_domains: ["Pain", "Walking and mobility", "Wound recovery", "Exercise adherence", "Neurological concerns"],
          checkin_frequency: "Daily for two weeks, then tapering to three times a week",
          review_frequency: "Fortnightly surgeon review with a closing consultation",
          support_level: "Coordinator support on working days, physiotherapy and return-to-work guidance",
          includes: ["Everything in Guided Recovery", "Return-to-activity guidance", "Closing recovery summary"],
          milestones: ["Comfortable basic mobility", "Walking without support", "Return to daily activities", "Recovery closed by the surgeon"],
        },
      ],
      programme_outline: [
        {
          period_label: "Week 1",
          focus: "Early recovery",
          checkin_frequency: "Daily check-in",
          monitoring_domains: ["Pain", "Walking", "Wound", "Patient concerns"],
          milestones: ["Comfortable basic mobility", "Recovery progressing without new concerns"],
        },
        {
          period_label: "Weeks 2–4",
          focus: "Building recovery",
          checkin_frequency: "5 check-ins a week",
          monitoring_domains: ["Mobility progression", "Pain trend", "Exercise adherence", "Wound"],
          milestones: ["Walking without support", "Wound healed"],
        },
        {
          period_label: "Weeks 5–8",
          focus: "Functional recovery",
          checkin_frequency: "3 check-ins a week",
          monitoring_domains: ["Daily function", "Return-to-activity progression", "Remaining symptoms"],
          milestones: ["Return to daily activities"],
        },
        {
          period_label: "Weeks 9–12",
          focus: "Return to normal activity",
          checkin_frequency: "Weekly check-in",
          monitoring_domains: ["Activity tolerance", "Remaining symptoms"],
          milestones: ["Recovery closed by the surgeon"],
        },
      ],
    },
    {
      name: "Conservative Back Pain Follow-up",
      summary:
        "Structured follow-up for patients managed without surgery, so a deteriorating course is recognised before it becomes urgent.",
      patient_type: "Adults with back pain managed without surgery",
      entry_point: "Outpatient consultation",
      typical_duration_days: 42,
      objective: "Track symptoms and adherence, and recognise a course that needs review.",
      end_condition: "Symptoms have settled or the surgeon changes the plan.",
      monitoring_domains: ["Pain", "Function", "Exercise adherence", "Red-flag symptoms"],
      suggested_patient_inputs: [
        { label: "How is your pain today?", reason: "The primary outcome of conservative management." },
        { label: "Did you complete today's exercises?", reason: "Adherence is the main modifiable factor." },
      ],
      care_team_suggestions: ["Treating surgeon", "Physiotherapist"],
      suggested_packages: [
        {
          name: "Essential Follow-up",
          positioning: "Short structured follow-up after the consultation.",
          duration_days: 30,
          monitoring_domains: ["Pain", "Exercise adherence"],
          checkin_frequency: "Three times a week",
          review_frequency: "Fortnightly review",
          support_level: "Coordinator support on working days",
          includes: ["Symptom check-in", "Exercise reminders"],
          milestones: ["Pain settling", "Exercise routine established"],
        },
        {
          name: "Guided Follow-up",
          positioning: "Longer follow-up with physiotherapy involvement.",
          duration_days: 60,
          monitoring_domains: ["Pain", "Function", "Exercise adherence"],
          checkin_frequency: "Three times a week",
          review_frequency: "Fortnightly review",
          support_level: "Coordinator and physiotherapy support",
          includes: ["Everything in Essential Follow-up", "Physiotherapy review points"],
          milestones: ["Pain settling", "Function improving"],
        },
        {
          name: "Complete Follow-up",
          positioning: "Extended follow-up through return to normal activity.",
          duration_days: 90,
          monitoring_domains: ["Pain", "Function", "Exercise adherence", "Red-flag symptoms"],
          checkin_frequency: "Twice a week",
          review_frequency: "Monthly review with a closing consultation",
          support_level: "Coordinator and physiotherapy support",
          includes: ["Everything in Guided Follow-up", "Return-to-activity guidance"],
          milestones: ["Pain settling", "Return to daily activities"],
        },
      ],
      programme_outline: [
        {
          period_label: "Weeks 1–2",
          focus: "Settling symptoms",
          checkin_frequency: "Three times a week",
          monitoring_domains: ["Pain", "Exercise adherence"],
          milestones: ["Exercise routine established"],
        },
        {
          period_label: "Weeks 3–6",
          focus: "Restoring function",
          checkin_frequency: "Twice a week",
          monitoring_domains: ["Function", "Pain trend"],
          milestones: ["Function improving"],
        },
      ],
    },
  ],
};

/** DEMO B — Anjali Mother & Baby Care (lead lactation consultant). */
export const LACTATION_DRAFT: ServiceDraft = {
  provider_summary:
    "Anjali is a lead lactation consultant supporting mothers for six to twelve weeks after delivery, working with a dietitian and a psychologist when they are needed. The support follows feeding, breast comfort, the baby's feeding pattern, the mother's rest, nutrition and emotional wellbeing, and anything the mother raises herself.",
  suggested_services: [
    {
      name: "Mother & Baby Postpartum Support",
      summary:
        "Continuing support at home after delivery, so feeding difficulties are noticed early and the mother is not left to work them out alone.",
      patient_type: "Mothers in the first weeks after delivery, together with their baby",
      entry_point: "First consultation after delivery or discharge",
      typical_duration_days: 84,
      objective: "Establish comfortable, sustainable feeding and support the mother's recovery and wellbeing.",
      end_condition: "Feeding is established and comfortable, and the mother is confident continuing on her own.",
      monitoring_domains: [
        "Feeding experience",
        "Latch and feeding difficulty",
        "Breast comfort",
        "Baby's feeding observations",
        "Maternal rest",
        "Nutrition and hydration",
        "Emotional wellbeing",
      ],
      suggested_patient_inputs: [
        { label: "How did feeding go today?", reason: "The mother's own experience is the primary measure of this service." },
        { label: "Is the latch comfortable, or is anything painful?", reason: "Pain on latching is the most common reason feeding stops early." },
        { label: "How does your breast feel today?", reason: "Engorgement and blocked ducts are common and respond well when caught early." },
        { label: "How many feeds and wet nappies did the baby have?", reason: "The clearest home indication that the baby is feeding enough." },
        { label: "How much rest did you manage?", reason: "Rest shapes both milk supply and how the mother is coping." },
        { label: "How are you feeling in yourself today?", reason: "Emotional wellbeing decides when the psychologist should be involved." },
      ],
      care_team_suggestions: ["Lead lactation consultant", "Dietitian when needed", "Psychologist when needed"],
      suggested_packages: [
        {
          name: "Essential Feeding Support",
          positioning: "Close support through the first weeks, when feeding is being established.",
          duration_days: 30,
          monitoring_domains: ["Feeding experience", "Latch and feeding difficulty", "Breast comfort", "Baby's feeding observations"],
          checkin_frequency: "Daily",
          review_frequency: "Twice-weekly consultant review",
          support_level: "Lactation consultant support on working days",
          includes: ["Daily feeding check-in", "Latch guidance", "Weekly summary for the consultant"],
          milestones: ["Comfortable latch", "Baby feeding well"],
        },
        {
          name: "Guided Mother & Baby Support",
          positioning: "Longer support covering the mother's rest, nutrition and wellbeing alongside feeding.",
          duration_days: 60,
          monitoring_domains: ["Feeding experience", "Breast comfort", "Baby's feeding observations", "Maternal rest", "Nutrition and hydration"],
          checkin_frequency: "Daily for three weeks, then five times a week",
          review_frequency: "Weekly consultant review",
          support_level: "Lactation consultant, with dietitian input when needed",
          includes: ["Everything in Essential Feeding Support", "Nutrition guidance", "Rest and recovery guidance"],
          milestones: ["Comfortable latch", "Feeding established", "Mother resting adequately"],
        },
        {
          name: "Complete Postpartum Support",
          positioning: "Extended support through the full postpartum period, including emotional wellbeing.",
          duration_days: 90,
          monitoring_domains: [
            "Feeding experience",
            "Breast comfort",
            "Baby's feeding observations",
            "Maternal rest",
            "Nutrition and hydration",
            "Emotional wellbeing",
          ],
          checkin_frequency: "Daily for three weeks, then tapering to three times a week",
          review_frequency: "Weekly consultant review with a closing consultation",
          support_level: "Lactation consultant, with dietitian and psychologist input when needed",
          includes: ["Everything in Guided Mother & Baby Support", "Emotional wellbeing check-ins", "Closing summary"],
          milestones: ["Comfortable latch", "Feeding established", "Mother resting adequately", "Confident continuing independently"],
        },
      ],
      programme_outline: [
        {
          period_label: "Week 1",
          focus: "Establishing feeding",
          checkin_frequency: "Daily check-in",
          monitoring_domains: ["Feeding experience", "Latch and feeding difficulty", "Breast comfort", "Baby's feeding observations"],
          milestones: ["Comfortable latch", "Baby feeding well"],
        },
        {
          period_label: "Weeks 2–4",
          focus: "Settling into a rhythm",
          checkin_frequency: "5 check-ins a week",
          monitoring_domains: ["Feeding experience", "Breast comfort", "Maternal rest", "Nutrition and hydration"],
          milestones: ["Feeding established", "Mother resting adequately"],
        },
        {
          period_label: "Weeks 5–8",
          focus: "Mother's recovery and wellbeing",
          checkin_frequency: "3 check-ins a week",
          monitoring_domains: ["Maternal rest", "Nutrition and hydration", "Emotional wellbeing", "Mother-raised concerns"],
          milestones: ["Mother feeling supported", "Feeding comfortable without help"],
        },
        {
          period_label: "Weeks 9–12",
          focus: "Confident on her own",
          checkin_frequency: "Weekly check-in",
          monitoring_domains: ["Feeding experience", "Emotional wellbeing"],
          milestones: ["Confident continuing independently"],
        },
      ],
    },
  ],
};
