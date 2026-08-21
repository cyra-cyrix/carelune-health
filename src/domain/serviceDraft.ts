/*
 * The AI service draft — the one structured shape the Super Admin service
 * builder speaks.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * A model returns prose-shaped JSON. Nothing in Carelune may store or render
 * that directly, so `analyse-provider-service` validates the model's reply
 * against the schema below BEFORE it is returned, and `platform-admin`
 * validates it AGAIN before any of it reaches `centre_services` /
 * `service_packages`. This module is the client-side half of that contract and
 * the single definition the UI and the tests share.
 *
 * The Edge Functions carry a mirror of `validateServiceDraft` (Deno cannot
 * import from `src/`), exactly as `generate-plan` mirrors `pathwayValidation`.
 * Change one, change both.
 *
 * THE SCHEMA IS THE CLINICAL BOUNDARY
 * -----------------------------------
 * There is deliberately no field here for a medicine, a dose, a diagnosis or an
 * emergency threshold. The model is asked to structure a SERVICE — who it is
 * for, how long it runs, what is worth following, what a package includes — and
 * a reply carrying anything else has nowhere to be stored. Everything below is
 * an AI DRAFT until a human confirms it, and nothing here is ever shown to a
 * patient by this flow.
 */

export type SuggestedPatientInput = {
  /** What the patient or family is asked, in their own words. */
  label: string;
  /** Why it is worth asking — shown to the Super Admin, never to a patient. */
  reason: string;
};

export type SuggestedPackage = {
  name: string;
  positioning: string;
  duration_days: number;
  monitoring_domains: string[];
  checkin_frequency: string;
  review_frequency: string;
  support_level: string;
  includes: string[];
  milestones: string[];
};

/** One period of the programme timeline — "Week 1", "Weeks 2–4", "Month 2". */
export type ProgrammePeriod = {
  period_label: string;
  focus: string;
  checkin_frequency: string;
  monitoring_domains: string[];
  milestones: string[];
};

export type SuggestedService = {
  name: string;
  summary: string;
  patient_type: string;
  entry_point: string;
  typical_duration_days: number | null;
  objective: string;
  end_condition: string;
  monitoring_domains: string[];
  suggested_patient_inputs: SuggestedPatientInput[];
  care_team_suggestions: string[];
  suggested_packages: SuggestedPackage[];
  programme_outline: ProgrammePeriod[];
};

export type ServiceDraft = {
  provider_summary: string;
  suggested_services: SuggestedService[];
};

/** What the Super Admin told Carelune about the provider. */
export type ProviderBrief = {
  provider_name: string;
  /** Human-facing provider type, e.g. "Solo professional". */
  provider_type: string;
  description: string;
  website: string;
  social: string;
  notes: string;
};

export type DraftValidation =
  | { ok: true; draft: ServiceDraft }
  | { ok: false; errors: string[] };

/* -------------------------------------------------------------------------- */

/** Caps. A model that ignores them produces a rejected reply, not a huge row. */
export const LIMITS = {
  services: 6,
  packagesPerService: 8,
  minPackages: 3,
  periods: 12,
  listItems: 24,
  shortText: 160,
  mediumText: 400,
  longText: 2000,
} as const;

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** A trimmed string within `max`, or null when it is absent/blank/oversized. */
function str(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t || t.length > max) return null;
  return t;
}

/** A list of clean short strings, deduped, capped. Never throws. */
function strList(v: unknown, max = LIMITS.listItems): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v) {
    const s = str(item, LIMITS.mediumText);
    if (s && !out.includes(s)) out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

function positiveInt(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && Number.isInteger(v) && v > 0 ? v : null;
}

/**
 * Validate a model reply and rebuild it from known keys only, so nothing the
 * model invented outside the schema survives into the product.
 */
export function validateServiceDraft(raw: unknown): DraftValidation {
  const errors: string[] = [];
  if (!isObj(raw)) return { ok: false, errors: ["The reply was not an object."] };

  const provider_summary = str(raw.provider_summary, LIMITS.longText);
  if (!provider_summary) errors.push("provider_summary is required.");

  const rawServices = Array.isArray(raw.suggested_services) ? raw.suggested_services : null;
  if (!rawServices || rawServices.length === 0) errors.push("At least one service must be suggested.");
  if (rawServices && rawServices.length > LIMITS.services) {
    errors.push(`At most ${LIMITS.services} services may be suggested.`);
  }

  const services: SuggestedService[] = [];
  (rawServices ?? []).slice(0, LIMITS.services).forEach((entry, i) => {
    const at = `suggested_services[${i}]`;
    if (!isObj(entry)) {
      errors.push(`${at} is not an object.`);
      return;
    }

    const name = str(entry.name, LIMITS.shortText);
    const summary = str(entry.summary, LIMITS.longText);
    const patient_type = str(entry.patient_type, LIMITS.mediumText);
    const entry_point = str(entry.entry_point, LIMITS.mediumText);
    const objective = str(entry.objective, LIMITS.longText);
    const end_condition = str(entry.end_condition, LIMITS.longText);
    if (!name) errors.push(`${at}.name is required.`);
    if (!summary) errors.push(`${at}.summary is required.`);
    if (!patient_type) errors.push(`${at}.patient_type is required.`);
    if (!entry_point) errors.push(`${at}.entry_point is required.`);
    if (!objective) errors.push(`${at}.objective is required.`);
    if (!end_condition) errors.push(`${at}.end_condition is required.`);

    // Duration is genuinely optional — some services run until a condition is met.
    let typical_duration_days: number | null = null;
    if (entry.typical_duration_days != null) {
      typical_duration_days = positiveInt(entry.typical_duration_days);
      if (typical_duration_days === null) errors.push(`${at}.typical_duration_days must be a whole number of days or null.`);
    }

    const monitoring_domains = strList(entry.monitoring_domains);
    if (monitoring_domains.length === 0) errors.push(`${at}.monitoring_domains must name at least one area.`);

    const suggested_patient_inputs: SuggestedPatientInput[] = [];
    (Array.isArray(entry.suggested_patient_inputs) ? entry.suggested_patient_inputs : [])
      .slice(0, LIMITS.listItems)
      .forEach((q, qi) => {
        if (!isObj(q)) return;
        const label = str(q.label, LIMITS.mediumText);
        const reason = str(q.reason, LIMITS.mediumText);
        if (!label) {
          errors.push(`${at}.suggested_patient_inputs[${qi}].label is required.`);
          return;
        }
        suggested_patient_inputs.push({ label, reason: reason ?? "" });
      });
    if (suggested_patient_inputs.length === 0) errors.push(`${at}.suggested_patient_inputs must include at least one question.`);

    const care_team_suggestions = strList(entry.care_team_suggestions);

    const rawPackages = Array.isArray(entry.suggested_packages) ? entry.suggested_packages : [];
    if (rawPackages.length < LIMITS.minPackages) {
      errors.push(`${at}.suggested_packages must offer at least ${LIMITS.minPackages} options.`);
    }
    const suggested_packages: SuggestedPackage[] = [];
    rawPackages.slice(0, LIMITS.packagesPerService).forEach((p, pi) => {
      const pAt = `${at}.suggested_packages[${pi}]`;
      if (!isObj(p)) {
        errors.push(`${pAt} is not an object.`);
        return;
      }
      const pName = str(p.name, LIMITS.shortText);
      const positioning = str(p.positioning, LIMITS.mediumText);
      const duration_days = positiveInt(p.duration_days);
      const checkin_frequency = str(p.checkin_frequency, LIMITS.shortText);
      const review_frequency = str(p.review_frequency, LIMITS.shortText);
      const support_level = str(p.support_level, LIMITS.mediumText);
      if (!pName) errors.push(`${pAt}.name is required.`);
      if (!duration_days) errors.push(`${pAt}.duration_days must be a whole number of days.`);
      if (!checkin_frequency) errors.push(`${pAt}.checkin_frequency is required.`);
      if (!review_frequency) errors.push(`${pAt}.review_frequency is required.`);
      if (!pName || !duration_days || !checkin_frequency || !review_frequency) return;
      suggested_packages.push({
        name: pName,
        positioning: positioning ?? "",
        duration_days,
        monitoring_domains: strList(p.monitoring_domains),
        checkin_frequency,
        review_frequency,
        support_level: support_level ?? "",
        includes: strList(p.includes),
        milestones: strList(p.milestones),
      });
    });

    const rawOutline = Array.isArray(entry.programme_outline) ? entry.programme_outline : [];
    if (rawOutline.length === 0) errors.push(`${at}.programme_outline must describe at least one period.`);
    const programme_outline: ProgrammePeriod[] = [];
    rawOutline.slice(0, LIMITS.periods).forEach((p, pi) => {
      const pAt = `${at}.programme_outline[${pi}]`;
      if (!isObj(p)) {
        errors.push(`${pAt} is not an object.`);
        return;
      }
      const period_label = str(p.period_label, LIMITS.shortText);
      const focus = str(p.focus, LIMITS.mediumText);
      const checkin_frequency = str(p.checkin_frequency, LIMITS.shortText);
      if (!period_label) {
        errors.push(`${pAt}.period_label is required.`);
        return;
      }
      programme_outline.push({
        period_label,
        focus: focus ?? "",
        checkin_frequency: checkin_frequency ?? "",
        monitoring_domains: strList(p.monitoring_domains),
        milestones: strList(p.milestones),
      });
    });

    if (!name || !summary || !patient_type || !entry_point || !objective || !end_condition) return;
    services.push({
      name,
      summary,
      patient_type,
      entry_point,
      typical_duration_days,
      objective,
      end_condition,
      monitoring_domains,
      suggested_patient_inputs,
      care_team_suggestions,
      suggested_packages,
      programme_outline,
    });
  });

  if (errors.length) return { ok: false, errors };
  return { ok: true, draft: { provider_summary: provider_summary as string, suggested_services: services } };
}

/* -------------------------------------------------------------------------- */

/**
 * The timeline a package is previewed as. A package narrows the service's
 * outline to the periods that fit inside its own duration, so "30-Day
 * Essential" and "90-Day Complete" preview differently from ONE outline — no
 * per-package timeline is stored, and nothing here knows what specialty it is
 * rendering.
 *
 * Periods carry no day numbers (the model writes human labels like "Weeks 2–4"),
 * so the share of the outline a package covers is proportional to its duration
 * against the longest package offered. A single-period outline always renders.
 */
export function periodsForPackage(
  outline: ProgrammePeriod[],
  pkg: SuggestedPackage,
  allPackages: SuggestedPackage[],
): ProgrammePeriod[] {
  if (outline.length <= 1) return outline;
  const longest = Math.max(...allPackages.map((p) => p.duration_days), pkg.duration_days);
  if (longest <= 0) return outline;
  const share = Math.min(1, pkg.duration_days / longest);
  const count = Math.max(1, Math.round(outline.length * share));
  return outline.slice(0, count);
}

/** "6–12 weeks" style duration wording for a service, or null when open-ended. */
export function durationLabel(days: number | null): string | null {
  if (!days) return null;
  if (days % 7 === 0 && days >= 14) return `${days / 7} weeks`;
  return `${days} days`;
}
