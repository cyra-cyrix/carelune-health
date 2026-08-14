// Carelune — governed validation for the Pathway Engine.
//
//  * validatePathwayConfig  — Stage A: a pathway version's config must only use
//    known modules/recorders/frequencies (no invented clinical structure).
//  * validatePlanOutput     — Stage B: the AI patient-plan DRAFT is checked
//    against a strict schema before it is ever displayed or stored. The model may
//    NOT invent medicines, diagnoses, doses or restrictions: fact fields must
//    carry document/doctor provenance, or validation fails.
//
// Pure, dependency-free, deterministic — safe to run in the browser, an Edge
// Function, or a unit test.

import {
  MODULE_REGISTRY,
  RECORDERS,
  FREQUENCIES,
  type PathwayConfig,
} from "../domain/pathways";

export interface ValidationResult<T = unknown> {
  ok: boolean;
  errors: string[];
  value?: T;
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string";
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const nonEmpty = (v: unknown): v is string => isStr(v) && v.trim().length > 0;

const STATUSES = ["draft", "clinically_review_required", "approved", "retired"];

/* ------------------------------- Stage A ---------------------------------- */

export function validatePathwayConfig(config: unknown): ValidationResult<PathwayConfig> {
  const e: string[] = [];
  if (!isObj(config)) return { ok: false, errors: ["config must be an object"] };

  if (!STATUSES.includes(String(config.content_status)))
    e.push(`content_status must be one of ${STATUSES.join("/")}`);

  const phases = config.phases;
  if (!Array.isArray(phases) || phases.length === 0) e.push("phases must be a non-empty array");
  else
    phases.forEach((p, i) => {
      if (!isObj(p) || !nonEmpty(p.key) || !nonEmpty(p.name)) e.push(`phase[${i}] needs key + name`);
      if (p && isObj(p) && !isNum(p.from_day)) e.push(`phase[${i}].from_day must be a number`);
    });

  const modules = config.modules;
  if (!Array.isArray(modules) || modules.length === 0) e.push("modules must be a non-empty array");
  else
    modules.forEach((m, i) => {
      if (!isObj(m)) return e.push(`module[${i}] must be an object`);
      if (!isStr(m.key) || !MODULE_REGISTRY[m.key]) e.push(`module[${i}].key "${String(m.key)}" is not a known module`);
      if (!RECORDERS.includes(m.recorded_by as never)) e.push(`module[${i}].recorded_by "${String(m.recorded_by)}" is invalid`);
      if (!FREQUENCIES.includes(m.frequency as never)) e.push(`module[${i}].frequency "${String(m.frequency)}" is invalid`);
      if (m.fields !== undefined && !Array.isArray(m.fields)) e.push(`module[${i}].fields must be an array`);
    });

  if (!Array.isArray(config.milestones)) e.push("milestones must be an array");
  if (!Array.isArray(config.warning_signs)) e.push("warning_signs must be an array");
  else
    (config.warning_signs as unknown[]).forEach((w, i) => {
      if (!isObj(w) || !nonEmpty(w.text)) e.push(`warning_signs[${i}] needs text`);
      if (isObj(w) && !["attention", "urgent"].includes(String(w.severity)))
        e.push(`warning_signs[${i}].severity must be attention/urgent`);
    });

  const esc = config.escalation;
  if (!isObj(esc) || !nonEmpty(esc.routine) || !nonEmpty(esc.urgent) || !nonEmpty(esc.emergency))
    e.push("escalation must have routine, urgent and emergency");

  if (!Array.isArray(config.education)) e.push("education must be an array");

  return e.length ? { ok: false, errors: e } : { ok: true, errors: [], value: config as unknown as PathwayConfig };
}

/* ------------------------------- Stage B ---------------------------------- */

export type Provenance = "document" | "doctor" | "pathway" | "ai_structured" | "missing";
const PROVENANCE: Provenance[] = ["document", "doctor", "pathway", "ai_structured", "missing"];
/** Facts the model must never invent — must be traceable to a document or the doctor. */
const FACT: Provenance[] = ["document", "doctor"];

export interface PlanMedicine { name: string; dose: string; freq: string; timing: string; note: string; provenance: Provenance }
export interface PlanFact { text: string; provenance: Provenance }
export interface PlanTask { time_label: string; discipline: string; title: string; detail: string; provenance: Provenance }
export interface PlanObservation { module: string; frequency: string; recorded_by: string }
export interface PlanDraft {
  clinical_summary: string;
  diagnosis: PlanFact[];
  procedure: PlanFact | null;
  medicines: PlanMedicine[];
  investigations: PlanFact[];
  daily_tasks: PlanTask[];
  therapy_tasks: PlanTask[];
  diet: PlanFact[];
  observations: PlanObservation[];
  milestones: { key: string; name: string; by_day: number | null }[];
  precautions: PlanFact[];
  warning_signs: { text: string; severity: string }[];
  escalation: { routine: string; urgent: string; emergency: string };
  education: { title: string; status: string }[];
  review_dates: { date: string; purpose: string }[];
  missing: string[];
}

const ALLOWED_KEYS = new Set([
  "clinical_summary", "diagnosis", "procedure", "medicines", "investigations",
  "daily_tasks", "therapy_tasks", "diet", "observations", "milestones",
  "precautions", "warning_signs", "escalation", "education", "review_dates", "missing",
]);

/**
 * Strict validation of an AI plan DRAFT. `enabledModules` (optional) restricts
 * observations to the pathway's enabled modules. Returns ok:false with the list
 * of every violation — the caller must NOT display or store an invalid draft.
 */
export function validatePlanOutput(raw: unknown, enabledModules?: string[]): ValidationResult<PlanDraft> {
  const e: string[] = [];
  if (!isObj(raw)) return { ok: false, errors: ["plan must be an object"] };

  for (const k of Object.keys(raw)) if (!ALLOWED_KEYS.has(k)) e.push(`unexpected key "${k}" (strict schema)`);

  if (!isStr(raw.clinical_summary)) e.push("clinical_summary must be a string");

  const checkFacts = (label: string, allowed: Provenance[]) => {
    const arr = raw[label];
    if (arr === undefined) return;
    if (!Array.isArray(arr)) return e.push(`${label} must be an array`);
    arr.forEach((f, i) => {
      if (!isObj(f) || !nonEmpty(f.text)) e.push(`${label}[${i}] needs non-empty text`);
      const p = isObj(f) ? String(f.provenance) : "";
      if (!PROVENANCE.includes(p as Provenance)) e.push(`${label}[${i}].provenance "${p}" is invalid`);
      else if (!allowed.includes(p as Provenance)) e.push(`${label}[${i}] provenance "${p}" not allowed here (needs ${allowed.join("/")})`);
    });
  };

  // Facts the AI must never invent.
  checkFacts("diagnosis", FACT);
  checkFacts("investigations", [...FACT, "pathway"]);
  checkFacts("diet", FACT);
  checkFacts("precautions", [...FACT, "pathway"]);

  if (raw.procedure !== null && raw.procedure !== undefined) {
    const pr = raw.procedure;
    if (!isObj(pr) || !nonEmpty(pr.text)) e.push("procedure must be null or {text, provenance}");
    else if (!FACT.includes(String(pr.provenance) as Provenance)) e.push("procedure provenance must be document/doctor");
  }

  // Medicines — copied exactly; never invented.
  if (raw.medicines !== undefined) {
    if (!Array.isArray(raw.medicines)) e.push("medicines must be an array");
    else
      raw.medicines.forEach((m, i) => {
        if (!isObj(m)) return e.push(`medicines[${i}] must be an object`);
        if (!nonEmpty(m.name)) e.push(`medicines[${i}].name is required (AI must copy medicines exactly)`);
        const p = String(m.provenance);
        if (!FACT.includes(p as Provenance))
          e.push(`medicines[${i}].provenance "${p}" invalid — medicines must come from a document or the doctor, never invented`);
      });
  }

  const checkTasks = (label: string) => {
    const arr = raw[label];
    if (arr === undefined) return;
    if (!Array.isArray(arr)) return e.push(`${label} must be an array`);
    arr.forEach((t, i) => {
      if (!isObj(t) || !nonEmpty(t.title)) e.push(`${label}[${i}] needs a title`);
      const p = isObj(t) ? String(t.provenance) : "";
      if (!PROVENANCE.includes(p as Provenance)) e.push(`${label}[${i}].provenance "${p}" is invalid`);
    });
  };
  checkTasks("daily_tasks");
  checkTasks("therapy_tasks");

  if (raw.observations !== undefined) {
    if (!Array.isArray(raw.observations)) e.push("observations must be an array");
    else
      raw.observations.forEach((o, i) => {
        if (!isObj(o) || !nonEmpty(o.module)) return e.push(`observations[${i}] needs a module`);
        if (!MODULE_REGISTRY[String(o.module)]) e.push(`observations[${i}].module "${String(o.module)}" is not a known module`);
        else if (enabledModules && !enabledModules.includes(String(o.module)))
          e.push(`observations[${i}].module "${String(o.module)}" is not enabled for this pathway`);
      });
  }

  if (raw.missing !== undefined && !Array.isArray(raw.missing)) e.push("missing must be an array of strings");

  return e.length ? { ok: false, errors: e } : { ok: true, errors: [], value: raw as unknown as PlanDraft };
}
