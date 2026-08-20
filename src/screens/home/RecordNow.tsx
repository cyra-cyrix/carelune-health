import { useRef, useState } from "react";
import { addCareEvent, uploadPatientDocument, type CareEventKind } from "../../lib/db";
import { prescribedParams, type MonitorParam } from "../../domain/monitoring";
import { ParamControl } from "./ActionStage";
import { BottomSheet, HcIcon, useHc, useSubmit } from "./hc-kit";

/*
 * Countable events. These are the things that happen several times a day, so a
 * single daily value cannot represent them — a feed at 07:00 and another at
 * 11:00 are two events, not one field being overwritten.
 */
const EVENT_TILES: { kind: CareEventKind; label: string; unit?: string }[] = [
  { kind: "feed", label: "Feed", unit: "mL" },
  { kind: "positioning", label: "Position" },
  { kind: "urine", label: "Urine", unit: "mL" },
  { kind: "bowel", label: "Bowel" },
  { kind: "secretion", label: "Secretion" },
];

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
  const { plan, readings, saveReadingFields, patient, reload } = useHc();
  const [param, setParam] = useState<MonitorParam | null>(null);
  const [event, setEvent] = useState<(typeof EVENT_TILES)[number] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  /*
   * A photo is stored as a document AND logged as an event, so it appears both
   * in the patient's records and on today's timeline. Household upload became
   * possible in migration 0027 — before that, the people at the bedside were the
   * only ones who could not send a wound photo.
   */
  const onPhoto = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true); setErr(null);
    try {
      const doc = await uploadPatientDocument(patient.id, file, "other");
      await addCareEvent(patient.id, patient.centre_id, {
        kind: "photo", detail: file.name, documentId: doc.id,
      });
      reload();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not upload that photo.");
    } finally { setBusy(false); }
  };

  const modules = (plan?.content?.observations ?? []).map((o) => o.module);
  const params = prescribedParams(
    modules,
    patient.diagnosis ?? [],
    (plan?.content?.daily_tasks ?? []).map((t) => t.title),
  );

  if (event) {
    return (
      <EventSheet
        tile={event}
        onBack={() => setEvent(null)}
        onSave={async (detail, amount) => {
          await addCareEvent(patient.id, patient.centre_id, {
            kind: event.kind, detail, amount, unit: event.unit,
          });
          reload();
          onClose();
        }}
      />
    );
  }

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
          {EVENT_TILES.map((t) => (
            <button key={t.kind} type="button" className="hc-rec-tile" onClick={() => setEvent(t)}>
              <span className="i">{eventIcon(t.kind)}</span>
              {t.label}
            </button>
          ))}
          <button type="button" className="hc-rec-tile" disabled={busy} onClick={() => cameraRef.current?.click()}>
            <span className="i"><HcIcon.Plus size={15} /></span>
            {busy ? "Uploading…" : "Photo"}
          </button>
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
      <input ref={photoRef} type="file" accept="image/jpeg,image/png" className="hidden"
        onChange={(e) => { void onPhoto(e.target.files?.[0]); e.target.value = ""; }} />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={(e) => { void onPhoto(e.target.files?.[0]); e.target.value = ""; }} />
      {err && <p className="hc-save-error">{err}</p>}
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


/** A countable event: how much (when it has a unit) and an optional note. */
function EventSheet({
  tile, onBack, onSave,
}: {
  tile: { kind: CareEventKind; label: string; unit?: string };
  onBack: () => void;
  onSave: (detail: string, amount: number | null) => Promise<void>;
}) {
  const [amount, setAmount] = useState("");
  const [detail, setDetail] = useState("");
  const { state, run } = useSubmit();

  const save = () =>
    run(async () => {
      await onSave(detail.trim(), amount.trim() ? Number(amount) : null);
      return true;
    });

  return (
    <BottomSheet title={tile.label} onClose={onBack}>
      {tile.unit && (
        <div className="hc-field" style={{ marginTop: 6 }}>
          <label className="hc-lab" htmlFor="ev-amt">How much ({tile.unit})</label>
          <input id="ev-amt" className="hc-num-in" inputMode="numeric" value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} placeholder="e.g. 150" />
        </div>
      )}
      <div className="hc-field">
        <label className="hc-lab" htmlFor="ev-note">Note (optional)</label>
        <input id="ev-note" className="hc-num-in" style={{ width: "100%" }} value={detail}
          onChange={(e) => setDetail(e.target.value)} placeholder="e.g. Ryle's tube, tolerated well" />
      </div>
      <button type="button" className="hc-save" onClick={save} disabled={state === "saving"}>
        {state === "saving" ? "Saving…" : <><HcIcon.Check size={16} /> Record {tile.label.toLowerCase()}</>}
      </button>
      {state === "error" && <p className="hc-save-error">Could not record that. Try again.</p>}
      <button type="button" className="hc-help-link" onClick={onBack}>Back</button>
    </BottomSheet>
  );
}

function eventIcon(kind: CareEventKind) {
  switch (kind) {
    case "feed": return <HcIcon.Food size={15} />;
    case "positioning": return <HcIcon.Bed size={15} />;
    case "urine": case "bowel": return <HcIcon.Drop size={15} />;
    case "secretion": return <HcIcon.Pulse size={15} />;
    default: return <HcIcon.Chart size={15} />;
  }
}
