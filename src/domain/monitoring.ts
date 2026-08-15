// The recovery-loop monitoring catalogue: the single mapping from a patient's
// PRESCRIBED plan modules → the parameters the caregiver records and the family
// views. Both surfaces derive their parameter set from here so they stay
// patient-specific and never drift. Storage fields map to daily_readings
// (ReadingsInput); threshold keys match reading_thresholds.param.
//
// A parameter is shown for a patient only if one of its `modules` is in that
// patient's plan observations (or a diagnosis keyword matches, e.g. diabetes →
// blood sugar). Nothing generic is shown "just in case".

import type { ReadingsInput } from "../lib/db";

export type ParamInputKind = "bp" | "number" | "scale" | "select";
export type ParamGroup = "vitals" | "intake" | "elimination" | "function" | "wellbeing";

export interface MonitorParam {
  /** Stable id; also the reading_thresholds.param key. */
  key: string;
  label: string;
  /** Compact label for family cards. */
  short: string;
  /** Storage field on daily_readings (camelCase ReadingsInput). */
  field: keyof ReadingsInput;
  input: ParamInputKind;
  unit?: string;
  min?: number;
  max?: number;
  options?: string[];
  placeholder?: string;
  /** Plan observation modules that prescribe this parameter. */
  modules: string[];
  /** Alternative gate — show if the diagnosis text contains any keyword. */
  diagnosisKeywords?: string[];
  /** Alternative gate — show if any care-task title contains a keyword. Lets
   *  vitals prescribed as nursing/monitoring TASKS (not observation modules)
   *  still surface on the caregiver Record page. */
  taskKeywords?: string[];
  /** Core home vital — always shown on the caregiver Record page regardless of
   *  how the plan expresses it (the universal set a caregiver records at home). */
  core?: boolean;
  /** Eligible for a numeric trend in the family view. */
  trend?: boolean;
  group: ParamGroup;
}

export const GROUP_LABEL: Record<ParamGroup, string> = {
  vitals: "Vitals",
  intake: "Feeding & fluids",
  elimination: "Bladder & bowel",
  function: "Mobility & skin",
  wellbeing: "Mood & mind",
};

const MOOD = ["Comfortable", "Low", "Anxious", "Irritable", "Withdrawn"];
const FEEDING = ["Oral — normal", "Oral — soft / thickened", "Ryle's tube", "Nil by mouth"];
const BOWEL = ["Passed — normal", "Passed — hard / constipated", "Loose", "Not passed"];
const MOBILITY = ["Bed-bound", "Sits with support", "Sits independently", "Stands with help", "Walks with aid", "Walks independently"];
const SKIN = ["Intact", "Redness", "Broken / pressure area"];
const COGNITION = ["Alert & oriented", "Drowsy", "Confused", "Not communicating"];

/** Ordered catalogue — display order in both Record and Family. */
export const PARAM_CATALOGUE: MonitorParam[] = [
  { key: "bp", label: "Blood pressure", short: "BP", field: "bp", input: "bp", unit: "mmHg", modules: ["vitals"], taskKeywords: ["blood pressure", "bp"], core: true, trend: true, group: "vitals" },
  { key: "pulse", label: "Pulse", short: "Pulse", field: "pulse", input: "number", unit: "bpm", min: 30, max: 200, modules: ["vitals"], taskKeywords: ["pulse", "heart rate"], core: true, trend: true, group: "vitals" },
  { key: "spo2", label: "SpO₂", short: "SpO₂", field: "spo2", input: "number", unit: "%", min: 50, max: 100, modules: ["vitals"], taskKeywords: ["spo2", "spo₂", "oxygen", "saturation", "pulse ox"], core: true, trend: true, group: "vitals" },
  { key: "temperature", label: "Temperature", short: "Temp", field: "temperature", input: "number", unit: "°F", min: 93, max: 108, modules: ["vitals"], taskKeywords: ["temperature", "temp", "fever"], core: true, trend: true, group: "vitals" },
  { key: "grbs", label: "Blood sugar", short: "Sugar", field: "grbs", input: "number", unit: "mg/dL", min: 20, max: 600, modules: [], diagnosisKeywords: ["diabet", "dm", "sugar", "glycae", "glucose"], taskKeywords: ["sugar", "grbs", "glucose", "glycae"], core: true, trend: true, group: "vitals" },
  { key: "pain", label: "Pain", short: "Pain", field: "pain", input: "scale", unit: "/10", min: 0, max: 10, modules: ["pain", "spasticity", "radiating_pain"], taskKeywords: ["pain", "spasticity"], core: true, trend: true, group: "vitals" },
  { key: "fluid_ml", label: "Fluid intake", short: "Fluids", field: "fluidMl", input: "number", unit: "mL", min: 0, max: 5000, modules: ["diet_hydration"], taskKeywords: ["fluid", "hydration", "intake", "diet"], trend: true, group: "intake" },
  { key: "feeding", label: "Feeding & swallowing", short: "Feeding", field: "feeding", input: "select", options: FEEDING, modules: ["feeding_swallowing", "diet_hydration"], taskKeywords: ["feeding", "swallow"], group: "intake" },
  { key: "urine_ml", label: "Urine output", short: "Urine", field: "urineMl", input: "number", unit: "mL", min: 0, max: 5000, modules: ["bowel_bladder"], taskKeywords: ["urine", "output"], trend: true, group: "elimination" },
  { key: "bowel", label: "Bowel movement", short: "Bowel", field: "bowel", input: "select", options: BOWEL, modules: ["bowel_bladder"], taskKeywords: ["bowel", "bladder"], group: "elimination" },
  { key: "activity", label: "Mobility", short: "Mobility", field: "activity", input: "select", options: MOBILITY, modules: ["mobility_function", "adl", "walking_distance", "range_of_motion"], taskKeywords: ["mobility", "walking", "adl", "motion", "range of"], group: "function" },
  { key: "skin", label: "Skin condition", short: "Skin", field: "skin", input: "select", options: SKIN, modules: ["skin_integrity", "wound_care"], taskKeywords: ["skin", "wound", "pressure"], group: "function" },
  { key: "mood", label: "Mood", short: "Mood", field: "mood", input: "select", options: MOOD, modules: ["cognition_behaviour"], taskKeywords: ["mood"], group: "wellbeing" },
  { key: "cognition", label: "Cognition & communication", short: "Mind", field: "cognition", input: "select", options: COGNITION, modules: ["cognition_behaviour", "speech_communication"], taskKeywords: ["cognition", "speech", "communication", "behaviour"], group: "wellbeing" },
];

/** Core caregiver modules used when a patient has no explicit plan observations
 *  yet (so the Record tab is never empty for an active patient). */
const DEFAULT_CORE_MODULES = ["vitals", "pain", "mobility_function", "diet_hydration", "bowel_bladder"];

/**
 * The parameters prescribed for a patient, in catalogue order. Core home vitals
 * are always included; the rest are driven by the plan's observation modules,
 * the patient's care-task titles (so vitals prescribed as nursing tasks still
 * appear), diagnosis keywords, or the common core fallback when a plan has none.
 */
export function prescribedParams(modules: string[], diagnosis: string[] = [], taskTitles: string[] = []): MonitorParam[] {
  const set = new Set(modules.length ? modules : DEFAULT_CORE_MODULES);
  const diag = diagnosis.join(" ").toLowerCase();
  const titles = taskTitles.join(" · ").toLowerCase();
  return PARAM_CATALOGUE.filter(
    (p) =>
      p.core ||
      p.modules.some((m) => set.has(m)) ||
      (p.diagnosisKeywords?.some((k) => diag.includes(k)) ?? false) ||
      (p.taskKeywords?.some((k) => titles.includes(k)) ?? false),
  );
}

/** Parse a stored reading value to a number for trend/threshold comparison.
 *  Blood pressure compares the systolic value. Returns null if not numeric. */
export function numericValue(param: MonitorParam, raw: string | null | undefined): number | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (param.input === "bp") {
    const m = s.match(/(\d{2,3})/);
    return m ? Number(m[1]) : null;
  }
  const m = s.match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

export type ParamStatus = "normal" | "attention" | "unknown";

/** Status for a value against a doctor-approved threshold (min/max). Returns
 *  'unknown' when no threshold is set — the family view then shows NO badge. */
export function statusFor(
  param: MonitorParam,
  raw: string | null | undefined,
  threshold: { min_val: number | null; max_val: number | null } | undefined,
): ParamStatus {
  if (!threshold || (threshold.min_val == null && threshold.max_val == null)) return "unknown";
  const v = numericValue(param, raw);
  if (v == null) return "unknown";
  if (threshold.min_val != null && v < threshold.min_val) return "attention";
  if (threshold.max_val != null && v > threshold.max_val) return "attention";
  return "normal";
}
