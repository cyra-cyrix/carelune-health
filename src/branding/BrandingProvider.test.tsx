// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { BrandingProvider, useBranding } from "./BrandingProvider";
import type { MyProfile } from "../lib/db";

// The org/profile queries are the unit under test's only dependency.
vi.mock("../lib/db", () => ({
  getMyOrg: vi.fn(),
  getMyProfile: vi.fn(),
}));
import { getMyOrg, getMyProfile } from "../lib/db";

const pmrAdmin: MyProfile = {
  id: "u-vivek",
  role: "pmr",
  full_name: "Vivek Rao",
  centre_id: "c1",
  is_admin: true,
  is_super_admin: false,
  must_reset_password: false,
};

/** Mirrors the admin-navigation gating used in App.tsx: nav appears purely from
 *  `profile?.is_admin`, independent of whether the organisation loaded. */
function AdminNavProbe() {
  const { profile, orgError, platformName } = useBranding();
  const isAdmin = profile?.is_admin ?? false;
  return (
    <div>
      {profile && <span data-testid="role">{profile.role}</span>}
      <span data-testid="brand">{platformName}</span>
      {orgError && <span data-testid="org-error">{orgError}</span>}
      {isAdmin && (
        <nav aria-label="admin">
          <button type="button">Team</button>
          <button type="button">Programme</button>
        </nav>
      )}
    </div>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // The provider logs the org failure in dev; keep test output clean.
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("BrandingProvider resilience", () => {
  it("keeps a valid admin profile and its nav when the organisation query fails", async () => {
    vi.mocked(getMyOrg).mockRejectedValue(new Error("column centres.emergency_number does not exist"));
    vi.mocked(getMyProfile).mockResolvedValue(pmrAdmin);

    render(
      <BrandingProvider>
        <AdminNavProbe />
      </BrandingProvider>,
    );

    // The profile survives the org failure...
    expect((await screen.findByTestId("role")).textContent).toBe("pmr");
    // ...and admin navigation is rendered from profile.is_admin.
    expect(await screen.findByRole("button", { name: "Team" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Programme" })).toBeTruthy();
    // The org failure is surfaced (not silently swallowed), brand falls back.
    expect(screen.getByTestId("org-error").textContent).toContain("centres.emergency_number");
    expect(screen.getByTestId("brand").textContent).toBe("Carelune");
  });

  it("still renders org branding and admin nav when both queries succeed", async () => {
    vi.mocked(getMyOrg).mockResolvedValue({
      id: "c1", name: "Sunrise", display_name: "Sunrise Spine & Neuro", logo_url: null,
      subdomain: "sunrise", setup_complete: true, invite_token: null, institution_type: "hospital",
      contact_phone: null, service_hours: null, emergency_note: null, emergency_number: null,
    });
    vi.mocked(getMyProfile).mockResolvedValue(pmrAdmin);

    render(
      <BrandingProvider>
        <AdminNavProbe />
      </BrandingProvider>,
    );

    expect((await screen.findByTestId("brand")).textContent).toBe("Sunrise Spine & Neuro");
    expect(await screen.findByRole("button", { name: "Team" })).toBeTruthy();
    expect(screen.queryByTestId("org-error")).toBeNull();
  });

  it("hides admin nav for a non-admin profile even if the org loads", async () => {
    vi.mocked(getMyOrg).mockResolvedValue({
      id: "c1", name: "Sunrise", display_name: "Sunrise", logo_url: null, subdomain: null,
      setup_complete: true, invite_token: null, institution_type: null, contact_phone: null,
      service_hours: null, emergency_note: null, emergency_number: null,
    });
    vi.mocked(getMyProfile).mockResolvedValue({ ...pmrAdmin, role: "nurse", is_admin: false });

    render(
      <BrandingProvider>
        <AdminNavProbe />
      </BrandingProvider>,
    );

    expect((await screen.findByTestId("role")).textContent).toBe("nurse");
    expect(screen.queryByRole("button", { name: "Team" })).toBeNull();
  });
});
