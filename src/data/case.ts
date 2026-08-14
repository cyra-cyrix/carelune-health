// The single clean fictional case for the v2 Carelune demo. A complex,
// multidisciplinary rehab patient discharged home and followed by the team.
// Modelled on a real discharge-summary *format* but fully FICTIONALISED —
// no real patient's identity or record. Swap `patientCase.name` freely.

export type Sex = "M" | "F";

export const patientCase = {
  name: "Sarita Kulkarni",
  age: 46,
  sex: "F" as Sex,
  location: "Home · Kumaraswamy Layout, Bengaluru",
  dischargedDaysAgo: 6,
  dayAtHome: 6,
  journeyTotalDays: 90,
};

/** Problem list from the discharge summary. */
export const diagnosis: string[] = [
  "Cerebral venous thrombosis — parietal haemorrhage",
  "Post right decompressive craniectomy (15/04) · tetraplegia, improving",
  "Tracheostomy — decannulated; thickened oral feeds",
  "Paroxysmal sympathetic hyperactivity with dystonia — settling",
  "Hypertension; bronchial asthma",
];

/** The uploaded discharge summary's multidisciplinary therapy program — the AI's input. */
export const dischargeProgram: { key: string; label: string; items: string[] }[] = [
  {
    key: "physio",
    label: "Physiotherapy",
    items: [
      "Upper & lower limb PROM + stretching",
      "CPM — continuous passive motion",
      "DVT-prevention exercises",
      "Chest therapy",
      "Sensory stimulation",
    ],
  },
  {
    key: "ot",
    label: "Occupational Therapy",
    items: ["Out-of-bed / wheelchair sitting", "Tactile stimulation", "Pressure-relief techniques"],
  },
  {
    key: "resp",
    label: "Respiratory",
    items: ["Pulmonary hygiene", "Nebulizations", "Tracheostomy site care"],
  },
  {
    key: "speech",
    label: "Speech & Swallow",
    items: ["Oromotor exercises", "Thickened oral feeding (soft/semisolid)"],
  },
  {
    key: "nursing",
    label: "Nursing",
    items: ["2-hourly repositioning", "Hygiene & skin care", "Feeding & catheter care"],
  },
];

export type Medication = {
  name: string;
  dose: string;
  freq: string; // 1-0-1 style
  timing: string;
  note?: string;
};

export const medications: Medication[] = [
  { name: "Rivaroxaban", dose: "20 mg", freq: "1-0-0", timing: "After food", note: "Till review" },
  { name: "Brivaracetam", dose: "75 mg", freq: "1-0-1", timing: "After food" },
  { name: "Amantadine", dose: "100 mg", freq: "0-1-0", timing: "After food" },
  { name: "Sacubitril + Valsartan", dose: "50 mg", freq: "1-0-1", timing: "After food" },
  { name: "Bisoprolol", dose: "5 mg", freq: "1-0-0", timing: "After food" },
  { name: "Clonidine", dose: "0.1 mg", freq: "1-1-1", timing: "After food", note: "For dystonia/PSH" },
  { name: "Torasemide + Spironolactone", dose: "10/25 mg", freq: "1-0-0", timing: "After food" },
  { name: "Metformin", dose: "500 mg", freq: "1-0-1", timing: "Before food" },
  { name: "Pantoprazole", dose: "40 mg", freq: "1-0-0", timing: "Before food" },
  { name: "Pacitane", dose: "2 mg", freq: "½-0-½", timing: "After food" },
  { name: "Melatonin", dose: "3 mg", freq: "0-0-1", timing: "At night" },
];

/**
 * The AI-structured draft SOP — daily home recommendations derived from the
 * discharge program. Every item is a suggestion PENDING the PMR doctor's
 * approval; nothing is active until approved.
 */
export type SopItem = { text: string; schedule: string };
export const draftSop: { key: string; label: string; items: SopItem[] }[] = [
  {
    key: "physio",
    label: "Physiotherapy",
    items: [
      { text: "Limb PROM + stretching", schedule: "20 min · morning & evening" },
      { text: "CPM stimulation", schedule: "2× daily" },
      { text: "Chest physiotherapy", schedule: "Twice daily" },
    ],
  },
  {
    key: "ot",
    label: "Occupational Therapy",
    items: [
      { text: "Wheelchair sitting, out of bed", schedule: "30 min · midday" },
      { text: "Tactile & grip stimulation", schedule: "Daily" },
    ],
  },
  {
    key: "nursing",
    label: "Nursing & positioning",
    items: [
      { text: "Repositioning + skin/pressure check", schedule: "Every 2 hours" },
      { text: "Nebulization", schedule: "3× daily" },
    ],
  },
  {
    key: "speech",
    label: "Speech & Swallow",
    items: [
      { text: "Oromotor exercises", schedule: "Before each feed" },
      { text: "Thickened feeds, upright 90°", schedule: "3-hourly" },
    ],
  },
];

/** 90-day multidisciplinary targets — become the journey milestones on approval. */
export const targets: { window: string; goal: string }[] = [
  { window: "Weeks 1–4", goal: "Tolerates 30 min supported sitting" },
  { window: "Weeks 1–4", goal: "Chest clear, secretions controlled off suction" },
  { window: "Weeks 5–8", goal: "Assisted standing with two persons" },
  { window: "Weeks 5–8", goal: "Full oral feeds, thin liquids reintroduced" },
  { window: "Weeks 9–12", goal: "Transfers with one person" },
  { window: "Weeks 9–12", goal: "Purposeful hand use for self-feeding" },
];

/** Last 7 days of home vitals — the improving trend the PMR reviews (not a single day). */
export type VitalTrend = {
  days: string[];
  bpSys: number[];
  bpDia: number[];
  hr: number[];
  spo2: number[];
  grbs: number[];
  tempF: number[];
};
export const vitalTrend: VitalTrend = {
  days: ["6d ago", "5d", "4d", "3d", "2d", "Yest", "Today"],
  bpSys: [148, 144, 140, 138, 134, 130, 128],
  bpDia: [92, 90, 88, 86, 84, 82, 82],
  hr: [96, 92, 90, 88, 84, 82, 80],
  spo2: [95, 96, 96, 97, 97, 98, 98],
  grbs: [172, 165, 150, 148, 140, 136, 132],
  tempF: [99.4, 99.1, 98.8, 98.6, 98.4, 98.2, 98.1],
};

/** The PMR's caseload — his patients. Only Sarita is fully expanded in the demo. */
export type CaseloadPatient = {
  id: string;
  name: string;
  age: number;
  sex: Sex;
  dayAtHome: number;
  headline: string;
  status: "active" | "in_review";
  pending: number;
};
export const caseload: CaseloadPatient[] = [
  {
    id: "sarita",
    name: patientCase.name,
    age: patientCase.age,
    sex: patientCase.sex,
    dayAtHome: patientCase.dayAtHome,
    headline: "CVT · post-craniectomy · tetraplegia, improving",
    status: "active",
    pending: 3,
  },
  {
    id: "ramesh",
    name: "Ramesh Gowda",
    age: 63,
    sex: "M",
    dayAtHome: 21,
    headline: "Ischaemic stroke · left hemiparesis",
    status: "active",
    pending: 0,
  },
  {
    id: "fatima",
    name: "Fatima Begum",
    age: 71,
    sex: "F",
    dayAtHome: 3,
    headline: "Post-op spine · early mobilisation",
    status: "in_review",
    pending: 1,
  },
];

/** Items awaiting the PMR's decision — the approvals inbox. */
export type ApprovalType = "nurse_query" | "duty_med" | "patient_query";
export type Approval = {
  id: string;
  type: ApprovalType;
  from: string;
  when: string;
  message: string;
  suggestion?: string; // present for duty-doctor medicine suggestions
  urgency: "routine" | "urgent";
};
export const approvals: Approval[] = [
  {
    id: "a1",
    type: "duty_med",
    from: "Dr. Farhan · Duty Doctor",
    when: "20 min ago",
    message: "BP has trended down all week on dual diuretic; sodium 140.",
    suggestion: "Reduce Torasemide + Spironolactone to alternate days",
    urgency: "routine",
  },
  {
    id: "a2",
    type: "nurse_query",
    from: "Nisha · Nurse",
    when: "1 h ago",
    message: "Swallow looks stronger today — family asking to start thin liquids. Hold for your call?",
    urgency: "urgent",
  },
  {
    id: "a3",
    type: "patient_query",
    from: "Family · Sarita's son",
    when: "2 h ago",
    message: "Can we increase her wheelchair sitting time?",
    urgency: "routine",
  },
];

/** The day aggregated from caregiver -> nurse -> duty doctor. */
export type DailyUpdate = {
  time: string;
  source: "caregiver" | "nurse" | "duty_doctor";
  by: string;
  text: string;
  flag?: "info" | "watch";
};
export const dailyUpdates: DailyUpdate[] = [
  { time: "14:10", source: "caregiver", by: "Lakshmi", text: "Repositioned to left side. Heels & sacrum checked — skin intact.", flag: "info" },
  { time: "13:20", source: "nurse", by: "Nisha", text: "Swallow reviewed — stronger today; kept thickened. Flagged to PMR.", flag: "watch" },
  { time: "12:30", source: "caregiver", by: "Lakshmi", text: "Wheelchair sitting 30 min tolerated. Lunch ~90%.", flag: "info" },
  { time: "10:00", source: "caregiver", by: "Lakshmi", text: "CPM + limb stretching done. Repositioned (2-hourly).", flag: "info" },
  { time: "09:30", source: "duty_doctor", by: "Dr. Farhan", text: "Vitals stable, BP improving. Medicine suggestion raised for your approval.", flag: "info" },
  { time: "08:00", source: "caregiver", by: "Lakshmi", text: "Morning medicines + nebulization given.", flag: "info" },
];

/** The approved multidisciplinary SOP, as the caregiver's day. */
export type CareTask = {
  id: string;
  time: string;
  discipline: string;
  title: string;
  detail: string;
  icon: string;
};
export const todayTasks: CareTask[] = [
  { id: "t1", time: "07:00", discipline: "Medicine", title: "Morning medicines", detail: "With breakfast", icon: "💊" },
  { id: "t2", time: "07:30", discipline: "Feeding", title: "Breakfast — thickened, upright 90°", detail: "Small spoons; watch swallow", icon: "🍲" },
  { id: "t3", time: "08:30", discipline: "Physiotherapy", title: "Limb PROM + stretching", detail: "20 minutes", icon: "🦵" },
  { id: "t4", time: "09:00", discipline: "Physiotherapy", title: "CPM stimulation", detail: "As set on the device", icon: "🔁" },
  { id: "t5", time: "10:00", discipline: "Nursing", title: "Repositioning + skin check", detail: "2-hourly", icon: "🔄" },
  { id: "t6", time: "11:00", discipline: "Respiratory", title: "Nebulization", detail: "Chest physiotherapy after", icon: "💨" },
  { id: "t7", time: "12:00", discipline: "Occupational", title: "Wheelchair sitting", detail: "30 minutes, out of bed", icon: "🦽" },
  { id: "t8", time: "12:30", discipline: "Feeding", title: "Lunch — thickened, upright 90°", detail: "Watch swallow", icon: "🍲" },
  { id: "t9", time: "14:00", discipline: "Nursing", title: "Repositioning + skin check", detail: "2-hourly", icon: "🔄" },
  { id: "t10", time: "16:00", discipline: "Speech & Swallow", title: "Oromotor exercises", detail: "Before evening feed", icon: "🗣️" },
  { id: "t11", time: "19:00", discipline: "Medicine", title: "Evening medicines", detail: "After dinner", icon: "💊" },
];

/** The daily readings the caregiver records at home — these flow up to the doctors. */
export type Readings = {
  bp: string;
  grbs: string;
  urineMl: string;
  foodIntake: string;
  mood: string;
  activity: string;
};
export const seededReadings: Readings = {
  bp: "128/82",
  grbs: "132",
  urineMl: "1450",
  foodIntake: "Most",
  mood: "🙂 Calm",
  activity: "Wheelchair 30 min",
};
export const FOOD_OPTIONS = ["All", "Most", "Some", "Little", "Refused"];
export const MOOD_OPTIONS = ["🙂 Calm", "😐 Flat", "😟 Restless", "😣 Distressed"];
