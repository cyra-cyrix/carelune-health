// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { PublicOrgInfo } from "../../lib/db";

/*
 * The public registration page's institution branding.
 *
 * The token already names the organisation, so this page must show that
 * organisation — not the generic "Your care team", and never a platform brand.
 * The fallback is for an organisation with no name at all, NOT for the moment
 * before the lookup returns.
 */
vi.mock("../../lib/db", () => ({
  getPublicOrgInfo: vi.fn(),
  registerPatient: vi.fn(),
}));
import { getPublicOrgInfo } from "../../lib/db";

import RegisterPatient from "./RegisterPatient";
import { APP_TITLE, NEUTRAL_TITLE } from "./registrationTitle";

const legacy = (over: Partial<PublicOrgInfo> = {}): PublicOrgInfo =>
  ({ kind: "legacy", institution_name: "Punarvas Hospital", logo_url: null,
     package_price: 5999, trial_days: 7, ...over } as PublicOrgInfo);

const universal = (over: Record<string, unknown> = {}): PublicOrgInfo =>
  ({ kind: "service", institution_name: "Punarvas Hospital", logo_url: null,
     package_price: 18000, trial_days: 0, service_name: "Neurological Rehabilitation Programme",
     package_name: "Standard Neurological Rehab Package", positioning: null, duration_days: 60,
     checkin_frequency: "Three times a week", review_frequency: "Weekly", support_level: "Moderate",
     includes: ["Initial assessment"], monitoring_domains: ["Mobility"], currency: "INR",
     ...over } as PublicOrgInfo);

/** The primary identity line in the page header (the name also appears, by
 *  design, as the small label on the package card). */
const identity = () => document.querySelector(".font-display.text-lg") as HTMLElement | null;
const eyebrow = () => identity()?.nextElementSibling as HTMLElement | null;

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("registration page institution branding", () => {
  it("never flashes the generic fallback while the organisation is still loading", async () => {
    // A lookup that has not resolved yet.
    let release!: (v: PublicOrgInfo) => void;
    vi.mocked(getPublicOrgInfo).mockReturnValue(new Promise<PublicOrgInfo>((r) => { release = r; }));

    render(<RegisterPatient token="tok" />);

    // Nothing generic is asserted before we know who the organisation is.
    expect(document.body.textContent).not.toContain("Your care team");
    expect(document.body.textContent).not.toContain("RECOVERY PROGRAMME");
    expect(screen.getByLabelText(/loading your care team/i)).toBeTruthy();

    release(legacy());
    await waitFor(() => expect(identity()?.textContent).toBe("Punarvas Hospital"));
    expect(document.body.textContent).not.toContain("Your care team");
  });

  it("shows the organisation as the primary identity with the programme beneath it", async () => {
    vi.mocked(getPublicOrgInfo).mockResolvedValue(universal());
    render(<RegisterPatient token="tok" />);

    await waitFor(() => expect(identity()?.textContent).toBe("Punarvas Hospital"));
    // The programme line sits directly beneath the organisation name.
    expect(eyebrow()?.textContent).toBe("Neurological Rehabilitation Programme");
  });

  it("renders the organisation's own logo when it has configured one", async () => {
    vi.mocked(getPublicOrgInfo).mockResolvedValue(
      universal({ logo_url: "https://cdn.example.com/punarvas.png" }),
    );
    render(<RegisterPatient token="tok" />);

    const logo = (await screen.findByAltText("Punarvas Hospital")) as HTMLImageElement;
    expect(logo.src).toBe("https://cdn.example.com/punarvas.png");
  });

  it("falls back to an initial when there is no logo", async () => {
    vi.mocked(getPublicOrgInfo).mockResolvedValue(universal());
    render(<RegisterPatient token="tok" />);
    await waitFor(() => expect(identity()?.textContent).toBe("Punarvas Hospital"));
    expect(screen.queryByAltText("Punarvas Hospital")).toBeNull();
    expect(document.querySelector(".bg-brand-600")?.textContent).toBe("P");
  });

  it("uses 'Your care team' only as a true fallback — an organisation with no name", async () => {
    vi.mocked(getPublicOrgInfo).mockResolvedValue(legacy({ institution_name: null }));
    render(<RegisterPatient token="tok" />);
    await waitFor(() => expect(identity()?.textContent).toBe("Your care team"));
  });

  it("also falls back when the lookup fails outright", async () => {
    vi.mocked(getPublicOrgInfo).mockRejectedValue(new Error("network"));
    render(<RegisterPatient token="tok" />);
    await waitFor(() => expect(identity()?.textContent).toBe("Your care team"));
  });

  it("never shows a platform brand on this patient-facing page", async () => {
    vi.mocked(getPublicOrgInfo).mockResolvedValue(universal());
    render(<RegisterPatient token="tok" />);
    await waitFor(() => expect(identity()?.textContent).toBe("Punarvas Hospital"));
    expect(document.body.textContent).not.toContain("Carelune");
  });
});

describe("registration tab title, in the browser", () => {
  beforeEach(() => {
    // Whatever the previous page left behind.
    document.title = APP_TITLE;
  });

  it("1. never shows the platform name in the tab, at any point", async () => {
    let release!: (v: PublicOrgInfo) => void;
    vi.mocked(getPublicOrgInfo).mockReturnValue(new Promise<PublicOrgInfo>((r) => { release = r; }));

    const view = render(<RegisterPatient token="tok" />);
    expect(document.title).not.toContain(APP_TITLE);

    release(universal());
    await waitFor(() => expect(document.title).toContain("Punarvas Hospital"));
    expect(document.title).not.toContain(APP_TITLE);
    view.unmount();
  });

  it("2. becomes the organisation's own title once resolved", async () => {
    vi.mocked(getPublicOrgInfo).mockResolvedValue(universal());
    render(<RegisterPatient token="tok" />);
    await waitFor(() =>
      expect(document.title).toBe("Punarvas Hospital — Neurological Rehabilitation Programme"),
    );
  });

  it("3. uses a neutral title while the organisation is loading", () => {
    vi.mocked(getPublicOrgInfo).mockReturnValue(new Promise<PublicOrgInfo>(() => {}));
    render(<RegisterPatient token="tok" />);
    expect(document.title).toBe(NEUTRAL_TITLE);
  });

  it("4. keeps the neutral title when the lookup fails", async () => {
    vi.mocked(getPublicOrgInfo).mockRejectedValue(new Error("network"));
    render(<RegisterPatient token="tok" />);
    await waitFor(() => expect(identity()?.textContent).toBe("Your care team"));
    expect(document.title).toBe(NEUTRAL_TITLE);
  });

  it("5. restores the normal application title on navigating away", async () => {
    vi.mocked(getPublicOrgInfo).mockResolvedValue(universal());
    const view = render(<RegisterPatient token="tok" />);
    await waitFor(() => expect(document.title).toContain("Punarvas Hospital"));

    view.unmount();
    expect(document.title).toBe(APP_TITLE);
  });
});
