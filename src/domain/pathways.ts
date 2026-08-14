// Carelune — governed Pathway Engine vocabulary (client-side source of truth for
// the stable module system). Pathway *content* lives in the database as versioned,
// doctor-approved config (pathway_versions.config); this file defines the fixed
// vocabulary that config is validated against, so screens render a stable set of
// modules driven by governed configuration — never AI-generated pages.

export type PathwayPackKey = "spine" | "joint" | "neuro";

export type PathwayStatus =
  | "draft"
  | "clinically_review_required"
  | "approved"
  | "retired";

/** Who records a module's observations. Authorization is enforced in the DB; this
 *  only drives which surface shows the input. */
export type Recorder = "caregiver" | "family" | "nurse" | "doctor" | "therapist";

export type Frequency =
  | "once"
  | "daily"
  | "twice_daily"
  | "weekly"
  | "per_visit"
  | "phase_start"
  | "as_needed";

export const RECORDERS: Recorder[] = ["caregiver", "family", "nurse", "doctor", "therapist"];
export const FREQUENCIES: Frequency[] = [
  "once",
  "daily",
  "twice_daily",
  "weekly",
  "per_visit",
  "phase_start",
  "as_needed",
];

/** Module category — groups modules into the ~common product surfaces. */
export type ModuleCategory =
  | "overview"
  | "clinical"
  | "monitoring"
  | "function"
  | "therapy"
  | "care"
  | "communication";

export interface ModuleMeta {
  key: string;
  label: string;
  category: ModuleCategory;
  /** Default recorder if a pathway version doesn't override it. */
  defaultRecorder: Recorder;
  /** True for the ~80% modules present on essentially every pathway. */
  common: boolean;
}

/**
 * The fixed module catalogue. ~common modules (the shared 80%) plus the
 * pathway-specific modules the three packs may enable. A pathway version may
 * ENABLE a subset and override recorder/frequency/fields — it can never invent a
 * module key outside this registry.
 */
export const MODULE_REGISTRY: Record<string, ModuleMeta> = {
  // ---- common (~80%) ----
  patient_overview: { key: "patient_overview", label: "Patient overview", category: "overview", defaultRecorder: "nurse", common: true },
  diagnosis_procedure: { key: "diagnosis_procedure", label: "Diagnosis & procedure", category: "clinical", defaultRecorder: "doctor", common: true },
  medicines: { key: "medicines", label: "Medicines", category: "clinical", defaultRecorder: "doctor", common: true },
  investigations: { key: "investigations", label: "Investigations & labs", category: "clinical", defaultRecorder: "nurse", common: true },
  vitals: { key: "vitals", label: "Vitals", category: "monitoring", defaultRecorder: "caregiver", common: true },
  pain: { key: "pain", label: "Pain", category: "monitoring", defaultRecorder: "caregiver", common: true },
  mobility_function: { key: "mobility_function", label: "Mobility & function", category: "function", defaultRecorder: "caregiver", common: true },
  physiotherapy: { key: "physiotherapy", label: "Physiotherapy", category: "therapy", defaultRecorder: "therapist", common: true },
  diet_hydration: { key: "diet_hydration", label: "Diet & hydration", category: "care", defaultRecorder: "caregiver", common: true },
  wound_care: { key: "wound_care", label: "Wound care", category: "care", defaultRecorder: "caregiver", common: true },
  bowel_bladder: { key: "bowel_bladder", label: "Bowel & bladder", category: "care", defaultRecorder: "caregiver", common: true },
  daily_tasks: { key: "daily_tasks", label: "Daily care tasks", category: "care", defaultRecorder: "caregiver", common: true },
  milestones: { key: "milestones", label: "Milestones", category: "function", defaultRecorder: "nurse", common: true },
  questions_concerns: { key: "questions_concerns", label: "Questions & concerns", category: "communication", defaultRecorder: "family", common: true },

  // ---- spine-specific ----
  radiating_pain: { key: "radiating_pain", label: "Radiating pain", category: "monitoring", defaultRecorder: "caregiver", common: false },
  numbness_weakness: { key: "numbness_weakness", label: "New numbness or weakness", category: "monitoring", defaultRecorder: "caregiver", common: false },
  spine_precautions: { key: "spine_precautions", label: "Doctor-approved precautions", category: "clinical", defaultRecorder: "doctor", common: false },

  // ---- joint-specific ----
  swelling: { key: "swelling", label: "Swelling", category: "monitoring", defaultRecorder: "caregiver", common: false },
  range_of_motion: { key: "range_of_motion", label: "Range of movement", category: "function", defaultRecorder: "therapist", common: false },
  weight_bearing: { key: "weight_bearing", label: "Weight-bearing instruction", category: "clinical", defaultRecorder: "doctor", common: false },
  walking_distance: { key: "walking_distance", label: "Walking distance & assistance", category: "function", defaultRecorder: "caregiver", common: false },
  walking_aid: { key: "walking_aid", label: "Walking aid", category: "function", defaultRecorder: "caregiver", common: false },
  dvt_infection_watch: { key: "dvt_infection_watch", label: "Infection / DVT warning signs", category: "monitoring", defaultRecorder: "caregiver", common: false },

  // ---- neuro-specific ----
  affected_side: { key: "affected_side", label: "Diagnosis & affected side", category: "clinical", defaultRecorder: "doctor", common: false },
  adl: { key: "adl", label: "Activities of daily living", category: "function", defaultRecorder: "caregiver", common: false },
  feeding_swallowing: { key: "feeding_swallowing", label: "Feeding & swallowing", category: "care", defaultRecorder: "caregiver", common: false },
  speech_communication: { key: "speech_communication", label: "Speech & communication", category: "function", defaultRecorder: "therapist", common: false },
  cognition_behaviour: { key: "cognition_behaviour", label: "Cognition & behaviour", category: "monitoring", defaultRecorder: "caregiver", common: false },
  skin_integrity: { key: "skin_integrity", label: "Skin integrity", category: "care", defaultRecorder: "caregiver", common: false },
  spasticity: { key: "spasticity", label: "Pain & spasticity", category: "monitoring", defaultRecorder: "caregiver", common: false },
  therapy_participation: { key: "therapy_participation", label: "Therapy participation", category: "therapy", defaultRecorder: "therapist", common: false },
  caregiver_burden: { key: "caregiver_burden", label: "Caregiver observations & burden", category: "communication", defaultRecorder: "family", common: false },
  equipment_needs: { key: "equipment_needs", label: "Equipment / home-care needs", category: "care", defaultRecorder: "nurse", common: false },
};

export const PACK_META: Record<PathwayPackKey, { name: string; specialty: string }> = {
  spine: { name: "Spine Recovery", specialty: "Spine surgery" },
  joint: { name: "Joint Replacement Recovery", specialty: "Orthopaedics — arthroplasty" },
  neuro: { name: "Neuro-Rehabilitation Continuity", specialty: "Neuro-rehabilitation" },
};

/** Stable display order for the three governed packs. */
export const PACK_ORDER: PathwayPackKey[] = ["spine", "joint", "neuro"];

/**
 * App roles that actually have a login today (no dedicated "therapist" login yet).
 * A module's clinical `recorded_by: "therapist"` therefore maps to the NURSE /
 * coordinator, who records therapy observations from the physiotherapist's visit
 * note. A dedicated therapist role is a planned addition; until then this mapping
 * is the single place that resolves it.
 */
export type AppRoleForRecording = "caregiver" | "family" | "nurse" | "pmr";
export function recorderAppRole(r: Recorder): AppRoleForRecording {
  switch (r) {
    case "caregiver": return "caregiver";
    case "family": return "family";
    case "doctor": return "pmr";
    case "nurse": return "nurse";
    case "therapist": return "nurse"; // no therapist login yet — coordinator records
  }
}

/* ------------------------------ config shapes ----------------------------- */

export interface PathwayPhase {
  key: string;
  name: string;
  from_day: number;
  to_day: number | null;
}
export interface PathwayModuleCfg {
  key: string; // must exist in MODULE_REGISTRY
  recorded_by: Recorder;
  frequency: Frequency;
  fields?: string[];
}
export interface PathwayMilestone {
  key: string;
  name: string;
  by_day: number | null;
  phase?: string;
}
export interface PathwayWarning {
  key: string;
  text: string;
  severity: "attention" | "urgent";
}
export interface PathwayEducation {
  key: string;
  title: string;
  status: "approved" | "approval_pending";
}
export interface PathwayConfig {
  /** Governance marker inside the config itself. */
  content_status: PathwayStatus;
  phases: PathwayPhase[];
  modules: PathwayModuleCfg[];
  milestones: PathwayMilestone[];
  warning_signs: PathwayWarning[];
  escalation: { routine: string; urgent: string; emergency: string };
  education: PathwayEducation[];
}
