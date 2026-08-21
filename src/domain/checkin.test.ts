import { describe, expect, it } from "vitest";
import { answerText, checkinExpectedOn, deriveInputType, isAnswered, toCheckinQuestions } from "./checkin";
import { LACTATION_ENROLMENT, SPINE_ENROLMENT } from "./enrolment.fixtures";
import { buildProgrammeExperience } from "./programmeExperience";

const questionsFor = (sub: typeof SPINE_ENROLMENT) => {
  const r = buildProgrammeExperience(sub, new Date("2026-08-21T09:00:00Z"));
  if (!r.ok) throw new Error("fixture should build");
  return toCheckinQuestions(r.experience.patientQuestions);
};

describe("deriving how a question is answered", () => {
  it("takes yes or no for a question shaped that way", () => {
    expect(deriveInputType("Did you complete your exercises?")).toBe("yes_no");
    expect(deriveInputType("Is the latch comfortable?")).toBe("yes_no");
    expect(deriveInputType("Any new numbness or weakness?")).toBe("yes_no");
  });

  it("offers a scale only where the question asks to rate something", () => {
    expect(deriveInputType("How would you rate your pain today?")).toBe("scale");
    expect(deriveInputType("Rate the severity of your headache")).toBe("scale");
    expect(deriveInputType("Pain score out of 10?")).toBe("scale");
  });

  it("does not turn a count or a frequency into a clinical scale", () => {
    // A count is a fact, not a severity — and it is not capped at ten.
    expect(deriveInputType("How many feeds did your baby have?")).toBe("text");
    expect(deriveInputType("How much rest did you manage?")).toBe("text");
    expect(deriveInputType("How often did you walk today?")).toBe("text");
  });

  it("falls back to words, which can express anything", () => {
    expect(deriveInputType("How does the wound look today?")).toBe("text");
    expect(deriveInputType("How did feeding go today?")).toBe("text");
  });

  it("uses the same rules for both services, and keys them by position", () => {
    const spine = questionsFor(SPINE_ENROLMENT);
    const lact = questionsFor(LACTATION_ENROLMENT);
    expect(spine.map((q) => q.key)).toEqual(["q1", "q2", "q3", "q4", "q5"]);
    expect(lact.map((q) => q.key)).toEqual(["q1", "q2", "q3", "q4", "q5"]);
    expect(spine[0].label).toBe("How is your back or leg pain today?");
    expect(lact[0].label).toBe("How did feeding go today?");
  });
});

describe("whether a check-in is expected today", () => {
  const monday = new Date(2026, 7, 17);
  const tuesday = new Date(2026, 7, 18);
  const saturday = new Date(2026, 7, 22);

  it("expects one every day when the cadence is daily", () => {
    expect(checkinExpectedOn("Daily", monday)).toBe(true);
    expect(checkinExpectedOn("Daily", saturday)).toBe(true);
  });

  it("reads the cadences the engine writes", () => {
    expect(checkinExpectedOn("Five times a week", tuesday)).toBe(true);
    expect(checkinExpectedOn("Five times a week", saturday)).toBe(false);
    expect(checkinExpectedOn("Three times a week", monday)).toBe(true);
    expect(checkinExpectedOn("Three times a week", tuesday)).toBe(false);
    expect(checkinExpectedOn("Weekly", monday)).toBe(true);
    expect(checkinExpectedOn("Weekly", tuesday)).toBe(false);
  });

  it("takes the more frequent reading of a compound cadence", () => {
    expect(checkinExpectedOn("Daily for two weeks, then three times a week", saturday)).toBe(true);
  });

  it("offers the check-in rather than hiding it when the cadence is unreadable", () => {
    expect(checkinExpectedOn("When it feels useful", saturday)).toBe(true);
    expect(checkinExpectedOn("", saturday)).toBe(true);
    expect(checkinExpectedOn(null, saturday)).toBe(true);
  });
});

describe("answers", () => {
  it("knows when one is complete", () => {
    expect(isAnswered({ label: "x", type: "yes_no", boolean: false })).toBe(true);
    expect(isAnswered({ label: "x", type: "yes_no" })).toBe(false);
    expect(isAnswered({ label: "x", type: "scale", number: 0 })).toBe(true);
    expect(isAnswered({ label: "x", type: "text", text: "  " })).toBe(false);
    expect(isAnswered(undefined)).toBe(false);
  });

  it("reads back the way the patient answered", () => {
    expect(answerText({ label: "x", type: "yes_no", boolean: true })).toBe("Yes");
    expect(answerText({ label: "x", type: "scale", number: 3 })).toBe("3");
    expect(answerText({ label: "x", type: "text", text: "Sore this morning" })).toBe("Sore this morning");
  });
});
