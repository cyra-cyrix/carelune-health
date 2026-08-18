import type { CareTaskRow, TaskOutcome } from "../../lib/db";
import { classifyTask, taskHour, type TaskKind } from "./hc-kit";

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
