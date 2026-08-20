import type { CareTaskRow, TaskOutcome } from "../../lib/db";
import { classifyTask, currentPeriod, periodOf, PERIODS, taskHour, type Period, type TaskKind } from "./hc-kit";

export type TodayItem = {
  task: CareTaskRow;
  kind: TaskKind;
  outcome: TaskOutcome | null;
  destination: "today" | "medicines";
};

export type TodayModel = {
  ordered: TodayItem[];
  active: TodayItem | null;
  rows: TodayItem[];
  recordableTotal: number;
  recordedCount: number;
  allRecorded: boolean;
};

function orderedItems(tasks: CareTaskRow[], outcomes: Map<string, TaskOutcome>): TodayItem[] {
  return tasks
    .map((task, sourceIndex) => ({ task, sourceIndex }))
    .sort(
      (a, b) =>
        taskHour(a.task) - taskHour(b.task) ||
        a.task.sort_order - b.task.sort_order ||
        a.sourceIndex - b.sourceIndex,
    )
    .map(({ task }) => {
      const kind = classifyTask(task);
      return {
        task,
        kind,
        outcome: outcomes.get(task.id) ?? null,
        destination: kind === "medicine" ? "medicines" : "today",
      };
    });
}

export function buildTodayModel(
  tasks: CareTaskRow[],
  outcomes: Map<string, TaskOutcome>,
  selectedId: string | null,
): TodayModel {
  const ordered = orderedItems(tasks, outcomes);
  const recordable = ordered.filter((item) => item.destination === "today");
  const selected = selectedId ? ordered.find((item) => item.task.id === selectedId) ?? null : null;
  const active = selected ?? recordable.find((item) => item.outcome === null) ?? null;
  const recordedCount = recordable.filter((item) => item.outcome !== null).length;

  return {
    ordered,
    active,
    rows: ordered.filter((item) => item.task.id !== active?.task.id),
    recordableTotal: recordable.length,
    recordedCount,
    allRecorded: recordable.length > 0 && recordedCount === recordable.length,
  };
}

export function nextSelectionAfterRecord(
  tasks: CareTaskRow[],
  outcomes: Map<string, TaskOutcome>,
  currentId: string,
): string | null {
  const recordable = orderedItems(tasks, outcomes).filter((item) => item.destination === "today");
  const currentIndex = recordable.findIndex((item) => item.task.id === currentId);
  const after = recordable.slice(Math.max(0, currentIndex + 1)).find((item) => item.outcome === null);
  const anyPending = recordable.find((item) => item.outcome === null);
  return (after ?? anyPending)?.task.id ?? null;
}


/* ------------------------- time blocks (sliding cards) --------------------- */

/**
 * One slide of the day. The caregiver works a block at a time — morning, then
 * afternoon, and so on — rather than scrolling one long list from 6am to bedtime.
 */
export interface PeriodBlock {
  key: Period;
  label: string;
  /** Human range for the card header, e.g. "Morning · until 12pm". */
  range: string;
  items: TodayItem[];
  recordable: number;
  recorded: number;
  done: boolean;
  /** The next unrecorded item in this block — what the card opens on. */
  next: TodayItem | null;
}

const hour12 = (h: number): string => {
  if (h === 0 || h === 24) return "12am";
  if (h === 12) return "12pm";
  return h > 12 ? `${h - 12}pm` : `${h}am`;
};

/**
 * Group today's activities into the four time blocks, keeping empty blocks out
 * so the caregiver never swipes onto a card with nothing on it.
 */
export function buildPeriodBlocks(ordered: TodayItem[]): PeriodBlock[] {
  return PERIODS.map((p) => {
    const items = ordered.filter((it) => periodOf(it.task) === p.key);
    const recordableItems = items.filter((it) => it.destination === "today");
    const recorded = recordableItems.filter((it) => it.outcome !== null).length;
    return {
      key: p.key,
      label: p.label,
      range: `${hour12(p.from)} – ${hour12(p.to)}`,
      items,
      recordable: recordableItems.length,
      recorded,
      done: recordableItems.length > 0 && recorded === recordableItems.length,
      next: recordableItems.find((it) => it.outcome === null) ?? null,
    };
  }).filter((b) => b.items.length > 0);
}

/**
 * Which card to show first: the earliest block that still has work, otherwise the
 * block matching the time of day, otherwise the first. Opening on a finished
 * morning when it is already evening would make the caregiver swipe to catch up.
 */
export function initialBlockKey(blocks: PeriodBlock[], now: Period = currentPeriod()): Period | null {
  if (!blocks.length) return null;
  const unfinished = blocks.find((b) => !b.done && b.recordable > 0);
  if (unfinished) return unfinished.key;
  return (blocks.find((b) => b.key === now) ?? blocks[blocks.length - 1]).key;
}


/* --------------------------- "at a glance" tiles --------------------------- */

export interface GlanceTile {
  key: TaskKind;
  kind: TaskKind;
  label: string;
  recorded: number;
  total: number;
  done: boolean;
}

const TILE_LABEL: Partial<Record<TaskKind, string>> = {
  task: "Vitals",
  medicine: "Medicines",
  physio: "Therapy",
  food: "Feeds",
  positioning: "Position",
};

/**
 * The four-up summary above the plan.
 *
 * Counts come from today's scheduled activities and their recorded outcomes —
 * the data we actually hold. The daily readings row stores one value per
 * parameter per day, not an event stream, so a tile cannot honestly claim
 * "4 feeds recorded"; it reports recorded-of-scheduled instead.
 */
export function glanceTiles(ordered: TodayItem[]): GlanceTile[] {
  const byKind = new Map<TaskKind, TodayItem[]>();
  for (const item of ordered) {
    const list = byKind.get(item.kind) ?? [];
    list.push(item);
    byKind.set(item.kind, list);
  }
  return [...byKind.entries()]
    .filter(([kind]) => TILE_LABEL[kind])
    .map(([kind, items]) => {
      const recorded = items.filter((i) => i.outcome !== null).length;
      return {
        key: kind,
        kind,
        label: TILE_LABEL[kind] as string,
        recorded,
        total: items.length,
        done: recorded === items.length,
      };
    })
    .sort((a, b) => b.total - a.total)
    .slice(0, 4);
}
