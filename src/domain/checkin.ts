/*
 * How a configured question becomes something a patient can answer.
 *
 * The frozen programme stores questions as wording and a reason — no type, no
 * id. Rather than ask a model what kind of answer each one wants every time the
 * page opens, this derives a conservative presentation type from the SHAPE of
 * the sentence, in one place, for every service alike. "Did you…" takes yes or
 * no; "How would you rate…" takes a scale; anything else takes words, which is
 * always safe because words can express any answer.
 *
 * There is no specialty here, and there must never be: the same rules read a
 * spine question and a feeding question.
 */
import type { PatientQuestion } from "./programmeExperience";

export type CheckinInputType = "yes_no" | "scale" | "text";

export type CheckinQuestion = {
  /** Stable within the frozen programme: its position, matching the server. */
  key: string;
  label: string;
  reason: string;
  type: CheckinInputType;
};

/** One answer, ready for the server. The label is what the patient was shown. */
export type DraftAnswer = {
  label: string;
  type: CheckinInputType;
  text?: string;
  number?: number;
  boolean?: boolean;
};

const YES_NO = /^(are|is|was|were|do|does|did|have|has|had|can|could|any|anything)\b/i;
/*
 * A 0–10 scale is only offered where the question EXPLICITLY asks to rate
 * something. "How many feeds did your baby have?" is a count, not a severity —
 * putting it on a 0–10 rating strip silently turns a factual number into
 * something that reads like a clinical score, and caps it at ten. Counts and
 * frequencies take words until the engine stores an explicit numeric type.
 */
const SCALE = /\b(rate|rating|severity|score|on a scale|out of 10)\b/i;

/** The presentation type for one question. Text is the safe default. */
export function deriveInputType(label: string): CheckinInputType {
  const s = label.trim();
  if (SCALE.test(s)) return "scale";
  if (YES_NO.test(s)) return "yes_no";
  return "text";
}

/** The frozen questions, ready to render. Order is the server's key order. */
export function toCheckinQuestions(questions: PatientQuestion[]): CheckinQuestion[] {
  return questions.map((q, i) => ({
    key: `q${i + 1}`,
    label: q.label,
    reason: q.reason,
    type: deriveInputType(q.label),
  }));
}

/**
 * Is a check-in expected today?
 *
 * A deliberately small reading of the cadences the engine actually writes. When
 * a frequency cannot be read confidently the answer is YES — a patient being
 * offered a check-in they did not strictly owe is harmless; silently hiding one
 * they did is not.
 */
export function checkinExpectedOn(frequency: string | null | undefined, date: Date): boolean {
  const s = (frequency ?? "").toLowerCase();
  if (!s) return true;
  const dow = date.getDay(); // 0 Sun … 6 Sat

  // "Daily for two weeks, then three times a week" — the more frequent wins.
  if (/\bdaily|every day\b/.test(s)) return true;
  if (/\bfive times|5 times\b/.test(s)) return dow >= 1 && dow <= 5;
  if (/\bfour times|4 times\b/.test(s)) return [1, 2, 4, 5].includes(dow);
  if (/\bthree times|3 times|thrice\b/.test(s)) return [1, 3, 5].includes(dow);
  if (/\btwice|two times|2 times\b/.test(s)) return [1, 4].includes(dow);
  if (/\bfortnight|every other week\b/.test(s)) return dow === 1;
  if (/\bweekly|once a week\b/.test(s)) return dow === 1;
  return true;
}

/** Has this question been answered enough to send? */
export function isAnswered(a: DraftAnswer | undefined): boolean {
  if (!a) return false;
  if (a.type === "yes_no") return typeof a.boolean === "boolean";
  if (a.type === "scale") return typeof a.number === "number";
  return !!a.text?.trim();
}

/** What the patient sees back for one answer. */
export function answerText(a: DraftAnswer): string {
  if (a.type === "yes_no") return a.boolean ? "Yes" : "No";
  if (a.type === "scale") return typeof a.number === "number" ? String(a.number) : "—";
  return a.text?.trim() || "—";
}
