/*
 * The patient's programme, built from their own frozen enrolment.
 *
 * Everything the universal patient surface shows comes from the snapshot that
 * 0028 wrote onto the subscription at enrolment — never from the live service
 * or package. That is the whole point: if the provider reprices a package or
 * revises the service tomorrow, the patient's programme does not move under
 * them. Nothing in this file reads configuration tables, and nothing in it
 * knows what specialty it is describing.
 *
 * One adapter, one UI model. Components consume `ProgrammeExperience`; they
 * never parse the stored JSON themselves.
 */
import type { EnrolledPackageSnapshot, ProgrammeConfig, SubscriptionRow } from "../lib/db";

export type ProgrammePeriodView = {
  label: string;
  focus: string;
  checkinFrequency: string;
  monitoringAreas: string[];
  milestones: string[];
  /** 1-based inclusive day window within the programme. */
  fromDay: number;
  toDay: number;
  index: number;
};

export type PatientQuestion = { label: string; reason: string };

export type ProgrammeExperience = {
  /** The service the provider runs, e.g. "Post-operative Spine Recovery". */
  programmeName: string;
  /** The package the patient is on, e.g. "Standard Recovery". */
  packageName: string;
  startDate: Date;
  durationDays: number;
  /** 1-based, clamped into the programme. */
  currentDay: number;
  currentWeek: number;
  totalWeeks: number;
  /** 0–100, how far through the programme today is. */
  percentComplete: number;
  finished: boolean;
  periods: ProgrammePeriodView[];
  currentPeriod: ProgrammePeriodView | null;
  completedPeriods: number;
  nextPeriod: ProgrammePeriodView | null;
  daysUntilNextPeriod: number | null;
  monitoringAreas: string[];
  patientQuestions: PatientQuestion[];
  checkinFrequency: string;
  reviewFrequency: string;
  supportLevel: string;
  milestones: string[];
  includes: string[];
};

export type ExperienceResult =
  | { ok: true; experience: ProgrammeExperience }
  | { ok: false; reason: string };

/* ----------------------------- period parsing ----------------------------- */

/**
 * Turn a human period label into a day window.
 *
 * The model writes labels for people — "Week 1", "Weeks 2–4", "Weeks 5-8",
 * "Days 1-14", "Month 2" — so this reads them deterministically rather than
 * asking anything at render time. A label it cannot read makes the WHOLE
 * outline fall back to an even split, so the periods stay consistent with each
 * other instead of half-parsed.
 */
export function parsePeriodLabel(label: string): { fromDay: number; toDay: number } | null {
  const s = label.toLowerCase().replace(/[–—]/g, "-").replace(/\s+to\s+/g, "-");
  const range = (a: number, b: number | undefined, unitDays: number) => {
    const first = a;
    const last = b ?? a;
    if (!Number.isFinite(first) || !Number.isFinite(last) || first < 1 || last < first) return null;
    return { fromDay: (first - 1) * unitDays + 1, toDay: last * unitDays };
  };

  let m = s.match(/weeks?\s*(\d+)\s*(?:-\s*(\d+))?/);
  if (m) return range(Number(m[1]), m[2] ? Number(m[2]) : undefined, 7);

  m = s.match(/months?\s*(\d+)\s*(?:-\s*(\d+))?/);
  if (m) return range(Number(m[1]), m[2] ? Number(m[2]) : undefined, 30);

  m = s.match(/days?\s*(\d+)\s*(?:-\s*(\d+))?/);
  if (m) {
    const first = Number(m[1]);
    const last = m[2] ? Number(m[2]) : first;
    if (first < 1 || last < first) return null;
    return { fromDay: first, toDay: last };
  }
  return null;
}

/** An even split — the fallback when the labels cannot be read as day windows. */
function evenWindows(count: number, durationDays: number) {
  return Array.from({ length: count }, (_, i) => ({
    fromDay: Math.floor((i * durationDays) / count) + 1,
    toDay: Math.floor(((i + 1) * durationDays) / count),
  }));
}

/* -------------------------------- helpers --------------------------------- */

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const cleanList = (v: unknown, max = 24): string[] =>
  Array.isArray(v)
    ? v.map((x) => (typeof x === "string" ? x.trim() : "")).filter(Boolean).slice(0, max)
    : [];

const text = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Whole days between two dates, ignoring clocks and time zones. */
export function daysBetween(from: Date, to: Date): number {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86_400_000);
}

/* -------------------------------- the adapter ----------------------------- */

/**
 * Build the patient's UI model from their subscription.
 *
 * Returns a reason rather than throwing when the snapshot is not something we
 * can render — the patient app shows a calm fallback and the care team is still
 * reachable. It never invents a programme it was not given.
 */
export function buildProgrammeExperience(
  sub: SubscriptionRow | null,
  now: Date = new Date(),
): ExperienceResult {
  if (!sub) return { ok: false, reason: "No subscription" };
  if (!sub.service_package_id) return { ok: false, reason: "Not a service enrolment" };

  const pkg: EnrolledPackageSnapshot = isObj(sub.package_snapshot) ? sub.package_snapshot : {};
  const cfg: ProgrammeConfig = isObj(sub.programme_config_snapshot) ? sub.programme_config_snapshot : {};

  const packageName = text(pkg.name) || text(sub.plan_name);
  const durationDays = typeof pkg.duration_days === "number" && pkg.duration_days > 0
    ? Math.floor(pkg.duration_days)
    : 0;
  if (!packageName || !durationDays) {
    return { ok: false, reason: "The enrolment snapshot is missing its programme details" };
  }

  const startedAt = new Date(sub.started_at);
  if (Number.isNaN(startedAt.getTime())) {
    return { ok: false, reason: "The enrolment has no valid start date" };
  }

  const elapsed = daysBetween(startedAt, now);
  const currentDay = Math.min(Math.max(elapsed + 1, 1), durationDays);
  const finished = elapsed + 1 > durationDays;

  // Periods, from the frozen outline only.
  const rawPeriods = Array.isArray(cfg.programme_outline) ? cfg.programme_outline : [];
  const parsed = rawPeriods.map((p) => parsePeriodLabel(text(p?.period_label)));
  const readable =
    rawPeriods.length > 0 &&
    parsed.every((w, i) => w !== null && (i === 0 || (parsed[i - 1] && w.fromDay >= parsed[i - 1]!.fromDay)));
  const windows = readable
    ? (parsed as { fromDay: number; toDay: number }[])
    : evenWindows(Math.max(rawPeriods.length, 1), durationDays);

  const periods: ProgrammePeriodView[] = rawPeriods.map((p, i) => {
    const w = windows[i] ?? { fromDay: 1, toDay: durationDays };
    const last = i === rawPeriods.length - 1;
    return {
      label: text(p?.period_label) || `Stage ${i + 1}`,
      focus: text(p?.focus),
      checkinFrequency: text(p?.checkin_frequency),
      monitoringAreas: cleanList(p?.monitoring_domains),
      milestones: cleanList(p?.milestones),
      fromDay: Math.max(1, Math.min(w.fromDay, durationDays)),
      // The last period always runs to the end of the programme, so a shorter
      // package can never leave the final days belonging to no stage at all.
      toDay: last ? durationDays : Math.max(1, Math.min(w.toDay, durationDays)),
      index: i,
    };
  });

  const currentPeriod =
    periods.find((p) => currentDay >= p.fromDay && currentDay <= p.toDay) ??
    (periods.length ? periods[periods.length - 1] : null);
  const completedPeriods = periods.filter((p) => p.toDay < currentDay).length;
  const nextPeriod = periods.find((p) => p.fromDay > currentDay) ?? null;

  return {
    ok: true,
    experience: {
      programmeName: text(pkg.service_name) || packageName,
      packageName,
      startDate: startedAt,
      durationDays,
      currentDay,
      currentWeek: Math.floor((currentDay - 1) / 7) + 1,
      totalWeeks: Math.ceil(durationDays / 7),
      percentComplete: Math.min(100, Math.round((currentDay / durationDays) * 100)),
      finished,
      periods,
      currentPeriod,
      completedPeriods,
      nextPeriod,
      daysUntilNextPeriod: nextPeriod ? nextPeriod.fromDay - currentDay : null,
      // The package narrows the service's areas to what this patient is on.
      monitoringAreas: cleanList(pkg.monitoring_domains).length
        ? cleanList(pkg.monitoring_domains)
        : cleanList(cfg.monitoring_domains),
      patientQuestions: (Array.isArray(cfg.patient_inputs) ? cfg.patient_inputs : [])
        .map((q) => ({ label: text(q?.label), reason: text(q?.reason) }))
        .filter((q) => q.label)
        .slice(0, 24),
      checkinFrequency: text(pkg.checkin_frequency),
      reviewFrequency: text(pkg.review_frequency),
      supportLevel: text(pkg.support_level),
      milestones: cleanList(pkg.milestones),
      includes: cleanList(pkg.includes),
    },
  };
}
