import { describe, expect, it } from "vitest";
import { activityCopy, activityStateTag, activityStatusLabel, buildCareActivity, localDateOf, type ProgrammeActivity } from "./careActivity";
import type { Attention } from "../screens/pmr/attention-model";

/** A recovery patient's attention, exactly as the existing model produces it. */
const attention = (over: Partial<Attention> = {}): Attention =>
  ({
    band: "stable",
    signals: ["stable"],
    alsoClinicalChange: false,
    reason: "Recovering steadily",
    changed: "Nothing new",
    action: "Nothing pending",
    urgent: false,
    lastUpdate: "Last recorded today",
    decisions: 0,
    concerns: 0,
    ...over,
  }) as Attention;

const FRIDAY = new Date(2026, 7, 21, 10, 0);   // 21 Aug 2026 is a Friday
const SATURDAY = new Date(2026, 7, 22, 10, 0);

const programme = (over: Partial<ProgrammeActivity> = {}): ProgrammeActivity => ({
  programmeName: "Standard Recovery",
  checkinFrequency: "Three times a week",
  latest: {
    submitted_at: "2026-08-21T09:12:00.000Z",
    local_date: localDateOf(FRIDAY),
    programme_day: 8,
    programme_period_label: "Weeks 2–4",
    responses: 8,
  },
  ...over,
});

describe("a recovery patient is untouched", () => {
  it("keeps the legacy source and the legacy model's own words", () => {
    const a = attention({ band: "change", reason: "Blood pressure rising", lastUpdate: "Last recorded yesterday" });
    const out = buildCareActivity({ patientId: "p1", attention: a, programme: null, explicitConcerns: 0, now: FRIDAY });

    expect(out.source).toBe("legacy_recovery");
    expect(out.displayState).toBe("legacy");
    expect(out.attention).toBe(a);                       // the same object, not a copy
    expect(out.attention.band).toBe("change");
    expect(out.latestUpdateLabel).toBe("Last recorded yesterday");
    expect(activityStatusLabel(out)).toBe("Last recorded yesterday");
  });

  it("has no cadence, because cadence is not a concept in recovery", () => {
    const out = buildCareActivity({ patientId: "p1", attention: attention(), programme: null, explicitConcerns: 0, now: FRIDAY });
    expect(out.expectedToday).toBeNull();
    expect(out.submittedToday).toBeNull();
    expect(out.responseCount).toBeNull();
  });
});

describe("a programme patient stops reading as blank", () => {
  it("reports a check-in that arrived today, with its facts", () => {
    const out = buildCareActivity({ patientId: "p2", attention: attention({ lastUpdate: "No readings recorded yet" }), programme: programme(), explicitConcerns: 0, now: FRIDAY });

    expect(out.source).toBe("programme_checkin");
    expect(out.displayState).toBe("checkin_received");
    expect(out.submittedToday).toBe(true);
    expect(out.responseCount).toBe(8);
    expect(out.programmeDay).toBe(8);
    expect(out.programmePeriod).toBe("Weeks 2–4");
    expect(activityStatusLabel(out)).toBe("Check-in received today · 8 responses");
    // The thing this phase exists to fix.
    expect(activityStatusLabel(out)).not.toMatch(/No readings recorded/);
  });

  it("says one is expected when the cadence says so and none has arrived", () => {
    const out = buildCareActivity({
      patientId: "p2", attention: attention(), explicitConcerns: 0, now: FRIDAY,
      programme: programme({ latest: { submitted_at: "2026-08-19T09:00:00Z", local_date: "2026-08-19", programme_day: 6, programme_period_label: "Week 1", responses: 5 } }),
    });
    expect(out.displayState).toBe("checkin_expected");
    expect(out.latestUpdateLabel).toBe("Last check-in 2 days ago");
    expect(activityStatusLabel(out)).toBe("Check-in expected today · last check-in 2 days ago");
  });

  it("says yesterday when it was yesterday", () => {
    const out = buildCareActivity({
      patientId: "p2", attention: attention(), explicitConcerns: 0, now: FRIDAY,
      programme: programme({ latest: { submitted_at: "2026-08-20T09:00:00Z", local_date: "2026-08-20", programme_day: 7, programme_period_label: "Week 1", responses: 5 } }),
    });
    expect(out.latestUpdateLabel).toBe("Last check-in yesterday");
  });

  it("does not call a patient missed on a day their cadence never asked for", () => {
    // Three times a week = Mon/Wed/Fri. Saturday is not a missed day.
    const out = buildCareActivity({
      patientId: "p2", attention: attention(), explicitConcerns: 0, now: SATURDAY,
      programme: programme({ latest: null }),
    });
    expect(out.displayState).toBe("checkin_available");
    expect(activityStatusLabel(out)).toBe("Check-in available · no check-in yet");
    expect(activityStatusLabel(out)).not.toMatch(/missed|overdue|late/i);
  });

  it("never says missed even when a cadence cannot be read", () => {
    const out = buildCareActivity({
      patientId: "p2", attention: attention(), explicitConcerns: 0, now: SATURDAY,
      programme: programme({ checkinFrequency: "Whenever it feels useful", latest: null }),
    });
    // An unreadable cadence errs towards offering a check-in, never towards blame.
    expect(out.expectedToday).toBe(true);
    expect(activityStatusLabel(out)).not.toMatch(/missed|overdue/i);
  });

  it("reads a patient who has never checked in as awaiting one, not as absent", () => {
    const out = buildCareActivity({
      patientId: "p2", attention: attention({ lastUpdate: "No readings recorded yet" }), explicitConcerns: 0, now: FRIDAY,
      programme: programme({ latest: null }),
    });
    expect(out.latestUpdateLabel).toBe("No check-in yet");
    expect(out.displayState).toBe("checkin_expected");
  });
});

describe("no clinical meaning is invented from an answer", () => {
  // The adapter is never given answer VALUES — only counts and timing. These
  // guard the contract: whatever a patient answered, the state is about
  // activity, and the clinical band still comes from the legacy model alone.
  it("treats a check-in the same whatever the answers were", () => {
    const calm = buildCareActivity({ patientId: "p", attention: attention(), programme: programme(), explicitConcerns: 0, now: FRIDAY });
    const alarming = buildCareActivity({
      patientId: "p", attention: attention(), explicitConcerns: 0, now: FRIDAY,
      programme: programme({ latest: { ...programme().latest!, responses: 8 } }),
    });
    expect(calm.displayState).toBe(alarming.displayState);
    expect(calm.attention.band).toBe(alarming.attention.band);
  });

  it("never raises a band, urgency or concern of its own", () => {
    const out = buildCareActivity({ patientId: "p", attention: attention({ band: "stable", urgent: false }), programme: programme(), explicitConcerns: 0, now: FRIDAY });
    expect(out.attention.band).toBe("stable");
    expect(out.attention.urgent).toBe(false);
    expect(out.hasExplicitPatientConcern).toBe(false);
    expect(JSON.stringify(out)).not.toMatch(/deteriorat|improving|high risk|abnormal|urgent attention/i);
  });

  it("counts a concern only when one was explicitly raised through the existing pathway", () => {
    const raised = buildCareActivity({ patientId: "p", attention: attention(), programme: programme(), explicitConcerns: 1, now: FRIDAY });
    expect(raised.hasExplicitPatientConcern).toBe(true);
    // ...and free text inside a check-in is not that.
    const textOnly = buildCareActivity({ patientId: "p", attention: attention(), programme: programme(), explicitConcerns: 0, now: FRIDAY });
    expect(textOnly.hasExplicitPatientConcern).toBe(false);
  });
});

describe("the same adapter for a different specialty", () => {
  it("describes a mother-and-baby programme in its own words", () => {
    const out = buildCareActivity({
      patientId: "p3", attention: attention({ lastUpdate: "No readings recorded yet" }), explicitConcerns: 0, now: FRIDAY,
      programme: {
        programmeName: "Guided Mother & Baby Support",
        checkinFrequency: "Five times a week",
        latest: { submitted_at: "2026-08-21T08:00:00Z", local_date: localDateOf(FRIDAY), programme_day: 22, programme_period_label: "Weeks 2-4", responses: 6 },
      },
    });
    expect(out.programmeName).toBe("Guided Mother & Baby Support");
    expect(out.programmeDay).toBe(22);
    expect(activityStatusLabel(out)).toBe("Check-in received today · 6 responses");
    expect(JSON.stringify(out)).not.toMatch(/wound|spine|recovery continuum/i);
  });
});

describe("a programme patient is never labelled clinically stable", () => {
  it("says what is operationally known instead", () => {
    const received = buildCareActivity({ patientId: "p", attention: attention({ band: "stable" }), programme: programme(), explicitConcerns: 0, now: FRIDAY });
    expect(activityStateTag(received)).toBe("Update received");
    expect(activityStateTag(received)).not.toMatch(/stable/i);

    const waiting = buildCareActivity({
      patientId: "p", attention: attention({ band: "stable" }), explicitConcerns: 0, now: FRIDAY,
      programme: programme({ latest: null }),
    });
    expect(activityStateTag(waiting)).toBe("No action pending");
    expect(activityStateTag(waiting)).not.toMatch(/stable/i);
  });

  it("leaves a recovery patient's card exactly as it was", () => {
    const legacy = buildCareActivity({ patientId: "p", attention: attention({ band: "stable" }), programme: null, explicitConcerns: 0, now: FRIDAY });
    // No extra tag is rendered for them at all.
    expect(activityStateTag(legacy)).toBeNull();
    // And the model that decides their band is untouched.
    expect(legacy.attention.band).toBe("stable");
    expect(legacy.latestUpdateLabel).toBe("Last recorded today");
  });
});

describe("a programme card never speaks the recovery product's language", () => {
  /** The wording that belongs to the recovery product and nowhere else. */
  const LEGACY_COPY = /recovery plan|home recovery|build and activate|no trend recorded/i;

  /** The attention model's own words for a newly registered patient. */
  const registered = attention({
    band: "decision",
    reason: "Registered and has no recovery plan yet",
    changed: "New registration",
    action: "Build and activate the recovery plan",
  });

  const cardCopy = (a: ReturnType<typeof buildCareActivity>) => {
    const c = activityCopy(a);
    return c ? [c.reason, c.changed ?? "", c.action].join(" | ") : null;
  };

  it("a dermatology patient is not told to build a recovery plan", () => {
    const a = buildCareActivity({
      patientId: "p", attention: registered, explicitConcerns: 0, now: FRIDAY,
      programme: { programmeName: "Standard Follow-Up Package", checkinFrequency: "Twice a week",
        latest: { submitted_at: "2026-08-21T16:32:00Z", local_date: localDateOf(FRIDAY), programme_day: 1, programme_period_label: "Weeks 1-4", responses: 7 } },
    });
    expect(cardCopy(a)).toBe("Latest programme update received |  | No action pending");
    expect(cardCopy(a)).not.toMatch(LEGACY_COPY);
  });

  it("a mother-and-baby patient is not given recovery wording either", () => {
    const a = buildCareActivity({
      patientId: "p", attention: registered, explicitConcerns: 0, now: FRIDAY,
      programme: { programmeName: "Essential Feeding Support", checkinFrequency: "Daily", latest: null },
    });
    expect(cardCopy(a)).toMatch(/Check-in expected today/);
    expect(cardCopy(a)).not.toMatch(LEGACY_COPY);
  });

  it("a spine patient's lines come from their programme, not from the model's copy", () => {
    const a = buildCareActivity({ patientId: "p", attention: registered, programme: programme(), explicitConcerns: 0, now: FRIDAY });
    expect(cardCopy(a)).not.toMatch(LEGACY_COPY);
    // The model's own strings are still there untouched — they are simply not shown.
    expect(a.attention.reason).toBe("Registered and has no recovery plan yet");
    expect(a.attention.action).toBe("Build and activate the recovery plan");
  });

  it("real work waiting on the clinician still leads, in neutral words", () => {
    const busy = attention({ band: "decision", decisions: 2, reason: "2 items awaiting your decision", action: "Review and decide" });
    const a = buildCareActivity({ patientId: "p", attention: busy, programme: programme(), explicitConcerns: 0, now: FRIDAY });
    expect(activityCopy(a)?.reason).toBe("2 items awaiting your decision");
    expect(activityCopy(a)?.action).toBe("Review and decide");

    const raised = attention({ band: "concern", concerns: 1 });
    const b = buildCareActivity({ patientId: "p", attention: raised, programme: programme(), explicitConcerns: 1, now: FRIDAY });
    expect(activityCopy(b)?.reason).toBe("1 concern raised from home");
    expect(activityCopy(b)?.action).toBe("Answer the concern");
  });

  it("a recovery patient keeps the model's wording, exactly", () => {
    const a = buildCareActivity({ patientId: "p", attention: registered, programme: null, explicitConcerns: 0, now: FRIDAY });
    // No override at all — the card renders the model's own strings.
    expect(activityCopy(a)).toBeNull();
    expect(a.attention.reason).toBe("Registered and has no recovery plan yet");
    expect(a.attention.changed).toBe("New registration");
    expect(a.attention.action).toBe("Build and activate the recovery plan");
  });
});
