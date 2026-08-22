// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PatientRow } from "../../lib/db";
import { LACTATION_ENROLMENT, LEGACY_SUBSCRIPTION, SPINE_ENROLMENT } from "../../domain/enrolment.fixtures";

vi.mock("../../lib/db", () => ({
  getMyPatient: vi.fn(),
  getSubscription: vi.fn(),
  getApprovedProgramme: vi.fn(),
}));
// The three experiences are stubbed: this file is about the routing decision,
// not about what any surface draws.
vi.mock("../home/HomeCare", () => ({ default: () => <div>LEGACY RECOVERY APP</div> }));
vi.mock("./ProgrammeHome", () => ({ default: () => <div>UNIVERSAL PROGRAMME APP</div> }));
vi.mock("./care/CareShell", () => ({ default: () => <div>CARE SHELL</div> }));

import { getApprovedProgramme, getMyPatient, getSubscription } from "../../lib/db";
import PatientSurface from "./PatientSurface";

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  // Default: no approved programme, so every pre-existing case below routes
  // exactly as it did before this branch was added.
  vi.mocked(getApprovedProgramme).mockResolvedValue(null);
});

const approvedProgramme = {
  id: "prog-1",
  activities: [{ key: "morning_meds" }],
  quick_records: ["pain"],
  status: "approved",
} as unknown as Awaited<ReturnType<typeof getApprovedProgramme>>;

const patient = { id: "patient-anand", full_name: "Anand Menon" } as PatientRow;

describe("which patient app a household member gets", () => {
  it("gives a patient enrolled in a service package the programme experience", async () => {
    vi.mocked(getMyPatient).mockResolvedValue(patient);
    vi.mocked(getSubscription).mockResolvedValue(SPINE_ENROLMENT);
    render(<PatientSurface role="caregiver" />);
    expect(await screen.findByText("UNIVERSAL PROGRAMME APP")).toBeTruthy();
    expect(screen.queryByText("LEGACY RECOVERY APP")).toBeNull();
  });

  it("gives a legacy recovery patient exactly the app they had before", async () => {
    vi.mocked(getMyPatient).mockResolvedValue(patient);
    vi.mocked(getSubscription).mockResolvedValue(LEGACY_SUBSCRIPTION);
    render(<PatientSurface role="family" />);
    expect(await screen.findByText("LEGACY RECOVERY APP")).toBeTruthy();
    expect(screen.queryByText("UNIVERSAL PROGRAMME APP")).toBeNull();
  });

  it("falls back to the recovery app when there is no subscription at all", async () => {
    vi.mocked(getMyPatient).mockResolvedValue(patient);
    vi.mocked(getSubscription).mockResolvedValue(null);
    render(<PatientSurface role="caregiver" />);
    expect(await screen.findByText("LEGACY RECOVERY APP")).toBeTruthy();
  });

  it("falls back to the recovery app when the subscription cannot be read", async () => {
    vi.mocked(getMyPatient).mockResolvedValue(patient);
    vi.mocked(getSubscription).mockRejectedValue(new Error("network"));
    render(<PatientSurface role="caregiver" />);
    expect(await screen.findByText("LEGACY RECOVERY APP")).toBeTruthy();
  });

  it("routes a different specialty the same way — the decision is the enrolment, not the service", async () => {
    vi.mocked(getMyPatient).mockResolvedValue({ ...patient, id: "patient-priya" } as PatientRow);
    vi.mocked(getSubscription).mockResolvedValue(LACTATION_ENROLMENT);
    render(<PatientSurface role="family" />);
    expect(await screen.findByText("UNIVERSAL PROGRAMME APP")).toBeTruthy();
  });
});

describe("an approved care programme takes precedence", () => {
  it("gives a patient with an approved programme the care shell", async () => {
    vi.mocked(getMyPatient).mockResolvedValue(patient);
    vi.mocked(getSubscription).mockResolvedValue(SPINE_ENROLMENT);
    vi.mocked(getApprovedProgramme).mockResolvedValue(approvedProgramme);
    render(<PatientSurface role="caregiver" />);
    expect(await screen.findByText("CARE SHELL")).toBeTruthy();
    expect(screen.queryByText("UNIVERSAL PROGRAMME APP")).toBeNull();
    expect(screen.queryByText("LEGACY RECOVERY APP")).toBeNull();
  });

  it("routes a lactation enrolment to the same shell — the decision is the programme, not the specialty", async () => {
    vi.mocked(getMyPatient).mockResolvedValue(patient);
    vi.mocked(getSubscription).mockResolvedValue(LACTATION_ENROLMENT);
    vi.mocked(getApprovedProgramme).mockResolvedValue(approvedProgramme);
    render(<PatientSurface role="family" />);
    expect(await screen.findByText("CARE SHELL")).toBeTruthy();
  });

  it("keeps a patient whose programme is only a DRAFT out of the care shell", async () => {
    // A draft is not care. RLS returns nothing for a household account, so the
    // patient falls through to the surface they had before approval.
    vi.mocked(getMyPatient).mockResolvedValue(patient);
    vi.mocked(getSubscription).mockResolvedValue(SPINE_ENROLMENT);
    vi.mocked(getApprovedProgramme).mockResolvedValue(null);
    render(<PatientSurface role="caregiver" />);
    expect(await screen.findByText("UNIVERSAL PROGRAMME APP")).toBeTruthy();
    expect(screen.queryByText("CARE SHELL")).toBeNull();
  });

  it("never shows the care shell to a legacy recovery patient", async () => {
    vi.mocked(getMyPatient).mockResolvedValue(patient);
    vi.mocked(getSubscription).mockResolvedValue(LEGACY_SUBSCRIPTION);
    vi.mocked(getApprovedProgramme).mockResolvedValue(null);
    render(<PatientSurface role="family" />);
    expect(await screen.findByText("LEGACY RECOVERY APP")).toBeTruthy();
    expect(screen.queryByText("CARE SHELL")).toBeNull();
  });
});
