export type CareStatus = "done" | "now" | "upcoming" | "missed";
export type DaySegment = "Morning" | "Midday" | "Evening";

export interface CareTask {
  id: string;
  time: string; // "07:00"
  segment: DaySegment;
  category: string; // Medication, Feeding, Physiotherapy, ...
  icon: string; // emoji — warm, instantly recognizable for a low-literacy caretaker
  title: string;
  note: string;
  status: CareStatus;
  result?: string; // logged outcome, e.g. "ROM 0–110°, 10 reps"
  isConsult?: boolean;
  safety?: string; // clinical stop-condition shown prominently on the task
}

export interface TrendPoint {
  label: string;
  score: number;
}

export interface Milestone {
  label: string;
  done: boolean;
}

export interface CareTeamMember {
  name: string;
  role: string;
  initials: string;
}

export interface PatientSummary {
  name: string;
  firstName: string;
  dayAtHome: number;
  caretaker: string;
  family: string;
  condition: string;
  location: string;
}

/* ---- Home signals (the AI's fuel: daily I/O + wellbeing charting) ---- */
export interface DailySignals {
  fluids: { ml: number; targetMl: number };
  urine: { ml: number; color: 0 | 1 | 2 }; // 0 pale (good) → 2 dark (flag)
  meals: { name: string; icon: string; pct: number | null }[]; // % eaten, null = not yet
  mood: number | null; // 1–5
  pain: number | null; // 0–10
  sleepHrs: number | null;
  vitals: { bp: string | null; pulse: number | null; spo2: number | null };
  bowel: boolean;
}

export interface WeekDay {
  d: string; // "Mon"
  n: number; // 6
  done: number;
  total: number;
  today?: boolean;
}

/* ---- Medications & labs (doctor prescribes, caretaker administers, AI trends) ---- */
export type MedState = "taken" | "due" | "prn" | "missed";

export interface MedDose {
  id: string;
  name: string;
  dose: string;
  route?: string;
  purpose: string; // plain-language "what it's for"
  withFood?: boolean;
  slot: "Morning" | "Afternoon" | "Night" | "As needed";
  time: string;
  state: MedState;
  changed?: boolean; // recently adjusted after a documented consultation
  /* Verified prescribing source — the only permitted origins. */
  sourceKind: "discharge_prescription" | "clinician_consultation";
  sourceRef: string;
  sourceDate: string;
  lastVerified: string;
  verifiedBy: string;
}

export type MedStatus = "active" | "new" | "changed" | "stopped";

export interface Medication {
  id: string;
  name: string;
  dose: string;
  schedule: string; // "1-1-1" morning-noon-night
  purpose: string;
  status: MedStatus;
  note?: string;
}

export type LabFlag = "normal" | "high" | "low";

export interface LabResult {
  id: string;
  name: string;
  value: string;
  unit: string;
  ref: string; // reference range, e.g. "< 7.0"
  flag: LabFlag;
  date: string;
  trend: number[]; // most-recent last
}

export interface LabOrder {
  name: string;
  due: string;
  collection: string; // "Home collection"
}

export interface DxEvent {
  label: string;
  date: string;
}

export interface PatientHistory {
  primaryDx: string;
  onset: string;
  timeline: DxEvent[];
  comorbidities: string[];
  activeProblems: string[];
  allergies: string[];
  premorbid: string;
  course: string; // inpatient course summary
  goals: string[];
}

/* ---- Hospital end ---- */
export type PatientRiskStatus = "good" | "warn" | "alert";

export interface PatientRow {
  id: string;
  name: string;
  age: number;
  condition: string;
  location: string;
  dayAtHome: number;
  caretaker: string;
  family: string;
  adherence: number; // 0–100
  status: PatientRiskStatus;
  alerts: string[];
  barthel: number;
  barthelPrev: number;
}

// (AI-authored treatment suggestions were removed per the frozen AI boundary —
// AI provides facts, patterns, concerns and questions only; see data/hospital.ts)
