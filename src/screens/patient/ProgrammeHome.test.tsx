// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PatientRow, SubscriptionRow } from "../../lib/db";
import { LACTATION_ENROLMENT, SPINE_ENROLMENT } from "../../domain/enrolment.fixtures";

// The surface reads the subscription it is handed and nothing else. This spy
// exists so a test can prove no live configuration is ever fetched.
const { getCentreServices } = vi.hoisted(() => ({ getCentreServices: vi.fn() }));
vi.mock("../../lib/db", () => ({ getCentreServices }));
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
beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-08-21T09:00:00.000Z")); });
afterAll(() => vi.useRealTimers());
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
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

describe("the check-in preview", () => {
  it("opens read-only and says plainly that nothing is saved yet", () => {
    show(SPINE_ENROLMENT);
    fireEvent.click(screen.getByRole("button", { name: "See today's check-in" }));

    const sheet = screen.getByRole("dialog", { name: "Your check-in" });
    expect(within(sheet).getByText(/nothing you see is saved yet/i)).toBeTruthy();
    // A preview, not a form: there is nothing to type into and nothing to submit.
    expect(sheet.querySelectorAll("input, textarea")).toHaveLength(0);
    expect(within(sheet).queryByRole("button", { name: /save|submit|send/i })).toBeNull();
  });

  it("lists every configured question with why it is asked", () => {
    show(SPINE_ENROLMENT);
    fireEvent.click(screen.getByRole("button", { name: "See today's check-in" }));
    const sheet = screen.getByRole("dialog", { name: "Your check-in" });
    expect(within(sheet).getAllByRole("listitem")).toHaveLength(5);
    expect(within(sheet).getByText(/earliest signal recovery is off track/)).toBeTruthy();
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
