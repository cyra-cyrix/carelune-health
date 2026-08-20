// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HcData } from "./hc-kit";
import { HcProvider } from "./hc-kit";
import { HomeCareToday } from "./HomeCareToday";

afterEach(cleanup);

function data(): HcData {
  return {
    role: "caregiver",
    patient: {
      id: "patient-1",
      centre_id: "centre-1",
      full_name: "Anand Menon",
      age: 62,
      sex: "M",
      location: "Bengaluru",
      discharged_on: "2026-08-06",
      journey_start: "2026-08-06T00:00:00.000Z",
      journey_total_days: 30,
      diagnosis: ["Stroke recovery"],
      status: "active",
      pathway_pack_id: "neuro",
      pathway_version_id: "version-1",
    },
    day: 13,
    tasks: [
      {
        id: "medicine",
        patient_id: "patient-1",
        time_label: "07:30",
        sort_order: 1,
        discipline: "Nursing",
        title: "Morning medicines",
        detail: null,
        active: true,
      },
      {
        id: "reading",
        patient_id: "patient-1",
        time_label: "08:00",
        sort_order: 2,
        discipline: "Monitoring",
        title: "Record blood pressure",
        detail: null,
        active: true,
      },
      {
        id: "walk",
        patient_id: "patient-1",
        time_label: "18:00",
        sort_order: 3,
        discipline: "Physiotherapy",
        title: "Evening walk",
        detail: "Walk indoors with support.",
        active: true,
      },
      {
        id: "position",
        patient_id: "patient-1",
        time_label: "21:00",
        sort_order: 4,
        discipline: "Nursing",
        title: "Bedtime positioning",
        detail: null,
        active: true,
      },
    ],
    outcomes: new Map([["walk", "done"]]),
    meds: [
      {
        id: "med-1",
        patient_id: "patient-1",
        name: "Aspirin",
        dose: "75 mg",
        freq: "1-0-0",
        timing: "Morning",
        note: null,
        active: true,
      },
    ],
    medAdmin: new Map(),
    plan: null,
    readings: {
      bp: "",
      grbs: "",
      urineMl: "",
      foodIntake: "",
      mood: "",
      activity: "",
      pulse: "",
      spo2: "",
      temperature: "",
      pain: "",
      fluidMl: "",
      bowel: "",
      skin: "",
      feeding: "",
      cognition: "",
    },
    history: [],
    thresholds: [],
    feed: [],
    events: [],
    recordOutcome: vi.fn(),
    saveReadingFields: vi.fn(async () => true),
    markMed: vi.fn(),
    clearMed: vi.fn(),
    goTab: vi.fn(),
    postStatus: vi.fn(async () => undefined),
    reload: vi.fn(),
  };
}

describe("HomeCareToday", () => {
  it("leads with the greeting, the next activity, and how the day is going", () => {
    render(<HcProvider value={data()}><HomeCareToday /></HcProvider>);

    expect(screen.getByRole("heading", { level: 1, name: /care$/ })).toBeTruthy();
    // 3 recordable activities (the medicine hands off to Medicines); the walk is done.
    expect(screen.getByText("1 of 3 activities recorded")).toBeTruthy();

    // Next up is the earliest unrecorded activity, with its controls in place —
    // recording must never send the caregiver to another screen.
    const next = screen.getByRole("region", { name: "Record blood pressure" });
    expect(within(next).getByText("Next up")).toBeTruthy();
  });

  it("lists the whole day in one plan, and offers the timeline", () => {
    render(<HcProvider value={data()}><HomeCareToday /></HcProvider>);

    const plan = screen.getByRole("region", { name: "Today’s plan" });
    expect(within(plan).getByText("Evening walk")).toBeTruthy();
    expect(within(plan).getByText("Bedtime positioning")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "See all" }));
    expect(screen.getByRole("heading", { level: 1, name: "Today’s timeline" })).toBeTruthy();
  });

  it("offers the timeline from the header", () => {
    // Recording itself now lives in the shell's bottom bar, reachable from every
    // tab rather than only from Today, so it is not asserted here.
    render(<HcProvider value={data()}><HomeCareToday /></HcProvider>);

    fireEvent.click(screen.getByRole("button", { name: /Timeline/ }));
    expect(screen.getByRole("heading", { level: 1, name: "Today’s timeline" })).toBeTruthy();
  });

  it("keeps a medicine task as a handoff to Medicines instead of a second completion", () => {
    const value = data();
    render(<HcProvider value={value}><HomeCareToday /></HcProvider>);

    fireEvent.click(screen.getByRole("button", { name: /Morning medicines/ }));
    fireEvent.click(screen.getByRole("button", { name: "Open Medicines" }));

    expect(value.goTab).toHaveBeenCalledWith("medicines");
    expect(value.recordOutcome).not.toHaveBeenCalledWith("medicine", expect.anything());
  });
});
