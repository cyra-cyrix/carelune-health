import { useState } from "react";
import type { MedicationRow, MedAdminStatus } from "../../lib/db";
import { HcIcon, PERIODS, useHc, type Period } from "./hc-kit";
import { parseMed } from "./HomeCareMedicines";

/**
 * Medicines for one administration period, as a single card.
 *
 * A morning round can be ten tablets. Ten cards on the home screen is a wall,
 * and ten checkboxes to confirm the normal outcome is a chore that gets skipped
 * — and a skipped record is worse than a slow one. So the card offers the
 * common case as one action, with the exception path equally visible beside it.
 *
 * The prescription is shown exactly as prescribed. `purpose` is displayed only
 * when the medicine row actually carries one; nothing is inferred here.
 */
export function MedicationGroup({ period, onOpenAll }: { period: Period; onOpenAll: () => void }) {
  const { meds, medAdmin, markMed } = useHc();
  const [expanded, setExpanded] = useState(false);
  const [bulk, setBulk] = useState(false);

  const rows = meds
    .map((med) => ({ med, plan: parseMed(med) }))
    .filter((r) => r.plan.slots.includes(period));

  if (rows.length === 0) return null;

  const meta = PERIODS.find((p) => p.key === period);
  const given = rows.filter((r) => medAdmin.get(`${r.med.id}|${period}`) === "given").length;
  const outstanding = rows.length - given;
  const foodNote = rows.find((r) => r.plan.food)?.plan.food;

  const allGiven = () => {
    setBulk(true);
    for (const r of rows) {
      if (!medAdmin.get(`${r.med.id}|${period}`)) markMed(r.med.id, period, "given");
    }
    window.setTimeout(() => setBulk(false), 700);
  };

  return (
    <section className="hc-medgroup" aria-labelledby={`medgroup-${period}`}>
      <div className="hc-medgroup-head">
        <div>
          <h3 id={`medgroup-${period}`}>{meta?.label ?? "Medicines"} medicines</h3>
          <p>
            {foodNote ? `${foodNote === "after" ? "After" : "Before"} food · ` : ""}
            {rows.length} medicine{rows.length === 1 ? "" : "s"}
            {given > 0 && ` · ${given} given`}
          </p>
        </div>
        <span className={`hc-medgroup-pill${outstanding === 0 ? " done" : ""} num`}>
          {outstanding === 0 ? "All given" : `${outstanding} due`}
        </span>
      </div>

      {outstanding > 0 && (
        <div className="hc-medgroup-acts">
          <button type="button" className="hc-save" style={{ margin: 0 }} onClick={allGiven} disabled={bulk}>
            {bulk ? "Recording…" : "All given as prescribed"}
          </button>
          <button type="button" className="hc-medgroup-alt" onClick={() => setExpanded((v) => !v)}>
            Something different
          </button>
        </div>
      )}

      <button type="button" className="hc-medgroup-toggle" onClick={() => setExpanded((v) => !v)}>
        {expanded ? "Hide medicines" : "See medicines"} <HcIcon.Right size={14} />
      </button>

      {expanded && (
        <ul className="hc-medgroup-list">
          {rows.map(({ med }) => {
            const status = medAdmin.get(`${med.id}|${period}`);
            return (
              <li key={med.id} className={status ? `given` : undefined}>
                <span className="mg-check" aria-hidden>
                  {status === "given" ? <HcIcon.Check size={13} /> : <span className="mg-dot" />}
                </span>
                <span className="mg-body">
                  <b>{[med.name, med.dose].filter(Boolean).join(" ")}</b>
                  {med.purpose && <small className="mg-purpose">{med.purpose}</small>}
                </span>
                <span className="mg-freq num">{med.freq || "As directed"}</span>
              </li>
            );
          })}
        </ul>
      )}

      {expanded && (
        <button type="button" className="hc-medgroup-toggle" onClick={onOpenAll}>
          Record individually <HcIcon.Right size={14} />
        </button>
      )}
    </section>
  );
}

/** The period a caregiver is most likely acting on right now. */
export function activeMedPeriod(meds: MedicationRow[], medAdmin: Map<string, MedAdminStatus>, now = new Date()): Period | null {
  const hour = now.getHours();
  const withDoses = PERIODS.filter((p) =>
    meds.some((m) => parseMed(m).slots.includes(p.key)),
  );
  if (withDoses.length === 0) return null;
  // The earliest period that still has something outstanding, so a missed
  // morning round stays visible rather than being replaced by the evening one.
  const pending = withDoses.find((p) =>
    meds.some((m) => parseMed(m).slots.includes(p.key) && !medAdmin.get(`${m.id}|${p.key}`)),
  );
  if (pending) return pending.key;
  return (withDoses.find((p) => hour >= p.from && hour < p.to) ?? withDoses[withDoses.length - 1]).key;
}
