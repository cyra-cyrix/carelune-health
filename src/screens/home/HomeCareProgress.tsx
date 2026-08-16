import { useMemo, useState } from "react";
import { readingRowToInput, type ReadingsInput } from "../../lib/db";
import { prescribedParams, numericValue, type MonitorParam } from "../../domain/monitoring";
import { useHc, HcIcon, niceDate, niceTime } from "./hc-kit";
import { TabHead } from "./HomeCareMedicines";

/* ============================================================================
   Progress — recovery first. The story is milestones and functional progress,
   not vital signs. Order: recovery week/day → working-towards milestone →
   achieved milestones → where things stand (clinician summary) → check-ins this
   week → latest care-team recovery note. Vital-sign trends live in a COLLAPSED
   "Clinical readings" section, opened only when wanted.

   Built only from persisted data. No proprietary recovery score, no prediction,
   no automated interpretation. Formal functional instruments (mRS/Barthel)
   aren't household-readable, and per-day care-task completion has no bulk
   function — the week strip uses reading-history presence (see the gap report).
   ========================================================================== */

const SOURCE_LABEL: Record<string, string> = { caregiver: "From home", nurse: "Nurse", duty_doctor: "Duty doctor", pmr: "Doctor" };

export function HomeCareProgress() {
  const { patient, day, plan, history, feed } = useHc();
  const first = patient.full_name.split(" ")[0];
  const week = Math.ceil(day / 7);
  const [clinicalOpen, setClinicalOpen] = useState(false);

  const milestones = useMemo(() => {
    if (!plan || plan.status !== "approved") return [];
    return (plan.content.milestones ?? []).map((m) => ({
      name: m.name, by: m.by_day, done: m.by_day != null ? day >= m.by_day : false,
    }));
  }, [plan, day]);
  const working = milestones.find((m) => !m.done) ?? null;
  const achieved = milestones.filter((m) => m.done);

  const inputs = useMemo<ReadingsInput[]>(() => history.map(readingRowToInput), [history]);
  const trends = useMemo(() => {
    const modules = (plan?.content?.observations ?? []).map((o) => o.module);
    const params = prescribedParams(modules, patient.diagnosis ?? []).filter((p) => p.trend);
    return params.map((p) => ({ p, series: inputs.map((inp) => numericValue(p, inp[p.field])).filter((n): n is number => n != null) }))
      .filter((t) => t.series.length >= 2);
  }, [plan, patient.diagnosis, inputs]);

  const recorded7 = useMemo(() => new Set(history.map((r) => r.reading_date)), [history]);
  const last7 = useMemo(() => {
    const out: { iso: string; on: boolean }[] = [];
    const today = new Date();
    for (let i = 6; i >= 0; i--) { const d = new Date(today.getTime() - i * 86_400_000); const iso = d.toISOString().slice(0, 10); out.push({ iso, on: recorded7.has(iso) }); }
    return out;
  }, [recorded7]);

  const recoveryNote = feed.find((u) => u.source !== "caregiver");
  const nothing = milestones.length === 0 && trends.length === 0 && feed.length === 0;

  return (
    <div style={{ paddingTop: 8 }}>
      <TabHead title="Progress" sub={`${first}’s recovery · Day ${day}${patient.journey_total_days ? ` of ${patient.journey_total_days}` : ""} · Week ${week}`} />

      {/* Recovery hero — you are moving forward */}
      {working ? (
        <div className="hc-recovery">
          <div className="rc-eyebrow">Working towards</div>
          <div className="rc-goal">{working.name}</div>
          {working.by != null && <div className="rc-sub">Target · day {working.by}{day <= working.by ? ` · ${working.by - day} day${working.by - day === 1 ? "" : "s"} to go` : ""}</div>}
          {achieved.length > 0 && <div className="rc-done">{achieved.length} milestone{achieved.length === 1 ? "" : "s"} reached so far</div>}
        </div>
      ) : milestones.length > 0 ? (
        <div className="hc-recovery"><div className="rc-goal">All planned milestones reached 🎉</div><div className="rc-sub">Your care team will set what’s next.</div></div>
      ) : null}

      {/* Milestone list */}
      {milestones.length > 0 && (
        <>
          <h2 className="hc-h2">Milestones</h2>
          <div className="hc-card">
            {milestones.map((m, i) => (
              <div key={i} className={`hc-mile${m.done ? " done" : m === working ? " next" : ""}`}>
                <span className="mk">{m.done ? <HcIcon.Check size={13} /> : null}</span>
                <span className="mbody"><b>{m.name}</b><small>{m.done ? "Reached" : m === working ? "Working towards" : m.by != null ? `Target: day ${m.by}` : "Ahead"}</small></span>
              </div>
            ))}
          </div>
        </>
      )}

      {plan?.content?.clinical_summary && (
        <div className="hc-card">
          <h3>Where things stand</h3>
          <p className="hc-muted" style={{ padding: 0, marginTop: 6 }}>{plan.content.clinical_summary}</p>
        </div>
      )}

      {/* Check-ins this week */}
      <div className="hc-card">
        <h3>Check-ins recorded this week</h3>
        <div className="hc-week" style={{ marginTop: 10, padding: 0 }}>
          {last7.map((d) => (
            <div key={d.iso} className={`hc-day${d.on ? " on rec" : ""}`} style={{ cursor: "default" }}>
              <span className="dnum num">{new Date(d.iso).getDate()}</span>
              <span className="ddot" />
            </div>
          ))}
        </div>
      </div>

      {/* Latest care-team recovery note */}
      {recoveryNote && (
        <>
          <h2 className="hc-h2">From your care team</h2>
          <div className="hc-card">
            <div className="hc-feed-item">
              <div className="hc-feed-head">
                <b>{recoveryNote.author_name || SOURCE_LABEL[recoveryNote.source] || "Care team"}</b>
                <time>{niceDate(recoveryNote.created_at)} · {niceTime(recoveryNote.created_at)}</time>
              </div>
              <p>{recoveryNote.body}</p>
            </div>
          </div>
        </>
      )}

      {/* Clinical readings — collapsed secondary */}
      {trends.length > 0 && (
        <>
          <button type="button" className="hc-collapse" aria-expanded={clinicalOpen} onClick={() => setClinicalOpen((v) => !v)}>
            <span className="cl-ic"><HcIcon.Chart size={18} /></span>
            <span className="cl-body"><b>Clinical readings</b><small>Blood pressure, pulse and other trends</small></span>
            <span className={`cl-chev${clinicalOpen ? " open" : ""}`}><HcIcon.Right size={18} /></span>
          </button>
          {clinicalOpen && <div className="hc-collapse-body">{trends.map(({ p, series }) => <TrendCard key={p.key} param={p} series={series} />)}</div>}
        </>
      )}

      {nothing && (
        <div className="hc-empty"><b>Progress appears as care is recorded</b><p>Milestones, care-team notes and readings for {first} will show here.</p></div>
      )}

      <p className="hc-muted" style={{ marginTop: 16 }}>A summary of recovery — not a clinical assessment.</p>
    </div>
  );
}

function TrendCard({ param, series }: { param: MonitorParam; series: number[] }) {
  const latest = series[series.length - 1];
  const prev = series.length >= 2 ? series[series.length - 2] : null;
  const max = Math.max(...series), min = Math.min(...series);
  const span = max - min || 1;
  return (
    <div className="hc-card">
      <div className="hc-metric-row">
        <h3 style={{ margin: 0 }}>{param.short}</h3>
        <span className="mv num">{latest}{param.unit ? <small> {param.unit}</small> : null}</span>
      </div>
      <div className="hc-trend" aria-hidden="true">
        {series.slice(-7).map((v, i) => <span key={i} className="bar" style={{ height: `${20 + ((v - min) / span) * 80}%` }} />)}
      </div>
      {prev != null && (
        <p className="hc-muted" style={{ padding: 0, marginTop: 8 }}>
          {latest === prev ? "Steady since the last reading" : `${latest > prev ? "Up" : "Down"} from ${prev}${param.unit ? ` ${param.unit}` : ""} last reading`}
        </p>
      )}
    </div>
  );
}
