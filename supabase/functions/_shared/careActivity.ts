// ===========================================================================
// MIRROR of src/domain/careActivityModel.ts — do not edit independently.
//
// Deno cannot import from `src/`, so the Edge Functions carry a copy of the
// care-activity vocabulary and its validator, exactly as `_shared/serviceDraft.ts`
// mirrors `src/domain/serviceDraft.ts`. The source file has no imports, so this
// is a verbatim copy below the line: change one, change both.
//
// Why it matters that this is the SAME validator: `compile-care-plan` checks a
// model's reply here before anything is stored, and the browser checks the
// stored programme again before anything is drawn. A shape that only one of them
// accepts is a shape that can reach a patient unvalidated.
// ===========================================================================

 * The universal care activity — the one shape every patient programme is made of.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Before this, what a caregiver was shown for a given instruction was decided by
 * regular expressions over free text: `classifyTask()` guessed a renderer from
 * words like "physio" or "reposition", `parseMed()` guessed a dose schedule from
 * "1-0-1", and `deriveInputType()` guessed a check-in input from English
 * sentence shape. That works for exactly one specialty and silently misreads
 * every other.
 *
 * So the type is DECLARED, not inferred. An activity says what kind of
 * interaction it is and what shape its answer takes, and the UI switches on
 * that. There are eight interaction types and there is no ninth: a renderer
 * exists for each, and nothing anywhere asks which specialty it is drawing.
 *
 * THE TYPE IS THE INTERACTION, NEVER THE BODY SYSTEM
 * --------------------------------------------------
 * `activityType` describes how a person interacts with the item and what an
 * answer looks like. `domain` is a free-text LABEL — "positioning", "oral care",
 * "swallow", "lactation" — used for grouping and professional filtering only.
 * Nothing branches on `domain`. That is what lets one `task` renderer draw
 * positioning, oral care and catheter care, and one `intake` renderer draw a
 * neuro tube feed and a breastfeed.
 *
 * THE SCHEMA IS THE CLINICAL BOUNDARY
 * -----------------------------------
 * As with `serviceDraft.ts`, the validator rebuilds every activity from known
 * keys only, so nothing a model invented outside this vocabulary survives into
 * the product. There is no field for a diagnosis, a threshold or an escalation
 * rule: a reply carrying one has nowhere to be stored.
 *
 * The Edge Functions carry a mirror of this validator in
 * `supabase/functions/_shared/careActivity.ts` (Deno cannot import from `src/`),
 * exactly as `analyse-provider-service` mirrors `serviceDraft`. Change one,
 * change both.
 */

/* --------------------------------- types ---------------------------------- */

/**
 * The eight interactions. Closed set — adding a ninth means adding a renderer,
 * and is a deliberate product decision, not a configuration change.
 */
export const ACTIVITY_TYPES = [
  "dose",         // give a medicine  -> given / skipped / refused
  "task",         // do a care task   -> done / partial / unable   (positioning, oral care, catheter care)
  "exercise",     // therapy/exercise -> completion + dosage + tolerance (physio, OT, swallow, breathing)
  "intake",       // feed or fluids   -> amount + route + tolerance
  "measurement",  // record a number  -> value(s) + unit           (BP, weight, output volume)
  "observation",  // record a choice  -> coded option(s) + note    (bowel, urine, skin)
  "symptom",      // record severity  -> scale + note              (pain, breathlessness, itch)
  "education",    // read + confirm   -> acknowledged
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

/** The answer shapes an activity may ask for. Closed, so it can be validated. */
export const FIELD_TYPES = [
  "number", "integer", "duration", "time",
  "choice", "multi_choice", "boolean", "scale", "text",
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export type ActivityField = {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  unit?: string;
  min?: number;
  max?: number;
  options?: string[];
  /** Scale anchors, e.g. "No pain" / "Worst imaginable". Never a clinical cut-off. */
  lowLabel?: string;
  highLabel?: string;
  placeholder?: string;
};

/**
 * When an activity is expected.
 *
 * `clock`     expands into scheduled occurrences at fixed local wall-clock times.
 * `on_demand` never expands. It is a quick-record: it appears in the centre "+"
 *             sheet, is recorded whenever it happens, and can never be "missed"
 *             because nothing ever expected it at a particular moment.
 */
export type ScheduleKind = "clock" | "on_demand";

export type ActivitySchedule = {
  kind: ScheduleKind;
  /** "HH:MM" in the patient's own time zone. Only meaningful for `clock`. */
  times: string[];
  /** "all", or ISO weekday numbers (1 = Monday … 7 = Sunday). */
  days: "all" | number[];
  /** 1-based day of the programme this activity starts on. */
  fromDay: number;
  /** Last programme day, or null for "until the programme ends". */
  throughDay: number | null;
  /** Minutes after which an unrecorded occurrence reads as not recorded. */
  graceMinutes: number;
};

/**
 * Where an activity came from, and therefore who is answerable for it.
 * Every proposed activity must state this — it is what makes a clinician's
 * review meaningful rather than ceremonial.
 */
export const ACTIVITY_BASES = ["document", "provider_default", "ai_suggested"] as const;
export type ActivityBasis = (typeof ACTIVITY_BASES)[number];

export const BASIS_LABEL: Record<ActivityBasis, string> = {
  document: "From the patient's own records",
  provider_default: "From the approved programme",
  ai_suggested: "Suggested — needs your decision",
};

export type CareActivity = {
  /** Stable within one programme. The only thing a client ever sends. */
  key: string;
  activityType: ActivityType;
  /** Grouping label only — never branched on. "positioning", "lactation", … */
  domain: string;
  title: string;
  instructions: string;
  schedule: ActivitySchedule | null;
  inputSchema: ActivityField[];
  basis: ActivityBasis;
  /** Why this was proposed, in words a clinician reviewing it would recognise. */
  rationale: string;
  /** Which household roles may record it. Empty means anyone linked to the patient. */
  recordedBy: string[];
};

export type ActivityValidation =
  | { ok: true; activities: CareActivity[] }
  | { ok: false; errors: string[] };

/* --------------------------------- limits --------------------------------- */

/** Caps. A model that ignores them produces a rejected reply, not a huge row. */
export const ACTIVITY_LIMITS = {
  activities: 40,
  fields: 10,
  options: 12,
  times: 8,
  shortText: 160,
  mediumText: 400,
  longText: 1200,
} as const;

/* ------------------------------- validation -------------------------------- */

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function str(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t || t.length > max) return null;
  return t;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function posInt(v: unknown): number | null {
  const n = num(v);
  return n !== null && Number.isInteger(n) && n > 0 ? n : null;
}

/** "HH:MM" on a 24-hour clock, or null. Nothing is guessed from other formats. */
export function parseClockTime(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const m = v.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function validateSchedule(raw: unknown, at: string, errors: string[]): ActivitySchedule | null {
  if (raw === null || raw === undefined) return null;
  if (!isObj(raw)) {
    errors.push(`${at}.schedule must be an object or null.`);
    return null;
  }

  const kind = raw.kind === "clock" ? "clock" : raw.kind === "on_demand" ? "on_demand" : null;
  if (!kind) {
    errors.push(`${at}.schedule.kind must be "clock" or "on_demand".`);
    return null;
  }
  // An on-demand activity is a quick-record. It carries no times by definition.
  if (kind === "on_demand") {
    return { kind, times: [], days: "all", fromDay: 1, throughDay: null, graceMinutes: 0 };
  }

  const times: string[] = [];
  for (const t of Array.isArray(raw.times) ? raw.times : []) {
    const parsed = parseClockTime(t);
    if (parsed && !times.includes(parsed)) times.push(parsed);
    if (times.length >= ACTIVITY_LIMITS.times) break;
  }
  if (times.length === 0) {
    errors.push(`${at}.schedule.times must list at least one "HH:MM" time.`);
    return null;
  }
  times.sort();

  let days: "all" | number[] = "all";
  if (Array.isArray(raw.days)) {
    const list = raw.days
      .map((d) => num(d))
      .filter((d): d is number => d !== null && Number.isInteger(d) && d >= 1 && d <= 7);
    const unique = [...new Set(list)].sort();
    if (unique.length === 0) {
      errors.push(`${at}.schedule.days must be "all" or ISO weekday numbers 1–7.`);
      return null;
    }
    days = unique.length === 7 ? "all" : unique;
  } else if (raw.days !== undefined && raw.days !== null && raw.days !== "all") {
    errors.push(`${at}.schedule.days must be "all" or ISO weekday numbers 1–7.`);
    return null;
  }

  const fromDay = posInt(raw.from_day ?? raw.fromDay) ?? 1;
  const throughRaw = raw.through_day ?? raw.throughDay;
  const throughDay = throughRaw === null || throughRaw === undefined ? null : posInt(throughRaw);
  if (throughRaw !== null && throughRaw !== undefined && throughDay === null) {
    errors.push(`${at}.schedule.through_day must be a whole number of days or null.`);
    return null;
  }
  if (throughDay !== null && throughDay < fromDay) {
    errors.push(`${at}.schedule.through_day cannot be before from_day.`);
    return null;
  }

  const graceRaw = raw.grace_minutes ?? raw.graceMinutes;
  const grace = graceRaw === undefined || graceRaw === null ? 120 : num(graceRaw);
  if (grace === null || grace < 0 || grace > 1440) {
    errors.push(`${at}.schedule.grace_minutes must be between 0 and 1440.`);
    return null;
  }

  return { kind, times, days, fromDay, throughDay, graceMinutes: Math.round(grace) };
}

function validateField(raw: unknown, at: string, errors: string[]): ActivityField | null {
  if (!isObj(raw)) {
    errors.push(`${at} is not an object.`);
    return null;
  }
  const key = str(raw.key, 64);
  const label = str(raw.label, ACTIVITY_LIMITS.shortText);
  const type = (FIELD_TYPES as readonly string[]).includes(String(raw.type))
    ? (raw.type as FieldType)
    : null;

  if (!key) errors.push(`${at}.key is required.`);
  if (!label) errors.push(`${at}.label is required.`);
  if (!type) errors.push(`${at}.type must be one of ${FIELD_TYPES.join(", ")}.`);
  if (!key || !label || !type) return null;

  const field: ActivityField = { key, label, type, required: raw.required === true };

  if (type === "choice" || type === "multi_choice") {
    const options: string[] = [];
    for (const o of Array.isArray(raw.options) ? raw.options : []) {
      const s = str(o, ACTIVITY_LIMITS.shortText);
      if (s && !options.includes(s)) options.push(s);
      if (options.length >= ACTIVITY_LIMITS.options) break;
    }
    if (options.length < 2) {
      errors.push(`${at}.options must offer at least two choices.`);
      return null;
    }
    field.options = options;
  }

  if (type === "number" || type === "integer" || type === "scale" || type === "duration") {
    const min = num(raw.min);
    const max = num(raw.max);
    if (min !== null) field.min = min;
    if (max !== null) field.max = max;
    if (min !== null && max !== null && max <= min) {
      errors.push(`${at}.max must be greater than min.`);
      return null;
    }
    if (type === "scale" && (min === null || max === null)) {
      errors.push(`${at} of type scale must state min and max.`);
      return null;
    }
  }

  const unit = str(raw.unit, 24);
  if (unit) field.unit = unit;
  const low = str(raw.low_label ?? raw.lowLabel, ACTIVITY_LIMITS.shortText);
  if (low) field.lowLabel = low;
  const high = str(raw.high_label ?? raw.highLabel, ACTIVITY_LIMITS.shortText);
  if (high) field.highLabel = high;
  const placeholder = str(raw.placeholder, ACTIVITY_LIMITS.shortText);
  if (placeholder) field.placeholder = placeholder;

  return field;
}

/**
 * Validate a list of care activities and rebuild each from known keys only.
 *
 * Accepts both the snake_case a model or the database produces and the camelCase
 * the UI uses, so one validator serves the compiler, the Edge Function mirror
 * and the client.
 */
export function validateCareActivities(raw: unknown): ActivityValidation {
  const errors: string[] = [];
  if (!Array.isArray(raw)) return { ok: false, errors: ["Activities must be an array."] };
  if (raw.length > ACTIVITY_LIMITS.activities) {
    errors.push(`At most ${ACTIVITY_LIMITS.activities} activities are allowed.`);
  }

  const activities: CareActivity[] = [];
  const seen = new Set<string>();

  raw.slice(0, ACTIVITY_LIMITS.activities).forEach((entry, i) => {
    const at = `activities[${i}]`;
    if (!isObj(entry)) {
      errors.push(`${at} is not an object.`);
      return;
    }

    const key = str(entry.key, 64);
    const rawType = entry.activity_type ?? entry.activityType;
    const activityType = (ACTIVITY_TYPES as readonly string[]).includes(String(rawType))
      ? (rawType as ActivityType)
      : null;
    const title = str(entry.title, ACTIVITY_LIMITS.shortText);

    if (!key) errors.push(`${at}.key is required.`);
    else if (!/^[a-z0-9_]+$/.test(key)) errors.push(`${at}.key must be lower-case letters, numbers and underscores.`);
    else if (seen.has(key)) errors.push(`${at}.key "${key}" is used more than once.`);
    if (!activityType) errors.push(`${at}.activity_type must be one of ${ACTIVITY_TYPES.join(", ")}.`);
    if (!title) errors.push(`${at}.title is required.`);

    const basis = (ACTIVITY_BASES as readonly string[]).includes(String(entry.basis))
      ? (entry.basis as ActivityBasis)
      : null;
    if (!basis) errors.push(`${at}.basis must be one of ${ACTIVITY_BASES.join(", ")}.`);

    const schedule = validateSchedule(entry.schedule, at, errors);

    const rawFields = Array.isArray(entry.input_schema ?? entry.inputSchema)
      ? ((entry.input_schema ?? entry.inputSchema) as unknown[])
      : [];
    const inputSchema: ActivityField[] = [];
    const fieldKeys = new Set<string>();
    rawFields.slice(0, ACTIVITY_LIMITS.fields).forEach((f, fi) => {
      const field = validateField(f, `${at}.input_schema[${fi}]`, errors);
      if (!field) return;
      if (fieldKeys.has(field.key)) {
        errors.push(`${at}.input_schema[${fi}].key "${field.key}" is used more than once.`);
        return;
      }
      fieldKeys.add(field.key);
      inputSchema.push(field);
    });

    if (!key || !activityType || !title || !basis || seen.has(key)) return;
    seen.add(key);

    activities.push({
      key,
      activityType,
      domain: str(entry.domain, ACTIVITY_LIMITS.shortText) ?? "",
      title,
      instructions: str(entry.instructions, ACTIVITY_LIMITS.longText) ?? "",
      schedule,
      inputSchema,
      basis,
      rationale: str(entry.rationale, ACTIVITY_LIMITS.mediumText) ?? "",
      recordedBy: (Array.isArray(entry.recorded_by ?? entry.recordedBy)
        ? ((entry.recorded_by ?? entry.recordedBy) as unknown[])
        : []
      )
        .map((r) => str(r, 32))
        .filter((r): r is string => !!r),
    });
  });

  if (errors.length) return { ok: false, errors };
  return { ok: true, activities };
}

/* ------------------------------- conversion -------------------------------- */

/** The snake_case form stored in the database and read by the SQL scheduler. */
export function toStoredActivity(a: CareActivity): Record<string, unknown> {
  return {
    key: a.key,
    activity_type: a.activityType,
    domain: a.domain,
    title: a.title,
    instructions: a.instructions,
    basis: a.basis,
    rationale: a.rationale,
    recorded_by: a.recordedBy,
    input_schema: a.inputSchema.map((f) => ({
      key: f.key,
      label: f.label,
      type: f.type,
      required: f.required,
      ...(f.unit ? { unit: f.unit } : {}),
      ...(f.min !== undefined ? { min: f.min } : {}),
      ...(f.max !== undefined ? { max: f.max } : {}),
      ...(f.options ? { options: f.options } : {}),
      ...(f.lowLabel ? { low_label: f.lowLabel } : {}),
      ...(f.highLabel ? { high_label: f.highLabel } : {}),
      ...(f.placeholder ? { placeholder: f.placeholder } : {}),
    })),
    schedule: a.schedule
      ? {
          kind: a.schedule.kind,
          times: a.schedule.times,
          days: a.schedule.days,
          from_day: a.schedule.fromDay,
          through_day: a.schedule.throughDay,
          grace_minutes: a.schedule.graceMinutes,
        }
      : null,
  };
}

/** Is this activity recorded whenever it happens, rather than at a set time? */
export function isQuickRecord(a: CareActivity): boolean {
  return a.schedule === null || a.schedule.kind === "on_demand";
}

/* ------------------------------ display groups ----------------------------- */

/**
 * Morning / Afternoon / Evening / Night are DISPLAY GROUPS. They exist so a day
 * reads like a day. They are not activity types, they are not stored as
 * configuration, and nothing clinical depends on them.
 */
export const DISPLAY_GROUPS = ["morning", "afternoon", "evening", "night"] as const;
export type DisplayGroup = (typeof DISPLAY_GROUPS)[number];

export const DISPLAY_GROUP_LABEL: Record<DisplayGroup, string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
  night: "Night",
};

/** The same boundaries the SQL scheduler uses, so client and server agree. */
export function displayGroupForHour(hour: number): DisplayGroup {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 21) return "evening";
  return "night";
}
