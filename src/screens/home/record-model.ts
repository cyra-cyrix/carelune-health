import type { CareEventKind, CareEventRow } from "../../lib/db";

/*
 * What to offer when the caregiver taps "+".
 *
 * A flat grid of every possible action treats 3am and 8am as the same moment,
 * and a first feed the same as a sixth. A caregiver on a Ryle's-tube patient
 * records the same handful of things a dozen times a day, so the work is not
 * choosing FROM options — it is repeating one with the right value. This model
 * ranks by what is plausible now and carries the last value forward.
 *
 * Pure and deterministic: `now` is injected so it can be tested at any hour.
 */

export interface RecordOption {
  kind: CareEventKind;
  label: string;
  unit?: string;
  /** Ranked position — lower sorts first. */
  score: number;
  /** How many times this happened today already. */
  count: number;
  /** The previous value today, offered as a one-tap repeat. */
  lastDetail: string | null;
  lastAmount: number | null;
  /** Minutes since it last happened, or null if not yet today. */
  sinceMin: number | null;
  /** Why it is being suggested — shown to the caregiver, never a silent guess. */
  hint: string | null;
}

interface Spec {
  kind: CareEventKind;
  label: string;
  unit?: string;
  /** Typical gap in minutes; drives the "due" hint. Null = not time-driven. */
  everyMin: number | null;
  /** Hours of day when this is plausible at all. */
  hours?: [number, number];
}

const SPECS: Spec[] = [
  { kind: "feed", label: "Feed", unit: "mL", everyMin: 180, hours: [5, 23] },
  { kind: "positioning", label: "Position", everyMin: 120 },
  { kind: "urine", label: "Urine", unit: "mL", everyMin: 240 },
  { kind: "bowel", label: "Bowel", everyMin: null },
  { kind: "secretion", label: "Secretion", everyMin: 240 },
  { kind: "pain", label: "Pain", everyMin: null },
  { kind: "photo", label: "Photo", everyMin: null },
  { kind: "note", label: "Note", everyMin: null },
];

/** Two-hourly turning alternates sides; the next one is the side not just used. */
export const POSITIONS = ["Left lateral", "Right lateral", "Supine", "Sitting up"] as const;

export function nextPosition(lastDetail: string | null): string {
  if (!lastDetail) return POSITIONS[0];
  const i = POSITIONS.findIndex((p) => p.toLowerCase() === lastDetail.trim().toLowerCase());
  if (i < 0) return POSITIONS[0];
  // Alternate left/right rather than cycling through every option: pressure
  // relief is about changing side, and supine is a resting position between.
  if (POSITIONS[i] === "Left lateral") return "Right lateral";
  if (POSITIONS[i] === "Right lateral") return "Left lateral";
  return POSITIONS[0];
}

export function rankRecordOptions(events: CareEventRow[], now: Date = new Date()): RecordOption[] {
  const hour = now.getHours();
  const minutesSince = (iso: string) => Math.round((now.getTime() - new Date(iso).getTime()) / 60000);

  return SPECS.map((spec) => {
    const mine = events
      .filter((e) => e.kind === spec.kind)
      .sort((a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime());
    const last = mine[mine.length - 1] ?? null;
    const sinceMin = last ? minutesSince(last.occurred_at) : null;

    let score = 50;
    let hint: string | null = null;

    if (spec.everyMin != null) {
      if (sinceMin == null) {
        // Nothing recorded yet today and it is a recurring duty — likely overdue.
        score = hour >= 8 ? 5 : 25;
        hint = hour >= 8 ? "Not recorded today" : null;
      } else if (sinceMin >= spec.everyMin) {
        score = 0;
        hint = `Due — last ${formatGap(sinceMin)} ago`;
      } else {
        // Recently done: push down, but keep reachable for a correction.
        score = 60 + Math.round((spec.everyMin - sinceMin) / 10);
        hint = `Last ${formatGap(sinceMin)} ago`;
      }
    } else if (sinceMin != null) {
      score = 55;
      hint = `Last ${formatGap(sinceMin)} ago`;
    }

    // Outside plausible hours, sink it rather than hide it — a night feed is
    // unusual, not impossible, and hiding it would force a workaround.
    if (spec.hours && (hour < spec.hours[0] || hour > spec.hours[1])) score += 40;

    return {
      kind: spec.kind,
      label: spec.label,
      unit: spec.unit,
      score,
      count: mine.length,
      lastDetail: last?.detail ?? null,
      lastAmount: last?.amount ?? null,
      sinceMin,
      hint,
    };
  }).sort((a, b) => a.score - b.score || a.label.localeCompare(b.label));
}

/** The one-tap repeat label, or null when there is nothing to repeat. */
export function repeatLabel(o: RecordOption): string | null {
  if (o.lastAmount == null && !o.lastDetail) return null;
  const amount = o.lastAmount != null ? `${o.lastAmount}${o.unit ? ` ${o.unit}` : ""}` : "";
  return [amount, o.lastDetail].filter(Boolean).join(" · ") || null;
}

function formatGap(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}
