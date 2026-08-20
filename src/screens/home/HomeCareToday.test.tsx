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
  it("splits the day into time-of-day cards instead of one long list", () => {
    render(<HcProvider value={data()}><HomeCareToday /></HcProvider>);

    expect(screen.getByRole("heading", { level: 1, name: "Today" })).toBeTruthy();
    expect(screen.getByText("1 of 3 recorded")).toBeTruthy();

    // 07:30 + 08:00 -> Morning, 18:00 -> Evening, 21:00 -> Bedtime. Nothing falls
    // in the afternoon, and that block is not rendered at all — the caregiver
    // never swipes onto an empty card.
    const tabs = screen.getByRole("navigation", { name: "Time of day" });
    expect(within(tabs).getByRole("button", { name: /Morning/ })).toBeTruthy();
    expect(within(tabs).getByRole("button", { name: /Evening/ })).toBeTruthy();
    expect(within(tabs).getByRole("button", { name: /Bedtime/ })).toBeTruthy();
    expect(within(tabs).queryByRole("button", { name: /Afternoon/ })).toBeNull();

    const evening = screen.getByRole("region", { name: /^Evening/ });
    expect(within(evening).getAllByText("Evening walk")).toHaveLength(1);
    // Morning work stays in the Morning card, not mixed into the evening one.
    expect(within(evening).queryByText("Record blood pressure")).toBeNull();
  });

  it("opens the next unrecorded activity for recording inside its own card", () => {
    render(<HcProvider value={data()}><HomeCareToday /></HcProvider>);

    // The reading is the next thing due, and its controls render in the Morning
    // card itself — recording must never send the caregiver to another screen.
    const morning = screen.getByRole("region", { name: /^Morning/ });
    expect(within(morning).getByText("Record blood pressure")).toBeTruthy();
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
