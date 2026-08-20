import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type {
  PatientRow, CareTaskRow, TaskOutcome, MedicationRow, MedAdminStatus,
  PatientPlanRow, ReadingsInput, ReadingRow, ThresholdRow, UpdateRow,
} from "../../lib/db";

/* ============================================================================
   Home Care — shared kit: the one context every tab reads, a sky progress
   ring, a bottom sheet, a small consistent icon set, and pure helpers used
   across the Action Stage and the timeline. No data access lives here — the
   shell (HomeCare.tsx) loads and owns state, and exposes it through <HcProvider>.
   ========================================================================== */

export type HcRole = "family" | "caregiver";

/** Everything a tab needs. Mutators are optimistic; the shell reconciles. */
export type HcData = {
  role: HcRole;
  patient: PatientRow;
  day: number;
  tasks: CareTaskRow[];
  outcomes: Map<string, TaskOutcome>;
  meds: MedicationRow[];
  medAdmin: Map<string, MedAdminStatus>;
  plan: PatientPlanRow | null;
  readings: ReadingsInput;
  history: ReadingRow[];
  thresholds: ThresholdRow[];
  feed: UpdateRow[];
  /** Record (or clear) a care-task outcome. */
  recordOutcome: (taskId: string, outcome: TaskOutcome | null) => void;
  /** Merge-save today's readings (never overwrites unrelated fields). */
  saveReadingFields: (patch: Partial<ReadingsInput>) => Promise<boolean>;
  /** Mark a medicine slot given/missed/skipped. */
  markMed: (medId: string, slot: string, status: MedAdminStatus) => void;
  /** Undo a medicine slot record (deletes today's med_admin row). */
  clearMed: (medId: string, slot: string) => void;
  /** Switch the active Home Care tab (e.g. route a medicine action to Medicines). */
  goTab: (tab: string) => void;
  /** Post a short status to the care-team feed (household → source "caregiver"). */
  postStatus: (body: string, flag: string) => Promise<void>;
  reload: () => void;
};

const HcContext = createContext<HcData | null>(null);

export function HcProvider({ value, children }: { value: HcData; children: ReactNode }) {
  return <HcContext.Provider value={value}>{children}</HcContext.Provider>;
}

export function useHc(): HcData {
  const ctx = useContext(HcContext);
  if (!ctx) throw new Error("useHc must be used within <HcProvider>");
  return ctx;
}

/** How this household member is named on anything the care team reads. The
 *  caregiver and the family are different people — never label one as the other. */
export const HOUSEHOLD_LABEL: Record<HcRole, string> = { family: "Family", caregiver: "Caregiver" };

/* ---------------------------- submission guard --------------------------- */

export type SubmitState = "idle" | "saving" | "saved" | "error";

/**
 * One real-world action must produce exactly one write. `run` ignores every call
 * made while a submission is already in flight, so a double tap (or an impatient
 * second tap during a slow network) can never queue a second write. The returned
 * state also drives the saving / saved / failed + retry affordances.
 */
export function useSubmit(resetAfterMs = 1400): { state: SubmitState; run: (task: () => Promise<boolean> | boolean) => Promise<void>; reset: () => void } {
  const [state, setState] = useState<SubmitState>("idle");
  const inFlight = useRef(false);

  useEffect(() => {
    if (state !== "saved" || resetAfterMs <= 0) return;
    const id = window.setTimeout(() => setState("idle"), resetAfterMs);
    return () => window.clearTimeout(id);
  }, [state, resetAfterMs]);

  const run = async (task: () => Promise<boolean> | boolean) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setState("saving");
    try {
      setState((await task()) ? "saved" : "error");
    } catch {
      setState("error");
    } finally {
      inFlight.current = false;
    }
  };

  return { state, run, reset: () => setState("idle") };
}

/* ------------------------------- helpers --------------------------------- */

/** Whole days since journey start, 1-indexed. */
export function dayAtHome(p: PatientRow): number {
  const start = new Date(p.journey_start).getTime();
  return Math.max(1, Math.floor((Date.now() - start) / 86_400_000) + 1);
}

/** Parse the leading hour from a free time label ("07:30", "8 AM", "Morning"). */
export function taskHour(t: { time_label: string | null }): number {
  const label = t.time_label ?? "";
  const m = label.match(/(\d{1,2}):?(\d{2})?/);
  if (!m) {
    if (/night|bed/i.test(label)) return 21;
    if (/evening/i.test(label)) return 18;
    if (/after ?noon|lunch/i.test(label)) return 13;
    if (/morning/i.test(label)) return 9;
    return 9;
  }
  let h = Number(m[1]);
  if (/pm/i.test(label) && h < 12) h += 12;
  if (/am/i.test(label) && h === 12) h = 0;
  return Math.min(23, Math.max(0, h));
}

export type Period = "morning" | "afternoon" | "evening" | "bedtime";
export const PERIODS: { key: Period; label: string; from: number; to: number }[] = [
  { key: "morning", label: "Morning", from: 0, to: 12 },
  { key: "afternoon", label: "Afternoon", from: 12, to: 17 },
  { key: "evening", label: "Evening", from: 17, to: 21 },
  { key: "bedtime", label: "Bedtime", from: 21, to: 24 },
];
export function periodOf(t: { time_label: string | null }): Period {
  const h = taskHour(t);
  return (PERIODS.find((p) => h >= p.from && h < p.to) ?? PERIODS[0]).key;
}
export function currentPeriod(): Period {
  const h = new Date().getHours();
  return (PERIODS.find((p) => h >= p.from && h < p.to) ?? PERIODS[0]).key;
}

export function niceDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return "Today";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}
export function niceTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}

/* --------------------------- task classification ------------------------- */

/** The renderer a care task drives in the Action Stage. Derived only from the
 *  task's own discipline + title — never invented. Unknown → "task" (safe
 *  generic outcome view), so no real task is ever hidden. */
export type TaskKind =
  | "reading"     // maps to one or more monitored parameters → proper inputs
  | "physio"      // exercise / mobility → instruction + optional timer + outcome
  | "food"        // diet / feeding → instruction + amount + outcome
  | "positioning" // turn / reposition → instruction + timer + outcome
  | "medicine"    // medicine-in-schedule task → outcome + pointer to Medicines
  | "task";       // generic do-and-confirm

export function classifyTask(t: CareTaskRow): TaskKind {
  const hay = `${t.discipline} ${t.title} ${t.detail ?? ""}`.toLowerCase();
  if (/physio|exercise|mobil|walk|range of|rom|gait|strength|balance|stretch/.test(hay)) return "physio";
  if (/turn|reposition|position|pressure relief|side lying|prone/.test(hay)) return "positioning";
  if (/medicine|medication|\bdose\b|tablet|\bdrug\b|\bmeds\b/.test(hay)) return "medicine";
  if (/diet|meal|feed|food|nutrition|lunch|breakfast|dinner|swallow/.test(hay)) return "food";
  return "task";
}

export const OUTCOME_META: Record<TaskOutcome, { label: string; short: string }> = {
  done: { label: "Done", short: "Done" },
  unable: { label: "Unable", short: "Unable" },
  refused: { label: "Refused", short: "Refused" },
  na: { label: "N/A", short: "N/A" },
};

/* ---------------------------- Bottom sheet ------------------------------- */

export function BottomSheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="hc-sheet-scrim" onClick={onClose} role="presentation">
      <div className="hc-sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="hc-sheet-grab" />
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  );
}

/** Re-render every second while `active` — drives the optional exercise timer. */
export function useNow(active: boolean): number {
  const [, force] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => force((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [active]);
  return Date.now();
}

/* ------------------------------- Icons ----------------------------------- */

type IP = { size?: number };
const svg = (size: number, path: ReactNode) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{path}</svg>
);

/** One consistent stroke-based icon family for Home Care (no emoji as UI). */
export const HcIcon = {
  Home: ({ size = 22 }: IP) => svg(size, <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></>),
  Pill: ({ size = 22 }: IP) => svg(size, <><rect x="3" y="8" width="18" height="8" rx="4" /><path d="M12 8v8" /></>),
  Check: ({ size = 22 }: IP) => svg(size, <path d="M20 6 9 17l-5-5" />),
  Heart: ({ size = 22 }: IP) => svg(size, <path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10Z" />),
  Pulse: ({ size = 22 }: IP) => svg(size, <path d="M3 12h4l2 6 4-13 2 7h6" />),
  Drop: ({ size = 22 }: IP) => svg(size, <path d="M12 3c3 4 6 6.5 6 10a6 6 0 0 1-12 0c0-3.5 3-6 6-10Z" />),
  Walk: ({ size = 22 }: IP) => svg(size, <><circle cx="13" cy="4.5" r="1.6" /><path d="M11 21l1.5-6-2.5-2 1-5 3 2 2 2" /><path d="M9 21l2-4" /></>),
  Food: ({ size = 22 }: IP) => svg(size, <><path d="M5 3v7a2 2 0 0 0 4 0V3M7 3v18" /><path d="M17 3c-1.5 0-3 1.5-3 5s1.5 4 3 4v9" /></>),
  Bed: ({ size = 22 }: IP) => svg(size, <><path d="M3 8v10M3 12h18v6M21 12v-1a3 3 0 0 0-3-3h-6v4" /><circle cx="7" cy="10.5" r="1.4" /></>),
  Chat: ({ size = 22 }: IP) => svg(size, <path d="M21 12a8 8 0 0 1-11.5 7.2L4 21l1.8-5.5A8 8 0 1 1 21 12Z" />),
  Phone: ({ size = 22 }: IP) => svg(size, <path d="M6 3h3l2 5-2 1a12 12 0 0 0 5 5l1-2 5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 4 5a2 2 0 0 1 2-2Z" />),
  Users: ({ size = 22 }: IP) => svg(size, <><circle cx="9" cy="8" r="3" /><path d="M3 20a6 6 0 0 1 12 0" /><path d="M16 6a3 3 0 0 1 0 5M21 20a5.5 5.5 0 0 0-3.5-5" /></>),
  Calendar: ({ size = 22 }: IP) => svg(size, <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 9h18M8 3v4M16 3v4" /></>),
  Chart: ({ size = 22 }: IP) => svg(size, <><path d="M4 20V4M4 20h16" /><path d="M8 16v-3M12 16V8M16 16v-6" /></>),
  Warn: ({ size = 22 }: IP) => svg(size, <><path d="M12 3 22 20H2L12 3Z" /><path d="M12 10v4M12 17h.01" /></>),
  Left: ({ size = 22 }: IP) => svg(size, <path d="M15 5l-7 7 7 7" />),
  Right: ({ size = 22 }: IP) => svg(size, <path d="M9 5l7 7-7 7" />),
  Plus: ({ size = 22 }: IP) => svg(size, <path d="M12 5v14M5 12h14" />),
  Menu: ({ size = 22 }: IP) => svg(size, <path d="M4 7h16M4 12h16M4 17h16" />),
  Clock: ({ size = 22 }: IP) => svg(size, <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>),
  Sun: ({ size = 22 }: IP) => svg(size, <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19" /></>),
  Moon: ({ size = 22 }: IP) => svg(size, <path d="M20 14A8 8 0 1 1 10 4a6 6 0 0 0 10 10Z" />),
  Life: ({ size = 22 }: IP) => svg(size, <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3.5" /><path d="M5 5l4 4M15 15l4 4M19 5l-4 4M9 15l-4 4" /></>),
};
export type HcIconKey = keyof typeof HcIcon;
