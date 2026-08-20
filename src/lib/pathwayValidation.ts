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

/*
 * Provenance — where a line in the plan came from. This is the safety spine of
 * the whole feature, so the distinctions matter:
 *
 *   document      copied from the patient's discharge summary / uploaded record
 *   doctor        stated by the treating doctor
 *   ai_structured reformatted by the model from `document`/`doctor` content
 *                 (a schedule assembled out of stated facts — no new clinical content)
 *   ai_suggested  PROPOSED by the model from international standard-of-care where
 *                 the document was silent. New clinical content. See docs/DECISIONS.md
 *                 D-002: the doctor must review every one of these before activation,
 *                 and none is ever shown to a caregiver or family beforehand.
 *   pathway       from a governed template (legacy; retained for stored drafts)
 *   missing       explicitly absent — surfaced to the doctor as a gap to fill
 */
export type Provenance = "document" | "doctor" | "pathway" | "ai_structured" | "ai_suggested" | "missing";
const PROVENANCE: Provenance[] = ["document", "doctor", "pathway", "ai_structured", "ai_suggested", "missing"];
/** Facts the model must never invent — must be traceable to a document or the doctor. */
const FACT: Provenance[] = ["document", "doctor"];
/** Regimen content the model MAY propose (D-002), on top of anything it may structure. */
const REGIMEN: Provenance[] = [...FACT, "pathway", "ai_structured", "ai_suggested"];

/** True when this line is new clinical content the model proposed. */
export const isProposed = (p: Provenance): boolean => p === "ai_suggested";

export interface PlanMedicine { name: string; dose: string; freq: string; timing: string; note: string; provenance: Provenance }
export interface PlanFact { text: string; provenance: Provenance }
/**
 * A scheduled instruction. `from_day`/`through_day` are day offsets from the start
 * of the programme (day 1 = discharge day), so a plan can say "twice daily, days
 * 1–7, then stop" instead of an undated list. Both optional: absent means "for the
 * whole programme".
 */
export interface PlanTask {
  time_label: string;
  discipline: string;
  title: string;
  detail: string;
  provenance: Provenance;
  from_day?: number | null;
  through_day?: number | null;
}
export interface PlanObservation { module: string; frequency: string; recorded_by: string }
/** A measurable recovery target the doctor is aiming the patient at. */
export interface PlanTarget { text: string; by_day: number | null; provenance: Provenance }
export interface PlanDraft {
  clinical_summary: string;
  diagnosis: PlanFact[];
  procedure: PlanFact | null;
  medicines: PlanMedicine[];
  investigations: PlanFact[];
  daily_tasks: PlanTask[];
  therapy_tasks: PlanTask[];
  /** Wound / surgical-site care. Empty when the patient had no procedure. */
  wound_care: PlanTask[];
  diet: PlanFact[];
  targets: PlanTarget[];
  observations: PlanObservation[];
  milestones: { key: string; name: string; by_day: number | null }[];
  precautions: PlanFact[];
  warning_signs: { text: string; severity: string }[];
  escalation: { routine: string; urgent: string; emergency: string };
  education: { title: string; status: string }[];
  review_dates: { date: string; purpose: string }[];
  missing: string[];
  conflicts?: string[];
  /** Guideline families the draft was written against — shown to the doctor, never
   *  presented as certification or compliance. */
  standards?: string[];
}

const ALLOWED_KEYS = new Set([
  "clinical_summary", "diagnosis", "procedure", "medicines", "investigations",
  "daily_tasks", "therapy_tasks", "wound_care", "diet", "targets", "observations",
  "milestones", "precautions", "warning_signs", "escalation", "education",
  "review_dates", "missing", "conflicts", "standards",
]);

/** Sections where the model is allowed to propose content (D-002). */
export type ProposedSection = "diet" | "precautions" | "targets" | "daily_tasks" | "therapy_tasks" | "wound_care";
const PROPOSED_SECTIONS: ProposedSection[] = ["diet", "precautions", "targets", "daily_tasks", "therapy_tasks", "wound_care"];

/** A pointer to one proposed line, so the UI can accept or remove exactly it. */
export interface ProposedRef { section: ProposedSection; index: number; text: string }

const rowText = (row: unknown): string => {
  const o = row as { text?: string; title?: string } | null;
  return (o?.text ?? o?.title ?? "").trim();
};

/**
 * Every line the model PROPOSED and the doctor has not yet ruled on.
 *
 * The doctor must be able to clear each one, so this deliberately walks EVERY
 * section the model may propose into — including ones the review screen happens
 * to render read-only. A suggestion the doctor cannot reach is a plan that can
 * never be activated.
 */
export function listProposed(plan: Partial<PlanDraft> | null | undefined): ProposedRef[] {
  if (!plan) return [];
  const out: ProposedRef[] = [];
  for (const section of PROPOSED_SECTIONS) {
    const rows = (plan[section] ?? []) as { provenance?: Provenance }[];
    if (!Array.isArray(rows)) continue;
    rows.forEach((row, index) => {
      if (isProposed(row?.provenance as Provenance)) out.push({ section, index, text: rowText(row) });
    });
  }
  return out;
}

/** How many proposed lines still await the doctor (D-002 control 2). */
export function proposedCount(plan: Partial<PlanDraft> | null | undefined): number {
  return listProposed(plan).length;
}

/** Accepting makes the line the DOCTOR's: they are taking responsibility for it. */
export function acceptProposed(plan: PlanDraft, ref: ProposedRef): PlanDraft {
  const rows = [...((plan[ref.section] ?? []) as unknown as Record<string, unknown>[])];
  if (!rows[ref.index]) return plan;
  rows[ref.index] = { ...rows[ref.index], provenance: "doctor" };
  return { ...plan, [ref.section]: rows };
}

/** Rejecting drops the line entirely. */
export function removeProposed(plan: PlanDraft, ref: ProposedRef): PlanDraft {
  const rows = [...((plan[ref.section] ?? []) as unknown as Record<string, unknown>[])];
  if (!rows[ref.index]) return plan;
  rows.splice(ref.index, 1);
  return { ...plan, [ref.section]: rows };
}

/** Accept every outstanding suggestion at once. */
export function acceptAllProposed(plan: PlanDraft): PlanDraft {
  let next = plan;
  for (const section of PROPOSED_SECTIONS) {
    const rows = (next[section] ?? []) as unknown as Record<string, unknown>[];
    if (!Array.isArray(rows) || !rows.length) continue;
    next = {
      ...next,
      [section]: rows.map((r) => (isProposed(r?.provenance as Provenance) ? { ...r, provenance: "doctor" } : r)),
    };
  }
  return next;
}

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

  // Facts the AI must never invent — identity of the illness and what was done.
  checkFacts("diagnosis", FACT);
  checkFacts("investigations", [...FACT, "pathway"]);
  // Regimen content the AI MAY propose where the document is silent (D-002). It is
  // still marked ai_suggested and still blocks activation until the doctor rules on it.
  checkFacts("diet", REGIMEN);
  checkFacts("precautions", REGIMEN);

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

  /** A day offset must be a positive whole number when present. */
  const checkDay = (label: string, i: number, key: string, v: unknown) => {
    if (v === undefined || v === null) return;
    if (!isNum(v) || v < 1 || !Number.isInteger(v)) e.push(`${label}[${i}].${key} must be a whole day number ≥ 1`);
  };

  const checkTasks = (label: string) => {
    const arr = raw[label];
    if (arr === undefined) return;
    if (!Array.isArray(arr)) return e.push(`${label} must be an array`);
    arr.forEach((t, i) => {
      if (!isObj(t) || !nonEmpty(t.title)) return e.push(`${label}[${i}] needs a title`);
      const p = String(t.provenance);
      if (!PROVENANCE.includes(p as Provenance)) e.push(`${label}[${i}].provenance "${p}" is invalid`);
      checkDay(label, i, "from_day", t.from_day);
      checkDay(label, i, "through_day", t.through_day);
      if (isNum(t.from_day) && isNum(t.through_day) && t.through_day < t.from_day)
        e.push(`${label}[${i}] ends (day ${t.through_day}) before it starts (day ${t.from_day})`);
    });
  };
  checkTasks("daily_tasks");
  checkTasks("therapy_tasks");
  checkTasks("wound_care");

  // Recovery targets — what the doctor is aiming at, optionally by a given day.
  if (raw.targets !== undefined) {
    if (!Array.isArray(raw.targets)) e.push("targets must be an array");
    else
      raw.targets.forEach((t, i) => {
        if (!isObj(t) || !nonEmpty(t.text)) return e.push(`targets[${i}] needs non-empty text`);
        const p = String(t.provenance);
        if (!REGIMEN.includes(p as Provenance)) e.push(`targets[${i}].provenance "${p}" is not allowed here`);
        checkDay("targets", i, "by_day", t.by_day);
      });
  }

  // Guideline families the draft was written against — free text, but it must be a
  // list of names. Never rendered as a compliance or certification claim.
  if (raw.standards !== undefined) {
    if (!Array.isArray(raw.standards) || raw.standards.some((s) => !nonEmpty(s)))
      e.push("standards must be an array of non-empty strings");
  }

  // Observations are driven by the governed pathway — module must be known, enabled
  // (when provided) and carry a valid recorder + frequency.
  if (raw.observations !== undefined) {
    if (!Array.isArray(raw.observations)) e.push("observations must be an array");
    else
      raw.observations.forEach((o, i) => {
        if (!isObj(o) || !nonEmpty(o.module)) return e.push(`observations[${i}] needs a module`);
        if (!MODULE_REGISTRY[String(o.module)]) e.push(`observations[${i}].module "${String(o.module)}" is not a known module`);
        else if (enabledModules && !enabledModules.includes(String(o.module)))
          e.push(`observations[${i}].module "${String(o.module)}" is not enabled for this pathway`);
        if (!RECORDERS.includes(o.recorded_by as never)) e.push(`observations[${i}].recorded_by "${String(o.recorded_by)}" is invalid`);
        if (!FREQUENCIES.includes(o.frequency as never)) e.push(`observations[${i}].frequency "${String(o.frequency)}" is invalid`);
      });
  }

  // Milestones — structure only (names are pathway/doctor sourced, never invented facts).
  if (raw.milestones !== undefined) {
    if (!Array.isArray(raw.milestones)) e.push("milestones must be an array");
    else
      raw.milestones.forEach((m, i) => {
        if (!isObj(m) || !nonEmpty(m.name)) e.push(`milestones[${i}] needs a name`);
        if (isObj(m) && m.by_day !== null && m.by_day !== undefined && !isNum(m.by_day))
          e.push(`milestones[${i}].by_day must be a number or null`);
      });
  }

  // Warning signs + escalation — required for a safe home plan.
  if (raw.warning_signs !== undefined) {
    if (!Array.isArray(raw.warning_signs)) e.push("warning_signs must be an array");
    else
      raw.warning_signs.forEach((w, i) => {
        if (!isObj(w) || !nonEmpty(w.text)) e.push(`warning_signs[${i}] needs text`);
        if (isObj(w) && !["attention", "urgent"].includes(String(w.severity)))
          e.push(`warning_signs[${i}].severity must be attention/urgent`);
      });
  }
  const esc = raw.escalation;
  if (!isObj(esc) || !nonEmpty(esc.routine) || !nonEmpty(esc.urgent) || !nonEmpty(esc.emergency))
    e.push("escalation must have routine, urgent and emergency");

  if (raw.review_dates !== undefined) {
    if (!Array.isArray(raw.review_dates)) e.push("review_dates must be an array");
    else
      raw.review_dates.forEach((r, i) => {
        if (!isObj(r) || !nonEmpty(r.purpose)) e.push(`review_dates[${i}] needs a purpose`);
      });
  }

  if (raw.missing !== undefined && !Array.isArray(raw.missing)) e.push("missing must be an array of strings");
  if (raw.conflicts !== undefined && !Array.isArray(raw.conflicts)) e.push("conflicts must be an array of strings");

  return e.length ? { ok: false, errors: e } : { ok: true, errors: [], value: raw as unknown as PlanDraft };
}
