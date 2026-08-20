import { useRef, useState } from "react";
import type { CareTaskRow, TaskOutcome, ReadingsInput } from "../../lib/db";
import { PARAM_CATALOGUE, type MonitorParam } from "../../domain/monitoring";
import { useHc, classifyTask, HcIcon, OUTCOME_META, useNow, useSubmit } from "./hc-kit";
import { CareAttachment } from "./CareAttachment";

/* ============================================================================
   Action Stage — the centre of Today. Renders the CORRECT input for the task in
   focus, never a generic checkbox:

     • monitoring tasks → the matching reading inputs, saved via the readings fn.
     • physiotherapy → instruction + optional timer + outcome.
     • food / positioning → the right response.
     • medicine-in-schedule → NO separate completion: it shows how many medicines
       are due and routes to the Medicines tab (status is derived from the
       individual med-admin records, never double-recorded here).
     • anything unrecognised → a safe generic outcome view (never hidden).
   ========================================================================== */

const READING_FIELDS = new Set(PARAM_CATALOGUE.map((p) => p.field));

function matchParams(title: string): MonitorParam[] {
  const t = title.toLowerCase();
  return PARAM_CATALOGUE.filter((p) => (p.taskKeywords ?? []).some((k) => t.includes(k)));
}

export function ActionStage({ task, onRecorded }: { task: CareTaskRow; onRecorded: () => void }) {
  const kind = classifyTask(task);
  const params = kind === "task" ? matchParams(task.title) : [];
  const meta = STAGE_META(kind, params);

  return (
    <div className="hc-stage-wrap">
      <div key={task.id} className="hc-stage hc-stage-anim">
        <div className="hc-stage-head">
          <span className="hc-kind">
            <span className="ki">{meta.icon}</span>
            {meta.label}
          </span>
          {task.time_label && <span className="hc-when num">{task.time_label}</span>}
        </div>
        <h3>{task.title}</h3>
        {task.detail && kind !== "medicine" && <DetailText text={task.detail} />}
        {task.discipline && <div className="disc">{task.discipline}</div>}

        {params.length > 0 ? (
          <ReadingRenderer task={task} params={params} onRecorded={onRecorded} />
        ) : kind === "physio" ? (
          <PhysioRenderer task={task} onRecorded={onRecorded} />
        ) : kind === "food" ? (
          <FoodRenderer task={task} onRecorded={onRecorded} />
        ) : kind === "medicine" ? (
          <MedicineTaskRenderer task={task} />
        ) : (
          <OutcomeRenderer task={task} kind={kind} onRecorded={onRecorded} />
        )}
      </div>
    </div>
  );
}

/** Long instructions collapse behind "More" so the stage stays space-efficient. */
function DetailText({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 110;
  if (!long) return <p className="instr">{text}</p>;
  return (
    <p className="instr">
      {open ? text : text.slice(0, 108).trimEnd() + "… "}
      <button type="button" className="hc-inline-more" onClick={() => setOpen((v) => !v)}>{open ? "Less" : "More"}</button>
    </p>
  );
}

function STAGE_META(kind: string, params: MonitorParam[]): { label: string; icon: React.ReactNode } {
  if (params.length) {
    const g = params[0].group;
    if (g === "vitals") return { label: "Reading", icon: <HcIcon.Heart size={15} /> };
    if (g === "intake") return { label: "Intake", icon: <HcIcon.Drop size={15} /> };
    if (g === "elimination") return { label: "Output", icon: <HcIcon.Drop size={15} /> };
    return { label: "Check-in", icon: <HcIcon.Pulse size={15} /> };
  }
  switch (kind) {
    case "physio": return { label: "Exercise", icon: <HcIcon.Walk size={15} /> };
    case "food": return { label: "Meal", icon: <HcIcon.Food size={15} /> };
    case "positioning": return { label: "Positioning", icon: <HcIcon.Bed size={15} /> };
    case "medicine": return { label: "Medicine", icon: <HcIcon.Pill size={15} /> };
    default: return { label: "Care", icon: <HcIcon.Check size={15} /> };
  }
}

/* --------------------------- reading renderer ---------------------------- */

function ReadingRenderer({ task, params, onRecorded }: { task: CareTaskRow; params: MonitorParam[]; onRecorded: () => void }) {
  const { readings, saveReadingFields, recordOutcome, outcomes } = useHc();
  const [vals, setVals] = useState<Record<string, string>>(() =>
    Object.fromEntries(params.map((p) => [p.field, readings[p.field] ?? ""])),
  );
  // One reading = one write: the guard drops any tap made while a save is in flight.
  const { state: status, run, reset } = useSubmit(0);
  const recorded = outcomes.get(task.id) === "done";

  const set = (field: string, v: string) => { setVals((s) => ({ ...s, [field]: v })); reset(); };
  const anyFilled = params.some((p) => (vals[p.field] ?? "").trim() !== "");

  const save = () => run(async () => {
    const patch: Partial<ReadingsInput> = {};
    for (const p of params) if (READING_FIELDS.has(p.field)) patch[p.field] = vals[p.field] ?? "";
    if (!(await saveReadingFields(patch))) return false;
    // The value is stored first; only then is the occurrence marked recorded.
    recordOutcome(task.id, "done");
    setTimeout(onRecorded, 650);
    return true;
  });

  return (
    <>
      {params.map((p) => (
        <div className="hc-field" key={p.field}>
          <div className="hc-lab">
            <b>{p.label}</b>
            {p.unit && p.input !== "scale" && <span>{p.unit}</span>}
          </div>
          <ParamControl param={p} value={vals[p.field] ?? ""} onChange={(v) => set(p.field, v)} />
        </div>
      ))}
      {recorded && status !== "saved" && (
        <div className="hc-done-badge"><HcIcon.Check size={14} /> Recorded today — you can update it</div>
      )}
      {status === "error" && (
        <p className="hc-save-error" role="alert">Couldn&rsquo;t save the reading. Nothing was lost — tap Try again.</p>
      )}
      <button type="button" className={`hc-save${status === "saved" ? " saved" : ""}`} onClick={save} disabled={status === "saving" || !anyFilled}>
        {status === "saved" ? <><HcIcon.Check size={17} /> Saved</>
          : status === "saving" ? "Saving…"
          : status === "error" ? "Try again"
          : "Save reading"}
      </button>
    </>
  );
}

export function ParamControl({ param, value, onChange }: { param: MonitorParam; value: string; onChange: (v: string) => void }) {
  if (param.input === "bp") return <BpControl value={value} onChange={onChange} />;
  if (param.input === "scale") return <ScaleControl value={value} onChange={onChange} />;
  if (param.input === "select") return <ChoiceControl options={param.options ?? []} value={value} onChange={onChange} />;
  if (param.field === "fluidMl" || param.field === "urineMl") return <QuantityControl unit={param.unit ?? "mL"} value={value} onChange={onChange} />;
  return (
    <input
      className="hc-num-in" inputMode="decimal" value={value}
      onChange={(e) => onChange(e.target.value)} placeholder={param.placeholder ?? "—"}
      aria-label={param.label}
    />
  );
}

function BpControl({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [sys, dia] = value.split("/").map((s) => s.trim()) as [string?, string?];
  const emit = (s: string, d: string) => onChange(s || d ? `${s}/${d}` : "");
  return (
    <div className="hc-bp">
      <input className="hc-num-in" inputMode="numeric" placeholder="120" aria-label="Systolic"
        value={sys ?? ""} onChange={(e) => emit(e.target.value.replace(/\D/g, ""), dia ?? "")} />
      <span className="sep">/</span>
      <input className="hc-num-in" inputMode="numeric" placeholder="80" aria-label="Diastolic"
        value={dia ?? ""} onChange={(e) => emit(sys ?? "", e.target.value.replace(/\D/g, ""))} />
    </div>
  );
}

function ScaleControl({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <>
      <div className="hc-scale">
        {Array.from({ length: 11 }, (_, i) => {
          const on = value === String(i);
          const tone = i <= 3 ? "lo" : i <= 6 ? "mid" : "hi";
          return (
            <button key={i} type="button" aria-label={`Pain ${i} of 10`}
              className={on ? `on ${tone}` : ""} onClick={() => onChange(on ? "" : String(i))}>{i}</button>
          );
        })}
      </div>
      <div className="hc-scale-ends"><span>No pain</span><span>Worst</span></div>
    </>
  );
}

function ChoiceControl({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="hc-choices">
      {options.map((o) => (
        <button key={o} type="button" className={`hc-choice${value === o ? " on" : ""}`} onClick={() => onChange(value === o ? "" : o)}>{o}</button>
      ))}
    </div>
  );
}

/** Stepper + quick-add for cumulative day totals (fluids in, urine out). */
function QuantityControl({ unit, value, onChange }: { unit: string; value: string; onChange: (v: string) => void }) {
  const n = Number(value.replace(/[^\d.]/g, "")) || 0;
  const step = 100;
  const add = (d: number) => onChange(String(Math.max(0, n + d)));
  return (
    <>
      <div className="hc-step-row">
        <button type="button" className="hc-step-btn" aria-label={`Minus ${step} ${unit}`} onClick={() => add(-step)}>−</button>
        <span className="hc-step-val num">{n}<small>{unit} today</small></span>
        <button type="button" className="hc-step-btn" aria-label={`Plus ${step} ${unit}`} onClick={() => add(step)}>+</button>
      </div>
      <div className="hc-quick" style={{ marginTop: 10 }}>
        {[100, 200].map((q) => (
          <button key={q} type="button" onClick={() => add(q)}>+{q} {unit}</button>
        ))}
        <input className="hc-num-in" style={{ flex: 1, minWidth: 90, fontSize: 16, padding: "10px" }} inputMode="numeric"
          placeholder="Set exact" aria-label={`Exact ${unit}`} value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ""))} />
      </div>
    </>
  );
}

/* ---------------------------- physio renderer ---------------------------- */

function PhysioRenderer({ task, onRecorded }: { task: CareTaskRow; onRecorded: () => void }) {
  const [start, setStart] = useState<number | null>(null);
  const now = useNow(start !== null);
  const secs = start !== null ? Math.floor((now - start) / 1000) : 0;
  const mmss = `${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`;
  return (
    <>
      <button type="button" className="hc-timer" onClick={() => setStart(start === null ? Date.now() : null)}>
        <HcIcon.Clock size={16} /> {start === null ? "Start timer" : `Stop · ${mmss}`}
        <span className="th">optional</span>
      </button>
      <OutcomeRenderer task={task} kind="physio" onRecorded={onRecorded} />
    </>
  );
}

/* ----------------------------- food renderer ----------------------------- */

const FOOD_AMOUNTS = ["All", "Most", "About half", "A little", "Refused"];

function FoodRenderer({ task, onRecorded }: { task: CareTaskRow; onRecorded: () => void }) {
  const { readings, saveReadingFields, recordOutcome, outcomes } = useHc();
  const [amount, setAmount] = useState(readings.foodIntake ?? "");
  const { state: status, run, reset } = useSubmit(0);
  const recorded = outcomes.get(task.id) === "done";

  const save = () => run(async () => {
    if (!(await saveReadingFields({ foodIntake: amount }))) return false;
    recordOutcome(task.id, amount === "Refused" ? "refused" : "done");
    setTimeout(onRecorded, 650);
    return true;
  });
  return (
    <>
      <div className="hc-field">
        <div className="hc-lab"><b>How much was taken?</b></div>
        <div className="hc-choices">
          {FOOD_AMOUNTS.map((o) => (
            <button key={o} type="button" className={`hc-choice${amount === o ? " on" : ""}`} onClick={() => { setAmount(amount === o ? "" : o); reset(); }}>{o}</button>
          ))}
        </div>
      </div>
      {recorded && status !== "saved" && <div className="hc-done-badge"><HcIcon.Check size={14} /> Recorded today</div>}
      {status === "error" && <p className="hc-save-error" role="alert">Couldn&rsquo;t save. Nothing was lost — tap Try again.</p>}
      <button type="button" className={`hc-save${status === "saved" ? " saved" : ""}`} onClick={save} disabled={status === "saving" || !amount}>
        {status === "saved" ? <><HcIcon.Check size={17} /> Saved</> : status === "saving" ? "Saving…" : status === "error" ? "Try again" : "Save"}
      </button>
    </>
  );
}

/* -------------------------- medicine-task renderer ------------------------ */

/** A medicine Today action is guidance only — never a second completion path.
 *  It shows how many medicines are still to record and routes to Medicines,
 *  where the individual doses (and their status) actually live. A combined
 *  title (e.g. "Morning medicines & wound check") is flagged: the plan stores
 *  two care types as one task, which cannot be recorded honestly with one tap. */
function MedicineTaskRenderer({ task }: { task: CareTaskRow }) {
  const { meds, medAdmin, goTab } = useHc();
  const recordedMedIds = new Set([...medAdmin.keys()].map((k) => k.split("|")[0]));
  const due = meds.filter((m) => !recordedMedIds.has(m.id)).length;
  const t = task.title.toLowerCase();
  const combined = /medicine|medication|\bmeds\b|dose/.test(t) && /wound|dressing|check|vital|bp|sugar|observ/.test(t);
  return (
    <>
      {combined && (
        <div className="hc-banner">
          This task bundles medicines with another check. Record each medicine in <b>Medicines</b>; treat the rest as guidance. (The care plan stores them as one task, so they can’t be completed accurately with a single tap.)
        </div>
      )}
      <div className="hc-med-due num">{due === 0 ? "All medicines recorded today" : `${due} medicine${due === 1 ? "" : "s"} to record`}</div>
      <button type="button" className="hc-save" onClick={() => goTab("medicines")}>
        <HcIcon.Pill size={16} /> Open Medicines
      </button>
    </>
  );
}

/* ---------------------------- outcome renderer --------------------------- */

/** Storable outcomes (task_logs.outcome enum). "Partially completed" and
 *  per-exercise difficulty aren't in the schema — see the data-gap report. */
const OUTCOMES_FOR: Record<string, TaskOutcome[]> = {
  physio: ["done", "unable", "refused"],
  positioning: ["done", "unable", "na"],
  task: ["done", "unable", "refused", "na"],
};

/** Exercise / activity reads in the family's words: completed, or couldn't. */
const PHYSIO_LABEL: Record<string, string> = { done: "Completed", unable: "Couldn’t complete", refused: "Refused" };

function OutcomeRenderer({ task, kind, onRecorded }: { task: CareTaskRow; kind: string; onRecorded: () => void }) {
  const { recordOutcome, outcomes } = useHc();
  const current = outcomes.get(task.id);
  const set = OUTCOMES_FOR[kind] ?? OUTCOMES_FOR.task;
  // A settle window so an accidental double tap can't record and immediately
  // un-record the same occurrence. Deliberate corrections still work after it.
  const settling = useRef(false);
  const pick = (o: TaskOutcome) => {
    if (settling.current) return;
    settling.current = true;
    window.setTimeout(() => { settling.current = false; }, 600);
    const next = current === o ? null : o;
    recordOutcome(task.id, next);
    if (next) setTimeout(onRecorded, 500);
  };
  const label: Record<string, string> | undefined = kind === "physio" ? PHYSIO_LABEL : undefined;
  return (
    <>
      <div className="hc-outcomes" style={{ marginTop: 16, gridTemplateColumns: set.length === 3 ? "1fr 1fr 1fr" : "1fr 1fr" }}>
        {set.map((o) => (
          <button key={o} type="button" className={`hc-outcome ${o}${current === o ? " on" : ""}`} onClick={() => pick(o)}>
            {current === o && <HcIcon.Check size={15} />}{label?.[o] ?? OUTCOME_META[o].label}
          </button>
        ))}
      </div>
      {/* Offered only once something has been recorded, and never required. */}
      {current && <CareAttachment activity={task.title} />}
    </>
  );
}
