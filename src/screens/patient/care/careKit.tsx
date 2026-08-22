/*
 * The shared pieces of the patient care shell.
 *
 * ONE recorder serves all eight activity types. It does not switch on a
 * specialty and it does not switch on a body system — it renders the fields the
 * activity's own `input_schema` declares, and asks for an outcome only where the
 * INTERACTION is a completion rather than a record. That single distinction is
 * the whole of the type-specific behaviour, which is why a neuro tube feed and a
 * breastfeed come out of the same component with different words.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { ActivityField, ActivityType, CareActivity } from "../../../domain/careActivityModel";
import { ACKNOWLEDGEMENT_COPY, type AcknowledgementState } from "../../../domain/careDay";

/* --------------------------------- icons ---------------------------------- */

const svg = (size: number, path: ReactNode) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{path}</svg>
);

type IP = { size?: number };

export const CareIcon = {
  Today: ({ size = 22 }: IP) => svg(size, <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>),
  Journey: ({ size = 22 }: IP) => svg(size, <><path d="M4 20V4M4 20h16" /><path d="M8 16v-4M12 16V8M16 16v-6" /></>),
  Plus: ({ size = 26 }: IP) => svg(size, <path d="M12 5v14M5 12h14" />),
  Connect: ({ size = 22 }: IP) => svg(size, <path d="M21 12a8 8 0 0 1-11.5 7.2L4 21l1.8-5.5A8 8 0 1 1 21 12Z" />),
  Plan: ({ size = 22 }: IP) => svg(size, <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></>),
  Check: ({ size = 18 }: IP) => svg(size, <path d="M20 6 9 17l-5-5" />),
  Alert: ({ size = 18 }: IP) => svg(size, <><circle cx="12" cy="12" r="9" /><path d="M12 8v4M12 16h.01" /></>),
  Mic: ({ size = 20 }: IP) => svg(size, <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></>),
  Pencil: ({ size = 20 }: IP) => svg(size, <path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3Z" />),
  Bolt: ({ size = 20 }: IP) => svg(size, <path d="M13 3 5 14h6l-1 7 8-11h-6l1-7Z" />),
  Chevron: ({ size = 18 }: IP) => svg(size, <path d="M9 5l7 7-7 7" />),
  Close: ({ size = 20 }: IP) => svg(size, <path d="M6 6l12 12M18 6 6 18" />),
};

/* --------------------------- small presentational -------------------------- */

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-sage-400">{children}</h2>
  );
}

/**
 * The acknowledgement a recorded entry carries.
 *
 * The state is decided by the system; this only renders it. Deliberately no
 * colour that could read as a clinical judgement — a recorded pain of 9 and a
 * recorded pain of 1 look identical here, because they are equally "recorded".
 */
export function AckChip({ state }: { state: AcknowledgementState }) {
  const quiet = state === "not_recorded";
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${
        quiet ? "bg-mist-100 text-sage-500" : "bg-good-100 text-good-700"
      }`}
    >
      {!quiet && <CareIcon.Check size={12} />}
      {ACKNOWLEDGEMENT_COPY[state]}
    </span>
  );
}

/** A bottom sheet. Escape closes; the scrim closes. */
export function Sheet({
  title, onClose, children,
}: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    ref.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-ink/30 backdrop-blur-[2px]"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[88vh] w-full max-w-[430px] overflow-y-auto rounded-t-3xl bg-white pb-8 shadow-lift outline-none"
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 bg-white/95 px-5 pb-3 pt-4 backdrop-blur">
          <h2 className="font-display text-[19px] font-semibold leading-snug tracking-tight text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="tap -mr-1 shrink-0 rounded-full p-1.5 text-sage-500 hover:bg-mist-100 hover:text-ink"
          >
            <CareIcon.Close />
          </button>
        </div>
        <div className="px-5">{children}</div>
      </div>
    </div>
  );
}

/* ------------------------------ field rendering ---------------------------- */

export type FieldValues = Record<string, unknown>;

const inputCls =
  "w-full rounded-xl bg-mist px-3.5 py-2.5 text-[16px] text-ink ring-1 ring-ink/10 " +
  "placeholder:text-sage-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500";

/** One field, drawn from its declared type. Nine types, no specialty anywhere. */
function Field({
  field, value, onChange,
}: { field: ActivityField; value: unknown; onChange: (v: unknown) => void }) {
  const id = `f-${field.key}`;

  if (field.type === "boolean") {
    return (
      <label htmlFor={id} className="flex items-center justify-between gap-3 py-1">
        <span className="text-[15px] text-ink">{field.label}</span>
        <input
          id={id}
          type="checkbox"
          checked={value === true}
          onChange={(e) => onChange(e.target.checked)}
          className="h-6 w-6 shrink-0 rounded-md border-line text-sky-600 focus-visible:ring-2 focus-visible:ring-sky-500"
        />
      </label>
    );
  }

  if (field.type === "choice" || field.type === "multi_choice") {
    const multi = field.type === "multi_choice";
    const selected: string[] = multi
      ? Array.isArray(value) ? (value as string[]) : []
      : typeof value === "string" ? [value] : [];
    return (
      <fieldset>
        <legend className="mb-2 text-[13px] font-medium text-sage-600">{field.label}</legend>
        <div className="flex flex-wrap gap-2">
          {(field.options ?? []).map((o) => {
            const on = selected.includes(o);
            return (
              <button
                key={o}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  onChange(
                    multi
                      ? on ? selected.filter((s) => s !== o) : [...selected, o]
                      : on ? null : o,
                  )
                }
                className={`tap min-h-[44px] rounded-xl px-3.5 py-2 text-[15px] font-medium transition-colors ${
                  on ? "bg-ink text-white" : "bg-mist text-ink ring-1 ring-ink/10 hover:bg-mist-100"
                }`}
              >
                {o}
              </button>
            );
          })}
        </div>
      </fieldset>
    );
  }

  if (field.type === "scale") {
    const min = field.min ?? 0;
    const max = field.max ?? 10;
    const steps = Array.from({ length: max - min + 1 }, (_, i) => min + i);
    return (
      <fieldset>
        <legend className="mb-2 text-[13px] font-medium text-sage-600">{field.label}</legend>
        <div className="flex flex-wrap gap-1.5">
          {steps.map((n) => {
            const on = value === n;
            return (
              <button
                key={n}
                type="button"
                aria-pressed={on}
                onClick={() => onChange(on ? null : n)}
                className={`tap h-11 min-w-[2.5rem] flex-1 rounded-lg text-[15px] font-semibold tabular-nums transition-colors ${
                  on ? "bg-ink text-white" : "bg-mist text-ink ring-1 ring-ink/10 hover:bg-mist-100"
                }`}
              >
                {n}
              </button>
            );
          })}
        </div>
        {(field.lowLabel || field.highLabel) && (
          <div className="mt-1.5 flex justify-between text-[11.5px] text-sage-500">
            <span>{field.lowLabel}</span>
            <span>{field.highLabel}</span>
          </div>
        )}
      </fieldset>
    );
  }

  if (field.type === "text") {
    return (
      <div>
        <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium text-sage-600">{field.label}</label>
        <textarea
          id={id}
          rows={3}
          value={typeof value === "string" ? value : ""}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={inputCls}
        />
      </div>
    );
  }

  // number | integer | duration | time
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium text-sage-600">
        {field.label}{field.unit ? ` (${field.unit})` : ""}
      </label>
      <input
        id={id}
        type={field.type === "time" ? "time" : "number"}
        inputMode={field.type === "time" ? undefined : "decimal"}
        step={field.type === "integer" ? 1 : "any"}
        min={field.min}
        max={field.max}
        value={value === null || value === undefined ? "" : String(value)}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === "") return onChange(null);
          onChange(field.type === "time" ? raw : Number(raw));
        }}
        className={inputCls}
      />
    </div>
  );
}

/* ------------------------------- the recorder ------------------------------ */

/**
 * Which interactions are a COMPLETION (something was meant to be done, and the
 * answer is whether it was) and which are a RECORD (something happened, and the
 * answer is what). This is the only place activity type changes behaviour, and
 * it is a statement about interaction — not about a specialty or a body system.
 */
const COMPLETION_TYPES = new Set<ActivityType>(["dose", "task", "exercise", "education"]);

export type RecordOutcome = "done" | "partial" | "unable" | "skipped" | "recorded";

const COMPLETION_CHOICES: { key: RecordOutcome; label: string }[] = [
  { key: "done", label: "Done" },
  { key: "partial", label: "Partly" },
  { key: "unable", label: "Couldn't" },
];

export type RecordSubmission = {
  payload: FieldValues;
  outcome: RecordOutcome;
  note: string | null;
  occurredAt: Date | null;
};

/**
 * Record one activity.
 *
 * `occurredAt` is offered because when something HAPPENED and when it was typed
 * in are different facts, and a caregiver at 22:00 recording the 18:00 feed
 * should be able to say so.
 */
export function ActivityRecorder({
  activity, submitLabel, onCancel, onSubmit, busy, error,
}: {
  activity: CareActivity;
  submitLabel?: string;
  onCancel: () => void;
  onSubmit: (s: RecordSubmission) => void;
  busy?: boolean;
  error?: string | null;
}) {
  const isCompletion = COMPLETION_TYPES.has(activity.activityType);
  const [values, setValues] = useState<FieldValues>({});
  const [outcome, setOutcome] = useState<RecordOutcome>(isCompletion ? "done" : "recorded");
  const [when, setWhen] = useState<string>("");

  // A `note` field is offered by many activities; when one exists it becomes the
  // event's note rather than an ordinary payload value, so the care team reads
  // it in the same place for every activity.
  const noteField = activity.inputSchema.find((f) => f.key === "note");
  const fields = useMemo(
    () =>
      activity.inputSchema.filter(
        (f) =>
          f.key !== "note" &&
          // For a completion interaction the outcome row above IS the outcome.
          // A configuration that also declares an `outcome`/`status` field would
          // otherwise show two controls for one decision, and leave a required
          // field the person has no reason to fill in.
          !(isCompletion && (f.key === "outcome" || f.key === "status")),
      ),
    [activity.inputSchema, isCompletion],
  );

  const missing = fields.filter(
    (f) => f.required && (values[f.key] === undefined || values[f.key] === null || values[f.key] === ""),
  );
  // "Couldn't" means it did not happen, so the fields describing what happened
  // are no longer required — insisting on them would be asking for fiction.
  const blocked = outcome === "unable" ? [] : missing;

  return (
    <>
      {activity.instructions && (
        <p className="mt-1 text-[15px] leading-relaxed text-sage-600">{activity.instructions}</p>
      )}

      {isCompletion && (
        <div className="mt-5">
          <SectionLabel>
            {activity.activityType === "education" ? "When you have read it" : "What happened"}
          </SectionLabel>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {COMPLETION_CHOICES.map((c) => {
              const on = outcome === c.key;
              return (
                <button
                  key={c.key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setOutcome(c.key)}
                  className={`tap min-h-[48px] rounded-xl text-[15px] font-semibold transition-colors ${
                    on ? "bg-ink text-white" : "bg-mist text-ink ring-1 ring-ink/10 hover:bg-mist-100"
                  }`}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {fields.length > 0 && outcome !== "unable" && (
        <div className="mt-6 space-y-5">
          {fields.map((f) => (
            <Field
              key={f.key}
              field={f}
              value={values[f.key]}
              onChange={(v) => setValues((prev) => ({ ...prev, [f.key]: v }))}
            />
          ))}
        </div>
      )}

      {noteField && (
        <div className="mt-5">
          <Field
            field={noteField}
            value={values.note}
            onChange={(v) => setValues((prev) => ({ ...prev, note: v }))}
          />
        </div>
      )}

      <div className="mt-5">
        <label htmlFor="when" className="mb-1.5 block text-[13px] font-medium text-sage-600">
          When did this happen
        </label>
        <input
          id="when"
          type="time"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
          className={inputCls}
        />
        <p className="mt-1 text-[12px] text-sage-500">Leave blank for now.</p>
      </div>

      {error && <p className="mt-4 text-[13.5px] text-coral-600">{error}</p>}

      <div className="mt-6 flex gap-2.5">
        <button
          type="button"
          onClick={onCancel}
          className="tap min-h-[50px] flex-1 rounded-2xl bg-mist-100 text-[15px] font-semibold text-ink hover:bg-mist-200"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={busy || blocked.length > 0}
          onClick={() => {
            let occurredAt: Date | null = null;
            if (when) {
              const [h, m] = when.split(":").map(Number);
              const d = new Date();
              d.setHours(h, m, 0, 0);
              // A time later today has not happened yet — it means yesterday.
              if (d.getTime() > Date.now()) d.setDate(d.getDate() - 1);
              occurredAt = d;
            }
            const note = typeof values.note === "string" && values.note.trim() ? values.note.trim() : null;
            const payload = { ...values };
            delete payload.note;
            // Carry the outcome under the configuration's own key, in the
            // configuration's own words, where it declares one.
            const declared = activity.inputSchema.find(
              (f) => (f.key === "outcome" || f.key === "status") && f.options?.length === 3,
            );
            if (isCompletion && declared?.options) {
              const idx = { done: 0, partial: 1, unable: 2, skipped: 1, recorded: 0 }[outcome];
              payload[declared.key] = declared.options[idx];
            }
            onSubmit({ payload, outcome, note, occurredAt });
          }}
          className="tap min-h-[50px] flex-[1.6] rounded-2xl bg-ink text-[15px] font-semibold text-white transition-colors hover:bg-ink/90 disabled:opacity-40"
        >
          {busy ? "Saving…" : submitLabel ?? "Record"}
        </button>
      </div>
      {blocked.length > 0 && (
        <p className="mt-2 text-center text-[12.5px] text-sage-500">
          {blocked.map((f) => f.label).join(", ")} {blocked.length === 1 ? "is" : "are"} needed.
        </p>
      )}
    </>
  );
}
