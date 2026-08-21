// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OrgSummary } from "../../lib/db";

vi.mock("../../lib/db", () => ({
  listOrgs: vi.fn(),
  createOrg: vi.fn(),
  setInstitutionStatus: vi.fn(),
  analyseProviderService: vi.fn(),
  createProviderService: vi.fn(),
}));
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ signOut: vi.fn() }) }));

import { createOrg, listOrgs } from "../../lib/db";
import SuperAdmin from "./SuperAdmin";

afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

const org = (over: Partial<OrgSummary> = {}): OrgSummary =>
  ({
    id: "c1",
    name: "Sunrise Spine & Rehab",
    display_name: null,
    setup_complete: true,
    institution_type: "rehab_centre",
    admin_name: "Dr Meera Nair",
    admin_email: "meera@sunrise.in",
    pathways: [],
    patient_count: 4,
    status: "active",
    ...over,
  }) as OrgSummary;

describe("Super Admin console — existing behaviour is intact", () => {
  it("still lists the organisations it has always listed", async () => {
    vi.mocked(listOrgs).mockResolvedValue([org()]);
    render(<SuperAdmin />);
    expect(await screen.findByText("Sunrise Spine & Rehab")).toBeTruthy();
    expect(screen.getByText("meera@sunrise.in", { exact: false })).toBeTruthy();
    expect(screen.getByText("4 patients")).toBeTruthy();
  });

  it("still creates an organisation and its admin from the console form", async () => {
    vi.mocked(listOrgs).mockResolvedValue([]);
    vi.mocked(createOrg).mockResolvedValue(undefined);
    render(<SuperAdmin />);
    await screen.findByText("Add without setup");

    fireEvent.change(screen.getByPlaceholderText("e.g. Sunrise Spine & Rehab"), { target: { value: "New Centre" } });
    fireEvent.click(screen.getByRole("button", { name: "Hospital" }));
    fireEvent.change(screen.getByPlaceholderText("admin@institution.in"), { target: { value: "admin@new.in" } });
    fireEvent.click(screen.getByRole("button", { name: "Create institution" }));

    expect(vi.mocked(createOrg).mock.calls[0][0].org_name).toBe("New Centre");
    expect(vi.mocked(createOrg).mock.calls[0][0].institution_type).toBe("hospital");
  });
});

describe("Super Admin console — the guided setup entry point", () => {
  it("opens the service builder from the console and comes back to it", async () => {
    vi.mocked(listOrgs).mockResolvedValue([org()]);
    render(<SuperAdmin />);
    await screen.findByText("Sunrise Spine & Rehab");

    fireEvent.click(screen.getByRole("button", { name: /New care provider/ }));
    expect(await screen.findByText("Tell Carelune about this provider")).toBeTruthy();
    // The console is replaced, not layered underneath.
    expect(screen.queryByText("Sunrise Spine & Rehab")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(await screen.findByText("Sunrise Spine & Rehab")).toBeTruthy();
    // Returning refreshes the list, so a provider created in the builder shows.
    expect(vi.mocked(listOrgs).mock.calls.length).toBeGreaterThan(1);
  });
});
