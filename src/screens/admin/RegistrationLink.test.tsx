// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { CentreServiceRow, ServicePackageRow } from "../../lib/db";

/*
 * The provider-side entry point.
 *
 * The hosted blocker was that a provider with a published universal service
 * still got `centres.invite_token` from this screen — a token with no package,
 * which is why the family landed on the legacy 30-Day Recovery Continuum. These
 * tests pin which token each kind of organisation is given.
 */
vi.mock("../../lib/db", () => ({
  getCentreServices: vi.fn(),
  generateInviteToken: vi.fn(),
  createServiceInvite: vi.fn(),
}));
import { createServiceInvite, generateInviteToken, getCentreServices } from "../../lib/db";

const branding = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock("../../branding/BrandingProvider", () => ({ useBranding: () => branding.value }));

import RegistrationLink from "./RegistrationLink";

/** The centre-level token that must never be handed out for a universal service. */
const CENTRE_TOKEN = "985113b8cfd744678ebe68fd";

const pkg = (): ServicePackageRow =>
  ({ id: "pkg-standard", name: "Standard Neurological Rehab Package", status: "active",
     duration_days: 60, price: 18000, currency: "INR", platform_fee_pct: 20 } as unknown as ServicePackageRow);

const service = (over: Partial<CentreServiceRow>): CentreServiceRow =>
  ({ id: "svc-1", name: "Neurological Rehabilitation Programme", status: "published",
     packages: [pkg()], ...over } as unknown as CentreServiceRow);

const setOrg = () => {
  branding.value = {
    org: { id: "centre-1", invite_token: CENTRE_TOKEN },
    profile: { is_admin: true },
    platformName: "Punarvas Hospital",
    refresh: vi.fn(),
  };
};

beforeEach(() => {
  vi.clearAllMocks();
  setOrg();
});
afterEach(cleanup);

describe("provider registration-link entry point", () => {
  it("a universal package button mints a package link, never the centre token", async () => {
    vi.mocked(getCentreServices).mockResolvedValue([service({})]);
    vi.mocked(createServiceInvite).mockResolvedValue("pkgtoken-abc123");

    render(<RegistrationLink onBack={() => {}} />);

    const button = await screen.findByRole("button", { name: /generate patient link/i });
    fireEvent.click(button);

    // It asks for THIS package by id.
    await waitFor(() => expect(createServiceInvite).toHaveBeenCalledWith("pkg-standard"));
    expect(generateInviteToken).not.toHaveBeenCalled();

    const field = (await screen.findByLabelText(
      /Registration link for Standard Neurological Rehab Package/i,
    )) as HTMLInputElement;

    // The generated token is the package's, and is NOT the centre invite token.
    expect(field.value).toContain("pkgtoken-abc123");
    expect(field.value).not.toContain(CENTRE_TOKEN);
    expect(field.value).toContain("?register=");
  });

  it("does not offer the centre-level link as the action for a universal service", async () => {
    vi.mocked(getCentreServices).mockResolvedValue([service({})]);
    render(<RegistrationLink onBack={() => {}} />);

    await screen.findByRole("button", { name: /generate patient link/i });
    // The legacy affordances are absent entirely.
    expect(screen.queryByText(/Your org’s link/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /generate registration link/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /regenerate link/i })).toBeNull();
    expect(document.body.textContent).not.toContain(CENTRE_TOKEN);
    // …and the package is named, so the link is physically tied to it.
    expect(screen.getByText("Standard Neurological Rehab Package")).toBeTruthy();
  });

  it("a legacy recovery organisation still gets the existing centre invite link", async () => {
    vi.mocked(getCentreServices).mockResolvedValue([]);
    render(<RegistrationLink onBack={() => {}} />);

    const field = (await screen.findByDisplayValue(new RegExp(CENTRE_TOKEN))) as HTMLInputElement;
    expect(field.value).toContain(CENTRE_TOKEN);
    // Nothing package-shaped is offered, and no package link is minted.
    expect(screen.queryByRole("button", { name: /generate patient link/i })).toBeNull();
    expect(createServiceInvite).not.toHaveBeenCalled();
  });

  it("treats a service with no ACTIVE package as not yet invitable", async () => {
    vi.mocked(getCentreServices).mockResolvedValue([
      service({ packages: [{ ...pkg(), status: "draft" } as unknown as ServicePackageRow] }),
    ]);
    render(<RegistrationLink onBack={() => {}} />);

    // Falls back to the legacy centre link rather than offering a dead button.
    await screen.findByDisplayValue(new RegExp(CENTRE_TOKEN));
    expect(screen.queryByRole("button", { name: /generate patient link/i })).toBeNull();
  });

  it("treats an unpublished service as not yet invitable", async () => {
    vi.mocked(getCentreServices).mockResolvedValue([
      service({ status: "pending_provider_confirmation" }),
    ]);
    render(<RegistrationLink onBack={() => {}} />);

    await screen.findByDisplayValue(new RegExp(CENTRE_TOKEN));
    expect(screen.queryByRole("button", { name: /generate patient link/i })).toBeNull();
  });
});
