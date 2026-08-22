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
  getMedications: vi.fn(),
  getMedAdminToday: vi.fn(),
  getOccurrences: vi.fn(),
  materialiseOccurrences: vi.fn(),
  raiseApproval: vi.fn(),
  recordCareEvent: vi.fn(),
  setMedAdmin: vi.fn(),
  clearMedAdmin: vi.fn(),
  structureCareNote: vi.fn(),
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
  dbMocks.raiseApproval.mockResolvedValue(undefined);
  dbMocks.setMedAdmin.mockResolvedValue(undefined);
  dbMocks.clearMedAdmin.mockResolvedValue(undefined);
  dbMocks.getMedAdminToday.mockResolvedValue(new Map());
  dbMocks.structureCareNote.mockResolvedValue(null);
  // The patient's verified medication record — the one medication store.
  dbMocks.getMedications.mockResolvedValue([
    { id: "med-1", name: "Pantoprazole", dose: "40 mg", timing: "Before food", note: "For stomach protection", active: true },
    { id: "med-2", name: "Baclofen", dose: "10 mg", timing: "After food", note: "Helps manage muscle stiffness", active: true },
    { id: "med-3", name: "Levetiracetam", dose: "500 mg", timing: "After food", note: null, active: true },
  ]);
});

/** As a clinician's approval would leave it: dose slots linked to real medicines. */
const withMedicineLinks = (activities: Record<string, unknown>[]) =>
  activities.map((a) =>
    a.activity_type === "dose"
      ? { ...a, medication_ids: a.key === "morning_meds" ? ["med-1", "med-2", "med-3"] : ["med-2"] }
      : a,
  );

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
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
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
    // The most useful few are shown; the rest are behind More.
    expect(within(dialog).getByRole("button", { name: "Pain" })).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Bowel movement" })).toBeTruthy();
    expect(within(dialog).queryByRole("button", { name: "Nappy" })).toBeNull();
    const more = within(dialog).getByRole("button", { name: /^More \(/ });
    fireEvent.click(more);
    expect(within(dialog).getByRole("button", { name: "Swallowing" })).toBeTruthy();
  });

  it("records a quick entry with no expectation attached", async () => {
    renderShell(NEURO_ACTIVITIES, NEURO_QUICK_RECORDS);
    await screen.findByText("Now");
    fireEvent.click(screen.getByRole("button", { name: /Tell us/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Pain" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "4" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(dbMocks.recordCareEvent).toHaveBeenCalled());
    const call = dbMocks.recordCareEvent.mock.calls[0][0];
    expect(call.activityKey).toBe("pain");
    expect(call.occurrenceId).toBeNull();
    expect(call.entryMode).toBe("quick");
    expect(call.payload.scale).toBe(4);
  });

  it("lists the plan grouped by what kind of care it is", async () => {
    renderShell(withMedicineLinks(NEURO_ACTIVITIES), NEURO_QUICK_RECORDS);
    await screen.findByText("Now");
    openTab(/^My Care$/);
    expect(await screen.findByText("Medicines")).toBeTruthy();
    expect(screen.getByText("Therapy")).toBeTruthy();
    expect(screen.getByText("Feeding and diet")).toBeTruthy();
    expect(screen.getByText("Nursing and daily care")).toBeTruthy();
    // Medicines come from the medication record, so the section lists the
    // regimen rather than the slot's schedule.
    expect(screen.getByText("Pantoprazole")).toBeTruthy();
    expect(screen.getAllByText("Every day at 11:00").length).toBeGreaterThan(0);
  });

  it("reports Progress as counts of what was recorded, never a percentage", async () => {
    renderShell(NEURO_ACTIVITIES, NEURO_QUICK_RECORDS);
    await screen.findByText("Now");
    openTab(/^Progress$/);
    expect(await screen.findByText("Planned care, last 7 days")).toBeTruthy();
    expect(screen.getAllByText(/recorded as planned/).length).toBeGreaterThan(0);
    expect(screen.getByText("Day by day")).toBeTruthy();
    expect(screen.queryByText(/%/)).toBeNull();
  });

  it("shows the care team on Connect without implying live monitoring", async () => {
    renderShell(NEURO_ACTIVITIES, NEURO_QUICK_RECORDS);
    await screen.findByText("Now");
    openTab(/^Team$/);
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
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
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
    openTab(/^My Care$/);
    expect(await screen.findByText("Feeding and diet")).toBeTruthy();
    expect(screen.getByText("Therapy")).toBeTruthy();
    expect(screen.getByText("Instructions and education")).toBeTruthy();
    expect(screen.getByText("Safer sleep for your baby")).toBeTruthy();
    // No medicines are configured for this programme, so that section is absent
    // rather than empty — the section list is data-driven, not hardcoded.
    expect(screen.queryByText("Medicines")).toBeNull();
  });

  it("uses every one of the five frozen slots, exactly as Neuro does", async () => {
    renderShell(LACTATION_ACTIVITIES, LACTATION_QUICK_RECORDS);
    await screen.findByText("Now");
    openTab(/^Progress$/);
    expect(await screen.findByText("Day by day")).toBeTruthy();
    openTab(/^Team$/);
    expect(await screen.findByText("Dr Ravi Kumar")).toBeTruthy();
    openTab(/^My Care$/);
    expect(await screen.findByText("Therapy")).toBeTruthy();
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

/* ========================================================================== */

describe("medicines", () => {
  const find = (k: string) => NEURO_ACTIVITIES.find((a) => a.key === k) as Record<string, unknown>;
  const linked = withMedicineLinks(NEURO_ACTIVITIES);
  const linkedFind = (k: string) => linked.find((a) => a.key === k) as Record<string, unknown>;

  it("says how many medicines a slot covers, rather than being a bare task", async () => {
    dbMocks.getOccurrences.mockResolvedValue([occurrenceFor(linkedFind("morning_meds"), 0.2)]);
    renderShell(linked, NEURO_QUICK_RECORDS);
    expect(await screen.findByText("3 medicines · 3 remaining")).toBeTruthy();
  });

  it("opens the actual verified medicines, grouped by the prescriber's food relation", async () => {
    dbMocks.getOccurrences.mockResolvedValue([occurrenceFor(linkedFind("morning_meds"), 0.2)]);
    renderShell(linked, NEURO_QUICK_RECORDS);
    fireEvent.click(await screen.findByText("Morning medicines"));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Before food")).toBeTruthy();
    expect(within(dialog).getByText("After food")).toBeTruthy();
    expect(within(dialog).getByText("Pantoprazole")).toBeTruthy();
    expect(within(dialog).getByText("40 mg")).toBeTruthy();
    // Purpose only where the prescriber wrote one.
    expect(within(dialog).getByText("For stomach protection")).toBeTruthy();
    expect(within(dialog).getByText("Levetiracetam")).toBeTruthy();
  });

  it("records each medicine on its own, so one can be taken and another not", async () => {
    dbMocks.getOccurrences.mockResolvedValue([occurrenceFor(linkedFind("morning_meds"), 0.2)]);
    renderShell(linked, NEURO_QUICK_RECORDS);
    fireEvent.click(await screen.findByText("Morning medicines"));
    const dialog = await screen.findByRole("dialog");

    const rowFor = (name: string) => (within(dialog).getByText(name).closest("li")) as HTMLElement;
    fireEvent.click(within(rowFor("Pantoprazole")).getByRole("button", { name: "Taken" }));
    fireEvent.click(within(rowFor("Baclofen")).getByRole("button", { name: "Not taken" }));
    fireEvent.click(within(rowFor("Levetiracetam")).getByRole("button", { name: "Taken" }));

    await waitFor(() => expect(dbMocks.setMedAdmin).toHaveBeenCalledTimes(3));
    // Each administration is written against the medication record itself.
    expect(dbMocks.setMedAdmin.mock.calls.map((c) => [c[1], c[3]])).toEqual([
      ["med-1", "given"], ["med-2", "missed"], ["med-3", "given"],
    ]);
  });

  it("will not record a completion for medicines it cannot name", async () => {
    // No links: the compiler produced a slot, but no clinician confirmed which
    // medicines it administers.
    dbMocks.getOccurrences.mockResolvedValue([occurrenceFor(find("morning_meds"), 0.2)]);
    renderShell(NEURO_ACTIVITIES, NEURO_QUICK_RECORDS);
    fireEvent.click(await screen.findByText("Morning medicines"));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Medication details need confirmation from your care team.")).toBeTruthy();
    expect(within(dialog).queryByRole("button", { name: "Taken" })).toBeNull();
    expect(dbMocks.recordCareEvent).not.toHaveBeenCalled();
  });
});

describe("the measurement recorder", () => {
  const find = (k: string) => NEURO_ACTIVITIES.find((a) => a.key === k) as Record<string, unknown>;

  it("asks for the configured measurements, not for a time", async () => {
    dbMocks.getOccurrences.mockResolvedValue([occurrenceFor(find("blood_pressure"), 0.2)]);
    renderShell(NEURO_ACTIVITIES, NEURO_QUICK_RECORDS);
    fireEvent.click(await screen.findByText("Blood pressure"));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText("Systolic (mmHg)")).toBeTruthy();
    expect(within(dialog).getByLabelText("Diastolic (mmHg)")).toBeTruthy();
    expect(within(dialog).getByLabelText("Pulse (bpm)")).toBeTruthy();
    // The time is a quiet footnote, defaulted to now.
    expect(within(dialog).getByText(/Recorded now/)).toBeTruthy();
    expect(within(dialog).queryByLabelText("When did this happen")).toBeNull();
  });

  it("lets the few who need it change the time", async () => {
    dbMocks.getOccurrences.mockResolvedValue([occurrenceFor(find("blood_pressure"), 0.2)]);
    renderShell(NEURO_ACTIVITIES, NEURO_QUICK_RECORDS);
    fireEvent.click(await screen.findByText("Blood pressure"));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Change" }));
    expect(within(dialog).getByLabelText("When did this happen")).toBeTruthy();
  });
});

describe("the centre + reaches the same engine", () => {
  it("still offers the programme's actions when it configured no quick list", async () => {
    /*
     * THE REPORTED DEFECT, at the screen. A real approved programme on staging
     * carried quick_records: [], and the "+" — which read only that list —
     * offered Speak, Type and nothing else. The caregiver of a patient whose
     * programme defined pain, bowel and blood pressure could record none of
     * them. The configured list may order the buttons; it may not be the only
     * thing that creates them.
     */
    renderShell(NEURO_ACTIVITIES, []);
    await screen.findByText("Nothing scheduled today");
    fireEvent.click(screen.getByRole("button", { name: /Tell us/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Quick record")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: /^More \(/ }));
    for (const label of ["Pain", "Bowel movement", "Blood pressure", "Reposition"]) {
      expect(within(dialog).getByRole("button", { name: label }), label).toBeTruthy();
    }
  });

  it("derives a different programme's actions through the very same code", async () => {
    // Same component, same derivation, no specialty anywhere in it. Lactation
    // offers what Lactation configured, and nothing neurological appears.
    renderShell(LACTATION_ACTIVITIES, []);
    await screen.findByText("Nothing scheduled today");
    fireEvent.click(screen.getByRole("button", { name: /Tell us/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Nappy" })).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: /^More \(/ }));
    expect(await screen.findByRole("button", { name: "How I am feeling" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Bowel movement" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Reposition" })).toBeNull();
  });

  it("never offers a medicine slot as a quick record", async () => {
    // Medicines are recorded against the round they belong to. "Morning
    // medicines, again, at 3pm" is not something that happened.
    renderShell(NEURO_ACTIVITIES, []);
    await screen.findByText("Nothing scheduled today");
    fireEvent.click(screen.getByRole("button", { name: /Tell us/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /^More \(/ }));
    expect(within(dialog).queryByRole("button", { name: /medicines/i })).toBeNull();
  });

  it("opens the proper measurement recorder for a SCHEDULED activity, as an unscheduled event", async () => {
    renderShell(NEURO_ACTIVITIES, NEURO_QUICK_RECORDS);
    await screen.findByText("Nothing scheduled today");
    fireEvent.click(screen.getByRole("button", { name: /Tell us/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Blood pressure" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText("Systolic (mmHg)")).toBeTruthy();
  });

  it("records repositioning done off-schedule with no expectation attached", async () => {
    renderShell(NEURO_ACTIVITIES, NEURO_QUICK_RECORDS);
    await screen.findByText("Nothing scheduled today");
    fireEvent.click(screen.getByRole("button", { name: /Tell us/ }));
    // Reposition sits behind More — the programme orders its own quick list.
    fireEvent.click(await screen.findByRole("button", { name: /^More \(/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Reposition" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(dbMocks.recordCareEvent).toHaveBeenCalled());
    const call = dbMocks.recordCareEvent.mock.calls[0][0];
    expect(call.activityKey).toBe("positioning");
    expect(call.occurrenceId).toBeNull();
    expect(call.entryMode).toBe("quick");
  });

  it("shows a structured candidate for confirmation before recording words", async () => {
    dbMocks.structureCareNote.mockResolvedValue({
      activity_key: "vomiting",
      values: { episodes: 2, when: "Soon after a feed" },
      occurred_at: new Date(Date.now() - 3600_000).toISOString(),
      occurred_label: "Occurred about 2:30 PM",
      summary: ["2 episodes", "After lunch"],
    });
    renderShell(NEURO_ACTIVITIES, NEURO_QUICK_RECORDS);
    await screen.findByText("Nothing scheduled today");
    fireEvent.click(screen.getByRole("button", { name: /Tell us/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Something else" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByRole("textbox"), {
      target: { value: "She vomited twice after lunch." },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Continue" }));

    // Nothing is recorded until the candidate is confirmed.
    expect(await within(dialog).findByText("Vomiting")).toBeTruthy();
    expect(within(dialog).getByText("2 episodes")).toBeTruthy();
    expect(within(dialog).getByText("Occurred about 2:30 PM")).toBeTruthy();
    expect(dbMocks.recordCareEvent).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(dbMocks.recordCareEvent).toHaveBeenCalled());
    const call = dbMocks.recordCareEvent.mock.calls[0][0];
    expect(call.activityKey).toBe("vomiting");
    expect(call.payload).toEqual({ episodes: 2, when: "Soon after a feed" });
    // The person's own words are kept with the entry.
    expect(call.note).toBe("She vomited twice after lunch.");
  });
});
