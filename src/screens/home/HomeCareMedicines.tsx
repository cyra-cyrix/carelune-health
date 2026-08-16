import { useEffect, useMemo, useRef, useState } from "react";
import { raiseApproval, type MedicationRow, type MedAdminStatus } from "../../lib/db";
import { useBranding } from "../../branding/BrandingProvider";
import { useHc, BottomSheet, HcIcon, currentPeriod, PERIODS, type Period } from "./hc-kit";

/* ============================================================================
   Medicines — a focused queue, not a long list. The medicine due now is shown
   prominently with Given / Skipped / Need help; two upcoming previews follow;
   the full schedule (grouped by time of day + PRN) lives in a bottom sheet.

   Slots come from the doctor's dose line (1-0-1, "after food", "SOS"…). Where a
   dose code reliably maps to times of day we say so in plain words; otherwise we
   keep the original instruction. Food guidance is shown once. Explanations come
   only from the stored, doctor-entered `note` — never invented. After Given /
   Skipped, a brief confirmation offers Undo (deletes the med_admin row).
   ========================================================================== */

type Slot = Period | "prn" | "interval";
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

/** Plain-language schedule, only where reliably derivable from the dose slots;
 *  otherwise fall back to the original freq/timing text (never invented). */
function schedulePlain(m: MedicationRow, plan: MedPlan): string {
  const derivedFromCode = /\d+(?:\s*-\s*\d+){2,3}/.test(`${m.timing ?? ""} ${m.freq ?? ""}`);
  if (derivedFromCode && plan.slots.length) {
    const labels = plan.slots.map((s) => PERIODS.find((p) => p.key === s)?.label ?? s);
    return labels.length === 1 ? labels[0] : `${labels.slice(0, -1).join(", ")} & ${labels[labels.length - 1]}`;
  }
  // No safe mapping — keep whatever the doctor wrote, minus a bare food phrase
  // (shown separately as a tag) so it isn't duplicated.
  const raw = [m.freq, m.timing].filter(Boolean).join(" · ");
  const cleaned = raw.replace(/\b(after|before|with)\s+food\b/gi, "").replace(/\s*·\s*$|^\s*·\s*/g, "").trim();
  return cleaned || "As directed";
}

type Dose = { med: MedicationRow; slot: Slot; plan: MedPlan };
type LastAction = { med: MedicationRow; slot: string; status: MedAdminStatus };

export function HomeCareMedicines() {
  const { meds, medAdmin, markMed, clearMed } = useHc();
  const [sheet, setSheet] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [last, setLast] = useState<LastAction | null>(null);
  const undoTimer = useRef<number | null>(null);

  const parsed = useMemo(() => meds.map((m) => ({ m, plan: parseMed(m) })), [meds]);
  const scheduled = useMemo<Dose[]>(() => {
    const out: Dose[] = [];
    for (const p of PERIODS.map((x) => x.key)) for (const { m, plan } of parsed) if (plan.slots.includes(p)) out.push({ med: m, slot: p, plan });
    return out;
  }, [parsed]);
  const prn = parsed.filter((p) => p.plan.prn);
  const interval = parsed.filter((p) => p.plan.interval);

  const statusOf = (medId: string, slot: string): MedAdminStatus | undefined => medAdmin.get(`${medId}|${slot}`);
  const recordedCount = scheduled.filter((d) => statusOf(d.med.id, d.slot)).length;

  const queue = useMemo(() => {
    const nowIdx = PERIODS.findIndex((p) => p.key === currentPeriod());
    const withPos = scheduled.map((d) => ({ d, pos: PERIODS.findIndex((p) => p.key === (d.slot as Period)) }));
    const unrecorded = withPos.filter(({ d }) => !statusOf(d.med.id, d.slot));
    unrecorded.sort((a, b) => (a.pos <= nowIdx ? 0 : 1) - (b.pos <= nowIdx ? 0 : 1) || a.pos - b.pos);
    return unrecorded.map(({ d }) => d);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduled, medAdmin]);

  const active = queue[Math.min(cursor, Math.max(0, queue.length - 1))] ?? null;
  const upcoming = queue.filter((d) => d !== active).slice(0, 3);

  const flashUndo = (a: LastAction) => {
    setLast(a);
    if (undoTimer.current) window.clearTimeout(undoTimer.current);
    undoTimer.current = window.setTimeout(() => setLast(null), 5000);
  };
  useEffect(() => () => { if (undoTimer.current) window.clearTimeout(undoTimer.current); }, []);

  const doMark = (med: MedicationRow, slot: string, status: MedAdminStatus) => {
    markMed(med.id, slot, status);
    flashUndo({ med, slot, status });
    setCursor(0);
  };
  const undo = () => { if (last) clearMed(last.med.id, last.slot); setLast(null); };

  if (meds.length === 0) {
    return (
      <div style={{ paddingTop: 8 }}>
        <TabHead title="Medicines" sub="What to give, and when." />
        <div className="hc-empty"><b>No medicines yet</b><p>The care team will add prescribed medicines here. Nothing to give right now.</p></div>
      </div>
    );
  }

  return (
    <div style={{ paddingTop: 8 }}>
      <TabHead title="Medicines" sub={`${recordedCount} of ${scheduled.length} scheduled doses recorded today`} />

      {active ? (
        <MedCard dose={active} onMark={doMark} />
      ) : (
        <div className="hc-empty" style={{ marginTop: 14 }}>
          <b>All scheduled medicines recorded</b>
          <p>Nothing more is due right now. As-needed medicines are always below.</p>
        </div>
      )}

      {queue.length > 1 && (
        <div className="hc-stage-nav">
          <button type="button" className="hc-stepbtn" aria-label="Previous medicine" disabled={cursor <= 0} onClick={() => setCursor((c) => Math.max(0, c - 1))}><HcIcon.Left size={20} /></button>
          <span className="hc-viewall" aria-hidden="true">{Math.min(cursor + 1, queue.length)} of {queue.length} due</span>
          <button type="button" className="hc-stepbtn" aria-label="Next medicine" disabled={cursor >= queue.length - 1} onClick={() => setCursor((c) => Math.min(queue.length - 1, c + 1))}><HcIcon.Right size={20} /></button>
        </div>
      )}

      {upcoming.length > 0 && (
        <div className="hc-med-preview">
          <h2 className="hc-h2" style={{ marginBottom: 4 }}>Coming up</h2>
          {upcoming.map((d) => (
            <div className="hc-med-prev-row" key={`${d.med.id}-${d.slot}`}>
              <span className="pdot" />
              <b>{d.med.name}</b>{d.med.dose && <span className="hc-tag dose">{d.med.dose}</span>}
              <small className="num">{d.plan.clock ?? slotLabel(d.slot)}</small>
            </div>
          ))}
        </div>
      )}

      {prn.length > 0 && (
        <>
          <h2 className="hc-h2">As needed</h2>
          {prn.map(({ m, plan }) => (
            <PrnCard key={m.id} med={m} food={plan.food} status={statusOf(m.id, "prn")} onMark={doMark} />
          ))}
        </>
      )}

      <button type="button" className="hc-row-btn" onClick={() => setSheet(true)}>
        <span className="rb-ic"><HcIcon.Calendar size={20} /></span>
        <span className="rb-body"><b>View full schedule</b><span>Every medicine, grouped by time of day</span></span>
        <HcIcon.Right size={18} />
      </button>

      {last && (
        <div className="hc-undo" role="status">
          <span><b>{last.med.name}</b> · {last.status === "given" ? "given" : "skipped"} ✓</span>
          <button type="button" onClick={undo}>Undo</button>
        </div>
      )}

      {sheet && (
        <BottomSheet title="Full medicine schedule" onClose={() => setSheet(false)}>
          <FullSchedule parsed={parsed} statusOf={statusOf} interval={interval} prn={prn} />
        </BottomSheet>
      )}
    </div>
  );
}

/* ------------------------------ due card --------------------------------- */

function MedCard({ dose, onMark }: { dose: Dose; onMark: (m: MedicationRow, slot: string, s: MedAdminStatus) => void }) {
  const { med, slot, plan } = dose;
  const { profile } = useBranding();
  const [helpSent, setHelpSent] = useState(false);
  const needHelp = async () => {
    setHelpSent(true);
    try {
      await raiseApproval(med.patient_id, { type: "patient_query", message: `Need help with ${med.name}${med.dose ? ` (${med.dose})` : ""} — ${slotLabel(slot)} dose.`, urgency: "routine", from_name: profile?.full_name ?? "Family" });
    } catch { /* non-blocking; the concern box in Help remains available */ }
  };
  return (
    <div className="hc-medcard">
      <span className="hc-kind"><span className="ki"><HcIcon.Pill size={15} /></span> Due · {plan.clock ?? slotLabel(slot)}</span>
      <div className="hc-med-name">{med.name}</div>
      <div className="hc-med-meta">
        {med.dose && <span className="hc-tag dose">{med.dose}</span>}
        {plan.food && <span className="hc-tag food">{plan.food === "before" ? "Before food" : "After food"}</span>}
        <span className="hc-tag route">{schedulePlain(med, plan)}</span>
      </div>
      {med.note && <p className="hc-med-note">{med.note}</p>}
      <div className="hc-med-acts">
        <button type="button" className="hc-outcome done" onClick={() => onMark(med, slot, "given")}><HcIcon.Check size={15} /> Given</button>
        <button type="button" className="hc-outcome unable" onClick={() => onMark(med, slot, "skipped")}>Skipped</button>
        <button type="button" className="hc-outcome" onClick={needHelp} disabled={helpSent}>{helpSent ? "Sent ✓" : "Need help"}</button>
      </div>
    </div>
  );
}

function PrnCard({ med, food, status, onMark }: { med: MedicationRow; food: "before" | "after" | null; status?: MedAdminStatus; onMark: (m: MedicationRow, slot: string, s: MedAdminStatus) => void }) {
  return (
    <div className="hc-medcard prn">
      <span className="hc-kind" style={{ color: "var(--amber)" }}><span className="ki" style={{ background: "var(--amber-wash)", color: "var(--amber)" }}><HcIcon.Pill size={15} /></span> As needed</span>
      <div className="hc-med-name">{med.name}</div>
      <div className="hc-med-meta">
        {med.dose && <span className="hc-tag dose">{med.dose}</span>}
        {food && <span className="hc-tag food">{food === "before" ? "Before food" : "After food"}</span>}
        <span className="hc-tag prn">Only if needed</span>
      </div>
      {med.note && <p className="hc-med-note">{med.note}</p>}
      <div className="hc-med-acts" style={{ gridTemplateColumns: "1fr" }}>
        <button type="button" className={`hc-outcome done${status === "given" ? " on" : ""}`} onClick={() => onMark(med, "prn", "given")}><HcIcon.Check size={15} /> Given now</button>
      </div>
    </div>
  );
}

/* ---------------------------- full schedule ------------------------------ */

function FullSchedule({ parsed, statusOf, interval, prn }: {
  parsed: { m: MedicationRow; plan: MedPlan }[];
  statusOf: (id: string, slot: string) => MedAdminStatus | undefined;
  interval: { m: MedicationRow; plan: MedPlan }[];
  prn: { m: MedicationRow; plan: MedPlan }[];
}) {
  return (
    <div style={{ paddingBottom: 8 }}>
      {PERIODS.map((p) => {
        const rows = parsed.filter(({ plan }) => plan.slots.includes(p.key));
        if (rows.length === 0) return null;
        return (
          <div key={p.key} className="hc-tl-group">
            <div className="hc-tl-label">{p.label}</div>
            {rows.map(({ m, plan }) => <ScheduleRow key={`${m.id}-${p.key}`} med={m} food={plan.food} status={statusOf(m.id, p.key)} />)}
          </div>
        );
      })}
      {interval.length > 0 && (
        <div className="hc-tl-group">
          <div className="hc-tl-label">Round the clock</div>
          {interval.map(({ m, plan }) => <ScheduleRow key={m.id} med={m} food={plan.food} hint={plan.interval ?? undefined} status={statusOf(m.id, "interval")} />)}
        </div>
      )}
      {prn.length > 0 && (
        <div className="hc-tl-group">
          <div className="hc-tl-label">As needed</div>
          {prn.map(({ m, plan }) => <ScheduleRow key={m.id} med={m} food={plan.food} prn status={statusOf(m.id, "prn")} />)}
        </div>
      )}
    </div>
  );
}

function ScheduleRow({ med, food, hint, prn, status }: { med: MedicationRow; food: "before" | "after" | null; hint?: string; prn?: boolean; status?: MedAdminStatus }) {
  return (
    <div className="hc-tl" style={{ cursor: "default" }}>
      <span className="tl-ic"><HcIcon.Pill size={16} /></span>
      <span className="tl-body">
        <span className="tl-title">{med.name}{med.dose ? <span style={{ color: "var(--slate)", fontWeight: 600 }}> · {med.dose}</span> : null}</span>
        <span className="tl-state">{[food ? (food === "before" ? "Before food" : "After food") : null, hint, prn ? "Only if needed" : null, med.note].filter(Boolean).join(" · ") || "As directed"}</span>
      </span>
      {status && <span className={`tl-chip ${status === "given" ? "done" : status === "skipped" ? "na" : "unable"}`}>{status === "given" ? "Given" : status === "skipped" ? "Skipped" : "Missed"}</span>}
    </div>
  );
}

/* -------------------------------- helpers -------------------------------- */

function slotLabel(slot: Slot): string {
  if (slot === "prn") return "As needed";
  if (slot === "interval") return "Round the clock";
  return PERIODS.find((p) => p.key === slot)?.label ?? "Today";
}

export function TabHead({ title, sub }: { title: string; sub: string }) {
  return (
    <div style={{ padding: "10px 2px 2px" }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.03em", margin: 0 }}>{title}</h1>
      <p style={{ fontSize: 13.5, color: "var(--slate)", margin: "3px 0 0", lineHeight: 1.5 }}>{sub}</p>
    </div>
  );
}
