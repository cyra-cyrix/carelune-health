import { describe, expect, it } from "vitest";
import type { CareTaskRow, TaskOutcome } from "../../lib/db";
import { buildTodayModel, nextSelectionAfterRecord } from "./today-model";

function task(
  id: string,
  time_label: string,
  sort_order: number,
  title = id,
  discipline = "Care",
): CareTaskRow {
  return {
    id,
    patient_id: "patient-1",
    time_label,
    sort_order,
    discipline,
    title,
    detail: null,
    active: true,
  };
}

describe("buildTodayModel", () => {
  it("orders activities by time and keeps source order when sort order ties", () => {
    const tasks = [
      task("late", "18:00", 4),
      task("same-order-first", "10:00", 2),
      task("early", "07:30", 1),
      task("same-order-second", "10:00", 2),
    ];

    expect(buildTodayModel(tasks, new Map(), null).ordered.map((item) => item.task.id)).toEqual([
      "early",
      "same-order-first",
      "same-order-second",
      "late",
    ]);
  });

  it("counts recorded care activities without treating medicine guidance as a task completion", () => {
    const tasks = [
      task("medicine", "07:30", 1, "Morning medicines", "Nursing"),
      task("reading", "08:00", 2, "Record blood pressure", "Monitoring"),
      task("walk", "10:00", 3, "Assisted walk", "Physiotherapy"),
      task("meal", "13:00", 4, "Lunch", "Diet"),
    ];
    const outcomes = new Map<string, TaskOutcome>([["walk", "done"]]);

    const model = buildTodayModel(tasks, outcomes, null);

    expect(model.recordableTotal).toBe(3);
    expect(model.recordedCount).toBe(1);
    expect(model.active?.task.id).toBe("reading");
    expect(model.rows.find((row) => row.task.id === "medicine")?.destination).toBe("medicines");
  });

  it("keeps an explicitly selected recorded activity open for correction", () => {
    const tasks = [task("walk", "10:00", 1, "Assisted walk", "Physiotherapy")];
    const outcomes = new Map<string, TaskOutcome>([["walk", "unable"]]);

    const model = buildTodayModel(tasks, outcomes, "walk");

    expect(model.active?.task.id).toBe("walk");
    expect(model.active?.outcome).toBe("unable");
    expect(model.allRecorded).toBe(true);
  });

  it("has no automatic active action when every recordable activity is recorded", () => {
    const tasks = [task("walk", "10:00", 1, "Assisted walk", "Physiotherapy")];
    const outcomes = new Map<string, TaskOutcome>([["walk", "done"]]);

    expect(buildTodayModel(tasks, outcomes, null).active).toBeNull();
  });
});

describe("nextSelectionAfterRecord", () => {
  it("advances to the next unrecorded care activity and skips medicine guidance", () => {
    const tasks = [
      task("walk", "10:00", 1, "Assisted walk", "Physiotherapy"),
      task("medicine", "11:00", 2, "Morning medicines", "Nursing"),
      task("meal", "13:00", 3, "Lunch", "Diet"),
    ];
    const outcomes = new Map<string, TaskOutcome>([["walk", "done"]]);

    expect(nextSelectionAfterRecord(tasks, outcomes, "walk")).toBe("meal");
  });
});
