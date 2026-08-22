// @vitest-environment jsdom

/*
 * THE UNIVERSALITY CHECK, run against the real components.
 *
 * The same CareShell is rendered twice — once with the Neuro configuration and
 * once with Lactation — and both must produce a working Today, Journey, Tell Us,
 * Connect and Plan with no change to the component and no specialty branch. If
 * one of these ever needs its own screen, that is the signal to fix the
 * abstraction rather than to add a branch.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LACTATION_ACTIVITIES, LACTATION_QUICK_RECORDS,
  NEURO_ACTIVITIES, NEURO_QUICK_RECORDS,
} from "../../../domain/careProgramme.fixtures";

const dbMocks = vi.hoisted(() => ({
  getApprovedProgramme: vi.fn(),
  getCareEvents: vi.fn(),
  getCareTeam: vi.fn(),
  getOccurrences: vi.fn(),
  materialiseOccurrences: vi.fn(),
  recordCareEvent: vi.fn(),
}));

vi.mock("../../../lib/db", () => dbMocks);
vi.mock("../../../branding/BrandingProvider", () => ({
  useBranding: () => ({
    org: { display_name: "Punarvas Hospital", name: "Punarvas Hospital" },
    profile: { full_name: "Lakshmi Rao" },
  }),
}));
// The existing messaging component is exercised by its own tests; this file is
// about the shell.
vi.mock("../../home/HomeCareMessages", () => ({ HomeCareMessages: () => <div>MESSAGES</div> }));

import CareShell from "./CareShell";

const patient = { id: "p1", full_name: "Anand Menon" } as never;
const subscription = {
  id: "sub-1",
  started_at: new Date(Date.now() - 7 * 86_400_000).toISOString(),
  package_snapshot: {
    service_name: "Neuro Continuum",
    name: "Neuro Standard",
    review_frequency: "Weekly review by the lead clinician",
    checkin_frequency: "Daily",
    includes: ["Coordinator support"],
    milestones: ["Sitting without support"],
  },
} as never;

const isoToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** An occurrence for `activity`, due `hoursFromNow` from this moment. */
const occurrenceFor = (
  activity: Record<string, unknown>,
  hoursFromNow: number,
  status = "pending",
) => {
  const due = new Date(Date.now() + hoursFromNow * 3_600_000);
  const h = due.getHours();
  return {
    id: `occ-${String(activity.key)}-${hoursFromNow}`,
    patient_id: "p1",
    activity_key: activity.key,
    activity_type: activity.activity_type,
    definition_snapshot: activity,
    due_at: due.toISOString(),
    window_end: null,
    local_date: isoToday(),
    display_group:
      h >= 5 && h < 12 ? "morning" : h >= 12 && h < 17 ? "afternoon" : h >= 17 && h < 21 ? "evening" : "night",
    status,
    resolved_by_event_id: null,
  };
};

const programmeOf = (activities: Record<string, unknown>[], quick: string[]) => ({
  id: "prog-1",
  patient_id: "p1",
  subscription_id: "sub-1",
  version: 1,
  activities,
  quick_records: quick,
  compiled_from: {},
  status: "approved",
  source_provenance: "compiler",
  ai_model: null,
  compiled_at: null,
  approved_by: "doc-1",
  approved_at: new Date().toISOString(),
  approval_note: null,
  created_at: new Date().toISOString(),
});

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  dbMocks.materialiseOccurrences.mockResolvedValue(0);
  dbMocks.getCareTeam.mockResolvedValue([
    { staff_id: "s1", team_role: "lead_doctor", full_name: "Dr Ravi Kumar" },
  ]);
  dbMocks.getCareEvents.mockResolvedValue([]);
  dbMocks.getOccurrences.mockResolvedValue([]);
  dbMocks.recordCareEvent.mockResolvedValue({});
});

const renderShell = (activities: Record<string, unknown>[], quick: string[]) => {
  const programme = programmeOf(activities, quick);
  dbMocks.getApprovedProgramme.mockResolvedValue(programme);
  return render(
    <CareShell role="caregiver" patient={patient} subscription={subscription} programme={programme as never} />,
  );
};

const openTab = (name: RegExp) => fireEvent.click(screen.getByRole("button", { name }));

/* ========================================================================== */

describe("the shell, with the Neuro configuration", () => {
  const find = (k: string) => NEURO_ACTIVITIES.find((a) => a.key === k) as Record<string, unknown>;

  beforeEach(() => {
    dbMocks.getOccurrences.mockResolvedValue([
      occurrenceFor(find("morning_meds"), -5, "done"),
      occurrenceFor(find("blood_pressure"), -6, "missed"),
      occurrenceFor(find("physiotherapy"), 0.2),
      occurrenceFor(find("night_meds"), 6),
    ]);
  });

  it("greets the caregiver and names the programme and day", async () => {
    renderShell(NEURO_ACTIVITIES, NEURO_QUICK_RECORDS);
    expect(await screen.findByText(/Good (morning|afternoon|evening), Lakshmi/)).toBeTruthy();
    expect(screen.getByText(/Neuro Continuum/)).toBeTruthy();
    expect(screen.getByText("Punarvas Hospital")).toBeTruthy();
  });

  it("shows NOW, what is unresolved, what is recorded and what is next", async () => {
    renderShell(NEURO_ACTIVITIES, NEURO_QUICK_RECORDS);
    expect(await screen.findByText("Now")).toBeTruthy();
    expect(screen.getByText("Earlier today — not recorded yet")).toBeTruthy();
    expect(screen.getByText("Recorded today")).toBeTruthy();
    expect(screen.getByText("Next")).toBeTruthy();
    expect(screen.getByText("Physiotherapy — sit to stand")).toBeTruthy();
    expect(screen.getByText("Blood pressure")).toBeTruthy();
  });

  it("offers Morning / Afternoon / Evening / Night as display grouping", async () => {
    renderShell(NEURO_ACTIVITIES, NEURO_QUICK_RECORDS);
    const nav = await screen.findByRole("navigation", { name: "Parts of the day" });
    expect(within(nav).getAllByRole("button").length).toBeGreaterThan(0);
  });

  it("records a scheduled activity through the one recorder", async () => {
    renderShell(NEURO_ACTIVITIES, NEURO_QUICK_RECORDS);
    fireEvent.click(await screen.findByText("Physiotherapy — sit to stand"));
    const dialog = await screen.findByRole("dialog");
    // ONE outcome control for one decision — the interaction's, not a second
    // copy from the configuration's own `outcome` field.
    expect(within(dialog).getByText("What happened")).toBeTruthy();
    expect(within(dialog).queryByText("How did it go")).toBeNull();
    expect(within(dialog).getAllByRole("button", { name: "Done" })).toHaveLength(1);
    expect(within(dialog).getByRole("button", { name: "Partly" })).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Couldn't" })).toBeTruthy();
    // The remaining fields still come from the activity's own input_schema.
    expect(within(dialog).getByText("Sets completed")).toBeTruthy();
    expect(within(dialog).getByText("How was it tolerated")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Record" }));
    await waitFor(() => expect(dbMocks.recordCareEvent).toHaveBeenCalled());
    const call = dbMocks.recordCareEvent.mock.calls[0][0];
    // The client sends a KEY, never a definition.
    expect(call.activityKey).toBe("physiotherapy");
    expect(call.occurrenceId).toBeTruthy();
    expect(call.entryMode).toBe("scheduled");
    expect(call).not.toHaveProperty("activity");
    expect(call.outcome).toBe("done");
  });

  it("offers this programme's own quick records under Tell us", async () => {
    renderShell(NEURO_ACTIVITIES, NEURO_QUICK_RECORDS);
    await screen.findByText("Now");
    fireEvent.click(screen.getByRole("button", { name: /Tell us/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Quick record")).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Swallowing" })).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Bowel movement" })).toBeTruthy();
    expect(within(dialog).queryByRole("button", { name: "Nappy" })).toBeNull();
  });

  it("records a quick entry with no expectation attached", async () => {
    renderShell(NEURO_ACTIVITIES, NEURO_QUICK_RECORDS);
    await screen.findByText("Now");
    fireEvent.click(screen.getByRole("button", { name: /Tell us/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Pain" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "4" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Record" }));
    await waitFor(() => expect(dbMocks.recordCareEvent).toHaveBeenCalled());
    const call = dbMocks.recordCareEvent.mock.calls[0][0];
    expect(call.activityKey).toBe("pain");
    expect(call.occurrenceId).toBeNull();
    expect(call.entryMode).toBe("quick");
    expect(call.payload.scale).toBe(4);
  });

  it("lists the plan grouped by what kind of care it is", async () => {
    renderShell(NEURO_ACTIVITIES, NEURO_QUICK_RECORDS);
    await screen.findByText("Now");
    openTab(/^Plan$/);
    expect(await screen.findByText("Medicines")).toBeTruthy();
    expect(screen.getByText("Therapy and exercises")).toBeTruthy();
    expect(screen.getByText("Feeding and fluids")).toBeTruthy();
    expect(screen.getByText("Daily care")).toBeTruthy();
    expect(screen.getAllByText("Every day at 09:00").length).toBeGreaterThan(0);
  });

  it("reports Journey as counts of what was recorded, never a progress percentage", async () => {
    renderShell(NEURO_ACTIVITIES, NEURO_QUICK_RECORDS);
    await screen.findByText("Now");
    openTab(/^Journey$/);
    expect(await screen.findByText("Recent days")).toBeTruthy();
    expect(screen.getByText(/scheduled recorded/)).toBeTruthy();
    expect(screen.queryByText(/%/)).toBeNull();
  });

  it("shows the care team on Connect without implying live monitoring", async () => {
    renderShell(NEURO_ACTIVITIES, NEURO_QUICK_RECORDS);
    await screen.findByText("Now");
    openTab(/^Connect$/);
    expect(await screen.findByText("Dr Ravi Kumar")).toBeTruthy();
    expect(screen.getByText("MESSAGES")).toBeTruthy();
    expect(screen.queryByText(/monitor(ing|ed) (you|24)/i)).toBeNull();
  });
});

/* ========================================================================== */

describe("the SAME shell, with the Lactation configuration", () => {
  const find = (k: string) => LACTATION_ACTIVITIES.find((a) => a.key === k) as Record<string, unknown>;

  beforeEach(() => {
    dbMocks.getOccurrences.mockResolvedValue([
      occurrenceFor(find("scheduled_feed"), -4, "done"),
      occurrenceFor(find("baby_weight"), -6, "missed"),
      occurrenceFor(find("pelvic_floor"), 0.2),
      occurrenceFor(find("nipple_care"), 6),
    ]);
  });

  it("renders Today through the same components with no change", async () => {
    renderShell(LACTATION_ACTIVITIES, LACTATION_QUICK_RECORDS);
    expect(await screen.findByText("Now")).toBeTruthy();
    expect(screen.getByText("Earlier today — not recorded yet")).toBeTruthy();
    expect(screen.getByText("Recorded today")).toBeTruthy();
    expect(screen.getByText("Next")).toBeTruthy();
    expect(screen.getByText("Pelvic floor exercises")).toBeTruthy();
    expect(screen.getByText("Baby's weight")).toBeTruthy();
  });

  it("offers ITS OWN quick records, and none of the Neuro ones", async () => {
    renderShell(LACTATION_ACTIVITIES, LACTATION_QUICK_RECORDS);
    await screen.findByText("Now");
    fireEvent.click(screen.getByRole("button", { name: /Tell us/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Nappy" })).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "How I am feeling" })).toBeTruthy();
    expect(within(dialog).queryByRole("button", { name: "Swallowing" })).toBeNull();
    expect(within(dialog).queryByRole("button", { name: "Bowel movement" })).toBeNull();
  });

  it("records through the identical recorder the Neuro activities use", async () => {
    renderShell(LACTATION_ACTIVITIES, LACTATION_QUICK_RECORDS);
    fireEvent.click(await screen.findByText("Pelvic floor exercises"));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("What happened")).toBeTruthy();
    expect(within(dialog).getAllByRole("button", { name: "Done" })).toHaveLength(1);
    fireEvent.click(within(dialog).getByRole("button", { name: "Record" }));
    await waitFor(() => expect(dbMocks.recordCareEvent).toHaveBeenCalled());
    const call = dbMocks.recordCareEvent.mock.calls[0][0];
    expect(call.activityKey).toBe("pelvic_floor");
    expect(call.outcome).toBe("done");
    // The outcome is carried back in the provider's own wording too.
    expect(call.payload.outcome).toBe("Done");
  });

  it("groups its plan under the same headings, with different content", async () => {
    renderShell(LACTATION_ACTIVITIES, LACTATION_QUICK_RECORDS);
    await screen.findByText("Now");
    openTab(/^Plan$/);
    expect(await screen.findByText("Feeding and fluids")).toBeTruthy();
    expect(screen.getByText("Therapy and exercises")).toBeTruthy();
    expect(screen.getByText("Things to read")).toBeTruthy();
    expect(screen.getByText("Safer sleep for your baby")).toBeTruthy();
    // No medicines are configured for this programme, so that section is absent
    // rather than empty — the section list is data-driven, not hardcoded.
    expect(screen.queryByText("Medicines")).toBeNull();
  });

  it("uses every one of the five frozen slots, exactly as Neuro does", async () => {
    renderShell(LACTATION_ACTIVITIES, LACTATION_QUICK_RECORDS);
    await screen.findByText("Now");
    openTab(/^Journey$/);
    expect(await screen.findByText("Recent days")).toBeTruthy();
    openTab(/^Connect$/);
    expect(await screen.findByText("Dr Ravi Kumar")).toBeTruthy();
    openTab(/^Plan$/);
    expect(await screen.findByText("Your care rhythm")).toBeTruthy();
    openTab(/^Today$/);
    expect(await screen.findByText("Now")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Tell us/ })).toBeTruthy();
  });
});

/* ========================================================================== */

describe("what the shell refuses to do", () => {
  it("draws a recorded value without interpreting it", async () => {
    const painActivity = NEURO_ACTIVITIES.find((a) => a.key === "pain") as Record<string, unknown>;
    dbMocks.getCareEvents.mockResolvedValue([
      {
        id: "e-severe",
        occurrence_id: null,
        activity_key: "pain",
        activity_type: "symptom",
        label_snapshot: "Pain",
        occurred_at: new Date().toISOString(),
        recorded_at: new Date().toISOString(),
        local_date: isoToday(),
        outcome: "recorded",
        payload: { scale: 10 },
        note: "Very bad since morning",
        entry_mode: "quick",
        acknowledgement_state: "recorded",
        shared_with_care_team: false,
      },
    ]);
    dbMocks.getOccurrences.mockResolvedValue([occurrenceFor(painActivity, 2)]);
    renderShell(NEURO_ACTIVITIES, NEURO_QUICK_RECORDS);

    expect(await screen.findByText("You also told us")).toBeTruthy();
    expect(screen.getByText("Very bad since morning")).toBeTruthy();
    // The acknowledgement is operational, not clinical: no urgency, no severity,
    // no advice, whatever the number was.
    expect(screen.getByText("Recorded")).toBeTruthy();
    expect(screen.queryByText(/urgent|severe|concerning|call your doctor/i)).toBeNull();
  });

  it("says so plainly when there is nothing scheduled", async () => {
    renderShell(NEURO_ACTIVITIES, NEURO_QUICK_RECORDS);
    expect(await screen.findByText("Nothing scheduled today")).toBeTruthy();
  });
});
