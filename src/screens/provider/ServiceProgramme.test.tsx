// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CentreServiceRow } from "../../lib/db";

vi.mock("../../lib/db", () => ({
  getCentreServices: vi.fn(),
  getCentreStaff: vi.fn(),
  confirmCentreService: vi.fn(),
  setServicePackagePrice: vi.fn(),
}));
const branding = { profile: { id: "u-approver" } as { id: string } | null };
vi.mock("../../branding/BrandingProvider", () => ({ useBranding: () => branding }));

import { confirmCentreService, getCentreServices, getCentreStaff, setServicePackagePrice } from "../../lib/db";
import ServiceProgramme from "./ServiceProgramme";
import { ServiceAwaitingBanner } from "./ServiceAwaitingBanner";

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  branding.profile = { id: "u-approver" };
  vi.mocked(getCentreStaff).mockResolvedValue([
    { id: "u-approver", full_name: "Dr Vivek Rao", role: "pmr" },
  ] as unknown as Awaited<ReturnType<typeof getCentreStaff>>);
});

/** A stored service, shaped exactly as the builder writes it. */
function service(over: Partial<CentreServiceRow> = {}): CentreServiceRow {
  return {
    id: "svc-1",
    name: "Post-operative Spine Recovery",
    summary: "Continuing follow-up at home after spine surgery.",
    status: "pending_provider_confirmation",
    patient_type: "Adults after lumbar decompression or fusion",
    entry_point: "Discharge from hospital",
    objective: "Support recovery at home and spot problems needing attention.",
    end_condition: "The surgeon closes the follow-up.",
    typical_duration_days: 84,
    programme_config: {
      provider_summary: "A solo spine surgeon following patients after discharge.",
      monitoring_domains: ["Pain", "Walking and mobility", "Wound recovery"],
      patient_inputs: [{ label: "How is your pain today?", reason: "The earliest signal recovery is off track." }],
      care_team: ["Spine surgeon", "Physiotherapist"],
      programme_outline: [
        { period_label: "Week 1", focus: "Early recovery", checkin_frequency: "Daily", monitoring_domains: ["Pain"], milestones: ["Comfortable basic mobility"] },
        { period_label: "Weeks 2–6", focus: "Building recovery", checkin_frequency: "3 a week", monitoring_domains: ["Walking and mobility"], milestones: ["Walking without support"] },
      ],
    },
    source_provenance: "ai_drafted",
    ai_model: "gpt-4o",
    provider_approver_profile_id: "u-approver",
    confirmed_by_provider_at: null,
    published_at: null,
    packages: [
      { id: "p1", name: "Basic Recovery", positioning: "Lightest option", sort_order: 0, duration_days: 30, monitoring_domains: ["Pain"], checkin_frequency: "Twice a week", review_frequency: "Weekly review", support_level: "Basic", includes: ["Check-ins"], milestones: ["Pain settling"], price: 12000, currency: "INR", platform_fee_pct: 20, status: "draft" },
      { id: "p2", name: "Standard Recovery", positioning: "Middle option", sort_order: 1, duration_days: 60, monitoring_domains: ["Pain", "Walking and mobility"], checkin_frequency: "Three times a week", review_frequency: "Weekly review", support_level: "Moderate", includes: ["Check-ins"], milestones: ["Walking without support"], price: 12000, currency: "INR", platform_fee_pct: 20, status: "draft" },
      { id: "p3", name: "Comprehensive Recovery", positioning: "Most complete", sort_order: 2, duration_days: 84, monitoring_domains: ["Pain", "Walking and mobility", "Wound recovery"], checkin_frequency: "Daily", review_frequency: "Twice weekly review", support_level: "Full", includes: ["Check-ins"], milestones: ["Recovery closed"], price: 12000, currency: "INR", platform_fee_pct: 20, status: "draft" },
    ],
    ...over,
  };
}

describe("Level-2 confirmation — who may confirm", () => {
  it("offers the confirmation to the clinician named on the service", async () => {
    vi.mocked(getCentreServices).mockResolvedValue([service()]);
    render(<ServiceProgramme onBack={() => {}} />);

    expect(await screen.findByText("This programme is waiting for you")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Confirm this programme" })).toBeTruthy();
  });

  it("shows a colleague the service read-only, naming who must confirm it", async () => {
    branding.profile = { id: "u-someone-else" };
    vi.mocked(getCentreServices).mockResolvedValue([service()]);
    render(<ServiceProgramme onBack={() => {}} />);

    expect(await screen.findByText("Waiting for Dr Vivek Rao")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Confirm this programme" })).toBeNull();
  });

  it("confirms through the RPC, note included, and re-reads the service", async () => {
    vi.mocked(getCentreServices)
      .mockResolvedValueOnce([service()])
      .mockResolvedValue([service({ status: "published", confirmed_by_provider_at: "2026-08-21T00:00:00.000Z", published_at: "2026-08-21T00:00:00.000Z" })]);
    vi.mocked(confirmCentreService).mockResolvedValue(undefined);
    render(<ServiceProgramme onBack={() => {}} />);

    fireEvent.change(await screen.findByPlaceholderText("Recorded with your confirmation."), {
      target: { value: "Happy to run this." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm this programme" }));

    expect(await screen.findByText(/Patients can be enrolled into this service/)).toBeTruthy();
    expect(vi.mocked(confirmCentreService).mock.calls[0]).toEqual(["svc-1", "Happy to run this."]);
    expect(screen.queryByRole("button", { name: "Confirm this programme" })).toBeNull();
  });

  it("a published service shows as available, with no confirmation left to give", async () => {
    vi.mocked(getCentreServices).mockResolvedValue([
      service({ status: "published", confirmed_by_provider_at: "2026-08-21T00:00:00.000Z", published_at: "2026-08-21T00:00:00.000Z" }),
    ]);
    render(<ServiceProgramme onBack={() => {}} />);

    expect(await screen.findByText(/Patients can be enrolled into this service/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Confirm this programme" })).toBeNull();
  });
});

describe("Level-2 confirmation — what the clinician reads", () => {
  it("renders the stored configuration, not a hard-coded programme", async () => {
    vi.mocked(getCentreServices).mockResolvedValue([service()]);
    render(<ServiceProgramme onBack={() => {}} />);

    expect(await screen.findByText("Adults after lumbar decompression or fusion")).toBeTruthy();
    expect(screen.getByText("How is your pain today?")).toBeTruthy();
    expect(screen.getByText("Spine surgeon · Physiotherapist")).toBeTruthy();
    for (const p of ["Basic Recovery", "Standard Recovery", "Comprehensive Recovery"]) {
      expect(screen.getByRole("article", { name: p })).toBeTruthy();
    }
    expect(screen.getByText(/platform fee is 20%/)).toBeTruthy();
  });

  it("previews a package as the programme timeline the service stores", async () => {
    vi.mocked(getCentreServices).mockResolvedValue([service()]);
    render(<ServiceProgramme onBack={() => {}} />);

    const card = await screen.findByRole("article", { name: "Comprehensive Recovery" });
    fireEvent.click(within(card).getByRole("button", { name: "Preview programme" }));

    const drawer = await screen.findByRole("dialog");
    expect(within(drawer).getByText("Week 1")).toBeTruthy();
    expect(within(drawer).getByText("Building recovery")).toBeTruthy();
  });

  it("renders a completely different specialty through the same components", async () => {
    vi.mocked(getCentreServices).mockResolvedValue([
      service({
        name: "Mother & Baby Postpartum Support",
        patient_type: "Mothers in the first weeks after delivery",
        programme_config: {
          monitoring_domains: ["Feeding experience", "Emotional wellbeing"],
          patient_inputs: [{ label: "How did feeding go today?", reason: "The mother's own experience is the measure." }],
          care_team: ["Lactation consultant", "Dietitian"],
          programme_outline: [
            { period_label: "Week 1", focus: "Establishing feeding", checkin_frequency: "Daily", monitoring_domains: ["Feeding experience"], milestones: ["Comfortable latch"] },
          ],
        },
        packages: [
          { id: "l1", name: "Essential Feeding Support", positioning: "Lightest option", sort_order: 0, duration_days: 30, monitoring_domains: ["Feeding experience"], checkin_frequency: "Daily", review_frequency: "Twice-weekly consultant review", support_level: "Basic", includes: ["Feeding check-in"], milestones: ["Comfortable latch"], price: 12000, currency: "INR", platform_fee_pct: 20, status: "draft" },
          { id: "l2", name: "Guided Mother & Baby Support", positioning: "Middle option", sort_order: 1, duration_days: 60, monitoring_domains: ["Feeding experience", "Maternal rest"], checkin_frequency: "5 a week", review_frequency: "Weekly consultant review", support_level: "Moderate", includes: ["Feeding check-in"], milestones: ["Feeding established"], price: 12000, currency: "INR", platform_fee_pct: 20, status: "draft" },
          { id: "l3", name: "Complete Postpartum Support", positioning: "Most complete", sort_order: 2, duration_days: 84, monitoring_domains: ["Feeding experience", "Emotional wellbeing"], checkin_frequency: "3 a week", review_frequency: "Weekly consultant review", support_level: "Full", includes: ["Feeding check-in"], milestones: ["Confident continuing independently"], price: 12000, currency: "INR", platform_fee_pct: 20, status: "draft" },
        ],
      }),
    ]);
    render(<ServiceProgramme onBack={() => {}} />);

    expect(await screen.findByText("Mothers in the first weeks after delivery")).toBeTruthy();
    expect(screen.getByRole("article", { name: "Complete Postpartum Support" })).toBeTruthy();
    expect(screen.getByText("How did feeding go today?")).toBeTruthy();
    expect(screen.queryByText(/wound/i)).toBeNull();
  });
});

describe("caseload prompt", () => {
  it("prompts only the clinician the service is waiting on", () => {
    const { container } = render(
      <ServiceAwaitingBanner services={[service()]} myId="u-approver" onOpen={() => {}} />,
    );
    expect(screen.getByText(/is ready for your confirmation/)).toBeTruthy();
    expect(container.querySelector("button")).toBeTruthy();
  });

  it("says nothing to a colleague who is not the approver", () => {
    const { container } = render(
      <ServiceAwaitingBanner services={[service()]} myId="u-someone-else" onOpen={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("says nothing once the service is confirmed", () => {
    const { container } = render(
      <ServiceAwaitingBanner services={[service({ status: "published" })]} myId="u-approver" onOpen={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });
});

describe("pricing a package", () => {
  const published = () =>
    service({ status: "published", confirmed_by_provider_at: "2026-08-21T00:00:00.000Z", published_at: "2026-08-21T00:00:00.000Z" });

  it("shows what families pay, formatted in rupees", async () => {
    vi.mocked(getCentreServices).mockResolvedValue([published()]);
    render(<ServiceProgramme onBack={() => {}} />);

    const card = await screen.findByRole("article", { name: "Basic Recovery" });
    expect(within(card).getByText("₹12,000")).toBeTruthy();
  });

  it("invites the owner to set a price that has never been set", async () => {
    const s = published();
    s.packages[0] = { ...s.packages[0], price: null };
    vi.mocked(getCentreServices).mockResolvedValue([s]);
    render(<ServiceProgramme onBack={() => {}} />);

    const card = await screen.findByRole("article", { name: "Basic Recovery" });
    expect(within(card).getByText("Price not set")).toBeTruthy();
    expect(within(card).getByRole("button", { name: "Set price" })).toBeTruthy();
  });

  it("sends only the package and the amount, and reloads afterwards", async () => {
    vi.mocked(getCentreServices).mockResolvedValue([published()]);
    vi.mocked(setServicePackagePrice).mockResolvedValue(undefined);
    render(<ServiceProgramme onBack={() => {}} />);

    const card = await screen.findByRole("article", { name: "Standard Recovery" });
    fireEvent.click(within(card).getByRole("button", { name: "Edit price" }));
    fireEvent.change(within(card).getByPlaceholderText("18000"), { target: { value: "20,000" } });
    fireEvent.click(within(card).getByRole("button", { name: "Save price" }));

    await vi.waitFor(() => expect(setServicePackagePrice).toHaveBeenCalled());
    expect(vi.mocked(setServicePackagePrice).mock.calls[0]).toEqual(["p2", 20000, "INR"]);
    // No platform fee is ever sent from the browser.
    expect(vi.mocked(setServicePackagePrice).mock.calls[0]).toHaveLength(3);
  });

  it("says the fee is 20% and that enrolled patients do not move", async () => {
    vi.mocked(getCentreServices).mockResolvedValue([published()]);
    render(<ServiceProgramme onBack={() => {}} />);

    const card = await screen.findByRole("article", { name: "Basic Recovery" });
    fireEvent.click(within(card).getByRole("button", { name: "Edit price" }));
    expect(within(card).getByText(/platform fee is 20%/)).toBeTruthy();
    expect(within(card).getByText(/keep the price they joined at/)).toBeTruthy();
  });

  it("surfaces a server refusal rather than pretending the price saved", async () => {
    vi.mocked(getCentreServices).mockResolvedValue([published()]);
    vi.mocked(setServicePackagePrice).mockRejectedValue(new Error("Only the clinician this service is assigned to may set its price"));
    render(<ServiceProgramme onBack={() => {}} />);

    const card = await screen.findByRole("article", { name: "Basic Recovery" });
    fireEvent.click(within(card).getByRole("button", { name: "Edit price" }));
    fireEvent.click(within(card).getByRole("button", { name: "Save price" }));

    expect(await within(card).findByText(/Only the clinician this service is assigned to/)).toBeTruthy();
  });

  it("offers no price control to a colleague who does not own the service", async () => {
    branding.profile = { id: "u-someone-else" };
    vi.mocked(getCentreServices).mockResolvedValue([published()]);
    render(<ServiceProgramme onBack={() => {}} />);

    const card = await screen.findByRole("article", { name: "Basic Recovery" });
    expect(within(card).getByText("₹12,000")).toBeTruthy();
    expect(within(card).queryByRole("button", { name: /price/i })).toBeNull();
  });

  it("offers no price control before the service is confirmed", async () => {
    vi.mocked(getCentreServices).mockResolvedValue([service()]);   // pending confirmation
    render(<ServiceProgramme onBack={() => {}} />);

    const card = await screen.findByRole("article", { name: "Basic Recovery" });
    expect(within(card).queryByRole("button", { name: /price/i })).toBeNull();
  });
});
