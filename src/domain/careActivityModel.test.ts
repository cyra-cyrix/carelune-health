import { describe, expect, it } from "vitest";
import {
  ACTIVITY_TYPES, displayGroupForHour, findMedicationSpecifics, isQuickRecord, parseClockTime,
  toStoredActivity, validateCareActivities,
} from "./careActivityModel";
import {
  LACTATION_ACTIVITIES, LACTATION_QUICK_RECORDS,
  NEURO_ACTIVITIES, NEURO_QUICK_RECORDS,
} from "./careProgramme.fixtures";

const ok = (raw: unknown) => {
  const r = validateCareActivities(raw);
  if (!r.ok) throw new Error(`expected valid, got: ${r.errors.join(" | ")}`);
  return r.activities;
};

const errorsOf = (raw: unknown) => {
  const r = validateCareActivities(raw);
  return r.ok ? [] : r.errors;
};

const one = (patch: Record<string, unknown> = {}) => [{
  key: "morning_meds",
  activity_type: "dose",
  domain: "medication",
  title: "Morning medicines",
  basis: "provider_default",
  input_schema: [],
  schedule: { kind: "clock", times: ["09:00"], days: "all", from_day: 1 },
  ...patch,
}];

/** A field, so a record-type activity has something to record. */
const A_FIELD = { key: "value", label: "Value", type: "text", required: false };

describe("the closed vocabulary", () => {
  it("accepts an activity of every declared type and no other", () => {
    for (const t of ACTIVITY_TYPES) {
      expect(errorsOf(one({ activity_type: t, input_schema: [A_FIELD] })), t).toEqual([]);
    }
    expect(errorsOf(one({ activity_type: "triage" }))[0]).toMatch(/activity_type must be one of/);
  });

  it("refuses a recording activity that records nothing", () => {
    // This is what left the hosted vitals sheet with only a timestamp to show:
    // a `measurement` with an empty schema validated, and the recorder had
    // nothing to draw. An interaction whose whole purpose is to capture a value
    // must say which value.
    for (const t of ["measurement", "symptom", "observation", "intake"]) {
      expect(errorsOf(one({ activity_type: t, input_schema: [] }))[0], t)
        .toMatch(/must state at least one field/);
    }
  });

  it("still allows a completion activity to carry no fields", () => {
    // "Was it done?" is the whole question for these, and the outcome control
    // is part of the interaction rather than the schema.
    for (const t of ["dose", "task", "exercise", "education"]) {
      expect(errorsOf(one({ activity_type: t, input_schema: [] })), t).toEqual([]);
    }
  });

  it("refuses an input field of an unknown type", () => {
    const errors = errorsOf(one({
      input_schema: [{ key: "risk", label: "Risk band", type: "clinical_score", required: true }],
    }));
    expect(errors.join(" ")).toMatch(/type must be one of/);
  });

  it("drops anything outside the schema rather than storing it", () => {
    const [a] = ok(one({
      escalation_rule: "Call the doctor if systolic is under 90",
      diagnosis: "Left MCA infarct",
    }));
    expect(a).not.toHaveProperty("escalation_rule");
    expect(a).not.toHaveProperty("diagnosis");
    expect(Object.keys(toStoredActivity(a))).not.toContain("escalation_rule");
  });

  it("requires every activity to declare its basis", () => {
    expect(errorsOf(one({ basis: undefined }))[0]).toMatch(/basis must be one of/);
    expect(errorsOf(one({ basis: "clinician_hunch" }))[0]).toMatch(/basis must be one of/);
  });

  it("refuses a duplicate activity key", () => {
    const errors = errorsOf([...one(), ...one()]);
    expect(errors.join(" ")).toMatch(/used more than once/);
  });

  it("refuses a key that is not a stable machine key", () => {
    expect(errorsOf(one({ key: "Morning Meds" }))[0]).toMatch(/lower-case letters/);
  });
});

describe("schedules", () => {
  it("reads only HH:MM and never guesses another format", () => {
    expect(parseClockTime("09:00")).toBe("09:00");
    expect(parseClockTime("9:05")).toBe("09:05");
    expect(parseClockTime("23:59")).toBe("23:59");
    expect(parseClockTime("9 AM")).toBeNull();
    expect(parseClockTime("morning")).toBeNull();
    expect(parseClockTime("25:00")).toBeNull();
  });

  it("refuses a clock schedule with no readable time", () => {
    expect(errorsOf(one({ schedule: { kind: "clock", times: ["breakfast"] } }))[0])
      .toMatch(/must list at least one "HH:MM" time/);
  });

  it("treats an on-demand activity as a quick record with no times", () => {
    const [a] = ok(one({ schedule: { kind: "on_demand" } }));
    expect(a.schedule?.times).toEqual([]);
    expect(isQuickRecord(a)).toBe(true);
  });

  it("treats a null schedule as a quick record", () => {
    const [a] = ok(one({ schedule: null }));
    expect(a.schedule).toBeNull();
    expect(isQuickRecord(a)).toBe(true);
  });

  it("normalises all seven weekdays back to 'all'", () => {
    const [a] = ok(one({ schedule: { kind: "clock", times: ["09:00"], days: [1, 2, 3, 4, 5, 6, 7] } }));
    expect(a.schedule?.days).toBe("all");
  });

  it("refuses a through_day that ends before it starts", () => {
    expect(errorsOf(one({ schedule: { kind: "clock", times: ["09:00"], from_day: 10, through_day: 3 } }))[0])
      .toMatch(/cannot be before from_day/);
  });

  it("survives a round trip through the stored form", () => {
    const [a] = ok(NEURO_ACTIVITIES.filter((x) => x.key === "physiotherapy"));
    const [b] = ok([toStoredActivity(a)]);
    expect(b).toEqual(a);
  });
});

describe("fields", () => {
  it("requires a scale to state its own range", () => {
    expect(errorsOf(one({
      input_schema: [{ key: "pain", label: "Pain", type: "scale", required: true }],
    }))[0]).toMatch(/must state min and max/);
  });

  it("requires a choice to offer at least two options", () => {
    expect(errorsOf(one({
      input_schema: [{ key: "x", label: "X", type: "choice", required: true, options: ["Only one"] }],
    }))[0]).toMatch(/at least two choices/);
  });

  it("refuses a duplicate field key within one activity", () => {
    const errors = errorsOf(one({
      input_schema: [
        { key: "note", label: "Note", type: "text", required: false },
        { key: "note", label: "Another note", type: "text", required: false },
      ],
    }));
    expect(errors.join(" ")).toMatch(/used more than once/);
  });
});

describe("display groups", () => {
  it("places an hour in the same group the database would", () => {
    expect(displayGroupForHour(6)).toBe("morning");
    expect(displayGroupForHour(11)).toBe("morning");
    expect(displayGroupForHour(12)).toBe("afternoon");
    expect(displayGroupForHour(16)).toBe("afternoon");
    expect(displayGroupForHour(17)).toBe("evening");
    expect(displayGroupForHour(20)).toBe("evening");
    expect(displayGroupForHour(21)).toBe("night");
    expect(displayGroupForHour(3)).toBe("night");
  });
});

/* ==========================================================================
 * THE UNIVERSALITY CHECK.
 *
 * Neuro and Lactation are entirely different care. If either needs anything the
 * other does not — a type, a field type, a schedule shape — the abstraction has
 * failed and the fix belongs in the abstraction, not in a specialty branch.
 * ======================================================================== */
describe("universality", () => {
  it("validates the Neuro reference configuration", () => {
    expect(ok(NEURO_ACTIVITIES)).toHaveLength(NEURO_ACTIVITIES.length);
  });

  it("validates the Lactation configuration", () => {
    expect(ok(LACTATION_ACTIVITIES)).toHaveLength(LACTATION_ACTIVITIES.length);
  });

  it("expresses both specialties using only the eight declared types", () => {
    for (const set of [NEURO_ACTIVITIES, LACTATION_ACTIVITIES]) {
      for (const a of ok(set)) {
        expect(ACTIVITY_TYPES).toContain(a.activityType);
      }
    }
  });

  it("needs no type that is private to one specialty", () => {
    const neuro = new Set(ok(NEURO_ACTIVITIES).map((a) => a.activityType));
    const lactation = new Set(ok(LACTATION_ACTIVITIES).map((a) => a.activityType));
    for (const t of lactation) expect(ACTIVITY_TYPES).toContain(t);
    for (const t of neuro) expect(ACTIVITY_TYPES).toContain(t);
    // Each genuinely exercises most of the vocabulary, so this is a real test
    // rather than two configurations that happen to be trivially similar.
    expect(neuro.size).toBeGreaterThanOrEqual(6);
    expect(lactation.size).toBeGreaterThanOrEqual(5);
  });

  it("covers the Neuro reference clinical areas the brief names", () => {
    const domains = new Set(ok(NEURO_ACTIVITIES).map((a) => a.domain));
    for (const d of [
      "medication", "vitals", "positioning", "physiotherapy", "occupational_therapy",
      "swallow", "nutrition", "oral_care", "device_care", "skin", "pain", "elimination",
    ]) {
      expect(domains).toContain(d);
    }
  });

  it("names quick records that exist in the programme they belong to", () => {
    const neuroKeys = new Set(ok(NEURO_ACTIVITIES).map((a) => a.key));
    for (const k of NEURO_QUICK_RECORDS) expect(neuroKeys).toContain(k);
    const lactationKeys = new Set(ok(LACTATION_ACTIVITIES).map((a) => a.key));
    for (const k of LACTATION_QUICK_RECORDS) expect(lactationKeys).toContain(k);
  });

  it("gives each specialty its own quick records without changing the model", () => {
    expect(NEURO_QUICK_RECORDS).not.toEqual(LACTATION_QUICK_RECORDS);
    expect(NEURO_QUICK_RECORDS).toContain("swallow_observation");
    expect(LACTATION_QUICK_RECORDS).toContain("nappy");
  });
});

/* ==========================================================================
 * MEDICATION INTEGRITY.
 *
 * A dose activity schedules WHEN medicines are given. It never says WHICH or
 * HOW MUCH — those come from the medication record a clinician maintains.
 * The compiler is told this; this is what enforces it.
 * ======================================================================== */
describe("medication integrity", () => {
  const dose = (patch: Record<string, unknown>) => ok(one({ activity_type: "dose", ...patch }));

  it("accepts a dose activity that schedules a time and nothing more", () => {
    expect(findMedicationSpecifics(dose({
      title: "Morning medicines",
      instructions: "Give with water, after breakfast. Sit upright for 30 minutes afterwards.",
    }))).toEqual([]);
  });

  it("passes the Neuro and Lactation programmes as configured", () => {
    expect(findMedicationSpecifics(ok(NEURO_ACTIVITIES))).toEqual([]);
    expect(findMedicationSpecifics(ok(LACTATION_ACTIVITIES))).toEqual([]);
  });

  it("refuses a stated amount in the title", () => {
    const found = findMedicationSpecifics(dose({ title: "Aspirin 75 mg" }));
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ field: "title", found: "75 mg" });
  });

  it("refuses a stated amount in the instructions, in any of its usual units", () => {
    for (const amount of ["500 mg", "5 ml", "2 tablets", "1 capsule", "10 units", "40 mcg", "2 puffs"]) {
      const found = findMedicationSpecifics(dose({ instructions: `Give ${amount} after food.` }));
      expect(found, amount).toHaveLength(1);
      expect(found[0].field).toBe("instructions");
    }
  });

  it("refuses the same claim written as a dosing pattern", () => {
    expect(findMedicationSpecifics(dose({ instructions: "Give 1-0-1 after food." })).length).toBe(1);
    expect(findMedicationSpecifics(dose({ instructions: "Half tablet: 1/2 tab at night." })).length).toBe(1);
  });

  it("refuses an amount hidden in a field label or option", () => {
    const found = findMedicationSpecifics(dose({
      input_schema: [
        { key: "status", label: "Did you give both 500 mg tablets", type: "choice", required: true,
          options: ["Given", "Skipped"] },
      ],
    }));
    expect(found).toHaveLength(1);
    expect(found[0].field).toBe("input_schema");
  });

  it("leaves every other activity type alone — an amount is the point of them", () => {
    // A feed of 200 mL and a 10-minute exercise are measurements of care given,
    // not prescriptions. Only `dose` is constrained.
    expect(findMedicationSpecifics(ok(one({
      activity_type: "intake", title: "Feed", instructions: "Give 200 ml slowly.",
      input_schema: [{ key: "amount", label: "Amount", type: "number", required: false }],
    })))).toEqual([]);
    expect(findMedicationSpecifics(ok(one({
      activity_type: "exercise", title: "Walking", instructions: "10 units of effort, 5 mg is not a thing here.",
    })))).toEqual([]);
  });

  it("does not guess at drug names, and says so by letting one through", () => {
    // Deliberate: matching names would fail open on the first unfamiliar drug.
    // Removing every stated AMOUNT removes what makes an invented instruction
    // actionable, which is the property that matters.
    expect(findMedicationSpecifics(dose({ title: "Aspirin" }))).toEqual([]);
  });
});

describe("the link to verified medication records", () => {
  it("carries medication ids on a dose activity, and only ids", () => {
    const [a] = ok(one({ activity_type: "dose", medication_ids: ["med-1", "med-2"] }));
    expect(a.medicationIds).toEqual(["med-1", "med-2"]);
    // Ids reference the one medication store. Nothing about the drug itself is
    // copied into the programme.
    expect(JSON.stringify(a)).not.toMatch(/mg|tablet/i);
  });

  it("drops medication references from anything that is not a dose", () => {
    const [a] = ok(one({
      activity_type: "task", title: "Reposition", medication_ids: ["med-1"],
    }));
    expect(a.medicationIds).toEqual([]);
  });

  it("defaults to no link, which the patient app reports rather than guessing", () => {
    const [a] = ok(one({ activity_type: "dose" }));
    expect(a.medicationIds).toEqual([]);
  });

  it("survives the round trip through the stored form", () => {
    const [a] = ok(one({ activity_type: "dose", medication_ids: ["med-1"] }));
    const [b] = ok([toStoredActivity(a)]);
    expect(b.medicationIds).toEqual(["med-1"]);
  });
});
