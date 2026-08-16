import { useEffect, useMemo, useRef, useState } from "react";
import { useBranding } from "../../branding/BrandingProvider";
import {
  getMyPatient, getCareTasks, getTodayTaskOutcomes, setTaskOutcome,
  getMedications, getMedAdminToday, setMedAdmin, clearMedAdmin,
  getPatientPlan, getTodayReadings, saveReadings, getThresholds,
  getReadingHistory, getDailyUpdates, addUpdate,
  type PatientRow, type CareTaskRow, type TaskOutcome, type MedicationRow,
  type MedAdminStatus, type PatientPlanRow, type ReadingsInput, type ReadingRow,
  type ThresholdRow, type UpdateRow,
} from "../../lib/db";
import {
  HcProvider, useHc, dayAtHome, taskHour, periodOf, PERIODS, OUTCOME_META,
  classifyTask, Ring, HcIcon, niceTime, type HcData, type HcRole, type Period,
} from "./hc-kit";
import { ActionStage } from "./ActionStage";
import { HomeCareMedicines } from "./HomeCareMedicines";
import { HomeCareLog } from "./HomeCareLog";
import { HomeCareProgress } from "./HomeCareProgress";
import { HomeCareHelp } from "./HomeCareHelp";
import "./homecare.css";

/* ============================================================================
   Home Care — the shared Family + Caregiver experience.

   One mobile-first surface for both household roles (separate authenticated
   users; every action keeps its own provenance via recorded_by). Five tabs
   (Today · Medicines · Log · Progress · Help). The shell owns all state and
   exposes it through <HcProvider>; each tab reads it with useHc().

   Frontend-only: reuses existing db functions + RLS unchanged. Both household
   roles may already write task outcomes, readings and med-admin (RLS gates on
   can_see_patient, not role). Household feed notes post as source "caregiver"
   (DB forces source = role_to_source(role); family maps to caregiver).
   ========================================================================== */

const EMPTY_READINGS: ReadingsInput = {
  bp: "", grbs: "", urineMl: "", foodIntake: "", mood: "", activity: "",
  pulse: "", spo2: "", temperature: "", pain: "", fluidMl: "", bowel: "", skin: "", feeding: "", cognition: "",
};

export type HcTab = "today" | "medicines" | "log" | "progress" | "help";

export default function HomeCare({ role, initialTab = "today" }: { role: HcRole; initialTab?: HcTab }) {
  const { profile } = useBranding();
  const [tab, setTab] = useState<HcTab>(initialTab);

  const [patient, setPatient] = useState<PatientRow | null>(null);
  const [tasks, setTasks] = useState<CareTaskRow[]>([]);
  const [outcomes, setOutcomes] = useState<Map<string, TaskOutcome>>(new Map());
  const [meds, setMeds] = useState<MedicationRow[]>([]);
  const [medAdmin, setMedAdminState] = useState<Map<string, MedAdminStatus>>(new Map());
  const [plan, setPlan] = useState<PatientPlanRow | null>(null);
  const [readings, setReadings] = useState<ReadingsInput>(EMPTY_READINGS);
  const [history, setHistory] = useState<ReadingRow[]>([]);
  const [thresholds, setThresholds] = useState<ThresholdRow[]>([]);
  const [feed, setFeed] = useState<UpdateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const reload = () => setRefreshKey((k) => k + 1);

  useEffect(() => {
    const onVis = () => document.visibilityState === "visible" && reload();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const p = await getMyPatient();
        if (!active) return;
        setPatient(p);
        if (p) {
          const [t, o, m, ma, pl, r, th, hist, fe] = await Promise.all([
            getCareTasks(p.id),
            getTodayTaskOutcomes(p.id).catch(() => new Map<string, TaskOutcome>()),
            getMedications(p.id).catch(() => [] as MedicationRow[]),
            getMedAdminToday(p.id).catch(() => new Map<string, MedAdminStatus>()),
            getPatientPlan(p.id).catch(() => null),
            getTodayReadings(p.id).catch(() => null),
            getThresholds(p.id).catch(() => [] as ThresholdRow[]),
            getReadingHistory(p.id, 7).catch(() => [] as ReadingRow[]),
            getDailyUpdates(p.id, 10).catch(() => [] as UpdateRow[]),
          ]);
          if (!active) return;
          setTasks(t);
          setOutcomes(o);
          setMeds(m.filter((x) => x.active));
          setMedAdminState(ma);
          setPlan(pl);
          setReadings(r ?? EMPTY_READINGS);
          setThresholds(th);
          setHistory(hist);
          setFeed(fe);
        }
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Could not load Home Care.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [refreshKey]);

  // ---- mutators (optimistic; reconcile from server on error) ----
  const recordOutcome = (taskId: string, outcome: TaskOutcome | null) => {
    if (!patient) return;
    setOutcomes((prev) => { const n = new Map(prev); if (outcome === null) n.delete(taskId); else n.set(taskId, outcome); return n; });
    setTaskOutcome(patient.id, taskId, outcome).catch(() => reload());
  };

  const saveReadingFields = async (patch: Partial<ReadingsInput>): Promise<boolean> => {
    if (!patient) return false;
    const merged = { ...readings, ...patch };
    setReadings(merged);
    try { await saveReadings(patient.id, merged); return true; }
    catch { reload(); return false; }
  };

  const markMed = (medId: string, slot: string, status: MedAdminStatus) => {
    if (!patient) return;
    const key = `${medId}|${slot}`;
    setMedAdminState((prev) => { const n = new Map(prev); n.set(key, status); return n; });
    setMedAdmin(patient.id, medId, slot, status).catch(() => reload());
  };

  const clearMed = (medId: string, slot: string) => {
    if (!patient) return;
    const key = `${medId}|${slot}`;
    setMedAdminState((prev) => { const n = new Map(prev); n.delete(key); return n; });
    clearMedAdmin(patient.id, medId, slot).catch(() => reload());
  };

  const postStatus = async (body: string, flag: string) => {
    if (!patient) return;
    await addUpdate(patient.id, { source: "caregiver", author_name: profile?.full_name ?? "Family", body, flag });
    reload();
  };

  if (loading) return <Shell><div className="hc-skel" /><div className="hc-skel" /><div className="hc-skel" /></Shell>;
  if (error) return <Shell><Info title="Couldn't load Home Care">{error}</Info></Shell>;
  if (!patient) return <Shell><Info title="No patient linked yet">Your centre links your account to the patient at onboarding. The daily plan appears here once that&rsquo;s done.</Info></Shell>;

  const data: HcData = {
    role, patient, day: dayAtHome(patient),
    tasks, outcomes, meds, medAdmin, plan, readings, history, thresholds, feed,
    recordOutcome, saveReadingFields, markMed, clearMed, postStatus, goTab: (t) => setTab(t as HcTab), reload,
  };

  return (
    <HcProvider value={data}>
      <div className="hc">
        <div className="hc-app">
          {tab === "today" && <TodayTab />}
          {tab === "medicines" && <HomeCareMedicines />}
          {tab === "log" && <HomeCareLog />}
          {tab === "progress" && <HomeCareProgress />}
          {tab === "help" && <HomeCareHelp />}
        </div>
        <BottomNav tab={tab} setTab={setTab} />
      </div>
    </HcProvider>
  );
}

/* ------------------------------- Header ---------------------------------- */

function Header() {
  const { patient, day } = useHc();
  const { org, platformName } = useBranding();
  const first = patient.full_name.split(" ")[0];
  return (
    <header className="hc-top">
      {org?.logo_url
        ? <img className="hc-logo" src={org.logo_url} alt="" />
        : <span className="hc-logo">{(platformName?.[0] ?? "•").toUpperCase()}</span>}
      <div className="hc-org">
        <b>{platformName}</b>
        <span>{first}&rsquo;s home recovery</span>
      </div>
      <span className="hc-daychip num">Day {day}</span>
    </header>
  );
}

/* ------------------------------ Week strip ------------------------------- */

/** Rolling 7 days ending today. Days with a recorded reading show a green dot
 *  (reading-history presence — labelled "Check-ins recorded this week", not care
 *  completion or a streak). Today is highlighted. */
function WeekStrip() {
  const { history } = useHc();
  const recorded = useMemo(() => new Set(history.map((r) => r.reading_date)), [history]);
  const days = useMemo(() => {
    const out: { date: Date; iso: string }[] = [];
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today.getTime() - i * 86_400_000);
      out.push({ date: d, iso: d.toISOString().slice(0, 10) });
    }
    return out;
  }, []);
  const todayIso = new Date().toISOString().slice(0, 10);
  return (
    <div className="hc-week" role="group" aria-label="Check-ins recorded this week">
      {days.map((d) => {
        const isToday = d.iso === todayIso;
        return (
          <div key={d.iso} className={`hc-day${isToday ? " on" : ""}${recorded.has(d.iso) ? " rec" : ""}`}>
            <span className="dow">{d.date.toLocaleDateString("en-IN", { weekday: "short" }).slice(0, 3)}</span>
            <span className="dnum num">{d.date.getDate()}</span>
            <span className="ddot" />
          </div>
        );
      })}
    </div>
  );
}

/* -------------------------------- Today ---------------------------------- */

function TodayTab() {
  const { patient, tasks, outcomes, feed, plan } = useHc();
  const first = patient.full_name.split(" ")[0];
  const sorted = useMemo(
    () => [...tasks].sort((a, b) => taskHour(a) - taskHour(b) || a.sort_order - b.sort_order),
    [tasks],
  );

  // Medicine tasks are guidance only (status lives in Medicines) — excluded from
  // the scheduled-completion count so nothing is double-recorded here.
  const completable = useMemo(() => sorted.filter((t) => classifyTask(t) !== "medicine"), [sorted]);
  const doneCount = completable.filter((t) => outcomes.get(t.id) === "done").length;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const outcomesRef = useRef(outcomes);
  outcomesRef.current = outcomes;

  const firstPending = completable.find((t) => !outcomes.has(t.id)) ?? null;
  const current = (selectedId ? sorted.find((t) => t.id === selectedId) : null) ?? firstPending ?? sorted[sorted.length - 1] ?? null;
  const idx = current ? sorted.findIndex((t) => t.id === current.id) : -1;

  const advance = () => {
    const oc = outcomesRef.current;
    const after = completable.slice(completable.findIndex((t) => t.id === current?.id) + 1).find((t) => !oc.has(t.id));
    const anyPending = completable.find((t) => !oc.has(t.id));
    setSelectedId((after ?? anyPending ?? null)?.id ?? null);
  };

  const upcoming = idx >= 0 ? sorted.slice(idx + 1, idx + 3) : [];
  const allDone = completable.length > 0 && doneCount >= completable.length;

  // A small, real care-team connection line: latest staff reply, else next review.
  const lastStaff = feed.find((u) => u.source !== "caregiver");
  const nextReview = (plan?.content?.review_dates ?? [])
    .map((r) => ({ ...r, t: new Date(r.date).getTime() }))
    .filter((r) => !Number.isNaN(r.t) && r.t >= Date.now() - 86_400_000)
    .sort((a, b) => a.t - b.t)[0];

  // Per-period summary (real counts) for the Continuum-style period cards.
  const periodSummary = PERIODS.map((p) => {
    const items = completable.filter((t) => periodOf(t) === p.key);
    return { p, total: items.length, done: items.filter((t) => outcomes.get(t.id) === "done").length, first: (items.find((t) => !outcomes.has(t.id)) ?? items[0]) };
  }).filter((x) => x.total > 0);
  const currentPeriodKey = current ? periodOf(current) : null;

  return (
    <>
      <Header />

      {/* Fuller sky hero: week strip + ring + current action together. */}
      <div className="hc-hero">
        <WeekStrip />
        <div className="hc-hero-main">
          <Ring value={doneCount} total={Math.max(completable.length, 1)} size={76} onDark />
          <div className="hh-txt">
            <div className="hh-eye">{first}&rsquo;s day</div>
            <div className="hh-count num">{doneCount} of {completable.length} done</div>
            <div className="hh-next">
              {completable.length === 0 ? "No scheduled care yet"
                : allDone ? "All scheduled care recorded today"
                : current ? `Up next · ${current.time_label || "today"} · ${current.title}` : "All caught up"}
            </div>
          </div>
        </div>
      </div>

      {(lastStaff || nextReview) && (
        <div className="hc-connect">
          <HcIcon.Chat size={15} />
          {lastStaff
            ? <span><b>{lastStaff.author_name || "Care team"}</b> replied · {niceTime(lastStaff.created_at)}</span>
            : <span>Next review · {new Date(nextReview!.date).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}</span>}
        </div>
      )}

      {periodSummary.length > 0 && (
        <div className="hc-periods">
          {periodSummary.map(({ p, total, done, first: firstTask }) => (
            <button key={p.key} type="button"
              className={`hc-pcard${p.key === currentPeriodKey ? " on" : ""}${done >= total ? " full" : ""}`}
              aria-label={`${p.label}: ${done} of ${total} done`}
              onClick={() => firstTask && setSelectedId(firstTask.id)}>
              <span className="pc-ic">{PERIOD_ICON[p.key]}</span>
              <span className="pc-label">{p.label}</span>
              <span className="pc-count num">{done}/{total}</span>
            </button>
          ))}
        </div>
      )}

      {current ? (
        <ActionStage task={current} onRecorded={advance} />
      ) : (
        <div className="hc-empty" style={{ marginTop: 14 }}>
          <b>Nothing due right now</b>
          <p>The care team hasn&rsquo;t set tasks for {first} yet. They appear here once the plan is active.</p>
        </div>
      )}

      {current && sorted.length > 1 && (
        <div className="hc-stage-nav">
          <button type="button" className="hc-stepbtn" aria-label="Previous action" disabled={idx <= 0} onClick={() => setSelectedId(sorted[idx - 1]?.id ?? null)}>
            <HcIcon.Left size={20} />
          </button>
          <span className="hc-viewall" aria-hidden="true">{idx + 1} of {sorted.length}</span>
          <button type="button" className="hc-stepbtn" aria-label="Next action" disabled={idx >= sorted.length - 1} onClick={() => setSelectedId(sorted[idx + 1]?.id ?? null)}>
            <HcIcon.Right size={20} />
          </button>
        </div>
      )}

      {upcoming.length > 0 && (
        <div className="hc-next">
          <h2 className="hc-h2" style={{ marginBottom: 6 }}>Next up</h2>
          {upcoming.map((t) => (
            <button key={t.id} type="button" className="hc-next-row" onClick={() => setSelectedId(t.id)}>
              <span className="tl-time num">{t.time_label || "—"}</span>
              <span className="tl-ic">{KIND_ICON(t)}</span>
              <span className="tl-title">{t.title}</span>
              <HcIcon.Right size={16} />
            </button>
          ))}
        </div>
      )}

      <CompactTimeline tasks={sorted} outcomes={outcomes} currentId={current?.id ?? null} onPick={setSelectedId} />

      <p className="hc-muted" style={{ marginTop: 18 }}>Everything here comes from the plan the care team approved.</p>
    </>
  );
}

/* --------------------------- Compact timeline ---------------------------- */

const PERIOD_ICON: Record<Period, React.ReactNode> = {
  morning: <HcIcon.Sun size={13} />, afternoon: <HcIcon.Sun size={13} />,
  evening: <HcIcon.Moon size={13} />, bedtime: <HcIcon.Moon size={13} />,
};

function CompactTimeline({ tasks, outcomes, currentId, onPick }: {
  tasks: CareTaskRow[]; outcomes: Map<string, TaskOutcome>; currentId: string | null; onPick: (id: string) => void;
}) {
  if (tasks.length === 0) return null;
  return (
    <div className="hc-timeline">
      <h2 className="hc-h2" style={{ marginBottom: 4 }}>The day</h2>
      {PERIODS.map((p) => {
        const group = tasks.filter((t) => periodOf(t) === p.key);
        if (group.length === 0) return null;
        return (
          <div className="hc-tl-group" key={p.key}>
            <div className="hc-tl-label">{PERIOD_ICON[p.key]} {p.label}</div>
            <div className="hc-mlist">
              {group.map((t) => {
                const oc = outcomes.get(t.id);
                const isMed = classifyTask(t) === "medicine";
                return (
                  <button key={t.id} type="button"
                    className={`hc-tl${oc ? " recorded" : ""}${t.id === currentId ? " current" : ""}`}
                    onClick={() => onPick(t.id)}>
                    <span className="tl-time num">{t.time_label || "—"}</span>
                    <span className="tl-ic">{KIND_ICON(t)}</span>
                    <span className="tl-body">
                      <span className="tl-title">{t.title}</span>
                      <span className="tl-state">{t.discipline}{t.detail ? ` · ${t.detail}` : ""}</span>
                    </span>
                    {oc ? <span className={`tl-chip ${oc}`}>{OUTCOME_META[oc].short}</span>
                      : isMed ? <span className="tl-chip na">In Medicines</span> : null}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function KIND_ICON(t: CareTaskRow): React.ReactNode {
  switch (classifyTask(t)) {
    case "physio": return <HcIcon.Walk size={16} />;
    case "food": return <HcIcon.Food size={16} />;
    case "positioning": return <HcIcon.Bed size={16} />;
    case "medicine": return <HcIcon.Pill size={16} />;
    default: return <HcIcon.Pulse size={16} />;
  }
}

/* ------------------------------ Bottom nav ------------------------------- */

const NAV: { key: HcTab; label: string; icon: (p: { size?: number }) => React.ReactNode }[] = [
  { key: "today", label: "Today", icon: HcIcon.Home },
  { key: "medicines", label: "Medicines", icon: HcIcon.Pill },
  { key: "log", label: "Log", icon: HcIcon.Pulse },
  { key: "progress", label: "Progress", icon: HcIcon.Chart },
  { key: "help", label: "Help", icon: HcIcon.Life },
];

function BottomNav({ tab, setTab }: { tab: HcTab; setTab: (t: HcTab) => void }) {
  return (
    <nav className="hc-nav" aria-label="Home Care sections">
      <div className="hc-nav-in">
        {NAV.map((n) => {
          const Ic = n.icon;
          return (
            <button key={n.key} type="button" className={`hc-navbtn${tab === n.key ? " on" : ""}`}
              aria-current={tab === n.key ? "page" : undefined} onClick={() => setTab(n.key)}>
              <span className="nb-ic"><Ic size={22} /></span>
              <span>{n.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

/* -------------------------------- shell ---------------------------------- */

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="hc"><div className="hc-app"><div style={{ paddingTop: 18 }}>{children}</div></div></div>;
}
function Info({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="hc-empty" style={{ marginTop: 24 }}><b>{title}</b><p>{children}</p></div>;
}
