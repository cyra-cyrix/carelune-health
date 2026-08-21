// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CentreServiceRow, ServicePackageRow, SubscriptionRow } from "../../lib/db";

vi.mock("../../lib/db", () => ({
  getCentreServices: vi.fn(),
  getSubscription: vi.fn(),
  assignServicePackage: vi.fn(),
}));
import { assignServicePackage, getCentreServices, getSubscription } from "../../lib/db";
import AssignProgramme from "./AssignProgramme";

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSubscription).mockResolvedValue(null);
});

const pkg = (over: Partial<ServicePackageRow> = {}): ServicePackageRow => ({
  id: "p1", name: "Standard Recovery", positioning: "Longer monitoring with milestones.", sort_order: 1,
  duration_days: 60, monitoring_domains: ["Pain", "Walking and mobility"], checkin_frequency: "Three times a week",
  review_frequency: "Weekly review by the surgeon", support_level: "Moderate support", includes: ["Check-ins"],
  milestones: ["Walking without support"], price: 18000, currency: "INR", platform_fee_pct: 20, status: "active",
  ...over,
});

const svc = (over: Partial<CentreServiceRow> = {}): CentreServiceRow => ({
  id: "s1", name: "Post-operative Spine Recovery", summary: null, status: "published",
  patient_type: null, entry_point: null, objective: null, end_condition: null, typical_duration_days: 84,
  programme_config: {
    programme_outline: [
      { period_label: "Week 1", focus: "Early recovery", checkin_frequency: "Daily", monitoring_domains: [], milestones: [] },
      { period_label: "Weeks 2–6", focus: "Building recovery", checkin_frequency: "3 a week", monitoring_domains: [], milestones: [] },
    ],
  },
  source_provenance: "ai_drafted", ai_model: "gpt-4o", provider_approver_profile_id: "u1",
  confirmed_by_provider_at: "2026-08-21T00:00:00.000Z", published_at: "2026-08-21T00:00:00.000Z",
  packages: [pkg({ id: "p0", name: "Basic Recovery", duration_days: 30, price: 9000, sort_order: 0 }), pkg()],
  ...over,
});

describe("assigning a programme — what a provider may offer", () => {
  it("offers only packages from the provider's own confirmed services", async () => {
    vi.mocked(getCentreServices).mockResolvedValue([
      svc(),
      svc({ id: "s2", name: "Unconfirmed Service", status: "pending_provider_confirmation" }),
      svc({ id: "s3", name: "Draft Service", status: "draft" }),
    ]);
    render(<AssignProgramme patientId="pat-1" patientName="Anand Menon" />);

    expect(await screen.findByText("Assign continuing-care programme")).toBeTruthy();
    expect(screen.getByText("Post-operative Spine Recovery")).toBeTruthy();
    expect(screen.queryByText("Unconfirmed Service")).toBeNull();
    expect(screen.queryByText("Draft Service")).toBeNull();
  });

  it("hides a package that is not live within a confirmed service", async () => {
    vi.mocked(getCentreServices).mockResolvedValue([
      svc({ packages: [pkg(), pkg({ id: "p9", name: "Withdrawn Recovery", status: "retired" })] }),
    ]);
    render(<AssignProgramme patientId="pat-1" />);

    expect(await screen.findByRole("button", { name: /Standard Recovery/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Withdrawn Recovery/ })).toBeNull();
  });

  it("stays out of the way for an organisation with no confirmed service", async () => {
    vi.mocked(getCentreServices).mockResolvedValue([svc({ status: "draft" })]);
    const { container } = render(<AssignProgramme patientId="pat-1" />);
    await vi.waitFor(() => expect(container.querySelector(".animate-pulse")).toBeNull());
    expect(container.firstChild).toBeNull();
  });

  it("leaves a patient already on the legacy centre package alone", async () => {
    vi.mocked(getCentreServices).mockResolvedValue([svc()]);
    vi.mocked(getSubscription).mockResolvedValue({
      id: "sub-legacy", patient_id: "pat-1", status: "trial", plan_name: "30-Day Recovery Continuum",
      price: 5999, trial_days: 7, trial_ends: "2026-09-01", pay_mode: "pay_at_centre",
      started_at: "2026-08-01T00:00:00.000Z", service_package_id: null, package_snapshot: null,
    } as SubscriptionRow);
    const { container } = render(<AssignProgramme patientId="pat-1" />);
    await vi.waitFor(() => expect(container.querySelector(".animate-pulse")).toBeNull());
    expect(container.firstChild).toBeNull();
  });
});

describe("assigning a programme — the preview", () => {
  it("shows what will be frozen before the provider commits", async () => {
    vi.mocked(getCentreServices).mockResolvedValue([svc()]);
    render(<AssignProgramme patientId="pat-1" patientName="Anand Menon" />);

    fireEvent.click(await screen.findByRole("button", { name: /Standard Recovery/ }));
    const preview = screen.getByRole("region", { name: "Programme preview" });

    expect(within(preview).getByText("Standard Recovery · 60 days")).toBeTruthy();
    expect(within(preview).getByText("Three times a week")).toBeTruthy();
    expect(within(preview).getByText("Weekly review by the surgeon")).toBeTruthy();
    expect(within(preview).getByText("₹18,000")).toBeTruthy();
    expect(within(preview).getByText("20%")).toBeTruthy();
    expect(within(preview).getByText("Pain")).toBeTruthy();
    expect(within(preview).getByText("Week 1")).toBeTruthy();
    expect(within(preview).getByText(/stays on this programme as it is today/)).toBeTruthy();
  });

  it("sends only the patient and the chosen package — never price or configuration", async () => {
    vi.mocked(getCentreServices).mockResolvedValue([svc()]);
    vi.mocked(assignServicePackage).mockResolvedValue({
      id: "sub-1", patient_id: "pat-1", status: "active", plan_name: "Standard Recovery", price: 18000,
      trial_days: 0, trial_ends: null, pay_mode: "pay_at_centre", started_at: "2026-08-21T00:00:00.000Z",
      service_package_id: "p1", centre_service_id: "s1", price_snapshot: 18000, platform_fee_pct_snapshot: 20,
      package_snapshot: { name: "Standard Recovery", service_name: "Post-operative Spine Recovery", duration_days: 60 },
    } as SubscriptionRow);

    render(<AssignProgramme patientId="pat-1" />);
    fireEvent.click(await screen.findByRole("button", { name: /Standard Recovery/ }));
    fireEvent.click(screen.getByRole("button", { name: "Assign programme" }));

    await screen.findByText("Programme assigned");
    expect(vi.mocked(assignServicePackage).mock.calls[0]).toEqual(["pat-1", "p1"]);
  });

  it("surfaces a server refusal instead of pretending it worked", async () => {
    vi.mocked(getCentreServices).mockResolvedValue([svc()]);
    vi.mocked(assignServicePackage).mockRejectedValue(new Error("This patient is already enrolled in a programme"));

    render(<AssignProgramme patientId="pat-1" />);
    fireEvent.click(await screen.findByRole("button", { name: /Standard Recovery/ }));
    fireEvent.click(screen.getByRole("button", { name: "Assign programme" }));

    expect(await screen.findByText("This patient is already enrolled in a programme")).toBeTruthy();
    expect(screen.queryByText("Programme assigned")).toBeNull();
  });
});

describe("assigning a programme — after assignment", () => {
  it("shows the enrolment as it was frozen, from the snapshot", async () => {
    vi.mocked(getCentreServices).mockResolvedValue([svc()]);
    vi.mocked(getSubscription).mockResolvedValue({
      id: "sub-1", patient_id: "pat-1", status: "active", plan_name: "Standard Recovery", price: 18000,
      trial_days: 0, trial_ends: null, pay_mode: "pay_at_centre", started_at: "2026-08-21T00:00:00.000Z",
      service_package_id: "p1", centre_service_id: "s1", price_snapshot: 18000, platform_fee_pct_snapshot: 20,
      package_snapshot: { name: "Standard Recovery", service_name: "Post-operative Spine Recovery", duration_days: 60 },
    } as SubscriptionRow);

    render(<AssignProgramme patientId="pat-1" patientName="Anand Menon" />);

    expect(await screen.findByText("Programme assigned")).toBeTruthy();
    expect(screen.getByText("Standard Recovery")).toBeTruthy();
    expect(screen.getByText("Post-operative Spine Recovery")).toBeTruthy();
    expect(screen.getByText("60 days")).toBeTruthy();
    expect(screen.getByText("Active")).toBeTruthy();
    // No selector once enrolled — one active programme at a time.
    expect(screen.queryByRole("button", { name: "Assign programme" })).toBeNull();
  });
});

describe("assigning a programme — the same selector for any specialty", () => {
  it("renders a mother-and-baby programme through the identical component", async () => {
    vi.mocked(getCentreServices).mockResolvedValue([
      svc({
        id: "s-lact", name: "Mother & Baby Postpartum Support",
        programme_config: {
          programme_outline: [
            { period_label: "Week 1", focus: "Establishing feeding", checkin_frequency: "Daily", monitoring_domains: [], milestones: [] },
          ],
        },
        packages: [
          pkg({ id: "lp1", name: "Essential Feeding Support", duration_days: 30, price: 11000, sort_order: 0,
                monitoring_domains: ["Feeding experience", "Emotional wellbeing"],
                checkin_frequency: "Daily", review_frequency: "Twice-weekly consultant review" }),
          pkg({ id: "lp2", name: "Complete Postpartum Support", duration_days: 84, price: 26000, sort_order: 1,
                monitoring_domains: ["Feeding experience", "Maternal rest"], checkin_frequency: "3 a week",
                review_frequency: "Weekly consultant review" }),
        ],
      }),
    ]);
    render(<AssignProgramme patientId="pat-2" patientName="Priya" />);

    expect(await screen.findByText("Mother & Baby Postpartum Support")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Essential Feeding Support/ }));

    const preview = screen.getByRole("region", { name: "Programme preview" });
    expect(within(preview).getByText("Essential Feeding Support · 30 days")).toBeTruthy();
    expect(within(preview).getByText("Feeding experience")).toBeTruthy();
    expect(within(preview).getByText("Establishing feeding")).toBeTruthy();
    expect(within(preview).getByText("20%")).toBeTruthy();
    // Nothing recovery-shaped leaks into a service that is not about recovery.
    expect(within(preview).queryByText(/wound|walking/i)).toBeNull();
  });
});
