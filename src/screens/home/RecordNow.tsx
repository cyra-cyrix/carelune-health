import { useState } from "react";
import { prescribedParams, type MonitorParam } from "../../domain/monitoring";
import { ParamControl } from "./ActionStage";
import { BottomSheet, HcIcon, useHc, useSubmit } from "./hc-kit";

/**
 * Record Now — the floating "+" sheet.
 *
 * The caregiver used to leave Today for a separate Log screen to enter anything
 * unscheduled. This puts every recordable parameter one tap from the home
 * screen, and only the parameters this patient's plan actually prescribes:
 * offering bowel or airway tiles to a patient with neither is noise, and noise
 * is what makes a clinical app feel unusable.
 */
export function RecordNow({ onClose }: { onClose: () => void }) {
  const { plan, readings, saveReadingFields, patient } = useHc();
  const [param, setParam] = useState<MonitorParam | null>(null);

  const modules = (plan?.content?.observations ?? []).map((o) => o.module);
  const params = prescribedParams(
    modules,
    patient.diagnosis ?? [],
    (plan?.content?.daily_tasks ?? []).map((t) => t.title),
  );

  if (param) {
    return <ParamSheet param={param} initial={readings[param.field] ?? ""} onBack={() => setParam(null)} onClose={onClose} onSave={(v) => saveReadingFields({ [param.field]: v })} />;
  }

  return (
    <BottomSheet title="Record now" onClose={onClose}>
      {params.length === 0 ? (
        <div className="hc-empty">
          <b>Nothing to record yet</b>
          <p>The care team has not prescribed anything for {patient.full_name.split(" ")[0]} to record.</p>
        </div>
      ) : (
        <div className="hc-rec-grid">
          {params.map((p) => {
            const recorded = !!(readings[p.field] ?? "").trim();
            return (
              <button
                key={p.key}
                type="button"
                className={`hc-rec-tile${recorded ? " recorded" : ""}`}
                onClick={() => setParam(p)}
              >
                <span className="i">{paramIcon(p.key)}</span>
                {p.short || p.label}
              </button>
            );
          })}
        </div>
      )}
      <p className="hc-plan-source" style={{ marginTop: 12 }}>
        Recorded here, it reaches the care team straight away — no separate log to fill in.
      </p>
    </BottomSheet>
  );
}

/** One parameter, opened for entry, with the same controls the plan uses. */
function ParamSheet({
  param, initial, onBack, onClose, onSave,
}: {
  param: MonitorParam;
  initial: string;
  onBack: () => void;
  onClose: () => void;
  onSave: (v: string) => Promise<boolean>;
}) {
  const [value, setValue] = useState(initial);
  const { state, run } = useSubmit();

  const save = () =>
    run(async () => {
      const ok = await onSave(value);
      if (ok) setTimeout(onClose, 600);
      return ok;
    });

  return (
    <BottomSheet title={param.label} onClose={onBack}>
      <div className="hc-field" style={{ marginTop: 6 }}>
        <ParamControl param={param} value={value} onChange={setValue} />
      </div>
      <button type="button" className="hc-save" onClick={save} disabled={state === "saving" || !value.trim()}>
        {state === "saving" ? "Saving…" : <><HcIcon.Check size={16} /> Save {param.short || param.label}</>}
      </button>
      {state === "error" && <p className="hc-save-error">Could not save. Try again.</p>}
      <button type="button" className="hc-help-link" onClick={onBack}>Back</button>
    </BottomSheet>
  );
}

function paramIcon(key: string) {
  switch (key) {
    case "bp": case "pulse": return <HcIcon.Heart size={15} />;
    case "spo2": return <HcIcon.Pulse size={15} />;
    case "temperature": case "grbs": return <HcIcon.Drop size={15} />;
    case "pain": return <HcIcon.Warn size={15} />;
    case "fluid_ml": case "feeding": return <HcIcon.Food size={15} />;
    case "urine_ml": case "bowel": return <HcIcon.Drop size={15} />;
    case "activity": return <HcIcon.Walk size={15} />;
    case "skin": return <HcIcon.Bed size={15} />;
    case "mood": case "cognition": return <HcIcon.Sun size={15} />;
    default: return <HcIcon.Chart size={15} />;
  }
}
