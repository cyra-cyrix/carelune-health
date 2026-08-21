// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PatientRow } from "../../lib/db";
import { LACTATION_ENROLMENT, LEGACY_SUBSCRIPTION, SPINE_ENROLMENT } from "../../domain/enrolment.fixtures";

vi.mock("../../lib/db", () => ({ getMyPatient: vi.fn(), getSubscription: vi.fn() }));
// The two experiences are stubbed: this file is about the routing decision,
// not about what either surface draws.
vi.mock("../home/HomeCare", () => ({ default: () => <div>LEGACY RECOVERY APP</div> }));
vi.mock("./ProgrammeHome", () => ({ default: () => <div>UNIVERSAL PROGRAMME APP</div> }));

import { getMyPatient, getSubscription } from "../../lib/db";
import PatientSurface from "./PatientSurface";

afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

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
