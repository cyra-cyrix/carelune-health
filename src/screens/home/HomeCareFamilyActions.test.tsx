// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HcData } from "./hc-kit";
import { HcProvider } from "./hc-kit";

/* The db module is the only write surface these screens touch; stubbing it keeps
   the test on the UI contract (one action = one write) without a network. */
const raiseApproval = vi.fn(async () => undefined);
vi.mock("../../lib/db", () => ({
  raiseApproval: (...args: unknown[]) => raiseApproval(...(args as [])),
  getPatientQueries: async () => [],
  getQueryReplies: async () => [],
}));
vi.mock("../../branding/BrandingProvider", () => ({
  useBranding: () => ({ profile: { full_name: "Lakshmi R" }, org: { service_hours: "8 AM – 8 PM" } }),
}));

const { HomeCareMessages } = await import("./HomeCareMessages");
const { HomeCareMedicines, summariseDoses, doseSummaryLine } = await import("./HomeCareMedicines");

afterEach(cleanup);
beforeEach(() => raiseApproval.mockClear());

function data(overrides: Partial<HcData> = {}): HcData {
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
    tasks: [],
    outcomes: new Map(),
    meds: [{
      id: "med-1", patient_id: "patient-1", name: "Aspirin", dose: "75 mg",
      freq: "1-0-0", timing: "Morning", note: null, active: true,
    }],
    medAdmin: new Map(),
    plan: null,
    readings: {
      bp: "", grbs: "", urineMl: "", foodIntake: "", mood: "", activity: "",
      pulse: "", spo2: "", temperature: "", pain: "", fluidMl: "", bowel: "",
      skin: "", feeding: "", cognition: "",
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
    ...overrides,
  };
}

describe("Raise a concern", () => {
  it("needs a category and a note, then reports status, who has it, and what happens next", async () => {
    render(<HcProvider value={data()}><HomeCareMessages /></HcProvider>);

    const send = screen.getByRole("button", { name: "Send to the care team" });
    expect(send.hasAttribute("disabled")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Breathing" }));
    fireEvent.change(screen.getByLabelText("What have you noticed?"), {
      target: { value: "His breathing sounds heavier tonight." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Needs attention today" }));
    fireEvent.click(screen.getByRole("button", { name: "Send to the care team" }));

    await waitFor(() => expect(raiseApproval).toHaveBeenCalledTimes(1));
    expect(raiseApproval).toHaveBeenCalledWith("patient-1", {
      type: "patient_query",
      message: "Breathing: His breathing sounds heavier tonight.",
      urgency: "urgent",
      from_name: "Lakshmi R",
    });

    const receipt = await screen.findByRole("region", { name: "Your concern has been sent" });
    expect(within(receipt).getByText(/Waiting for the care team/)).toBeTruthy();
    expect(within(receipt).getByText(/nursing and coordination team/i)).toBeTruthy();
    expect(within(receipt).getByText(/8 AM – 8 PM/)).toBeTruthy();
  });

  it("says plainly that this is not an emergency service", () => {
    render(<HcProvider value={data()}><HomeCareMessages /></HcProvider>);
    expect(screen.getByText(/Carelune is not an emergency service/)).toBeTruthy();
  });

  it("sends one concern even if the button is tapped twice", async () => {
    render(<HcProvider value={data()}><HomeCareMessages /></HcProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Pain or discomfort" }));
    fireEvent.change(screen.getByLabelText("What have you noticed?"), { target: { value: "Sore shoulder." } });

    const send = screen.getByRole("button", { name: "Send to the care team" });
    fireEvent.click(send);
    fireEvent.click(send);

    await waitFor(() => expect(raiseApproval).toHaveBeenCalledTimes(1));
  });
});

describe("Medicines", () => {
  it("records a skipped dose once, with the reason sent to the care team", async () => {
    const value = data();
    render(<HcProvider value={value}><HomeCareMedicines /></HcProvider>);

    fireEvent.click(screen.getByRole("button", { name: /^Aspirin/ }));
    fireEvent.click(screen.getByRole("button", { name: "Skipped" }));
    fireEvent.click(screen.getByRole("button", { name: "Vomiting or nausea" }));
    fireEvent.click(screen.getByRole("button", { name: "Record as skipped" }));

    await waitFor(() => expect(value.markMed).toHaveBeenCalledTimes(1));
    expect(value.markMed).toHaveBeenCalledWith("med-1", "morning", "skipped");
    await waitFor(() => expect(value.postStatus).toHaveBeenCalledTimes(1));
    expect(vi.mocked(value.postStatus).mock.calls[0][0]).toContain("Vomiting or nausea");
  });

  it("writes one med_admin record when the taken control is double tapped", () => {
    const value = data();
    render(<HcProvider value={value}><HomeCareMedicines /></HcProvider>);

    const check = screen.getByRole("button", { name: "Record Aspirin as taken" });
    fireEvent.click(check);
    fireEvent.click(check);

    expect(value.markMed).toHaveBeenCalledTimes(1);
    expect(value.clearMed).not.toHaveBeenCalled();
  });
});

describe("dose reporting", () => {
  it("counts a taken dose as taken and nothing else", () => {
    expect(summariseDoses(["given", undefined, undefined])).toEqual({ total: 3, taken: 1, skipped: 0, remaining: 2 });
  });

  it("counts a skipped dose as skipped and never as taken", () => {
    const d = summariseDoses(["skipped", undefined, undefined]);
    expect(d.skipped).toBe(1);
    expect(d.taken).toBe(0);
    expect(d.remaining).toBe(2);
  });

  it("treats a missed dose the same way — not taken", () => {
    expect(summariseDoses(["missed"])).toEqual({ total: 1, taken: 0, skipped: 1, remaining: 0 });
  });

  it("keeps the remaining count correct as doses are recorded", () => {
    expect(summariseDoses(["given", "skipped", undefined, undefined, undefined]).remaining).toBe(3);
    expect(summariseDoses(["given", "skipped", "given", "given", "skipped"]).remaining).toBe(0);
  });

  it("says taken and skipped separately, never one blended number", () => {
    expect(doseSummaryLine(summariseDoses(["given", "skipped", undefined, undefined, undefined])))
      .toBe("1 of 5 taken · 1 skipped · 3 still to record");
    expect(doseSummaryLine(summariseDoses(["given", "given"]))).toBe("2 of 2 taken");
    expect(doseSummaryLine(summariseDoses([]))).toBe("No scheduled doses today.");
  });

  it("does not report a skipped dose as taken on the Medicines screen", async () => {
    const value = data();
    render(<HcProvider value={value}><HomeCareMedicines /></HcProvider>);

    fireEvent.click(screen.getByRole("button", { name: /^Aspirin/ }));
    fireEvent.click(screen.getByRole("button", { name: "Skipped" }));
    fireEvent.click(screen.getByRole("button", { name: "Record as skipped" }));

    await waitFor(() => expect(value.markMed).toHaveBeenCalledWith("med-1", "morning", "skipped"));
    // The shell reconciles the optimistic map; re-render with the stored status.
    cleanup();
    render(
      <HcProvider value={data({ medAdmin: new Map([["med-1|morning", "skipped" as const]]) })}>
        <HomeCareMedicines />
      </HcProvider>,
    );
    expect(screen.getByText("0 of 1 taken · 1 skipped")).toBeTruthy();
    expect(screen.queryByText(/1 of 1 taken/)).toBeNull();
    expect(screen.getByText("0/1 taken")).toBeTruthy();
  });
});
