/*
 * Two programme configurations, in one shape.
 *
 * These exist for the universality check: NEURO_ACTIVITIES and
 * LACTATION_ACTIVITIES go through the same validator, the same scheduler, the
 * same eight renderers and the same patient shell. If a change to the shell ever
 * makes one of them render and the other not, the abstraction has broken and the
 * fix belongs in the abstraction — not in a specialty branch.
 *
 * They are written in the STORED snake_case form, so the same literal can be
 * validated by `validateCareActivities`, inserted into
 * `centre_services.programme_activities`, and read back by the SQL scheduler
 * without any translation step in between.
 *
 * NOTE ON CONTENT. Every value below is illustrative configuration for a demo
 * organisation. No dose, no threshold, no diagnosis and no escalation rule
 * appears here, because the activity model has nowhere to put one.
 */

const OUTCOME_DOSE = {
  key: "status",
  label: "What happened",
  type: "choice",
  required: true,
  options: ["Given", "Skipped", "Refused"],
};

const NOTE_FIELD = { key: "note", label: "Anything to add", type: "text", required: false };

/* --------------------------------------------------------------------------
 * Neuro Rehabilitation & Stroke — the reference domain.
 *
 * This represents ONE patient who happens to need this subset. A different
 * neuro patient gets a different subset: the compiler narrows the provider's
 * defaults using that patient's own clinical information, and a clinician
 * decides. Nothing here is "what every neuro patient gets".
 * ------------------------------------------------------------------------ */

export const NEURO_ACTIVITIES: Record<string, unknown>[] = [
  {
    key: "morning_meds",
    activity_type: "dose",
    domain: "medication",
    title: "Morning medicines",
    instructions: "Give with water, after breakfast. Sit upright for 30 minutes afterwards.",
    basis: "document",
    rationale: "Listed on the discharge medication chart.",
    recorded_by: ["caregiver", "family"],
    input_schema: [OUTCOME_DOSE, NOTE_FIELD],
    schedule: { kind: "clock", times: ["09:00"], days: "all", from_day: 1, through_day: null, grace_minutes: 120 },
  },
  {
    key: "night_meds",
    activity_type: "dose",
    domain: "medication",
    title: "Night medicines",
    instructions: "Give after dinner, before sleep.",
    basis: "document",
    rationale: "Listed on the discharge medication chart.",
    recorded_by: ["caregiver", "family"],
    input_schema: [OUTCOME_DOSE, NOTE_FIELD],
    schedule: { kind: "clock", times: ["21:00"], days: "all", from_day: 1, through_day: null, grace_minutes: 120 },
  },
  {
    key: "blood_pressure",
    activity_type: "measurement",
    domain: "vitals",
    title: "Blood pressure",
    instructions: "Sitting, after five minutes of rest. Left arm, supported at heart level.",
    basis: "document",
    rationale: "Monitoring requested in the discharge summary.",
    recorded_by: ["caregiver", "family"],
    input_schema: [
      { key: "systolic", label: "Systolic", type: "integer", required: true, unit: "mmHg", min: 50, max: 260 },
      { key: "diastolic", label: "Diastolic", type: "integer", required: true, unit: "mmHg", min: 30, max: 160 },
      { key: "pulse", label: "Pulse", type: "integer", required: false, unit: "bpm", min: 30, max: 200 },
    ],
    schedule: { kind: "clock", times: ["08:00"], days: "all", from_day: 1, through_day: null, grace_minutes: 180 },
  },
  {
    key: "positioning",
    activity_type: "task",
    domain: "positioning",
    title: "Reposition",
    instructions: "Change position and check pressure points. Alternate sides.",
    basis: "provider_default",
    rationale: "Part of the approved programme for reduced mobility.",
    recorded_by: ["caregiver"],
    input_schema: [
      { key: "outcome", label: "Was it done", type: "choice", required: true, options: ["Done", "Partly", "Couldn't"] },
      { key: "position", label: "Position now", type: "choice", required: false, options: ["Left side", "Right side", "Back", "Sitting"] },
      NOTE_FIELD,
    ],
    schedule: {
      kind: "clock", times: ["06:00", "09:00", "12:00", "15:00", "18:00", "21:00"],
      days: "all", from_day: 1, through_day: null, grace_minutes: 60,
    },
  },
  {
    key: "physiotherapy",
    activity_type: "exercise",
    domain: "physiotherapy",
    title: "Physiotherapy — sit to stand",
    instructions: "Three sets of eight, resting a minute between sets. Stop if there is chest pain or severe giddiness.",
    basis: "document",
    rationale: "Physiotherapy advised in the discharge summary.",
    recorded_by: ["caregiver", "family"],
    input_schema: [
      { key: "outcome", label: "How did it go", type: "choice", required: true, options: ["Done", "Partly", "Couldn't"] },
      { key: "sets", label: "Sets completed", type: "integer", required: false, min: 0, max: 20 },
      { key: "tolerance", label: "How was it tolerated", type: "choice", required: false, options: ["Comfortable", "Tiring", "Difficult"] },
      NOTE_FIELD,
    ],
    schedule: { kind: "clock", times: ["10:00"], days: [1, 2, 3, 4, 5, 6], from_day: 1, through_day: null, grace_minutes: 240 },
  },
  {
    key: "occupational_therapy",
    activity_type: "exercise",
    domain: "occupational_therapy",
    title: "Occupational therapy — hand function",
    instructions: "Practise the grip and release tasks set by the therapist, ten minutes.",
    basis: "document",
    rationale: "Occupational therapy advised in the discharge summary.",
    recorded_by: ["caregiver", "family"],
    input_schema: [
      { key: "outcome", label: "How did it go", type: "choice", required: true, options: ["Done", "Partly", "Couldn't"] },
      { key: "minutes", label: "Minutes", type: "duration", required: false, min: 0, max: 120, unit: "min" },
      NOTE_FIELD,
    ],
    schedule: { kind: "clock", times: ["16:00"], days: [2, 4], from_day: 1, through_day: null, grace_minutes: 240 },
  },
  {
    key: "swallow_exercise",
    activity_type: "exercise",
    domain: "swallow",
    title: "Swallow exercises",
    instructions: "The exercises the speech therapist demonstrated, before the midday feed.",
    basis: "document",
    rationale: "Speech and swallow therapy advised in the discharge summary.",
    recorded_by: ["caregiver"],
    input_schema: [
      { key: "outcome", label: "How did it go", type: "choice", required: true, options: ["Done", "Partly", "Couldn't"] },
      NOTE_FIELD,
    ],
    schedule: { kind: "clock", times: ["11:00"], days: "all", from_day: 1, through_day: null, grace_minutes: 180 },
  },
  {
    key: "feed",
    activity_type: "intake",
    domain: "nutrition",
    title: "Feed",
    instructions: "Sit upright at 45 degrees or more. Keep upright for 30 minutes afterwards.",
    basis: "document",
    rationale: "Feeding route and diet consistency stated in the discharge summary.",
    recorded_by: ["caregiver"],
    input_schema: [
      { key: "amount", label: "Amount taken", type: "number", required: false, unit: "mL", min: 0, max: 2000 },
      { key: "route", label: "Route", type: "choice", required: true, options: ["Oral — soft", "Oral — thickened", "Tube feed"] },
      { key: "tolerance", label: "How was it tolerated", type: "choice", required: true, options: ["Took it well", "Slow", "Difficult"] },
      { key: "coughing", label: "Any coughing during the feed", type: "boolean", required: false },
      NOTE_FIELD,
    ],
    schedule: { kind: "clock", times: ["08:00", "13:00", "19:00"], days: "all", from_day: 1, through_day: null, grace_minutes: 120 },
  },
  {
    key: "oral_care",
    activity_type: "task",
    domain: "oral_care",
    title: "Mouth care",
    instructions: "Clean the mouth and teeth, checking for any sores.",
    basis: "provider_default",
    rationale: "Part of the approved programme where feeding is assisted.",
    recorded_by: ["caregiver"],
    input_schema: [
      { key: "outcome", label: "Was it done", type: "choice", required: true, options: ["Done", "Partly", "Couldn't"] },
      NOTE_FIELD,
    ],
    schedule: { kind: "clock", times: ["08:00", "20:00"], days: "all", from_day: 1, through_day: null, grace_minutes: 180 },
  },
  {
    key: "catheter_care",
    activity_type: "task",
    domain: "device_care",
    title: "Catheter care",
    instructions: "Clean around the catheter and check the bag is draining and below bladder level.",
    basis: "document",
    rationale: "Indwelling catheter recorded at discharge.",
    recorded_by: ["caregiver"],
    input_schema: [
      { key: "outcome", label: "Was it done", type: "choice", required: true, options: ["Done", "Partly", "Couldn't"] },
      { key: "drainage", label: "Draining freely", type: "boolean", required: false },
      NOTE_FIELD,
    ],
    schedule: { kind: "clock", times: ["07:00"], days: "all", from_day: 1, through_day: null, grace_minutes: 240 },
  },
  {
    key: "skin_check",
    activity_type: "observation",
    domain: "skin",
    title: "Skin check",
    instructions: "Look at the pressure points — heels, hips, lower back, shoulders.",
    basis: "provider_default",
    rationale: "Part of the approved programme for reduced mobility.",
    recorded_by: ["caregiver"],
    input_schema: [
      { key: "state", label: "How does the skin look", type: "choice", required: true, options: ["Intact", "Redness", "Broken area"] },
      NOTE_FIELD,
    ],
    schedule: { kind: "clock", times: ["20:00"], days: "all", from_day: 1, through_day: null, grace_minutes: 240 },
  },
  {
    key: "safe_transfer",
    activity_type: "education",
    domain: "education",
    title: "Moving safely from bed to chair",
    instructions: "A short guide to transferring safely without straining your own back.",
    basis: "provider_default",
    rationale: "Included in the approved programme for the first week at home.",
    recorded_by: ["caregiver", "family"],
    input_schema: [{ key: "acknowledged", label: "I have read this", type: "boolean", required: true }],
    schedule: { kind: "clock", times: ["19:00"], days: [1], from_day: 1, through_day: 7, grace_minutes: 720 },
  },

  /* ---- Quick records: recorded whenever they happen, never "missed" ---- */
  {
    key: "pain",
    activity_type: "symptom",
    domain: "pain",
    title: "Pain",
    instructions: "",
    basis: "document",
    rationale: "Pain recorded at discharge.",
    recorded_by: ["caregiver", "family"],
    input_schema: [
      { key: "scale", label: "How bad is it", type: "scale", required: true, min: 0, max: 10, low_label: "None", high_label: "Worst imaginable" },
      { key: "site", label: "Where", type: "text", required: false, placeholder: "e.g. left shoulder" },
      NOTE_FIELD,
    ],
    schedule: { kind: "on_demand", times: [], days: "all", from_day: 1, through_day: null, grace_minutes: 0 },
  },
  {
    key: "urine",
    activity_type: "observation",
    domain: "elimination",
    title: "Urine",
    instructions: "",
    basis: "provider_default",
    rationale: "Followed while a catheter is in place.",
    recorded_by: ["caregiver"],
    input_schema: [
      { key: "passed", label: "What happened", type: "choice", required: true, options: ["Passed normally", "Small amount", "Not passed", "Cloudy or unusual"] },
      { key: "volume", label: "Amount, if measured", type: "number", required: false, unit: "mL", min: 0, max: 3000 },
      NOTE_FIELD,
    ],
    schedule: { kind: "on_demand", times: [], days: "all", from_day: 1, through_day: null, grace_minutes: 0 },
  },
  {
    key: "bowel",
    activity_type: "observation",
    domain: "elimination",
    title: "Bowel movement",
    instructions: "",
    basis: "provider_default",
    rationale: "Followed after reduced mobility and a change of diet.",
    recorded_by: ["caregiver"],
    input_schema: [
      { key: "passed", label: "What happened", type: "choice", required: true, options: ["Passed — normal", "Passed — hard", "Loose", "Not passed"] },
      NOTE_FIELD,
    ],
    schedule: { kind: "on_demand", times: [], days: "all", from_day: 1, through_day: null, grace_minutes: 0 },
  },
  {
    key: "swallow_observation",
    activity_type: "observation",
    domain: "swallow",
    title: "Swallowing",
    instructions: "",
    basis: "document",
    rationale: "Swallowing difficulty recorded at discharge.",
    recorded_by: ["caregiver"],
    input_schema: [
      { key: "what", label: "What did you notice", type: "choice", required: true, options: ["Swallowed comfortably", "Coughing", "Choking", "Food staying in the mouth", "Wet or gurgly voice"] },
      NOTE_FIELD,
    ],
    schedule: { kind: "on_demand", times: [], days: "all", from_day: 1, through_day: null, grace_minutes: 0 },
  },
  {
    key: "caregiver_observation",
    activity_type: "observation",
    domain: "general",
    title: "Something I noticed",
    instructions: "Anything at all — you do not need to know whether it matters.",
    basis: "provider_default",
    rationale: "Open channel for the household, in the approved programme.",
    recorded_by: ["caregiver", "family"],
    input_schema: [
      { key: "what", label: "What happened", type: "text", required: true, placeholder: "In your own words" },
    ],
    schedule: { kind: "on_demand", times: [], days: "all", from_day: 1, through_day: null, grace_minutes: 0 },
  },
  {
    key: "temperature",
    activity_type: "measurement",
    domain: "vitals",
    title: "Temperature",
    instructions: "",
    basis: "provider_default",
    rationale: "Followed at home where fever would matter.",
    recorded_by: ["caregiver", "family"],
    input_schema: [
      { key: "temperature", label: "Temperature", type: "number", required: true, unit: "°C", min: 30, max: 45 },
      { key: "site", label: "Where measured", type: "choice", required: false, options: ["Forehead", "Underarm", "Mouth", "Ear"] },
    ],
    schedule: { kind: "on_demand", times: [], days: "all", from_day: 1, through_day: null, grace_minutes: 0 },
  },
  {
    key: "vomiting",
    activity_type: "observation",
    domain: "gastrointestinal",
    title: "Vomiting",
    instructions: "",
    basis: "provider_default",
    rationale: "Followed where swallowing and feeding are affected.",
    recorded_by: ["caregiver", "family"],
    input_schema: [
      { key: "episodes", label: "How many times", type: "integer", required: true, min: 1, max: 20 },
      { key: "when", label: "In relation to a feed", type: "choice", required: false, options: ["Before a feed", "During a feed", "Soon after a feed", "Not related to a feed"] },
      NOTE_FIELD,
    ],
    schedule: { kind: "on_demand", times: [], days: "all", from_day: 1, through_day: null, grace_minutes: 0 },
  },
];

/*
 * The quick actions this programme offers, most useful first. The patient app
 * shows the first few and puts the rest behind "More" — the list is programme
 * configuration, and no component knows what is in it.
 *
 * A quick record may name a SCHEDULED activity too: recording "Reposition" or
 * "Blood pressure" from the centre + is an extra, unscheduled event, which is
 * exactly what a caregiver doing one off-schedule needs.
 */
export const NEURO_QUICK_RECORDS = [
  "pain", "blood_pressure", "temperature", "vomiting", "urine", "bowel",
  "positioning", "swallow_observation", "feed", "catheter_care", "caregiver_observation",
];

/* --------------------------------------------------------------------------
 * Mother & Baby / Postpartum & Lactation — the universality check.
 *
 * Different words, different clinical content, different quick records. The
 * SAME eight activity types, the same schedule shape, the same field vocabulary
 * and therefore the same screen. Nothing below required a new type, a new
 * renderer or a branch anywhere in the UI.
 * ------------------------------------------------------------------------ */

export const LACTATION_ACTIVITIES: Record<string, unknown>[] = [
  {
    key: "scheduled_feed",
    activity_type: "intake",
    domain: "lactation",
    title: "Feed",
    instructions: "Either side. Note how the latch felt and whether baby settled afterwards.",
    basis: "provider_default",
    rationale: "Feeding pattern followed in the approved programme.",
    recorded_by: ["family", "caregiver"],
    input_schema: [
      { key: "side", label: "Side", type: "choice", required: true, options: ["Left", "Right", "Both", "Expressed", "Formula"] },
      { key: "minutes", label: "How long", type: "duration", required: false, unit: "min", min: 0, max: 120 },
      { key: "latch", label: "How did the latch feel", type: "choice", required: false, options: ["Comfortable", "Some pain", "Painful", "Kept slipping"] },
      { key: "settled", label: "Did baby settle afterwards", type: "boolean", required: false },
      NOTE_FIELD,
    ],
    schedule: { kind: "clock", times: ["07:00", "10:00", "13:00", "16:00", "19:00", "22:00"], days: "all", from_day: 1, through_day: null, grace_minutes: 90 },
  },
  {
    key: "baby_weight",
    activity_type: "measurement",
    domain: "growth",
    title: "Baby's weight",
    instructions: "Before the morning feed, on the same scale each time.",
    basis: "provider_default",
    rationale: "Weight followed in the approved programme.",
    recorded_by: ["family"],
    input_schema: [
      { key: "weight", label: "Weight", type: "number", required: true, unit: "kg", min: 0.5, max: 15 },
    ],
    schedule: { kind: "clock", times: ["06:00"], days: [1, 4], from_day: 1, through_day: null, grace_minutes: 360 },
  },
  {
    key: "nipple_care",
    activity_type: "task",
    domain: "maternal_care",
    title: "Nipple care",
    instructions: "After feeds, as the consultant showed you.",
    basis: "provider_default",
    rationale: "Part of the approved programme for the first fortnight.",
    recorded_by: ["family"],
    input_schema: [
      { key: "outcome", label: "Was it done", type: "choice", required: true, options: ["Done", "Partly", "Couldn't"] },
      NOTE_FIELD,
    ],
    schedule: { kind: "clock", times: ["08:00", "20:00"], days: "all", from_day: 1, through_day: 14, grace_minutes: 240 },
  },
  {
    key: "pelvic_floor",
    activity_type: "exercise",
    domain: "physiotherapy",
    title: "Pelvic floor exercises",
    instructions: "Three sets of ten, as shown at the postnatal visit.",
    basis: "provider_default",
    rationale: "Postnatal recovery exercises in the approved programme.",
    recorded_by: ["family"],
    input_schema: [
      { key: "outcome", label: "How did it go", type: "choice", required: true, options: ["Done", "Partly", "Couldn't"] },
      { key: "sets", label: "Sets completed", type: "integer", required: false, min: 0, max: 10 },
      NOTE_FIELD,
    ],
    schedule: { kind: "clock", times: ["16:00"], days: "all", from_day: 3, through_day: null, grace_minutes: 300 },
  },
  {
    key: "safe_sleep",
    activity_type: "education",
    domain: "education",
    title: "Safer sleep for your baby",
    instructions: "A short guide to sleep position, surface and room sharing.",
    basis: "provider_default",
    rationale: "Included in the approved programme for the first week.",
    recorded_by: ["family"],
    input_schema: [{ key: "acknowledged", label: "I have read this", type: "boolean", required: true }],
    schedule: { kind: "clock", times: ["20:00"], days: [1], from_day: 1, through_day: 7, grace_minutes: 720 },
  },

  /* ---- Quick records ---- */
  {
    key: "nappy",
    activity_type: "observation",
    domain: "elimination",
    title: "Nappy",
    instructions: "",
    basis: "provider_default",
    rationale: "Output followed while feeding is being established.",
    recorded_by: ["family", "caregiver"],
    input_schema: [
      { key: "kind", label: "What was in it", type: "multi_choice", required: true, options: ["Wet", "Dirty", "Neither"] },
      NOTE_FIELD,
    ],
    schedule: { kind: "on_demand", times: [], days: "all", from_day: 1, through_day: null, grace_minutes: 0 },
  },
  {
    key: "maternal_pain",
    activity_type: "symptom",
    domain: "pain",
    title: "Pain",
    instructions: "",
    basis: "provider_default",
    rationale: "Followed during postnatal recovery.",
    recorded_by: ["family"],
    input_schema: [
      { key: "scale", label: "How bad is it", type: "scale", required: true, min: 0, max: 10, low_label: "None", high_label: "Worst imaginable" },
      { key: "site", label: "Where", type: "text", required: false, placeholder: "e.g. nipples, abdomen" },
      NOTE_FIELD,
    ],
    schedule: { kind: "on_demand", times: [], days: "all", from_day: 1, through_day: null, grace_minutes: 0 },
  },
  {
    key: "mood",
    activity_type: "symptom",
    domain: "wellbeing",
    title: "How I am feeling",
    instructions: "",
    basis: "provider_default",
    rationale: "Followed during postnatal recovery.",
    recorded_by: ["family"],
    input_schema: [
      { key: "scale", label: "How are you feeling today", type: "scale", required: true, min: 0, max: 10, low_label: "Very low", high_label: "Very good" },
      NOTE_FIELD,
    ],
    schedule: { kind: "on_demand", times: [], days: "all", from_day: 1, through_day: null, grace_minutes: 0 },
  },
  {
    key: "family_observation",
    activity_type: "observation",
    domain: "general",
    title: "Something I noticed",
    instructions: "Anything at all — you do not need to know whether it matters.",
    basis: "provider_default",
    rationale: "Open channel for the household, in the approved programme.",
    recorded_by: ["family", "caregiver"],
    input_schema: [
      { key: "what", label: "What happened", type: "text", required: true, placeholder: "In your own words" },
    ],
    schedule: { kind: "on_demand", times: [], days: "all", from_day: 1, through_day: null, grace_minutes: 0 },
  },
];

export const LACTATION_QUICK_RECORDS = [
  "scheduled_feed", "nappy", "maternal_pain", "mood", "family_observation",
];
