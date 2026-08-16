import { useMemo, useState } from "react";
import { raiseApproval, type MedicationRow, type MedAdminStatus } from "../../lib/db";
import { useBranding } from "../../branding/BrandingProvider";
import { useHc, BottomSheet, HcIcon, currentPeriod, PERIODS, type Period } from "./hc-kit";

/* ============================================================================
   Medicines — a calm, dense, Apple-Health-style log. Every dose for the day is
   visible as a compact ROW inside time-grouped inset lists (Morning / Afternoon
   / Evening / Bedtime / As needed / Round the clock). No oversized cards, no
   wasted space:

     • row = pill icon · name · "dose · before/after food · time" · a check.
     • tap the check → mark given (tap again → undo). Green when given.
     • tap the row → a detail sheet with the full instruction, the doctor's note,
       and Given / Skipped / Need help.

   Everything is composed from THIS patient's medications + dose lines — nothing
   hardcoded or invented; the doctor's plan is the source of truth.
   ========================================================================== */

type MedPlan = { slots: Period[]; interval: string | null; prn: boolean; food: "before" | "after" | null; clock: string | null };

function parseMed(m: MedicationRow): MedPlan {
  const text = `${m.freq ?? ""} ${m.timing ?? ""} ${m.note ?? ""}`.toLowerCase();
  const prn = /need|sos|prn|required/.test(text);
  const interval = text.match(/every\s+[\w-]+\s*(?:hours?|hrs?|h)\b/)?.[0] ?? (/hourly/.test(text) ? "hourly" : null);
  const food: MedPlan["food"] = /before food|empty stomach/.test(text) ? "before" : /after food|with food|post food/.test(text) ? "after" : null;
  const clockM = `${m.timing ?? ""}`.match(/\b(\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/i) ?? `${m.timing ?? ""}`.match(/\b(\d{1,2}:\d{2})\b/);
  const clock = clockM ? clockM[1] : null;

  const slots: Period[] = [];
  const pat = `${m.timing ?? ""} ${m.freq ?? ""}`.match(/\d+(?:\s*-\s*\d+){2,3}/);
  if (pat) {
    const nums = pat[0].split("-").map((n) => Number(n.trim()));
    const map: Period[] = nums.length === 4 ? ["morning", "afternoon", "evening", "bedtime"] : ["morning", "afternoon", "bedtime"];
    nums.forEach((n, i) => { if (n > 0 && map[i]) slots.push(map[i]); });
  }
  if (slots.length === 0 && !prn && !interval) {
    if (/morning|breakfast|\bam\b/.test(text)) slots.push("morning");
    if (/after ?noon|lunch|noon/.test(text)) slots.push("afternoon");
    if (/evening|dinner/.test(text)) slots.push("evening");
    if (/night|bed|\bhs\b|\bpm\b/.test(text)) slots.push("bedtime");
    if (slots.length === 0) slots.push("morning");
  }
  return { slots, interval, prn, food, clock };
}

const foodLabel = (f: MedPlan["food"]) => (f === "before" ? "Before food" : f === "after" ? "After food" : null);

type Row = { med: MedicationRow; plan: MedPlan };
type Focus = { med: MedicationRow; plan: MedPlan; slot: string };

const PERIOD_ICON: Record<Period, React.ReactNode> = {
  morning: <HcIcon.Sun size={13} />, afternoon: <HcIcon.Sun size={13} />,
  evening: <HcIcon.Moon size={13} />, bedtime: <HcIcon.Moon size={13} />,
};

export function HomeCareMedicines() {
  const { meds, medAdmin, markMed, clearMed } = useHc();
  const [focus, setFocus] = useState<Focus | null>(null);

  const parsed = useMemo<Row[]>(() => meds.map((m) => ({ med: m, plan: parseMed(m) })), [meds]);
  const statusOf = (medId: string, slot: string) => medAdmin.get(`${medId}|${slot}`);

  const nowPeriod = currentPeriod();
  const scheduledTotal = parsed.reduce((n, r) => n + r.plan.slots.length, 0);
  const scheduledDone = parsed.reduce((n, r) => n + r.plan.slots.filter((s) => statusOf(r.med.id, s)).length, 0);
  const pct = scheduledTotal ? Math.round((scheduledDone / scheduledTotal) * 100) : 0;

  const toggle = (med: MedicationRow, slot: string, status?: MedAdminStatus) => {
    if (status === "given") clearMed(med.id, slot);
    else markMed(med.id, slot, "given");
  };

  if (meds.length === 0) {
    return (
      <div style={{ paddingTop: 8 }}>
        <TabHead title="Medicines" sub="Today’s doses." />
        <div className="hc-empty"><b>No medicines yet</b><p>The care team will add prescribed medicines here. Nothing to give right now.</p></div>
      </div>
    );
  }

  const renderRow = (r: Row, slot: string) => {
    const status = statusOf(r.med.id, slot);
    return (
      <div className={`hc-mrow${status ? ` ${status}` : ""}`} key={`${r.med.id}-${slot}`}>
        <button type="button" className="mr-main" onClick={() => setFocus({ med: r.med, plan: r.plan, slot })}>
          <span className="mr-ic"><HcIcon.Pill size={16} /></span>
          <span className="mr-txt">
            <b>{r.med.name}</b>
            <small>{[r.med.dose, foodLabel(r.plan.food), slot === "prn" ? "Only if needed" : slot === "interval" ? (r.plan.interval ?? "") : r.plan.clock].filter(Boolean).join(" · ") || "As directed"}</small>
          </span>
        </button>
        {slot === "prn"
          ? <button type="button" className={`mr-check${status === "given" ? " given" : ""}`} aria-label={`Log ${r.med.name} taken`} onClick={() => toggle(r.med, slot, status)}><span className="mr-dot">{status === "given" && <HcIcon.Check size={14} />}</span></button>
          : <button type="button" className={`mr-check${status === "given" ? " given" : status === "skipped" ? " skipped" : ""}`}
              aria-label={status === "given" ? `Undo ${r.med.name}` : `Mark ${r.med.name} given`} onClick={() => toggle(r.med, slot, status)}>
              <span className="mr-dot">{status === "given" ? <HcIcon.Check size={14} /> : status === "skipped" ? "–" : null}</span>
            </button>}
      </div>
    );
  };

  return (
    <div style={{ paddingTop: 8 }}>
      <TabHead title="Medicines" sub={`${scheduledDone} of ${scheduledTotal} doses taken today`} />
      <div className="hc-mprog" aria-hidden="true"><span style={{ width: `${pct}%` }} /></div>

      {PERIODS.map((p) => {
        const rows = parsed.filter((r) => r.plan.slots.includes(p.key));
        if (rows.length === 0) return null;
        const done = rows.filter((r) => statusOf(r.med.id, p.key)).length;
        return (
          <section key={p.key}>
            <div className="hc-mgrp-head">
              <span className="mg-label">{PERIOD_ICON[p.key]} {p.label}{p.key === nowPeriod && <span className="mg-now">Now</span>}</span>
              <span className={`mg-count${done === rows.length ? " done" : ""}`}>{done}/{rows.length}</span>
            </div>
            <div className="hc-mlist">{rows.map((r) => renderRow(r, p.key))}</div>
          </section>
        );
      })}

      {parsed.some((r) => r.plan.interval) && (
        <section>
          <div className="hc-mgrp-head"><span className="mg-label"><HcIcon.Clock size={13} /> Round the clock</span></div>
          <div className="hc-mlist">{parsed.filter((r) => r.plan.interval).map((r) => renderRow(r, "interval"))}</div>
        </section>
      )}

      {parsed.some((r) => r.plan.prn) && (
        <section>
          <div className="hc-mgrp-head"><span className="mg-label"><HcIcon.Pill size={13} /> As needed</span><span className="mg-count">If needed</span></div>
          <div className="hc-mlist">{parsed.filter((r) => r.plan.prn).map((r) => renderRow(r, "prn"))}</div>
        </section>
      )}

      <p className="hc-muted" style={{ marginTop: 14 }}>Give exactly what the doctor listed. Tap a medicine for details.</p>

      {focus && (
        <MedDetail focus={focus} status={statusOf(focus.med.id, focus.slot)}
          onClose={() => setFocus(null)}
          onMark={(s) => { markMed(focus.med.id, focus.slot, s); setFocus(null); }}
          onClear={() => { clearMed(focus.med.id, focus.slot); setFocus(null); }} />
      )}
    </div>
  );
}

/* ------------------------------ detail sheet ----------------------------- */

function MedDetail({ focus, status, onClose, onMark, onClear }: {
  focus: Focus; status?: MedAdminStatus; onClose: () => void;
  onMark: (s: MedAdminStatus) => void; onClear: () => void;
}) {
  const { med, plan, slot } = focus;
  const { profile } = useBranding();
  const [helpSent, setHelpSent] = useState(false);
  const when = slot === "prn" ? "As needed" : slot === "interval" ? (plan.interval ?? "Round the clock") : (plan.clock ?? PERIODS.find((p) => p.key === slot)?.label ?? "Today");
  const facts = [med.dose, foodLabel(plan.food), when].filter(Boolean) as string[];
  const needHelp = async () => {
    setHelpSent(true);
    try { await raiseApproval(med.patient_id, { type: "patient_query", message: `Need help with ${med.name}${med.dose ? ` (${med.dose})` : ""} — ${when} dose.`, urgency: "routine", from_name: profile?.full_name ?? "Family" }); }
    catch { /* Help tab always available */ }
  };
  return (
    <BottomSheet title={med.name} onClose={onClose}>
      <div className="hc-mfacts">
        {facts.map((f, i) => <span key={i} className="hc-tag route">{f}</span>)}
      </div>
      {med.note && <p className="hc-med-note" style={{ marginTop: 10 }}>{med.note}</p>}

      {status ? (
        <div className="hc-med-status" style={{ marginTop: 16 }}>
          <span className={`hc-med-chip ${status}`}>{status === "given" ? <><HcIcon.Check size={15} /> Given</> : "Skipped"}</span>
          <button type="button" className="hc-med-undo" onClick={onClear}>Undo</button>
        </div>
      ) : (
        <div className="hc-med-acts" style={{ gridTemplateColumns: slot === "prn" ? "1fr" : "1fr 1fr", marginTop: 16 }}>
          <button type="button" className="hc-outcome done" onClick={() => onMark("given")}><HcIcon.Check size={15} /> {slot === "prn" ? "Given now" : "Given"}</button>
          {slot !== "prn" && <button type="button" className="hc-outcome unable" onClick={() => onMark("skipped")}>Skipped</button>}
        </div>
      )}
      <button type="button" className="hc-med-help" onClick={needHelp} disabled={helpSent}>{helpSent ? "Sent to the care team ✓" : "Need help with this medicine?"}</button>
    </BottomSheet>
  );
}

/* -------------------------------- shared --------------------------------- */

export function TabHead({ title, sub }: { title: string; sub: string }) {
  return (
    <div style={{ padding: "10px 2px 2px" }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.03em", margin: 0 }}>{title}</h1>
      <p style={{ fontSize: 13.5, color: "var(--slate)", margin: "3px 0 0", lineHeight: 1.5 }}>{sub}</p>
    </div>
  );
}
