// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PatientRow, SubscriptionRow } from "../../lib/db";
import { LACTATION_ENROLMENT, SPINE_ENROLMENT } from "../../domain/enrolment.fixtures";

// The surface reads the subscription it is handed and nothing else. This spy
// exists so a test can prove no live configuration is ever fetched.
const { getCentreServices, getCheckinForToday, getCheckinResponses, submitProgrammeCheckin } = vi.hoisted(() => ({
  getCentreServices: vi.fn(),
  getCheckinForToday: vi.fn(),
  getCheckinResponses: vi.fn(),
  submitProgrammeCheckin: vi.fn(),
}));
vi.mock("../../lib/db", () => ({ getCentreServices, getCheckinForToday, getCheckinResponses, submitProgrammeCheckin }));
// Messaging is reused unchanged from the recovery app; stubbed here so this
// file tests the programme surface rather than the existing message thread.
vi.mock("../home/HomeCareMessages", () => ({ HomeCareMessages: () => <div>EXISTING MESSAGE THREAD</div> }));
// Provider branding is real, patient-facing text, so each fixture is shown
// under its own provider — otherwise a leak test would be testing the mock.
const branding = vi.hoisted(() => ({
  value: {
    org: { name: "Dr Vivek Spine Care", display_name: "Dr Vivek Spine Care" },
    profile: { id: "u-carer", full_name: "Lakshmi Rao" },
  },
}));
vi.mock("../../branding/BrandingProvider", () => ({ useBranding: () => branding.value }));

import ProgrammeHome from "./ProgrammeHome";

const patient = { id: "patient-anand", full_name: "Anand Menon" } as PatientRow;
const priya = { id: "patient-priya", full_name: "Priya Nair" } as PatientRow;

/** Day 8 of Anand's programme; day 22 of Priya's. */
// shouldAdvanceTime: the clock is pinned so "day 8" is deterministic, but it
// still ticks, so waitFor/findBy are not starved of time.
beforeAll(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); vi.setSystemTime(new Date("2026-08-21T09:00:00.000Z")); });
afterAll(() => vi.useRealTimers());
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  getCheckinForToday.mockResolvedValue(null);   // nothing sent yet by default
  branding.value = {
    org: { name: "Dr Vivek Spine Care", display_name: "Dr Vivek Spine Care" },
    profile: { id: "u-carer", full_name: "Lakshmi Rao" },
  };
});

/** Show a fixture under its own provider's branding. */
const asLactationProvider = () => {
  branding.value = {
    org: { name: "Anjali Mother & Baby Care", display_name: "Anjali Mother & Baby Care" },
    profile: { id: "u-carer", full_name: "Meera Nair" },
  };
};

const show = (sub: SubscriptionRow, p: PatientRow = patient) =>
  render(<ProgrammeHome role="caregiver" patient={p} subscription={sub} />);

describe("Today", () => {
  it("says where the patient is, in their own programme", () => {
    show(SPINE_ENROLMENT);
    expect(screen.getByText(/Good (morning|afternoon|evening), Lakshmi/)).toBeTruthy();
    expect(screen.getByText("8")).toBeTruthy();
    expect(screen.getByText("Standard Recovery")).toBeTruthy();
    expect(screen.getByRole("progressbar", { name: "Day 8 of 60" })).toBeTruthy();
  });

  it("shows the period the patient is actually in", () => {
    show(SPINE_ENROLMENT);
    expect(screen.getByText("Weeks 2–4")).toBeTruthy();
    expect(screen.getByText("Building recovery")).toBeTruthy();
  });

  it("takes today's focus from the configuration, not from code", () => {
    show(SPINE_ENROLMENT);
    for (const area of ["Pain and comfort", "Walking and mobility", "Wound recovery"]) {
      expect(screen.getAllByText(area).length).toBeGreaterThan(0);
    }
  });

  it("previews the questions the check-in will ask, from configuration", () => {
    show(SPINE_ENROLMENT);
    expect(screen.getByText("How is your back or leg pain today?")).toBeTruthy();
    expect(screen.getByText("How far did you walk today?")).toBeTruthy();
  });

  it("never fetches live configuration — the patient's copy is the source", () => {
    show(SPINE_ENROLMENT);
    expect(getCentreServices).not.toHaveBeenCalled();
  });
});

describe("Progress", () => {
  const openProgress = () => fireEvent.click(screen.getByRole("button", { name: /Progress/ }));

  it("reports programme timing, not a verdict on the patient", () => {
    show(SPINE_ENROLMENT);
    openProgress();
    expect(screen.getByText("of 60")).toBeTruthy();
    expect(screen.getByText("1 of 3 stages behind you")).toBeTruthy();
    expect(screen.getByText(/Weeks 5–8 begins in 21 days/)).toBeTruthy();
  });

  it("makes no claim about how recovery is going", () => {
    show(SPINE_ENROLMENT);
    openProgress();
    const body = document.body.textContent ?? "";
    expect(body).not.toMatch(/you are improving|doing well|on track to recover|great progress/i);
    expect(screen.getByText(/for your care team to judge with you/)).toBeTruthy();
  });

  it("marks stages behind, now and ahead", () => {
    show(SPINE_ENROLMENT);
    openProgress();
    expect(screen.getByText("Done")).toBeTruthy();
    expect(screen.getByText("Now")).toBeTruthy();
    expect(screen.getByText("Ahead")).toBeTruthy();
  });
});

describe("Care", () => {
  const openCare = () => fireEvent.click(screen.getByRole("button", { name: /Care/ }));

  it("describes the programme in the patient's language", () => {
    show(SPINE_ENROLMENT);
    openCare();
    expect(screen.getByText("Standard Recovery")).toBeTruthy();
    expect(screen.getByText("Post-operative Spine Recovery · 60 days")).toBeTruthy();
    expect(screen.getByText("Three times a week")).toBeTruthy();
    expect(screen.getByText("Weekly review by your surgeon")).toBeTruthy();
    expect(screen.getByText("Wound photo review")).toBeTruthy();
  });

  it("never shows the patient Carelune's cut, the price, or any internal wiring", () => {
    show(SPINE_ENROLMENT);
    openCare();
    const body = document.body.textContent ?? "";
    expect(body).not.toMatch(/platform fee|20%|₹|18,?000/);
    expect(body).not.toMatch(/package_snapshot|programme_config|service_package_id|centre_service/i);
  });
});

describe("the same components for a completely different service", () => {
  it("renders mother-and-baby support without a line of specialty code", () => {
    asLactationProvider();
    show(LACTATION_ENROLMENT, priya);
    expect(screen.getByText("Guided Mother & Baby Support")).toBeTruthy();
    expect(screen.getByText("Settling into a rhythm")).toBeTruthy();
    expect(screen.getAllByText("Breast comfort").length).toBeGreaterThan(0);
    expect(screen.getByText("How did feeding go today?")).toBeTruthy();
  });

  it("lets no recovery wording leak into the lactation programme", () => {
    asLactationProvider();
    show(LACTATION_ENROLMENT, priya);
    const body = document.body.textContent ?? "";
    expect(body).not.toMatch(/wound|spine|surgeon|physiothera/i);
  });

  it("lets no feeding wording leak into the spine programme", () => {
    show(SPINE_ENROLMENT);
    const body = document.body.textContent ?? "";
    expect(body).not.toMatch(/latch|breast|feeding|lactation|nappies/i);
  });
});

describe("a snapshot we cannot render", () => {
  it("stays calm and keeps the care team reachable", () => {
    const broken = { ...SPINE_ENROLMENT, package_snapshot: null } as SubscriptionRow;
    show(broken);
    expect(screen.getByText("We couldn't load your programme")).toBeTruthy();
    expect(screen.getByText(/Nothing is wrong with your care/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ask your care team" })).toBeTruthy();
  });
});

describe("the patient's copy is frozen", () => {
  it("renders the snapshot even when the enrolment's own top-level fields have moved on", () => {
    // 0028 keeps plan_name/price current for the provider's records; the patient
    // surface reads the frozen snapshot, so a later reprice cannot reach them.
    const repriced = {
      ...SPINE_ENROLMENT,
      plan_name: "Standard Recovery (2027 pricing)",
      price: 99000,
    } as SubscriptionRow;
    show(repriced);
    expect(screen.getByText("Standard Recovery")).toBeTruthy();
    expect(screen.queryByText(/2027 pricing/)).toBeNull();
    expect((document.body.textContent ?? "")).not.toMatch(/99,?000/);
  });
});

describe("Support", () => {
  it("hands the patient the messaging they already had, not a new one", () => {
    show(SPINE_ENROLMENT);
    fireEvent.click(screen.getByRole("button", { name: /Support/ }));
    expect(screen.getByText("EXISTING MESSAGE THREAD")).toBeTruthy();
  });

  it("offers the same route from Today", () => {
    show(SPINE_ENROLMENT);
    fireEvent.click(screen.getByRole("button", { name: /Ask your care team/ }));
    expect(screen.getByText("EXISTING MESSAGE THREAD")).toBeTruthy();
  });
});

describe("today's check-in", () => {
  const flushLoad = async () => { await vi.waitFor(() => expect(getCheckinForToday).toHaveBeenCalled()); };

  it("invites the patient to start it, with the configured questions", async () => {
    show(SPINE_ENROLMENT);
    await flushLoad();
    expect(await screen.findByRole("button", { name: "Start today's check-in" })).toBeTruthy();
    expect(screen.getByText("How is your back or leg pain today?")).toBeTruthy();
  });

  it("asks one configured question at a time, in the patient's own wording", async () => {
    show(SPINE_ENROLMENT);
    await flushLoad();
    fireEvent.click(await screen.findByRole("button", { name: "Start today's check-in" }));

    expect(screen.getByText("Question 1 of 5")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "How is your back or leg pain today?" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(screen.getByRole("heading", { name: "How far did you walk today?" })).toBeTruthy();
  });

  it("sends structured answers carrying the wording that was displayed", async () => {
    submitProgrammeCheckin.mockResolvedValue({
      id: "sub-1", patient_id: "patient-anand", subscription_id: "sub-spine",
      submitted_at: "2026-08-21T09:12:00.000Z", local_date: "2026-08-21",
      programme_day: 8, programme_period_label: "Weeks 2–4", status: "submitted",
    });
    show(SPINE_ENROLMENT);
    await flushLoad();
    fireEvent.click(await screen.findByRole("button", { name: "Start today's check-in" }));

    fireEvent.change(screen.getByPlaceholderText("In your own words"), { target: { value: "Sore this morning" } });
    for (let i = 0; i < 5; i++) fireEvent.click(screen.getByRole("button", { name: /Next|Skip/ }));
    fireEvent.click(screen.getByRole("button", { name: "Submit check-in" }));

    await screen.findByText("Completed ✓");
    const sent = submitProgrammeCheckin.mock.calls[0][0];
    expect(sent.subscriptionId).toBe("sub-spine");
    expect(sent.periodLabel).toBe("Weeks 2–4");
    expect(sent.answers[0]).toMatchObject({ label: "How is your back or leg pain today?", type: "text", text: "Sore this morning" });
    // The browser never names the patient or the programme day.
    expect(Object.keys(sent)).not.toContain("patientId");
    expect(Object.keys(sent)).not.toContain("programmeDay");
  });

  it("confirms plainly, without telling the patient how they are doing", async () => {
    submitProgrammeCheckin.mockResolvedValue({
      id: "sub-1", patient_id: "patient-anand", subscription_id: "sub-spine",
      submitted_at: "2026-08-21T09:12:00.000Z", local_date: "2026-08-21",
      programme_day: 8, programme_period_label: "Weeks 2–4", status: "submitted",
    });
    show(SPINE_ENROLMENT);
    await flushLoad();
    fireEvent.click(await screen.findByRole("button", { name: "Start today's check-in" }));
    fireEvent.change(screen.getByPlaceholderText("In your own words"), { target: { value: "Fine" } });
    for (let i = 0; i < 5; i++) fireEvent.click(screen.getByRole("button", { name: /Next|Skip/ }));
    fireEvent.click(screen.getByRole("button", { name: "Submit check-in" }));

    expect(await screen.findByText("Your care team can now see today's update.")).toBeTruthy();
    expect(screen.getByText(/1 question answered · Submitted at/)).toBeTruthy();
    const body = document.body.textContent ?? "";
    expect(body).not.toMatch(/doing well|looks normal|on track|everything is fine|improving/i);
  });

  it("keeps everything typed when the submit fails, and offers another go", async () => {
    submitProgrammeCheckin.mockRejectedValue(new Error("Network unavailable"));
    show(SPINE_ENROLMENT);
    await flushLoad();
    fireEvent.click(await screen.findByRole("button", { name: "Start today's check-in" }));
    fireEvent.change(screen.getByPlaceholderText("In your own words"), { target: { value: "Sore this morning" } });
    for (let i = 0; i < 5; i++) fireEvent.click(screen.getByRole("button", { name: /Next|Skip/ }));
    fireEvent.click(screen.getByRole("button", { name: "Submit check-in" }));

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText(/Your answers are still here/)).toBeTruthy();
    // walk back to the first question; Back disappears once we are on it
    for (let i = 0; i < 5; i++) {
      const back = screen.queryByRole("button", { name: "Back" });
      if (!back) break;
      fireEvent.click(back);
    }
    expect((screen.getByPlaceholderText("In your own words") as HTMLTextAreaElement).value).toBe("Sore this morning");
  });

  it("shows a check-in already sent today as completed, and never reopens it", async () => {
    getCheckinForToday.mockResolvedValue({
      id: "sub-1", patient_id: "patient-anand", subscription_id: "sub-spine",
      submitted_at: "2026-08-21T09:12:00.000Z", local_date: "2026-08-21",
      programme_day: 8, programme_period_label: "Weeks 2–4", status: "submitted",
    });
    show(SPINE_ENROLMENT);
    expect(await screen.findByText("Completed ✓")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Start today's check-in" })).toBeNull();
    expect(screen.getByRole("button", { name: "View answers" })).toBeTruthy();
  });

  it("reads back what was sent, as sent", async () => {
    getCheckinForToday.mockResolvedValue({
      id: "sub-1", patient_id: "patient-anand", subscription_id: "sub-spine",
      submitted_at: "2026-08-21T09:12:00.000Z", local_date: "2026-08-21",
      programme_day: 8, programme_period_label: "Weeks 2–4", status: "submitted",
    });
    getCheckinResponses.mockResolvedValue([
      { id: "r1", submission_id: "sub-1", question_key: "q1", question_label_snapshot: "How is your back or leg pain today?", response_type: "text", value_text: "Sore this morning", value_number: null, value_boolean: null },
      { id: "r2", submission_id: "sub-1", question_key: "q4", question_label_snapshot: "Did you complete your exercises?", response_type: "yes_no", value_text: null, value_number: null, value_boolean: true },
    ]);
    show(SPINE_ENROLMENT);
    fireEvent.click(await screen.findByRole("button", { name: "View answers" }));

    const sheet = await screen.findByRole("dialog", { name: "Your answers" });
    expect(within(sheet).getByText("Sore this morning")).toBeTruthy();
    expect(within(sheet).getByText("Yes")).toBeTruthy();
    // A record, not a form.
    expect(sheet.querySelectorAll("input, textarea")).toHaveLength(0);
  });

  it("runs the identical flow for a completely different service", async () => {
    asLactationProvider();
    show(LACTATION_ENROLMENT, priya);
    await flushLoad();
    fireEvent.click(await screen.findByRole("button", { name: "Start today's check-in" }));
    expect(screen.getByRole("heading", { name: "How did feeding go today?" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    // "Is the latch comfortable?" is a yes/no question by shape alone.
    expect(screen.getByRole("button", { name: "Yes" })).toBeTruthy();
    expect((document.body.textContent ?? "")).not.toMatch(/wound|spine/i);
  });
});
