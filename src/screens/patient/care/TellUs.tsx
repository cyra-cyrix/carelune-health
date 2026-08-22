/*
 * The centre "+" — "Something happened. Tell us."
 *
 * This is the primary care-capture action, not a chat. It opens onto three
 * routes into the SAME activity engine:
 *
 *   Speak / Type    say it in words; what you said is structured into one of
 *                   this programme's own activities and shown back for you to
 *                   confirm or edit before anything is recorded.
 *   Quick record    the handful of activities this programme configures, most
 *                   useful first, the rest behind "More".
 *   Something else  words, kept as words, when nothing fits.
 *
 * Every route ends in the ordinary recorder for that activity type — a
 * measurement opens the same numeric fields the scheduled one does, a symptom
 * the same scale. There is no second set of forms, and nothing here is
 * specialty-aware: the programme decides what is offered.
 */
import { useState } from "react";
import type { CareActivity, QuickRecord } from "../../../domain/careActivityModel";
import { structureCareNote, type StructuredNote } from "../../../lib/db";
import { ActivityRecorder, CareIcon, SectionLabel, Sheet, type RecordSubmission } from "./careKit";
import MedicineSheet from "./MedicineSheet";

/** How many quick actions are shown before "More". */
const QUICK_VISIBLE = 6;

export default function TellUsSheet({
  quickRecords, patientId, subscriptionId, onClose, onRecord, onRecordMedicines, onMessage,
}: {
  quickRecords: QuickRecord[];
  patientId: string;
  subscriptionId: string;
  onClose: () => void;
  onRecord: (a: CareActivity, s: RecordSubmission) => Promise<void>;
  onRecordMedicines: (a: CareActivity, d: { name: string; status: string }[]) => Promise<void>;
  onMessage: () => void;
}) {
  const [chosen, setChosen] = useState<CareActivity | null>(null);
  const [words, setWords] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* The programme's own free-text activity, if it configures one: a single
     required text field. That is what "Something else" records into. */
  const openTextActivity = quickRecords
    .map((q) => q.activity)
    .find(
      (a) => a.inputSchema.length === 1 && a.inputSchema[0].type === "text" && a.inputSchema[0].required,
    );

  /* ---- one chosen activity, recorded through the ordinary recorder ---- */
  if (chosen) {
    return (
      <Sheet title={chosen.title} onClose={onClose}>
        {chosen.activityType === "dose" ? (
          <MedicineSheet
            activity={chosen}
            patientId={patientId}
            onClose={() => setChosen(null)}
            onRecorded={(detail) => onRecordMedicines(chosen, detail)}
          />
        ) : (
          <ActivityRecorder
            activity={chosen}
            busy={busy}
            error={error}
            onCancel={() => { setChosen(null); setError(null); }}
            onSubmit={async (s) => {
              setBusy(true); setError(null);
              try { await onRecord(chosen, s); }
              catch (e) { setError(e instanceof Error ? e.message : "Could not save that."); }
              finally { setBusy(false); }
            }}
          />
        )}
      </Sheet>
    );
  }

  /* ---- words: spoken or typed ---- */
  if (words !== null) {
    return (
      <Sheet title="Tell us what happened" onClose={onClose}>
        <WordsEntry
          initial={words}
          subscriptionId={subscriptionId}
          quickRecords={quickRecords}
          openTextActivity={openTextActivity ?? null}
          onPick={(a) => { setWords(null); setChosen(a); }}
          onCancel={() => setWords(null)}
          onMessage={onMessage}
          onRecord={onRecord}
        />
      </Sheet>
    );
  }

  const visible = showAll ? quickRecords : quickRecords.slice(0, QUICK_VISIBLE);
  const hidden = quickRecords.length - visible.length;

  return (
    <Sheet title="What would you like to tell us?" onClose={onClose}>
      <div className="mt-4 grid grid-cols-2 gap-2.5">
        <SpeakButton onText={(t) => setWords(t)} />
        <button
          type="button"
          onClick={() => setWords("")}
          className="tap flex min-h-[88px] flex-col items-center justify-center gap-1.5 rounded-2xl bg-mist text-[14.5px] font-semibold text-ink ring-1 ring-ink/10 hover:bg-mist-100"
        >
          <CareIcon.Pencil />
          Type
        </button>
      </div>

      {quickRecords.length > 0 && (
        <>
          <div className="mt-7"><SectionLabel>Quick record</SectionLabel></div>
          <div className="mt-2 flex flex-wrap gap-2">
            {visible.map((q) => (
              <button
                key={q.activity.key}
                type="button"
                onClick={() => setChosen(q.activity)}
                className="tap min-h-[46px] rounded-xl bg-white px-4 text-[15px] font-medium text-ink ring-1 ring-ink/10 hover:bg-mist-100"
              >
                {q.label}
              </button>
            ))}
            {hidden > 0 && (
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="tap min-h-[46px] rounded-xl bg-mist px-4 text-[15px] font-semibold text-sage-600 ring-1 ring-ink/10 hover:bg-mist-100"
              >
                More ({hidden})
              </button>
            )}
          </div>
        </>
      )}

      <button
        type="button"
        onClick={() => setWords("")}
        className="tap mt-6 w-full rounded-2xl bg-mist-100 py-3.5 text-[15px] font-semibold text-ink hover:bg-mist-200"
      >
        Something else
      </button>
      <button
        type="button"
        onClick={onMessage}
        className="tap mt-2.5 w-full py-2 text-[14px] font-semibold text-sky-700"
      >
        Message your care team instead
      </button>
    </Sheet>
  );
}

/* ------------------------------ words -> record ---------------------------- */

/**
 * What someone said, turned into a candidate they confirm.
 *
 * The structuring proposes: which of THIS patient's activities it belongs to,
 * the values it could read, and roughly when it happened. Nothing is saved
 * until the person has seen that candidate and confirmed it, because a
 * misheard sentence becoming a clinical record silently is the failure worth
 * preventing. It never diagnoses — it can only fill in fields the programme
 * already defines.
 */
function WordsEntry({
  initial, subscriptionId, quickRecords, openTextActivity, onPick, onCancel, onMessage, onRecord,
}: {
  initial: string;
  subscriptionId: string;
  quickRecords: QuickRecord[];
  openTextActivity: CareActivity | null;
  onPick: (a: CareActivity) => void;
  onCancel: () => void;
  onMessage: () => void;
  onRecord: (a: CareActivity, s: RecordSubmission) => Promise<void>;
}) {
  const [text, setText] = useState(initial);
  const [candidate, setCandidate] = useState<StructuredNote | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const candidateActivity = candidate
    ? quickRecords.find((q) => q.activity.key === candidate.activity_key)?.activity ?? null
    : null;

  const saveAsWords = async () => {
    if (!openTextActivity) {
      setError("This programme has no free-text record. You can message your care team instead.");
      return;
    }
    await onRecord(openTextActivity, {
      payload: { [openTextActivity.inputSchema[0].key]: text.trim() },
      outcome: "recorded",
      note: null,
      occurredAt: null,
    });
  };

  const structure = async () => {
    setBusy(true); setError(null);
    try {
      const result = await structureCareNote(subscriptionId, text.trim());
      if (result?.activity_key) setCandidate(result);
      else await saveAsWords();
    } catch {
      // Structuring is a convenience, never a gate. If it is unavailable the
      // words are still kept.
      await saveAsWords();
    } finally {
      setBusy(false);
    }
  };

  /* ---- the structured candidate, for confirmation ---- */
  if (candidate && candidateActivity) {
    return (
      <div className="pb-2">
        <p className="mt-1 text-[13.5px] text-sage-600">Is this right?</p>
        <div className="mt-3 rounded-2xl bg-sky-50 p-4 ring-1 ring-sky-500/25">
          <p className="font-display text-[18px] font-semibold text-ink">{candidateActivity.title}</p>
          <ul className="mt-2 space-y-1">
            {candidate.summary.map((line, i) => (
              <li key={i} className="text-[15px] text-ink">{line}</li>
            ))}
          </ul>
          {candidate.occurred_label && (
            <p className="mt-2 text-[13.5px] text-sage-600">{candidate.occurred_label}</p>
          )}
        </div>
        <p className="mt-3 text-[12.5px] leading-relaxed text-sage-500">
          Your own words are kept with the entry either way.
        </p>

        {error && <p className="mt-3 text-[13.5px] text-coral-600">{error}</p>}

        <div className="mt-5 flex gap-2.5">
          <button
            type="button"
            onClick={() => onPick(candidateActivity)}
            className="tap min-h-[50px] flex-1 rounded-2xl bg-mist-100 text-[15px] font-semibold text-ink hover:bg-mist-200"
          >
            Edit
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true); setError(null);
              try {
                await onRecord(candidateActivity, {
                  payload: candidate.values,
                  outcome: "recorded",
                  note: text.trim() || null,
                  occurredAt: candidate.occurred_at ? new Date(candidate.occurred_at) : null,
                });
              } catch (e) {
                setError(e instanceof Error ? e.message : "Could not save that.");
              } finally { setBusy(false); }
            }}
            className="tap min-h-[50px] flex-[1.6] rounded-2xl bg-ink text-[15px] font-semibold text-white disabled:opacity-40"
          >
            {busy ? "Saving…" : "Confirm"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-2">
      <textarea
        rows={5}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="In your own words — for example, “She vomited twice after lunch.”"
        className="mt-3 w-full rounded-xl bg-mist px-3.5 py-3 text-[16px] text-ink ring-1 ring-ink/10 placeholder:text-sage-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
      />

      {error && <p className="mt-3 text-[13.5px] text-coral-600">{error}</p>}
      {!openTextActivity && (
        <button
          type="button"
          onClick={onMessage}
          className="tap mt-3 w-full py-2 text-[14px] font-semibold text-sky-700"
        >
          Message your care team instead
        </button>
      )}

      <div className="mt-5 flex gap-2.5">
        <button
          type="button"
          onClick={onCancel}
          className="tap min-h-[50px] flex-1 rounded-2xl bg-mist-100 text-[15px] font-semibold text-ink hover:bg-mist-200"
        >
          Back
        </button>
        <button
          type="button"
          disabled={busy || text.trim().length === 0}
          onClick={() => void structure()}
          className="tap min-h-[50px] flex-[1.6] rounded-2xl bg-ink text-[15px] font-semibold text-white disabled:opacity-40"
        >
          {busy ? "Reading…" : "Continue"}
        </button>
      </div>
    </div>
  );
}

/**
 * Speech, where the browser offers it.
 *
 * The transcript is never saved directly — it lands in the text box for the
 * person to read and correct first. Where the browser has no speech recognition
 * this says so plainly rather than pretending to listen.
 */
function SpeakButton({ onText }: { onText: (t: string) => void }) {
  const [listening, setListening] = useState(false);
  const [unsupported, setUnsupported] = useState(false);

  const start = () => {
    const w = window as unknown as Record<string, unknown>;
    const Ctor = (w.SpeechRecognition ?? w.webkitSpeechRecognition) as
      | (new () => {
          lang: string;
          interimResults: boolean;
          maxAlternatives: number;
          onresult: (e: { results: Array<Array<{ transcript: string }>> }) => void;
          onerror: () => void;
          onend: () => void;
          start: () => void;
        })
      | undefined;
    if (!Ctor) { setUnsupported(true); return; }
    const rec = new Ctor();
    rec.lang = navigator.language || "en-IN";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => onText(e.results[0]?.[0]?.transcript ?? "");
    rec.onerror = () => { setListening(false); setUnsupported(true); };
    rec.onend = () => setListening(false);
    setListening(true);
    rec.start();
  };

  return (
    <button
      type="button"
      onClick={start}
      disabled={listening}
      className="tap flex min-h-[88px] flex-col items-center justify-center gap-1.5 rounded-2xl bg-mist text-[14.5px] font-semibold text-ink ring-1 ring-ink/10 hover:bg-mist-100 disabled:opacity-60"
    >
      <CareIcon.Mic />
      {listening ? "Listening…" : unsupported ? "Not available" : "Speak"}
    </button>
  );
}
