/*
 * Server-side validation of the AI service draft — shared by the Edge Functions
 * that produce it (`analyse-provider-service`) and the one that stores it
 * (`platform-admin`). A draft is validated on the way out of the model AND
 * again on the way into the database, because the browser sits between them and
 * the operator may have edited it.
 *
 * This is a mirror of `src/domain/serviceDraft.ts` — Deno cannot import from
 * `src/` — exactly as `generate-plan` mirrors `src/lib/pathwayValidation.ts`.
 * Change one, change both.
 *
 * THE SCHEMA IS THE CLINICAL BOUNDARY: there is no field for a medicine, a
 * dose, a diagnosis or an emergency threshold, and the draft is rebuilt from
 * known keys only, so anything else a model volunteers has nowhere to land.
 */

export const LIMITS = {
  services: 6,
  packagesPerService: 8,
  minPackages: 3,
  periods: 12,
  listItems: 24,
  shortText: 160,
  mediumText: 400,
  longText: 2000,
};

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function str(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t && t.length <= max ? t : null;
}

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

const positiveInt = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) && Number.isInteger(v) && v > 0 ? v : null;

export function validateServiceDraft(raw: unknown): { ok: true; draft: Record<string, unknown> } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (!isObj(raw)) return { ok: false, errors: ["The reply was not an object."] };

  const provider_summary = str(raw.provider_summary, LIMITS.longText);
  if (!provider_summary) errors.push("provider_summary is required.");

  const rawServices = Array.isArray(raw.suggested_services) ? raw.suggested_services : null;
  if (!rawServices || rawServices.length === 0) errors.push("At least one service must be suggested.");
  if (rawServices && rawServices.length > LIMITS.services) errors.push(`At most ${LIMITS.services} services may be suggested.`);

  const services: Record<string, unknown>[] = [];
  (rawServices ?? []).slice(0, LIMITS.services).forEach((entry: unknown, i: number) => {
    const at = `suggested_services[${i}]`;
    if (!isObj(entry)) { errors.push(`${at} is not an object.`); return; }

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

    let typical_duration_days: number | null = null;
    if (entry.typical_duration_days != null) {
      typical_duration_days = positiveInt(entry.typical_duration_days);
      if (typical_duration_days === null) errors.push(`${at}.typical_duration_days must be a whole number of days or null.`);
    }

    const monitoring_domains = strList(entry.monitoring_domains);
    if (monitoring_domains.length === 0) errors.push(`${at}.monitoring_domains must name at least one area.`);

    const suggested_patient_inputs: Record<string, string>[] = [];
    (Array.isArray(entry.suggested_patient_inputs) ? entry.suggested_patient_inputs : [])
      .slice(0, LIMITS.listItems)
      .forEach((q: unknown, qi: number) => {
        if (!isObj(q)) return;
        const label = str(q.label, LIMITS.mediumText);
        const reason = str(q.reason, LIMITS.mediumText);
        if (!label) { errors.push(`${at}.suggested_patient_inputs[${qi}].label is required.`); return; }
        suggested_patient_inputs.push({ label, reason: reason ?? "" });
      });
    if (suggested_patient_inputs.length === 0) errors.push(`${at}.suggested_patient_inputs must include at least one question.`);

    const rawPackages = Array.isArray(entry.suggested_packages) ? entry.suggested_packages : [];
    if (rawPackages.length < LIMITS.minPackages) errors.push(`${at}.suggested_packages must offer at least ${LIMITS.minPackages} options.`);
    const suggested_packages: Record<string, unknown>[] = [];
    rawPackages.slice(0, LIMITS.packagesPerService).forEach((p: unknown, pi: number) => {
      const pAt = `${at}.suggested_packages[${pi}]`;
      if (!isObj(p)) { errors.push(`${pAt} is not an object.`); return; }
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
    const programme_outline: Record<string, unknown>[] = [];
    rawOutline.slice(0, LIMITS.periods).forEach((p: unknown, pi: number) => {
      const pAt = `${at}.programme_outline[${pi}]`;
      if (!isObj(p)) { errors.push(`${pAt} is not an object.`); return; }
      const period_label = str(p.period_label, LIMITS.shortText);
      const focus = str(p.focus, LIMITS.mediumText);
      const checkin_frequency = str(p.checkin_frequency, LIMITS.shortText);
      if (!period_label) { errors.push(`${pAt}.period_label is required.`); return; }
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
      name, summary, patient_type, entry_point, typical_duration_days, objective, end_condition,
      monitoring_domains, suggested_patient_inputs,
      care_team_suggestions: strList(entry.care_team_suggestions),
      suggested_packages, programme_outline,
    });
  });

  if (errors.length) return { ok: false, errors };
  return { ok: true, draft: { provider_summary, suggested_services: services } };
}
