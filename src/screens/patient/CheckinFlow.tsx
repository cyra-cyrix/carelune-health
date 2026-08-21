/*
 * Today's check-in — one question at a time.
 *
 * The questions are the ones frozen onto this patient's enrolment, and the
 * wording sent back is the wording they read. How each is answered comes from
 * `deriveInputType`, the one generic rule for every service: nothing here knows
 * whether it is asking about a wound or a feed.
 *
 * A failed submit keeps everything typed and offers another go — a patient who
 * has just answered five questions must never be asked to do it twice because
 * of a dropped connection.
 */
import { useState } from "react";
import type { CheckinQuestion, DraftAnswer } from "../../domain/checkin";
import { answerText, isAnswered, toCheckinQuestions } from "../../domain/checkin";
import type { ProgrammeExperience } from "../../domain/programmeExperience";
import { submitProgrammeCheckin, type CheckinSubmissionRow } from "../../lib/db";

export default function CheckinFlow({
  experience, subscriptionId, onClose, onSubmitted,
}: {
  experience: ProgrammeExperience;
  subscriptionId: string;
  onClose: () => void;
  onSubmitted: (submission: CheckinSubmissionRow, answered: number) => void;
}) {
  const questions = toCheckinQuestions(experience.patientQuestions);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, DraftAnswer>>({});
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onNote = step >= questions.length;
  const question = questions[step];
  const answered = Object.values(answers).filter(isAnswered);

  const set = (q: CheckinQuestion, patch: Partial<DraftAnswer>) =>
    setAnswers((prev) => ({ ...prev, [q.key]: { ...prev[q.key], label: q.label, type: q.type, ...patch } }));

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const submission = await submitProgrammeCheckin({
        subscriptionId,
        answers: answered,
        periodLabel: experience.currentPeriod?.label ?? null,
        note,
      });
      onSubmitted(submission, answered.length + (note.trim() ? 1 : 0));
    } catch (e) {
      // Everything the patient typed stays exactly where it is.
      setError(e instanceof Error ? e.message : "We couldn't send your check-in. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-mist">
      <header className="flex items-center justify-between gap-3 px-5 py-4">
        <div className="flex-1">
          <div className="flex gap-1.5" aria-hidden>
            {questions.map((q, i) => (
              <span key={q.key} className={`h-1 flex-1 rounded-full ${i <= step ? "bg-sky-500" : "bg-mist-200"}`} />
            ))}
            <span className={`h-1 flex-1 rounded-full ${onNote ? "bg-sky-500" : "bg-mist-200"}`} />
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label="Close check-in" className="tap -mr-2 px-2 text-[15px] font-semibold text-sage-500 hover:text-ink">
          Close
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-6 pb-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sage-400">
          {onNote ? "Last one" : `Question ${step + 1} of ${questions.length}`}
        </p>

        {onNote ? (
          <>
            <h2 className="mt-3 font-display text-[23px] font-semibold leading-snug tracking-tight text-ink">
              Anything else you&apos;d like your care team to know?
            </h2>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional"
              className="mt-5 min-h-[128px] w-full rounded-2xl bg-white px-4 py-3.5 text-[16px] leading-relaxed text-ink ring-1 ring-line placeholder:text-sage-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
            />
          </>
        ) : (
          <>
            <h2 className="mt-3 font-display text-[23px] font-semibold leading-snug tracking-tight text-ink">{question.label}</h2>
            <div className="mt-6">
              {question.type === "yes_no" && (
                <div className="flex gap-3">
                  {[true, false].map((v) => (
                    <button
                      key={String(v)}
                      type="button"
                      aria-pressed={answers[question.key]?.boolean === v}
                      onClick={() => set(question, { boolean: v })}
                      className={`tap flex-1 rounded-2xl px-4 py-4 text-[16px] font-semibold ring-1 transition-colors ${
                        answers[question.key]?.boolean === v
                          ? "bg-sky-600 text-white ring-sky-600"
                          : "bg-white text-ink ring-line hover:bg-mist-100"
                      }`}
                    >
                      {v ? "Yes" : "No"}
                    </button>
                  ))}
                </div>
              )}

              {question.type === "scale" && (
                <>
                  <div className="grid grid-cols-6 gap-2">
                    {Array.from({ length: 11 }, (_, n) => (
                      <button
                        key={n}
                        type="button"
                        aria-pressed={answers[question.key]?.number === n}
                        onClick={() => set(question, { number: n })}
                        className={`tap rounded-xl py-3 text-[15px] font-semibold ring-1 transition-colors ${
                          answers[question.key]?.number === n
                            ? "bg-sky-600 text-white ring-sky-600"
                            : "bg-white text-ink ring-line hover:bg-mist-100"
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                  <p className="mt-2.5 flex justify-between text-[12.5px] text-sage-500">
                    <span>None</span><span>As bad as it gets</span>
                  </p>
                </>
              )}

              {question.type === "text" && (
                <textarea
                  autoFocus
                  value={answers[question.key]?.text ?? ""}
                  onChange={(e) => set(question, { text: e.target.value })}
                  placeholder="In your own words"
                  className="min-h-[128px] w-full rounded-2xl bg-white px-4 py-3.5 text-[16px] leading-relaxed text-ink ring-1 ring-line placeholder:text-sage-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                />
              )}
            </div>
            {question.reason && <p className="mt-4 text-[13px] leading-relaxed text-sage-500">{question.reason}</p>}
          </>
        )}

        {error && (
          <div className="mt-6 rounded-2xl bg-coral-100 px-4 py-3.5 text-[14px] leading-relaxed text-coral-600" role="alert">
            {error}
            <span className="mt-1 block text-[13px] text-sage-600">Your answers are still here — try again when you&apos;re ready.</span>
          </div>
        )}
      </div>

      <footer className="border-t border-line/70 bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          {step > 0 && (
            <button type="button" onClick={() => setStep(step - 1)} className="tap rounded-2xl px-4 py-3.5 text-[15px] font-semibold text-sage-600 hover:text-ink">
              Back
            </button>
          )}
          {onNote ? (
            <button
              type="button"
              onClick={() => void submit()}
              disabled={busy || answered.length === 0}
              className="tap flex-1 rounded-2xl bg-brand-800 px-4 py-3.5 text-[16px] font-semibold text-white hover:bg-brand-900 disabled:opacity-50"
            >
              {busy ? "Sending…" : "Submit check-in"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setStep(step + 1)}
              className="tap flex-1 rounded-2xl bg-brand-800 px-4 py-3.5 text-[16px] font-semibold text-white hover:bg-brand-900"
            >
              {isAnswered(answers[question.key]) ? "Next" : "Skip"}
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}

/** What the patient submitted, read back. Never editable. */
export function SubmittedAnswers({
  answers, onClose,
}: { answers: { question_label_snapshot: string; text: string }[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-midnight-950/30 backdrop-blur-[2px]">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0" />
      <div role="dialog" aria-modal="true" aria-label="Your answers" className="relative max-h-[86vh] w-full max-w-[430px] overflow-y-auto rounded-t-3xl bg-white px-6 pb-8 pt-6">
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-mist-200" />
        <h2 className="font-display text-[21px] font-semibold tracking-tight text-ink">What you sent today</h2>
        <ol className="mt-6 space-y-5">
          {answers.map((a) => (
            <li key={a.question_label_snapshot}>
              <p className="text-[13.5px] leading-snug text-sage-500">{a.question_label_snapshot}</p>
              <p className="mt-1 text-[16px] leading-snug text-ink">{a.text}</p>
            </li>
          ))}
        </ol>
        <button type="button" onClick={onClose} className="tap mt-7 w-full rounded-2xl bg-mist-100 px-4 py-3.5 text-[15px] font-semibold text-ink">
          Close
        </button>
      </div>
    </div>
  );
}

/** Render one stored response the way the patient answered it. */
export function responseText(r: { response_type: string; value_text: string | null; value_number: number | null; value_boolean: boolean | null }): string {
  return answerText({
    label: "",
    type: r.response_type === "yes_no" ? "yes_no" : r.response_type === "scale" ? "scale" : "text",
    text: r.value_text ?? undefined,
    number: r.value_number ?? undefined,
    boolean: r.value_boolean ?? undefined,
  });
}
