// @vitest-environment jsdom

/*
 * Who the care-programme card is for, and what a clinician reviewing a draft is
 * actually shown.
 */
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  approvePatientProgramme: vi.fn(),
  compileCarePlan: vi.fn(),
  getPatientProgrammes: vi.fn(),
  getSubscription: vi.fn(),
  reviseProgrammeDraft: vi.fn(),
}));
vi.mock("../../lib/db", () => db);

import ProgrammeReview from "./ProgrammeReview";

const draft = {
  id: "prog-1",
  version: 4,
  status: "draft",
  ai_model: "gpt-4o",
  approved_at: null,
  approval_note: null,
  quick_records: [],
  compiled_from: {
    clinical_domain: "Neuro Rehabilitation & Stroke",
    service_name: "Neuro Continuum at Home",
    knowledge_pack_title: "Neuro reference",
    knowledge_pack_version: 1,
    facts_document_label: "Discharge summary",
    had_patient_facts: true,
    notes_for_clinician: ["Blood pressure frequency was not stated in the records."],
  },
  activities: [
    {
      key: "morning_meds", activity_type: "dose", title: "Morning medicines", basis: "document",
      instructions: "Give with water, after breakfast.", rationale: "Listed on the discharge medication chart.",
      input_schema: [], schedule: { kind: "clock", times: ["09:00"], days: "all", from_day: 1 },
    },
    {
      key: "reposition", activity_type: "task", title: "Reposition", basis: "provider_default",
      instructions: "", rationale: "Part of the approved programme.",
      input_schema: [], schedule: { kind: "clock", times: ["06:00", "12:00"], days: "all", from_day: 1 },
    },
    {
      key: "sleep_check", activity_type: "observation", title: "Sleep", basis: "ai_suggested",
      instructions: "", rationale: "Disturbed sleep is common after stroke.",
      input_schema: [], schedule: { kind: "on_demand" },
    },
  ],
};

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  db.getPatientProgrammes.mockResolvedValue([draft]);
  db.getSubscription.mockResolvedValue({ id: "sub-1", service_package_id: "pkg-1" });
});

describe("who the card is for", () => {
  it("renders nothing for a legacy recovery patient", async () => {
    // The compiler refuses a patient with no enrolment, so offering the action
    // would be offering something that cannot work.
    db.getSubscription.mockResolvedValue({ id: "sub-1", service_package_id: null });
    const { container } = render(<ProgrammeReview patientId="p1" />);
    await waitFor(() => expect(container.textContent).toBe(""));
  });

  it("renders nothing when there is no subscription at all", async () => {
    db.getSubscription.mockResolvedValue(null);
    const { container } = render(<ProgrammeReview patientId="p1" />);
    await waitFor(() => expect(container.textContent).toBe(""));
  });

  it("renders for a patient enrolled in a service programme", async () => {
    render(<ProgrammeReview patientId="p1" />);
    expect(await screen.findByText("Care programme")).toBeTruthy();
  });
});

describe("what the clinician review shows for every activity", () => {
  const row = async (title: string) => {
    const el = (await screen.findByText(title)).closest("li");
    if (!el) throw new Error(`no row for ${title}`);
    return el as HTMLElement;
  };

  it("shows the activity, its schedule, its basis and an editable inclusion", async () => {
    render(<ProgrammeReview patientId="p1" />);
    const meds = await row("Morning medicines");
    expect(within(meds).getByText("Every day at 09:00")).toBeTruthy();
    expect(within(meds).getByText("From the patient's own records")).toBeTruthy();
    const box = within(meds).getByRole("checkbox", { name: "Include Morning medicines" }) as HTMLInputElement;
    expect(box.checked).toBe(true);
  });

  it("names the source it actually used, per activity", async () => {
    render(<ProgrammeReview patientId="p1" />);
    expect(within(await row("Morning medicines")).getByText(/Discharge summary/)).toBeTruthy();
    expect(within(await row("Reposition")).getByText(/Neuro Continuum at Home/)).toBeTruthy();
    expect(within(await row("Sleep")).getByText(/not in this patient's records/)).toBeTruthy();
  });

  it("carries the reason each activity was proposed", async () => {
    render(<ProgrammeReview patientId="p1" />);
    expect(within(await row("Morning medicines")).getByText("Listed on the discharge medication chart.")).toBeTruthy();
    expect(within(await row("Sleep")).getByText("Disturbed sleep is common after stroke.")).toBeTruthy();
  });

  it("says what kind of thing the reviewer is being asked to accept", async () => {
    render(<ProgrammeReview patientId="p1" />);
    expect(await screen.findByText("1 from this patient's records")).toBeTruthy();
    expect(screen.getByText("1 from the approved programme")).toBeTruthy();
    expect(screen.getByText("1 candidates needing your decision")).toBeTruthy();
  });

  it("says plainly that nothing is scheduled from a draft", async () => {
    render(<ProgrammeReview patientId="p1" />);
    expect(await screen.findByText(/no care is scheduled from it/)).toBeTruthy();
    expect(screen.getByText(/Draft v4 — awaiting your approval/)).toBeTruthy();
  });

  it("passes the compiler's own notes to the reviewer", async () => {
    render(<ProgrammeReview patientId="p1" />);
    expect(await screen.findByText(/Blood pressure frequency was not stated/)).toBeTruthy();
  });
});
