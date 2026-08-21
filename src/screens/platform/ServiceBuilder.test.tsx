// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ServiceDraft } from "../../domain/serviceDraft";
import { LACTATION_DRAFT, SPINE_DRAFT } from "../../domain/serviceDraft.fixtures";

// The two Edge Function calls are the screen's only dependencies. OpenAI is
// never reached from a test — the mock stands in for the whole backend.
vi.mock("../../lib/db", () => ({
  analyseProviderService: vi.fn(),
  createProviderService: vi.fn(),
}));
import { analyseProviderService, createProviderService } from "../../lib/db";
import ServiceBuilder from "./ServiceBuilder";

afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

const analysisOf = (draft: ServiceDraft) => ({
  draft,
  provenance: { source: "ai_drafted", ai_model: "gpt-4o", drafted_at: "2026-08-21T00:00:00.000Z" },
});

/** Fill the provider step the way an operator would. */
function fillProvider(over: Partial<Record<"name" | "email" | "description", string>> = {}) {
  fireEvent.change(screen.getByLabelText("Provider or practice name"), {
    target: { value: over.name ?? "Dr Vivek Spine Care" },
  });
  fireEvent.click(screen.getByRole("button", { name: /Solo professional/ }));
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: over.email ?? "vivek@spinecare.in" } });
  fireEvent.change(screen.getByLabelText("What does this provider do?"), {
    target: {
      value:
        over.description ??
        "Dr Vivek is a spine surgeon. He wants to monitor patients after spine surgery for 6-12 weeks, mainly pain, walking, wound, exercises and important neurological concerns.",
    },
  });
}

/** Drive the wizard as far as the programmes step for a given draft. */
async function toProgrammes(draft: ServiceDraft) {
  vi.mocked(analyseProviderService).mockResolvedValue(analysisOf(draft));
  render(<ServiceBuilder onExit={() => {}} />);
  fillProvider();
  fireEvent.click(screen.getByRole("button", { name: "Analyse with AI" }));
  await screen.findByText("Carelune understood");
  fireEvent.click(screen.getByRole("button", { name: "Review this service" }));
  fireEvent.click(await screen.findByRole("button", { name: "Confirm understanding" }));
  await screen.findByText("Carelune prepared your patient programmes");
}

describe("service builder — provider step", () => {
  it("renders the provider brief and holds the analysis until it has enough to work with", () => {
    render(<ServiceBuilder onExit={() => {}} />);
    expect(screen.getByText("Tell Carelune about this provider")).toBeTruthy();
    const analyse = screen.getByRole("button", { name: "Analyse with AI" }) as HTMLButtonElement;
    expect(analyse.disabled).toBe(true);
    fillProvider();
    expect((screen.getByRole("button", { name: "Analyse with AI" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("sends what the operator wrote, and never a website Carelune has not read", async () => {
    vi.mocked(analyseProviderService).mockResolvedValue(analysisOf(SPINE_DRAFT));
    render(<ServiceBuilder onExit={() => {}} />);
    fillProvider();
    fireEvent.click(screen.getByRole("button", { name: "Analyse with AI" }));
    await screen.findByText("Carelune understood");
    const sent = vi.mocked(analyseProviderService).mock.calls[0][0];
    expect(sent.provider_name).toBe("Dr Vivek Spine Care");
    expect(sent.provider_type).toBe("Solo professional");
    expect(sent.description).toMatch(/spine surgeon/);
  });

  it("keeps the operator's information and offers a manual route when the analysis fails", async () => {
    vi.mocked(analyseProviderService).mockRejectedValue(new Error("OpenAI error (429)"));
    render(<ServiceBuilder onExit={() => {}} />);
    fillProvider();
    fireEvent.click(screen.getByRole("button", { name: "Analyse with AI" }));

    expect(await screen.findByText(/Your information is still saved/)).toBeTruthy();
    expect((screen.getByLabelText("Provider or practice name") as HTMLInputElement).value).toBe("Dr Vivek Spine Care");
    expect((screen.getByLabelText("What does this provider do?") as HTMLTextAreaElement).value).toMatch(/spine surgeon/);

    fireEvent.click(screen.getByRole("button", { name: "Continue manually" }));
    expect(await screen.findByText("Edit this service")).toBeTruthy();
  });
});

describe("service builder — understanding and confirmation", () => {
  it("shows what Carelune understood rather than raw model output", async () => {
    vi.mocked(analyseProviderService).mockResolvedValue(analysisOf(SPINE_DRAFT));
    render(<ServiceBuilder onExit={() => {}} />);
    fillProvider();
    fireEvent.click(screen.getByRole("button", { name: "Analyse with AI" }));

    expect(await screen.findByText("Carelune understood")).toBeTruthy();
    expect(screen.getByText(SPINE_DRAFT.provider_summary)).toBeTruthy();
    expect(screen.getAllByText("AI draft").length).toBeGreaterThan(0);
    // Both plausible services are offered; the operator chooses.
    expect(screen.getByText("Post-operative Spine Recovery")).toBeTruthy();
    expect(screen.getByText("Conservative Back Pain Follow-up")).toBeTruthy();
    expect(document.body.textContent).not.toContain("suggested_packages");
  });

  it("confirming the understanding does not publish anything", async () => {
    await toProgrammes(SPINE_DRAFT);
    expect(createProviderService).not.toHaveBeenCalled();
  });

  it("warns before regenerating over a draft the operator confirmed", async () => {
    vi.mocked(analyseProviderService).mockResolvedValue(analysisOf(SPINE_DRAFT));
    render(<ServiceBuilder onExit={() => {}} />);
    fillProvider();
    fireEvent.click(screen.getByRole("button", { name: "Analyse with AI" }));
    await screen.findByText("Carelune understood");
    fireEvent.click(screen.getByRole("button", { name: "Review this service" }));
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Service name"), { target: { value: "Spine Recovery at Home" } });
    fireEvent.click(screen.getByRole("button", { name: "Done editing" }));

    fireEvent.click(screen.getByRole("button", { name: "Regenerate" }));
    expect(screen.getByText("Regenerate replaces this draft.")).toBeTruthy();
    // Declining leaves the edit intact and calls nothing.
    fireEvent.click(screen.getByRole("button", { name: "Keep this draft" }));
    expect(vi.mocked(analyseProviderService).mock.calls).toHaveLength(1);
    expect(screen.getByText("Spine Recovery at Home")).toBeTruthy();
  });
});

describe("service builder — programmes and timeline", () => {
  it("renders every package the service offers, with what differs between them", async () => {
    await toProgrammes(SPINE_DRAFT);
    const spine = SPINE_DRAFT.suggested_services[0];
    expect(spine.suggested_packages.length).toBeGreaterThanOrEqual(3);
    for (const p of spine.suggested_packages) {
      const card = screen.getByRole("article", { name: p.name });
      expect(within(card).getByText(p.checkin_frequency)).toBeTruthy();
      expect(within(card).getByText(p.review_frequency)).toBeTruthy();
      expect(within(card).getAllByText(p.milestones[0]).length).toBeGreaterThan(0);
    }
  });

  it("names the 20% platform fee and never a patient price", async () => {
    await toProgrammes(SPINE_DRAFT);
    expect(screen.getByText(/platform fee is 20%/)).toBeTruthy();
    expect(document.body.textContent).not.toContain("30%");
  });

  it("previews a package as a programme timeline built from the configuration", async () => {
    await toProgrammes(SPINE_DRAFT);
    const complete = screen.getByRole("article", { name: "Complete Recovery" });
    fireEvent.click(within(complete).getByRole("button", { name: "Preview programme" }));

    const drawer = await screen.findByRole("dialog");
    const outline = SPINE_DRAFT.suggested_services[0].programme_outline;
    for (const period of outline) {
      expect(within(drawer).getByText(period.period_label)).toBeTruthy();
      expect(within(drawer).getByText(period.focus)).toBeTruthy();
    }
  });

  it("gives a shorter package a shorter programme from the same outline", async () => {
    await toProgrammes(SPINE_DRAFT);
    const essential = screen.getByRole("article", { name: "Essential Recovery" });
    fireEvent.click(within(essential).getByRole("button", { name: "Preview programme" }));

    const drawer = await screen.findByRole("dialog");
    expect(within(drawer).getByText("Week 1")).toBeTruthy();
    expect(within(drawer).queryByText("Weeks 9–12")).toBeNull();
  });
});

describe("service builder — Level-1 confirmation", () => {
  it("records the configuration and hands it to the provider, without publishing it", async () => {
    vi.mocked(createProviderService).mockResolvedValue({
      org: { id: "c1", name: "Dr Vivek Spine Care" },
      admin: { email: "vivek@spinecare.in", full_name: "Dr Vivek Rao" },
      service: {
        id: "s1",
        name: "Post-operative Spine Recovery",
        status: "pending_provider_confirmation",
        packages: 3,
        approver_name: "Dr Vivek Rao",
      },
    });
    await toProgrammes(SPINE_DRAFT);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirm configuration" }));

    expect(await screen.findByText("Post-operative Spine Recovery is configured")).toBeTruthy();
    expect(screen.getByText("Awaiting the provider's confirmation")).toBeTruthy();

    const sent = vi.mocked(createProviderService).mock.calls[0][0];
    expect(sent.org_name).toBe("Dr Vivek Spine Care");
    expect(sent.provider_type).toBe("solo_professional");
    expect(sent.source_provenance).toBe("ai_drafted");
    expect(sent.ai_model).toBe("gpt-4o");
    expect(sent.service.suggested_packages).toHaveLength(3);
    // The browser never sends a fee: the database holds it.
    expect(Object.keys(sent)).not.toContain("platform_fee_pct");
  });

  it("explains the second confirmation before the operator commits", async () => {
    await toProgrammes(SPINE_DRAFT);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText("Confirm this configuration")).toBeTruthy();
    expect(screen.getByText(/confirms it$/)).toBeTruthy();
    expect(screen.getByText(/Only after that second confirmation/)).toBeTruthy();
  });
});

describe("service builder — the same engine for a different specialty", () => {
  it("renders the lactation service through the identical components", async () => {
    await toProgrammes(LACTATION_DRAFT);
    const lact = LACTATION_DRAFT.suggested_services[0];

    // Same headings, same card role, same preview — different content throughout.
    expect(screen.getByText("Carelune prepared your patient programmes")).toBeTruthy();
    for (const p of lact.suggested_packages) {
      expect(screen.getByRole("article", { name: p.name })).toBeTruthy();
    }
    expect(screen.queryByRole("article", { name: "Essential Recovery" })).toBeNull();

    const complete = screen.getByRole("article", { name: "Complete Postpartum Support" });
    fireEvent.click(within(complete).getByRole("button", { name: "Preview programme" }));
    const drawer = await screen.findByRole("dialog");
    expect(within(drawer).getByText("Establishing feeding")).toBeTruthy();
    expect(within(drawer).getByText("Mother's recovery and wellbeing")).toBeTruthy();
    expect(within(drawer).queryByText(/wound/i)).toBeNull();
  });

  it("carries the mother-and-baby monitoring areas the spine service has no idea about", async () => {
    vi.mocked(analyseProviderService).mockResolvedValue(analysisOf(LACTATION_DRAFT));
    render(<ServiceBuilder onExit={() => {}} />);
    fillProvider({ name: "Anjali Mother & Baby Care", email: "anjali@motherbaby.in" });
    fireEvent.click(screen.getByRole("button", { name: "Analyse with AI" }));
    await screen.findByText("Carelune understood");
    fireEvent.click(screen.getByRole("button", { name: "Review this service" }));

    expect(await screen.findByText("Mothers in the first weeks after delivery, together with their baby")).toBeTruthy();
    expect(screen.getAllByText("Emotional wellbeing").length).toBeGreaterThan(0);
    expect(screen.getByText("How did feeding go today?")).toBeTruthy();
  });
});
