import { useMemo, useState } from "react";
import type { ReadingsInput, CareTaskRow } from "../../lib/db";
import { prescribedParams, statusFor, type MonitorParam } from "../../domain/monitoring";
import { useHc, BottomSheet, HcIcon, niceDate, classifyTask } from "./hc-kit";
import { ParamControl } from "./ActionStage";
import { TabHead } from "./HomeCareMedicines";

/* ============================================================================
   Log — flexible-time observations and care records. Not a hospital form: no
   completion score, no fourteen big cards. Grouped compact sections derived
   from the patient's activated plan; each row shows the latest value + time and
   opens a focused bottom-sheet input. Fluids use inline quick-add. Simple care
   actions (repositioning, feeding) record one-tap with a timestamp + Undo,
   reusing the existing task-outcome record.

   Threshold indication is calm and non-clinical: "Outside the range set by your
   care team", with View instructions / Message coordinator — never "urgent".

   Data note: daily_readings stores a single food_intake value (no per-meal
   breakfast/lunch/dinner) and has no sleep field — see the data-gap report.
   ========================================================================== */

const FOOD_AMOUNTS = ["All", "Most", "About half", "A little", "Refused"];

export function HomeCareLog() {
  const { patient, plan, readings, thresholds, history, saveReadingFields, tasks } = useHc();
  const [sheet, setSheet] = useState<MonitorParam | null>(null);
  const [foodOpen, setFoodOpen] = useState(false);
  const [instr, setInstr] = useState<string | null>(null);

  const params = useMemo(() => {
    const modules = (plan?.content?.observations ?? []).map((o) => o.module);
    return prescribedParams(modules, patient.diagnosis ?? []);
  }, [plan, patient.diagnosis]);

  const has = (field: string) => params.some((p) => p.field === field);
  const get = (field: string) => params.find((p) => p.field === field);
  const thByKey = useMemo(() => new Map(thresholds.map((t) => [t.param, t])), [thresholds]);
  const updated = history.length ? niceDate(history[history.length - 1].reading_date) : "Today";

  const vitals = params.filter((p) => ["bp", "pulse", "spo2", "temperature", "grbs"].includes(p.field));
  const outputs = params.filter((p) => ["urineMl", "bowel"].includes(p.field));
  const wellbeing = params.filter((p) => ["pain", "mood", "cognition"].includes(p.field));
  const funct = params.filter((p) => ["activity", "skin"].includes(p.field));
  const showFood = has("feeding") || has("fluidMl") || (plan?.content?.diet?.length ?? 0) > 0;

  const flexible = useMemo(
    () => tasks.filter((t) => classifyTask(t) === "positioning" || /feed|suction|airway/.test(`${t.title} ${t.detail ?? ""}`.toLowerCase())),
    [tasks],
  );

  const save = async (field: keyof ReadingsInput, v: string) => saveReadingFields({ [field]: v } as Partial<ReadingsInput>);

  const precautions = (plan?.content?.precautions ?? []).map((p) => p.text)
    .concat((plan?.content?.warning_signs ?? []).map((w) => w.text));

  return (
    <div style={{ paddingTop: 8 }}>
      <TabHead title="Log" sub="Record readings and care whenever they happen — no set order." />

      {vitals.length > 0 && (
        <Section title="Vitals">
          {vitals.map((p) => (
            <LogRow key={p.field} label={p.label} unit={p.unit} value={readings[p.field] ?? ""} updated={updated}
              attention={statusFor(p, readings[p.field] ?? "", thByKey.get(p.key)) === "attention"}
              onOpen={() => setSheet(p)} onInstr={() => setInstr(p.label)} onMsg />
          ))}
        </Section>
      )}

      {showFood && (
        <Section title="Food & fluids">
          <button type="button" className="hc-lrow" onClick={() => setFoodOpen(true)}>
            <span className="lr-ic"><HcIcon.Food size={16} /></span>
            <span className="lr-body"><b>Food intake</b><small>{readings.foodIntake ? `${readings.foodIntake} · ${updated}` : "Tap to record"}</small></span>
            <HcIcon.Right size={16} />
          </button>
          {has("feeding") && get("feeding") && (
            <LogRow label="Feeding" value={readings.feeding ?? ""} updated={updated} onOpen={() => setSheet(get("feeding")!)} />
          )}
          {has("fluidMl") && <FluidInline value={readings.fluidMl ?? ""} unit={get("fluidMl")?.unit ?? "mL"} updated={updated} onSave={(v) => save("fluidMl", v)} />}
          <p className="hc-muted" style={{ marginTop: 8 }}>Recorded as one daily food total — per-meal breakdown isn’t stored yet.</p>
        </Section>
      )}

      {outputs.length > 0 && (
        <Section title="Output">
          {outputs.map((p) => (
            <LogRow key={p.field} label={p.label} unit={p.unit} value={readings[p.field] ?? ""} updated={updated} onOpen={() => setSheet(p)} />
          ))}
        </Section>
      )}

      {wellbeing.length > 0 && (
        <Section title="Wellbeing">
          {wellbeing.map((p) => (
            <LogRow key={p.field} label={p.label} unit={p.unit} value={readings[p.field] ?? ""} updated={updated} onOpen={() => setSheet(p)} />
          ))}
        </Section>
      )}

      {funct.length > 0 && (
        <Section title="Mobility & skin">
          {funct.map((p) => (
            <LogRow key={p.field} label={p.label} value={readings[p.field] ?? ""} updated={updated} onOpen={() => setSheet(p)} />
          ))}
        </Section>
      )}

      {flexible.length > 0 && (
        <Section title="Care logs">
          {flexible.map((t) => <FlexRow key={t.id} task={t} />)}
        </Section>
      )}

      {params.length === 0 && (
        <div className="hc-empty"><b>Nothing to record yet</b><p>The care team hasn’t prescribed observations for {patient.full_name.split(" ")[0]} yet. They appear here once added.</p></div>
      )}

      {/* focused param sheet */}
      {sheet && (
        <ParamSheet param={sheet} initial={readings[sheet.field] ?? ""} onClose={() => setSheet(null)}
          onSave={async (v) => { const ok = await save(sheet.field, v); if (ok) setSheet(null); return ok; }} />
      )}

      {/* food amount sheet */}
      {foodOpen && (
        <BottomSheet title="Food intake today" onClose={() => setFoodOpen(false)}>
          <div className="hc-choices" style={{ marginTop: 6 }}>
            {FOOD_AMOUNTS.map((o) => (
              <button key={o} type="button" className={`hc-choice${readings.foodIntake === o ? " on" : ""}`}
                onClick={async () => { await save("foodIntake", o); setFoodOpen(false); }}>{o}</button>
            ))}
          </div>
          <p className="hc-muted" style={{ marginTop: 12, padding: 0 }}>Stored as a single daily value — the plan doesn’t hold separate breakfast/lunch/dinner fields.</p>
        </BottomSheet>
      )}

      {/* "View instructions" — real plan precautions/warnings only */}
      {instr && (
        <BottomSheet title="What your care team advised" onClose={() => setInstr(null)}>
          {precautions.length > 0 ? (
            <ul style={{ listStyle: "none", padding: 0, margin: "6px 0 0" }}>
              {precautions.slice(0, 8).map((w, i) => (
                <li key={i} style={{ display: "flex", gap: 8, padding: "7px 0", fontSize: 13.5, color: "var(--ink)" }}>
                  <span style={{ color: "var(--sky-ink)", flex: "none" }}><HcIcon.Check size={16} /></span>{w}
                </li>
              ))}
            </ul>
          ) : (
            <p className="hc-muted" style={{ padding: 0 }}>No specific instructions are recorded in the plan. If you’re unsure, message your coordinator.</p>
          )}
        </BottomSheet>
      )}
    </div>
  );
}

/* ------------------------------- pieces ---------------------------------- */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="hc-h2">{title}</h2>
      <div className="hc-lgroup">{children}</div>
    </section>
  );
}

function LogRow({ label, unit, value, updated, attention, onOpen, onInstr, onMsg }: {
  label: string; unit?: string; value: string; updated: string; attention?: boolean;
  onOpen: () => void; onInstr?: () => void; onMsg?: boolean;
}) {
  const { goTab } = useHc();
  const has = value.trim() !== "";
  return (
    <div className={`hc-lrow-wrap${attention ? " attn" : ""}`}>
      <button type="button" className="hc-lrow" onClick={onOpen}>
        <span className="lr-ic">{has ? <HcIcon.Check size={16} /> : <HcIcon.Plus size={16} />}</span>
        <span className="lr-body">
          <b>{label}</b>
          <small>{has ? `${value}${unit ? ` ${unit}` : ""} · ${updated}` : "Tap to record"}</small>
        </span>
        <HcIcon.Right size={16} />
      </button>
      {attention && (
        <div className="hc-attn-note">
          <span><HcIcon.Warn size={13} /> Outside the range set by your care team</span>
          <div className="hc-attn-acts">
            {onInstr && <button type="button" onClick={onInstr}>View instructions</button>}
            {onMsg && <button type="button" onClick={() => goTab("help")}>Message coordinator</button>}
          </div>
        </div>
      )}
    </div>
  );
}

function FluidInline({ value, unit, updated, onSave }: { value: string; unit: string; updated: string; onSave: (v: string) => void }) {
  const n = Number(value.replace(/[^\d.]/g, "")) || 0;
  const add = (d: number) => onSave(String(Math.max(0, n + d)));
  return (
    <div className="hc-fluid">
      <div className="lr-body" style={{ flex: 1 }}>
        <b>Fluids in</b>
        <small>{n} {unit} today{value ? ` · ${updated}` : ""}</small>
      </div>
      <div className="hc-quick">
        {[100, 200].map((q) => <button key={q} type="button" onClick={() => add(q)}>+{q}</button>)}
        <input className="hc-num-in" style={{ width: 84, fontSize: 15, padding: 9 }} inputMode="numeric" aria-label={`Fluids in ${unit}`}
          placeholder={unit} value={value} onChange={(e) => onSave(e.target.value.replace(/[^\d]/g, ""))} />
      </div>
    </div>
  );
}

/** Simple care action (repositioning, feeding) — one-tap Done with a timestamp
 *  and Undo, reusing the existing task-outcome record (no new backend). */
function FlexRow({ task }: { task: CareTaskRow }) {
  const { outcomes, recordOutcome } = useHc();
  const done = outcomes.get(task.id) === "done";
  const [at, setAt] = useState<string | null>(null);
  const mark = () => {
    recordOutcome(task.id, "done");
    setAt(new Date().toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }));
  };
  const undo = () => { recordOutcome(task.id, null); setAt(null); };
  return (
    <div className={`hc-lrow-wrap${done ? " done" : ""}`}>
      <div className="hc-lrow" style={{ cursor: "default" }}>
        <span className="lr-ic">{done ? <HcIcon.Check size={16} /> : <HcIcon.Bed size={16} />}</span>
        <span className="lr-body"><b>{task.title}</b><small>{done ? `Recorded${at ? ` · ${at}` : ""}` : task.time_label || "Anytime"}</small></span>
        {done
          ? <button type="button" className="hc-mini-undo" onClick={undo}>Undo</button>
          : <button type="button" className="hc-mini-do" onClick={mark}><HcIcon.Check size={15} /> Done</button>}
      </div>
    </div>
  );
}

function ParamSheet({ param, initial, onClose, onSave }: {
  param: MonitorParam; initial: string; onClose: () => void; onSave: (v: string) => Promise<boolean>;
}) {
  const [val, setVal] = useState(initial);
  const [saving, setSaving] = useState(false);
  const save = async () => { setSaving(true); const ok = await onSave(val); if (!ok) setSaving(false); };
  return (
    <BottomSheet title={param.label} onClose={onClose}>
      <div className="hc-field" style={{ marginTop: 6 }}>
        <ParamControl param={param} value={val} onChange={setVal} />
      </div>
      <button type="button" className="hc-save" onClick={save} disabled={saving}>
        {saving ? "Saving…" : <><HcIcon.Check size={16} /> Save {param.short}</>}
      </button>
      <button type="button" className="hc-help-link" onClick={onClose}>Cancel</button>
    </BottomSheet>
  );
}
