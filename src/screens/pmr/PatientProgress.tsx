import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import ConcernInbox from "../../components/ConcernInbox";
import { useBranding } from "../../branding/BrandingProvider";
import {
  RecoveryTrajectory, StatusTag, SignalDot, Avatar, SectionLabel, Panel, Reveal, ProvenanceTag,
  type Tone,
} from "../../components/clinical";
import {
  getPatient,
  getReadingHistory,
  getMedications,
  getApprovals,
  getDailyUpdates,
  getCareTeam,
  getCareTasks,
  getTodayTaskLogs,
  getPatientPlan,
  decideApproval,
  addMedication,
  updateMedication,
  removeMedication,
  addUpdate,
  type PatientRow,
  type ReadingRow,
  type MedicationRow,
  type ApprovalRow,
  type UpdateRow,
  type MedicationInput,
  type CareTeamMember,
  type CareTaskRow,
  type PatientPlanRow,
} from "../../lib/db";
import LatestCheckin from "../provider/LatestCheckin";

/**
 * Patient Recovery Cockpit — Carelune's signature screen. A clinical hero lets
 * the doctor understand the patient in seconds (identity · pathway · recovery day
 * · condition · attention state · milestone position); below, information is
 * disclosed Now → Change → Detail. Every signal is computed from real data —
 * there is deliberately no composite "recovery score".
 */
export default function PatientProgress({ patientId, onBack }: { patientId: string; onBack: () => void }) {
  const [patient, setPatient] = useState<PatientRow | null>(null);
  const [readings, setReadings] = useState<ReadingRow[]>([]);
  const [meds, setMeds] = useState<MedicationRow[]>([]);
  const [approvals, setApprovals] = useState<ApprovalRow[]>([]);
  const [updates, setUpdates] = useState<UpdateRow[]>([]);
  const [team, setTeam] = useState<CareTeamMember[]>([]);
  const [tasks, setTasks] = useState<CareTaskRow[]>([]);
  const [doneToday, setDoneToday] = useState<Set<string>>(new Set());
  const [plan, setPlan] = useState<PatientPlanRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<PatientView>("overview");

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [p, r, m, a, u] = await Promise.all([
          getPatient(patientId),
          getReadingHistory(patientId, 7),
          getMedications(patientId),
          getApprovals(patientId),
          getDailyUpdates(patientId),
        ]);
        if (!active) return;
        setPatient(p); setReadings(r); setMeds(m); setApprovals(a); setUpdates(u);
        setLoading(false);
        // Secondary signals load progressively — never block the hero.
        getCareTeam(patientId).then((t) => active && setTeam(t)).catch(() => {});
        getPatientPlan(patientId).then((pl) => active && setPlan(pl)).catch(() => {});
        Promise.all([getCareTasks(patientId), getTodayTaskLogs(patientId)])
          .then(([ts, done]) => { if (active) { setTasks(ts); setDoneToday(done); } })
          .catch(() => {});
      } catch (e) {
        if (active) { setError(e instanceof Error ? e.message : "Could not load this patient."); setLoading(false); }
      }
    })();
    return () => { active = false; };
  }, [patientId]);

  if (loading) {
    return (
      <div className="min-h-full bg-mist">
        <div className="bg-midnight-900 px-5 py-10"><div className="mx-auto h-24 max-w-[1120px] animate-pulse rounded-2xl bg-white/10" /></div>
        <div className="mx-auto max-w-[1120px] px-5 py-6"><div className="h-64 animate-pulse rounded-3xl bg-white/70" /></div>
      </div>
    );
  }
  if (error || !patient) {
    return (
      <div className="min-h-full bg-mist p-6">
        <button type="button" onClick={onBack} className="tap inline-flex min-h-[44px] items-center pr-3 text-[13px] font-semibold text-sky-700">← Command centre</button>
        <div className="mt-4 rounded-2xl bg-white p-5 shadow-panel ring-1 ring-ink/[0.05]">
          <p className="text-[14px] font-semibold text-ink">Couldn&rsquo;t load this patient</p>
          <p className="mt-1 text-[13px] text-sage-600">{error ?? "Not found."}</p>
        </div>
      </div>
    );
  }

  const decisionsPending = approvals.filter((a) => a.status === "pending" && a.type !== "patient_query").length;
  const concernsPending = approvals.filter((a) => a.status === "pending" && a.type === "patient_query").length;

  return (
    <div className="min-h-full bg-mist">
      <CockpitHero patient={patient} readings={readings} approvals={approvals} plan={plan} onBack={onBack} />

      <SectionNav
        value={view}
        onChange={setView}
        badges={{ communication: decisionsPending + concernsPending }}
      />

      <main className="mx-auto max-w-[1120px] px-5 py-6 lg:px-8">
        {view === "overview" && (
          <div className="grid gap-5 lg:grid-cols-[1.55fr_1fr]">
            <div className="space-y-5">
              {/* Renders nothing unless this patient is on a Carelune programme
                  and has sent a check-in, so a recovery patient's cockpit is
                  exactly what it was. */}
              <LatestCheckin patientId={patientId} />
              <Reveal index={0}><ChangedSinceYesterday readings={readings} approvals={approvals} updates={updates} doneToday={doneToday} tasks={tasks} /></Reveal>
              <Reveal index={1}><VitalsPanel readings={readings} /></Reveal>
            </div>
            <div className="space-y-5">
              <Reveal index={0}><PendingDecisions decisions={decisionsPending} concerns={concernsPending} onOpen={() => setView("communication")} /></Reveal>
              <Reveal index={1}><DailyCarePanel tasks={tasks} doneToday={doneToday} /></Reveal>
            </div>
          </div>
        )}

        {view === "changes" && (
          <div className="grid gap-5 lg:grid-cols-[1.55fr_1fr]">
            <div className="space-y-5">
              <Reveal index={0}><ChangedSinceYesterday readings={readings} approvals={approvals} updates={updates} doneToday={doneToday} tasks={tasks} /></Reveal>
              <Reveal index={1}><VitalsPanel readings={readings} /></Reveal>
            </div>
            <div className="space-y-5">
              <Reveal index={0}><DailyCarePanel tasks={tasks} doneToday={doneToday} /></Reveal>
            </div>
          </div>
        )}

        {view === "plan" && (
          <div className="grid gap-5 lg:grid-cols-[1.55fr_1fr]">
            <div className="space-y-5">
              <Reveal index={0}><Medicines patientId={patientId} rows={meds} onChange={setMeds} /></Reveal>
              {plan && <Reveal index={1}><DietDetail plan={plan} /></Reveal>}
            </div>
            <div className="space-y-5">
              {plan && <Reveal index={0}><MilestonesPanel plan={plan} day={dayAtHome(patient)} /></Reveal>}
              <Reveal index={1}><DailyCarePanel tasks={tasks} doneToday={doneToday} /></Reveal>
            </div>
          </div>
        )}

        {view === "communication" && (
          <div className="grid gap-5 lg:grid-cols-[1.55fr_1fr]">
            <div className="space-y-5">
              <Reveal index={0}><ApprovalsInbox patientId={patientId} rows={approvals.filter((a) => a.type !== "patient_query")} /></Reveal>
              <Reveal index={1}><ConcernInbox patientId={patientId} /></Reveal>
            </div>
            <div className="space-y-5">
              <Reveal index={0}><CareTeamPanel team={team} /></Reveal>
            </div>
          </div>
        )}

        {view === "history" && (
          <div className="max-w-[720px]">
            <Reveal index={0}><ClinicalTimeline rows={updates} /></Reveal>
          </div>
        )}
      </main>
    </div>
  );
}

/* ------------------------------ section nav -------------------------------- */

type PatientView = "overview" | "changes" | "plan" | "communication" | "history";

const VIEWS: { key: PatientView; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "changes", label: "Changes" },
  { key: "plan", label: "Plan" },
  { key: "communication", label: "Communication" },
  { key: "history", label: "History" },
];

/** One row of sections instead of ten stacked panels — the clinician chooses the
 *  altitude, and each section is reachable in one click on tablet and desktop. */
function SectionNav({ value, onChange, badges }: {
  value: PatientView; onChange: (v: PatientView) => void; badges?: Partial<Record<PatientView, number>>;
}) {
  return (
    <div className="border-b border-line bg-white px-5 lg:px-8">
      <div className="mx-auto flex max-w-[1120px] items-center gap-1 overflow-x-auto" role="tablist" aria-label="Patient sections">
        {VIEWS.map((v) => {
          const on = value === v.key;
          const badge = badges?.[v.key] ?? 0;
          return (
            <button
              key={v.key}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => onChange(v.key)}
              className={`-mb-px inline-flex min-h-[44px] shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3 text-[13.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
                on ? "border-brand-600 text-ink" : "border-transparent text-sage-600 hover:text-ink"
              }`}
            >
              {v.label}
              {badge > 0 && (
                <span className="rounded-full bg-warn-100 px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-warn-600">{badge}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------------------- pending decisions ---------------------------- */

/** The clinician's own queue, stated plainly at the top of Overview. */
function PendingDecisions({ decisions, concerns, onOpen }: { decisions: number; concerns: number; onOpen: () => void }) {
  const total = decisions + concerns;
  return (
    <Panel
      label="Decision"
      title="Waiting on you"
      aside={<StatusTag tone={total > 0 ? "attention" : "recovery"}>{total} pending</StatusTag>}
    >
      {total === 0 ? (
        <p className="text-[13.5px] text-sage-500">Nothing is waiting on your decision for this patient.</p>
      ) : (
        <>
          <ul className="space-y-2">
            {decisions > 0 && (
              <li className="flex items-center gap-2.5 text-[13.5px] text-ink">
                <SignalDot tone="attention" />
                <span><span className="font-semibold">{decisions}</span> clinical item{decisions === 1 ? "" : "s"} to approve, suggest on, or decline</span>
              </li>
            )}
            {concerns > 0 && (
              <li className="flex items-center gap-2.5 text-[13.5px] text-ink">
                <SignalDot tone="calm" />
                <span><span className="font-semibold">{concerns}</span> concern{concerns === 1 ? "" : "s"} raised from home, unanswered</span>
              </li>
            )}
          </ul>
          <button type="button" onClick={onOpen} className="tap mt-3 inline-flex min-h-[44px] items-center rounded-full bg-brand-800 px-4 text-[12.5px] font-semibold text-white hover:bg-brand-900">
            Open Communication
          </button>
        </>
      )}
    </Panel>
  );
}

/* ------------------------------- helpers ---------------------------------- */

function dayAtHome(p: PatientRow): number {
  const start = new Date(p.journey_start).getTime();
  return Math.max(1, Math.floor((Date.now() - start) / 86_400_000) + 1);
}
function num(v: string | null | undefined): number {
  const n = Number((v ?? "").toString().replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : NaN;
}
function timeAgo(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  return `${Math.round(hrs / 24)} d ago`;
}
function within24h(iso: string): boolean {
  return Date.now() - new Date(iso).getTime() < 86_400_000;
}

/* --------------------------------- hero ----------------------------------- */

function CockpitHero({
  patient, readings, approvals, plan, onBack,
}: {
  patient: PatientRow; readings: ReadingRow[]; approvals: ApprovalRow[]; plan: PatientPlanRow | null; onBack: () => void;
}) {
  const day = dayAtHome(patient);
  const total = patient.journey_total_days || 30;

  const urgentOpen = approvals.filter((a) => a.status === "pending" && a.urgency === "urgent").length;
  const pendingOpen = approvals.filter((a) => a.status === "pending").length;

  // salient vital trend for the hero trajectory
  const bpSys = readings.map((r) => num((r.bp ?? "").split("/")[0])).filter(Number.isFinite);
  const grbs = readings.map((r) => num(r.grbs)).filter(Number.isFinite);
  const traj = bpSys.length >= 2 ? { label: "Blood pressure", values: bpSys, good: "down" as const }
    : grbs.length >= 2 ? { label: "Blood sugar", values: grbs, good: "down" as const } : null;
  const improving = traj ? (traj.good === "down" ? traj.values[traj.values.length - 1] < traj.values[0] : traj.values[traj.values.length - 1] > traj.values[0]) : null;

  const attention: { tone: Tone; label: string } = urgentOpen > 0
    ? { tone: "escalation", label: `Needs review — ${urgentOpen} urgent` }
    : pendingOpen > 0
      ? { tone: "attention", label: `Needs review — ${pendingOpen} pending` }
      : improving === false
        ? { tone: "attention", label: "A vital is trending the wrong way" }
        : patient.status === "active"
          ? { tone: "recovery", label: "Recovery progressing as expected" }
          : { tone: "calm", label: "Awaiting recovery plan" };

  const summary = plan?.content?.clinical_summary?.trim();
  const condition = summary || (patient.diagnosis.length ? patient.diagnosis.join(", ") : "Recovery at home");
  // Diagnoses are chips only when the condition line is the clinician's summary —
  // otherwise the line already IS the diagnosis list.
  const showDiagnosisChips = !!summary && patient.diagnosis.length > 0;

  const nextMilestone = useMemo(() => {
    const ms = (plan?.content?.milestones ?? []).filter((m) => m.by_day != null).sort((a, b) => (a.by_day! - b.by_day!));
    const upcoming = ms.find((m) => (m.by_day as number) >= day);
    return upcoming ?? ms[ms.length - 1] ?? null;
  }, [plan, day]);

  return (
    <div className="bg-midnight-900">
      <div className="relative mx-auto max-w-[1120px] overflow-hidden px-5 py-7 lg:px-8 lg:py-9">
        <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(80% 120% at 100% 0%, rgba(42,111,199,0.20), transparent 60%)" }} />
        <div className="relative">
          <button type="button" onClick={onBack} className="tap inline-flex min-h-[44px] items-center pr-3 text-[13px] font-semibold text-haze-300 hover:text-haze-100">← Command centre</button>

          <div className="mt-4 flex flex-wrap items-start justify-between gap-6">
            {/* identity + condition */}
            <div className="flex min-w-0 gap-4">
              <Avatar name={patient.full_name} tone={attention.tone} size={56} />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h1 className="font-display text-[22px] font-semibold tracking-[-0.02em] text-haze-100 sm:text-[26px]">{patient.full_name}</h1>
                  <StatusTag tone={attention.tone}>{attention.label}</StatusTag>
                </div>
                {/* Identity said once: age/sex, where, and where they are in the
                    journey. Week is derivable from the day, and the diagnosis
                    already leads the condition line, so neither is repeated. */}
                <p className="mt-1 text-[13px] text-haze-400">
                  {patient.age ?? "—"}{patient.sex ? " " + patient.sex : ""}{patient.location ? ` · ${patient.location}` : ""}
                  {" · "}Day {day} of {total}
                </p>
                <p className="mt-2.5 max-w-xl text-[14.5px] leading-relaxed text-haze-200">{condition}</p>
                {showDiagnosisChips && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {patient.diagnosis.slice(0, 3).map((dx) => (
                      <span key={dx} className="rounded-full bg-white/[0.06] px-2.5 py-1 text-[12px] font-medium text-haze-200 ring-1 ring-white/10">{dx}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* trajectory + milestone position */}
            <div className="w-full max-w-[300px] rounded-2xl bg-white/[0.06] p-4 ring-1 ring-white/10 backdrop-blur-sm sm:w-[300px]">
              <div className="flex items-center justify-between">
                <SectionLabel onDark>{traj ? traj.label : "Recovery trajectory"}</SectionLabel>
                {traj && improving != null && (
                  <span className={`text-[11px] font-bold ${improving ? "text-brand-300" : "text-warn-300"}`}>{improving ? "improving" : "watch"}</span>
                )}
              </div>
              <div className="mt-2">
                {traj ? <RecoveryTrajectory values={traj.values} tone={improving === false ? "attention" : "recovery"} height={44} animate onDark />
                  : <p className="py-3 text-[12px] text-haze-400">Trends appear here as the home team records daily readings.</p>}
              </div>
              {nextMilestone && (
                <div className="mt-3 border-t border-white/10 pt-3">
                  <SectionLabel onDark>Next milestone</SectionLabel>
                  <p className="mt-1 text-[13.5px] font-semibold text-haze-100">{nextMilestone.name}</p>
                  <p className="mt-0.5 text-[12px] text-haze-300">
                    {nextMilestone.by_day != null && ((nextMilestone.by_day >= day)
                      ? `Target day ${nextMilestone.by_day} · ${nextMilestone.by_day - day} day${nextMilestone.by_day - day === 1 ? "" : "s"} to go`
                      : `Target day ${nextMilestone.by_day} · now day ${day}`)}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------- changed since yesterday ----------------------- */

function ChangedSinceYesterday({
  readings, approvals, updates, doneToday, tasks,
}: {
  readings: ReadingRow[]; approvals: ApprovalRow[]; updates: UpdateRow[]; doneToday: Set<string>; tasks: CareTaskRow[];
}) {
  const changes: { tone: Tone; text: ReactNode }[] = [];

  // vital deltas from the last two readings
  const deltas: { label: string; a: number; b: number; good: "up" | "down" }[] = [];
  const push = (label: string, series: number[], good: "up" | "down") => {
    if (series.length >= 2) deltas.push({ label, a: series[series.length - 2], b: series[series.length - 1], good });
  };
  push("BP (sys)", readings.map((r) => num((r.bp ?? "").split("/")[0])).filter(Number.isFinite), "down");
  push("Blood sugar", readings.map((r) => num(r.grbs)).filter(Number.isFinite), "down");
  push("Urine", readings.map((r) => num(r.urine_ml)).filter(Number.isFinite), "up");
  for (const d of deltas) {
    if (d.a === d.b) continue;
    const better = d.good === "down" ? d.b < d.a : d.b > d.a;
    changes.push({ tone: better ? "recovery" : "attention", text: <><span className="font-semibold">{d.label}</span> {d.a} → {d.b}{better ? " · improving" : " · watch"}</> });
  }

  const newConcerns = approvals.filter((a) => a.type === "patient_query" && within24h(a.created_at)).length;
  const newApprovals = approvals.filter((a) => a.type !== "patient_query" && a.status === "pending" && within24h(a.created_at)).length;
  const newUpdates = updates.filter((u) => within24h(u.created_at)).length;
  const doneCount = tasks.filter((t) => doneToday.has(t.id)).length;

  if (newConcerns > 0) changes.push({ tone: "attention", text: <><span className="font-semibold">{newConcerns}</span> new concern{newConcerns === 1 ? "" : "s"} raised from home</> });
  if (newApprovals > 0) changes.push({ tone: "attention", text: <><span className="font-semibold">{newApprovals}</span> new item{newApprovals === 1 ? "" : "s"} awaiting your decision</> });
  if (tasks.length > 0) changes.push({ tone: doneCount >= tasks.length ? "recovery" : "neutral", text: <><span className="font-semibold">{doneCount}/{tasks.length}</span> care tasks completed today</> });
  if (newUpdates > 0 && changes.length < 5) changes.push({ tone: "calm", text: <><span className="font-semibold">{newUpdates}</span> update{newUpdates === 1 ? "" : "s"} from the care team today</> });

  return (
    <Panel label="Now" title="Changed since yesterday">
      {changes.length === 0 ? (
        <p className="text-[13.5px] text-sage-500">No material changes recorded since yesterday. The home team is logging as usual.</p>
      ) : (
        <ul className="space-y-2.5">
          {changes.map((c, i) => (
            <li key={i} className="flex items-center gap-2.5 text-[13.5px] text-ink">
              <SignalDot tone={c.tone} />
              {c.text}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* ------------------------------- vitals ----------------------------------- */

function VitalsPanel({ readings }: { readings: ReadingRow[] }) {
  const bpSys = readings.map((r) => num((r.bp ?? "").split("/")[0])).filter(Number.isFinite);
  const bpDia = readings.map((r) => num((r.bp ?? "").split("/")[1])).filter(Number.isFinite);
  const grbs = readings.map((r) => num(r.grbs)).filter(Number.isFinite);
  const urine = readings.map((r) => num(r.urine_ml)).filter(Number.isFinite);
  const last = (a: number[]) => a[a.length - 1];

  const cards: ReactNode[] = [];
  if (bpSys.length >= 2 && bpDia.length >= 2) cards.push(<VitalCard key="bp" label="Blood pressure" values={bpSys} display={`${last(bpSys)}/${last(bpDia)}`} good="down" />);
  if (grbs.length >= 2) cards.push(<VitalCard key="grbs" label="Blood sugar" values={grbs} display={`${last(grbs)}`} good="down" />);
  if (urine.length >= 2) cards.push(<VitalCard key="urine" label="Urine (mL)" values={urine} display={`${last(urine)}`} good="up" />);

  return (
    <Panel label="Detail" title={`Vitals · last ${readings.length || 0} day${readings.length === 1 ? "" : "s"}`}>
      {cards.length === 0 ? (
        <p className="text-[13.5px] text-sage-500">No readings recorded yet. They appear here as the home team logs them daily.</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">{cards}</div>
          <p className="mt-3 text-[12px] text-sage-500">Recorded at home by the family or caregiver — a {readings.length}-day trend, not a single reading.</p>
        </>
      )}
    </Panel>
  );
}

function VitalCard({ label, values, display, good }: { label: string; values: number[]; display: string; good: "up" | "down" }) {
  const improving = good === "down" ? values[values.length - 1] < values[0] : values[values.length - 1] > values[0];
  const steady = values[values.length - 1] === values[0];
  const tone: Tone = steady ? "neutral" : improving ? "recovery" : "attention";
  return (
    <div className="rounded-2xl bg-mist p-3.5 ring-1 ring-ink/[0.04]">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-sage-500">{label}</span>
        <span className={`text-[11px] font-bold ${tone === "recovery" ? "text-brand-700" : tone === "attention" ? "text-warn-600" : "text-sage-500"}`}>
          {steady ? "steady" : improving ? "improving" : "watch"}
        </span>
      </div>
      <div className="mt-1 text-[19px] font-semibold tabular-nums text-ink">{display}</div>
      <div className="text-[11px] tabular-nums text-sage-500">{values[0]} → {values[values.length - 1]}</div>
      <div className="mt-2"><RecoveryTrajectory values={values} tone={tone} height={30} animate={false} /></div>
    </div>
  );
}

/* ---------------------------- daily care & physio ------------------------- */

function DailyCarePanel({ tasks, doneToday }: { tasks: CareTaskRow[]; doneToday: Set<string> }) {
  if (tasks.length === 0) {
    return (
      <Panel label="Detail" title="Daily care & mobility">
        <p className="text-[13.5px] text-sage-500">Daily care tasks appear here once the recovery plan is active.</p>
      </Panel>
    );
  }
  const done = tasks.filter((t) => doneToday.has(t.id)).length;
  const pct = Math.round((done / tasks.length) * 100);
  const physio = tasks.filter((t) => /physio|mobil|therap/i.test(t.discipline));
  const tone: Tone = pct >= 80 ? "recovery" : pct >= 40 ? "attention" : "neutral";
  return (
    <Panel
      label="Detail"
      title="Daily care & mobility"
      aside={<span className="text-[12.5px] font-semibold text-sage-600">{done}/{tasks.length} today</span>}
    >
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-mist-200">
        <div className={`h-full rounded-full ${tone === "recovery" ? "bg-brand-500" : tone === "attention" ? "bg-warn-500" : "bg-sky-500"}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 text-[12.5px] text-sage-600">{pct}% of today&rsquo;s care completed by the home team.</p>
      {physio.length > 0 && (
        <div className="mt-4">
          <SectionLabel>Mobility & physiotherapy</SectionLabel>
          <ul className="mt-2 space-y-1.5">
            {physio.map((t) => (
              <li key={t.id} className="flex items-center gap-2.5 text-[13.5px] text-ink">
                <span className={`grid h-4 w-4 place-items-center rounded-full text-[10px] ${doneToday.has(t.id) ? "bg-brand-500 text-white" : "bg-mist-200 text-sage-500"}`}>{doneToday.has(t.id) ? "✓" : ""}</span>
                <span className="w-[52px] shrink-0 text-[12px] font-semibold text-sky-700 tabular-nums">{t.time_label}</span>
                <span className="min-w-0 flex-1">{t.title}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}

/* ------------------------------- diet ------------------------------------- */

function DietDetail({ plan }: { plan: PatientPlanRow }) {
  const diet = plan.content?.diet ?? [];
  return (
    <Panel label="Detail" title="Diet">
      {diet.length === 0 ? (
        <p className="text-[13.5px] text-sage-500">No specific diet instructions in the active plan.</p>
      ) : (
        <ul className="space-y-1.5">
          {diet.map((d, i) => (
            <li key={i} className="flex items-start gap-2 text-[13.5px] text-ink">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" />
              <span className="min-w-0 flex-1">{d.text}</span>
              <ProvenanceTag p={d.provenance} />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* ------------------------------ milestones -------------------------------- */

function MilestonesPanel({ plan, day }: { plan: PatientPlanRow; day: number }) {
  const ms = (plan.content?.milestones ?? []).slice().sort((a, b) => ((a.by_day ?? 999) - (b.by_day ?? 999)));
  return (
    <Panel label="Detail" title="Milestones">
      {ms.length === 0 ? (
        <p className="text-[13.5px] text-sage-500">No milestones set in the active plan.</p>
      ) : (
        <ol className="space-y-2.5">
          {ms.map((m, i) => {
            const due = m.by_day != null;
            const passed = due && (m.by_day as number) < day;
            const current = due && (m.by_day as number) >= day && (i === 0 || (ms[i - 1].by_day ?? 0) < day);
            return (
              <li key={i} className="flex items-center gap-3">
                <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold ${passed ? "bg-brand-500 text-white" : current ? "bg-sky-600 text-white ring-4 ring-sky-500/15" : "bg-mist-200 text-sage-500"}`}>{i + 1}</span>
                <span className="min-w-0 flex-1 text-[13.5px] text-ink">{m.name}</span>
                {due && <span className="shrink-0 text-[12px] font-medium text-sage-500">target day {m.by_day}</span>}
              </li>
            );
          })}
        </ol>
      )}
      <p className="mt-3 text-[12px] text-sage-500">Targets from the approved pathway and your stated goal — not completion claims.</p>
    </Panel>
  );
}

/* ------------------------------ care team --------------------------------- */

const TEAM_LABEL: Record<string, string> = { lead_doctor: "Lead clinician", nurse: "Rehab nurse", coordinator: "Recovery coordinator" };

function CareTeamPanel({ team }: { team: CareTeamMember[] }) {
  return (
    <Panel label="Context" title="Care team">
      {team.length === 0 ? (
        <p className="text-[13.5px] text-sage-500">No care team assigned yet.</p>
      ) : (
        <ul className="space-y-3">
          {team.map((m) => (
            <li key={m.id} className="flex items-center gap-3">
              <Avatar name={m.full_name ?? "?"} size={36} tone="neutral" />
              <div className="min-w-0">
                <div className="truncate text-[13.5px] font-semibold text-ink">{m.full_name ?? "Unassigned"}</div>
                <div className="text-[12px] text-sage-500">{TEAM_LABEL[m.team_role] ?? m.team_role}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* --------------------------- approvals inbox ------------------------------ */

type LocalStatus = ApprovalRow["status"];

/** Used only when a staff account has no name on file — never a clinical title
 *  the signed-in person does not hold. */
const STAFF_FALLBACK: Record<string, string> = {
  pmr: "Doctor", duty_doctor: "Duty doctor", nurse: "Nurse",
};
const A_META: Record<ApprovalRow["type"], { label: string; tone: Tone }> = {
  duty_med: { label: "Medicine suggestion", tone: "calm" },
  nurse_query: { label: "Nurse query", tone: "recovery" },
  patient_query: { label: "Family query", tone: "neutral" },
};

function ApprovalsInbox({ patientId, rows }: { patientId: string; rows: ApprovalRow[] }) {
  // A note written here is attributed to the person who actually wrote it. It
  // used to be stamped "Lead clinician" for whoever was signed in, which would
  // read as a doctor's note even when an admin account wrote it.
  const { profile } = useBranding();
  const [items, setItems] = useState(rows);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const setStatus = (id: string, status: LocalStatus) => setItems((xs) => xs.map((i) => (i.id === id ? { ...i, status } : i)));

  const decide = async (id: string, status: "approved" | "declined") => {
    setBusy(id); const prev = items; setStatus(id, status);
    try { await decideApproval(id, status); } catch { setItems(prev); } finally { setBusy(null); }
  };
  const sendSuggestion = async (it: ApprovalRow) => {
    setBusy(it.id); const prev = items; setStatus(it.id, "suggested"); setNoteFor(null);
    const text = note.trim(); setNote("");
    try {
      await decideApproval(it.id, "suggested");
      if (text) {
        await addUpdate(patientId, {
          source: (profile?.role as UpdateRow["source"]) ?? "pmr",
          author_name: profile?.full_name?.trim() || STAFF_FALLBACK[profile?.role ?? ""] || "Care team",
          body: `Re: ${it.from_name ?? "query"} — ${text}`,
        });
      }
    } catch { setItems(prev); } finally { setBusy(null); }
  };

  const pending = items.filter((i) => i.status === "pending").length;
  const rank = (i: ApprovalRow) => (i.status === "pending" ? (i.urgency === "urgent" ? 0 : 1) : 2);
  const ordered = [...items].sort((a, b) => rank(a) - rank(b));

  return (
    <Panel
      label="Decision"
      title="Approvals"
      aside={<StatusTag tone={pending > 0 ? "attention" : "recovery"}>{pending} pending</StatusTag>}
    >
      {items.length === 0 ? (
        <p className="text-[13.5px] text-sage-500">Nothing awaiting your decision.</p>
      ) : (
        <ul className="space-y-2.5">
          {ordered.map((it) => (
            <li key={it.id} className={`rounded-2xl p-3.5 ring-1 ${it.urgency === "urgent" && it.status === "pending" ? "bg-warn-100/50 ring-warn-500/20" : "bg-mist ring-ink/[0.05]"}`}>
              <div className="flex items-center gap-2">
                <StatusTag tone={A_META[it.type].tone}>{A_META[it.type].label}</StatusTag>
                {it.urgency === "urgent" && <StatusTag tone="escalation">Urgent</StatusTag>}
                <span className="ml-auto text-[11px] text-sage-500">{timeAgo(it.created_at)}</span>
              </div>
              <p className="mt-1.5 text-[13px] font-semibold text-ink">{it.from_name}</p>
              <p className="mt-0.5 text-[13px] leading-snug text-sage-600">{it.message}</p>
              {it.suggestion && (
                <p className="mt-1.5 rounded-xl bg-white px-3 py-1.5 text-[13px] text-ink ring-1 ring-ink/[0.06]">
                  <span className="font-semibold text-sky-700">{it.type === "patient_query" ? "Your reply: " : "Suggests: "}</span>{it.suggestion}
                </p>
              )}
              {it.status === "pending" ? (
                noteFor === it.id ? (
                  <div className="mt-2.5">
                    <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder={it.type === "patient_query" ? "Your reply to the family…" : "Your suggestion back to the team…"} className="w-full rounded-xl bg-white px-3 py-2 text-[13px] text-ink ring-1 ring-line focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500" />
                    <div className="mt-2 flex gap-2">
                      <button type="button" onClick={() => sendSuggestion(it)} disabled={busy === it.id || !note.trim()} className="tap rounded-full bg-brand-800 px-3.5 py-1.5 text-[12px] font-semibold text-white disabled:opacity-60">{it.type === "patient_query" ? "Send reply" : "Send suggestion"}</button>
                      <button type="button" onClick={() => { setNoteFor(null); setNote(""); }} className="tap rounded-full px-3 py-1.5 text-[12px] font-semibold text-sage-600">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {it.type === "patient_query" ? (
                      <>
                        <button type="button" onClick={() => setNoteFor(it.id)} className="tap rounded-full bg-brand-800 px-3.5 py-1.5 text-[12px] font-semibold text-white">Reply</button>
                        <button type="button" onClick={() => decide(it.id, "approved")} disabled={busy === it.id} className="tap rounded-full bg-white px-3.5 py-1.5 text-[12px] font-semibold text-sage-600 ring-1 ring-line disabled:opacity-60">Mark reviewed</button>
                      </>
                    ) : (
                      <>
                        <button type="button" onClick={() => decide(it.id, "approved")} disabled={busy === it.id} className="tap rounded-full bg-brand-800 px-3.5 py-1.5 text-[12px] font-semibold text-white disabled:opacity-60">Approve</button>
                        <button type="button" onClick={() => setNoteFor(it.id)} className="tap rounded-full bg-brand-800 px-3.5 py-1.5 text-[12px] font-semibold text-white">Suggest</button>
                        <button type="button" onClick={() => decide(it.id, "declined")} disabled={busy === it.id} className="tap rounded-full bg-white px-3.5 py-1.5 text-[12px] font-semibold text-coral-600 ring-1 ring-coral-200 disabled:opacity-60">Decline</button>
                      </>
                    )}
                  </div>
                )
              ) : (
                <p className="mt-2 text-[12px] font-semibold text-sage-600">
                  {it.type === "patient_query"
                    ? it.status === "suggested" ? "Replied · the family can see it" : "Reviewed"
                    : `${it.status === "approved" ? "Approved" : it.status === "declined" ? "Declined" : "Suggestion sent"} · saved`}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* -------------------------------- medicines ------------------------------- */

const FIELD = "rounded-xl bg-white px-3 py-1.5 text-[13px] text-ink ring-1 ring-line focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500";
const emptyDraft: MedicationInput = { name: "", dose: "", freq: "", timing: "After food" };

function Medicines({ patientId, rows, onChange }: { patientId: string; rows: MedicationRow[]; onChange: (m: MedicationRow[]) => void }) {
  const [editId, setEditId] = useState<string | null>(null);
  const [draft, setDraft] = useState<MedicationInput>(emptyDraft);
  const [busy, setBusy] = useState(false);

  const startAdd = () => { setDraft(emptyDraft); setEditId("new"); };
  const startEdit = (m: MedicationRow) => { setDraft({ name: m.name, dose: m.dose ?? "", freq: m.freq ?? "", timing: m.timing ?? "", note: m.note ?? "" }); setEditId(m.id); };

  const save = async () => {
    if (!draft.name.trim()) return;
    setBusy(true);
    try {
      if (editId === "new") { const created = await addMedication(patientId, draft); onChange([...rows, created]); }
      else if (editId) { await updateMedication(editId, draft); onChange(rows.map((m) => (m.id === editId ? { ...m, ...draft } : m))); }
      setEditId(null);
    } finally { setBusy(false); }
  };
  const remove = async (id: string) => {
    const prev = rows; onChange(rows.filter((m) => m.id !== id));
    try { await removeMedication(id); } catch { onChange(prev); }
  };

  return (
    <Panel
      label="Detail"
      title="Medicines"
      aside={<button type="button" onClick={startAdd} className="tap rounded-full bg-brand-800 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-brand-900">+ Add</button>}
    >
      {editId !== null && (
        <div className="mb-3 rounded-2xl bg-mist p-3 ring-1 ring-ink/[0.04]">
          <div className="grid grid-cols-2 gap-2">
            <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Medicine name" className={FIELD} />
            <input value={draft.dose} onChange={(e) => setDraft({ ...draft, dose: e.target.value })} placeholder="Dose (e.g. 5 mg)" className={FIELD} />
            <input value={draft.freq} onChange={(e) => setDraft({ ...draft, freq: e.target.value })} placeholder="Frequency (1-0-1)" className={FIELD} />
            <input value={draft.timing} onChange={(e) => setDraft({ ...draft, timing: e.target.value })} placeholder="Timing" className={FIELD} />
          </div>
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={save} disabled={busy} className="tap rounded-full bg-brand-800 px-3.5 py-1.5 text-[12px] font-semibold text-white disabled:opacity-60">{editId === "new" ? "Add medicine" : "Save"}</button>
            <button type="button" onClick={() => setEditId(null)} className="tap rounded-full px-3 py-1.5 text-[12px] font-semibold text-sage-600">Cancel</button>
          </div>
        </div>
      )}
      {rows.length === 0 ? (
        <p className="text-[13.5px] text-sage-500">No medicines recorded.</p>
      ) : (
        <ul className="divide-y divide-ink/[0.05]">
          {rows.map((m) => (
            <li key={m.id} className="flex items-center gap-2 py-2.5">
              <span className="min-w-0 flex-1 text-[13.5px] text-ink">
                <span className="font-semibold">{m.name}</span> <span className="text-sage-500">{m.dose}</span>
                <span className="block text-[11px] text-sage-400">{m.timing}{m.note ? ` · ${m.note}` : ""}</span>
              </span>
              <span className="shrink-0 rounded-md bg-mist px-1.5 py-0.5 text-[12px] font-semibold tabular-nums text-ink ring-1 ring-ink/[0.04]">{m.freq}</span>
              <button type="button" onClick={() => startEdit(m)} className="tap inline-flex min-h-[44px] shrink-0 items-center px-2 text-[12.5px] font-semibold text-sky-700">Edit</button>
              <button type="button" onClick={() => remove(m.id)} aria-label={`Remove ${m.name}`} className="tap inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center text-[18px] leading-none text-sage-400 hover:text-coral-500">×</button>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[12px] text-sage-500">You own medicine changes. Duty-doctor suggestions arrive in Approvals.</p>
    </Panel>
  );
}

/* ---------------------------- clinical timeline --------------------------- */

const SRC: Record<UpdateRow["source"], { label: string; tone: Tone }> = {
  caregiver: { label: "From home", tone: "calm" },
  nurse: { label: "Rehab nurse", tone: "recovery" },
  duty_doctor: { label: "Duty doctor", tone: "neutral" },
  pmr: { label: "Lead clinician", tone: "attention" },
};
function clockTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

function ClinicalTimeline({ rows }: { rows: UpdateRow[] }) {
  return (
    <Panel label="Context" title="Clinical timeline">
      {rows.length === 0 ? (
        <p className="text-[13.5px] text-sage-500">No updates yet today.</p>
      ) : (
        <ol className="space-y-3">
          {rows.map((u) => (
            <li key={u.id} className="flex gap-3">
              <div className="w-11 shrink-0 pt-0.5 text-[12px] font-medium tabular-nums text-sage-500">{clockTime(u.created_at)}</div>
              <div className={`min-w-0 flex-1 rounded-xl px-3 py-2 ${u.flag === "watch" ? "bg-warn-100/60 ring-1 ring-warn-500/20" : "bg-mist"}`}>
                <div className="flex items-center gap-2">
                  <StatusTag tone={SRC[u.source].tone}>{SRC[u.source].label}</StatusTag>
                  {u.author_name && <span className="text-[12px] font-medium text-sage-500">{u.author_name}</span>}
                </div>
                <p className="mt-1 text-[13px] leading-snug text-ink">{u.body}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}
