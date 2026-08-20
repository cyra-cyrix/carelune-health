import { Fragment, useEffect, useState } from "react";
import { useBranding } from "../../branding/BrandingProvider";
import {
  getMyPatient, getCareTasks, getTodayTaskOutcomes, setTaskOutcome,
  getMedications, getMedAdminToday, setMedAdmin, clearMedAdmin,
  getPatientPlan, getTodayReadings, saveReadings, getThresholds, getTodayCareEvents,
  getReadingHistory, getDailyUpdates, addUpdate,
  type PatientRow, type CareTaskRow, type TaskOutcome, type MedicationRow,
  type MedAdminStatus, type PatientPlanRow, type ReadingsInput, type ReadingRow,
  type ThresholdRow, type UpdateRow, type CareEventRow,
} from "../../lib/db";
import { HcProvider, dayAtHome, HcIcon, type HcData, type HcRole } from "./hc-kit";
import { HomeCareToday } from "./HomeCareToday";
import { HomeCareMedicines } from "./HomeCareMedicines";
import { HomeCarePlan } from "./HomeCarePlan";
import { RecordNow } from "./RecordNow";
import { HomeCareProgress } from "./HomeCareProgress";
import { HomeCareHelp } from "./HomeCareHelp";
import { HomeCareMessages } from "./HomeCareMessages";
import { HomeCareMore } from "./HomeCareMore";
import "./homecare.css";

/* Home Care is the shared Family + Caregiver shell. It owns patient-scoped
   state and preserves the existing Supabase/RLS write contracts for every tab. */

const EMPTY_READINGS: ReadingsInput = {
  bp: "", grbs: "", urineMl: "", foodIntake: "", mood: "", activity: "",
  pulse: "", spo2: "", temperature: "", pain: "", fluidMl: "", bowel: "", skin: "", feeding: "", cognition: "",
};

/** Four sections live in the bottom bar; medicines, log and help are opened
 *  from More (and from an action that hands off, e.g. a medicine task). */
export type HcTab = "today" | "progress" | "careplan" | "messages" | "more" | "medicines" | "help";

export default function HomeCare({ role, initialTab = "today" }: { role: HcRole; initialTab?: HcTab }) {
  const { profile } = useBranding();
  const [tab, setTab] = useState<HcTab>(initialTab);
  const [recordOpen, setRecordOpen] = useState(false);
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
  const [events, setEvents] = useState<CareEventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const reload = () => setRefreshKey((key) => key + 1);

  useEffect(() => {
    const onVisibilityChange = () => document.visibilityState === "visible" && reload();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const nextPatient = await getMyPatient();
        if (!active) return;
        setPatient(nextPatient);
        if (nextPatient) {
          const [nextTasks, nextOutcomes, nextMeds, nextMedAdmin, nextPlan, nextReadings, nextThresholds, nextHistory, nextFeed, nextEvents] = await Promise.all([
            getCareTasks(nextPatient.id),
            getTodayTaskOutcomes(nextPatient.id).catch(() => new Map<string, TaskOutcome>()),
            getMedications(nextPatient.id).catch(() => [] as MedicationRow[]),
            getMedAdminToday(nextPatient.id).catch(() => new Map<string, MedAdminStatus>()),
            getPatientPlan(nextPatient.id).catch(() => null),
            getTodayReadings(nextPatient.id).catch(() => null),
            getThresholds(nextPatient.id).catch(() => [] as ThresholdRow[]),
            getReadingHistory(nextPatient.id, 7).catch(() => [] as ReadingRow[]),
            getDailyUpdates(nextPatient.id, 10).catch(() => [] as UpdateRow[]),
            // Absent until migration 0027 is applied — an empty list, never a crash.
            getTodayCareEvents(nextPatient.id).catch(() => [] as CareEventRow[]),
          ]);
          if (!active) return;
          setTasks(nextTasks);
          setOutcomes(nextOutcomes);
          setMeds(nextMeds.filter((medicine) => medicine.active));
          setMedAdminState(nextMedAdmin);
          setPlan(nextPlan);
          setReadings(nextReadings ?? EMPTY_READINGS);
          setThresholds(nextThresholds);
          setHistory(nextHistory);
          setFeed(nextFeed);
          setEvents(nextEvents);
        }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Could not load Home Care.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [refreshKey]);

  const recordOutcome = (taskId: string, outcome: TaskOutcome | null) => {
    if (!patient) return;
    setOutcomes((previous) => {
      const next = new Map(previous);
      if (outcome === null) next.delete(taskId);
      else next.set(taskId, outcome);
      return next;
    });
    setTaskOutcome(patient.id, taskId, outcome).catch(() => reload());
  };

  const saveReadingFields = async (patch: Partial<ReadingsInput>): Promise<boolean> => {
    if (!patient) return false;
    const merged = { ...readings, ...patch };
    setReadings(merged);
    try {
      await saveReadings(patient.id, merged);
      return true;
    } catch {
      reload();
      return false;
    }
  };

  const markMed = (medId: string, slot: string, status: MedAdminStatus) => {
    if (!patient) return;
    const key = `${medId}|${slot}`;
    setMedAdminState((previous) => new Map(previous).set(key, status));
    setMedAdmin(patient.id, medId, slot, status).catch(() => reload());
  };

  const clearMed = (medId: string, slot: string) => {
    if (!patient) return;
    const key = `${medId}|${slot}`;
    setMedAdminState((previous) => {
      const next = new Map(previous);
      next.delete(key);
      return next;
    });
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
    role, patient, day: dayAtHome(patient), tasks, outcomes, meds, medAdmin, plan, readings, history, thresholds, feed, events,
    recordOutcome, saveReadingFields, markMed, clearMed, postStatus, goTab: (nextTab) => setTab(nextTab as HcTab), reload,
  };

  return (
    <HcProvider value={data}>
      <div className="hc">
        <div className="hc-app">
          {tab === "today" && <HomeCareToday />}
          {tab === "progress" && <HomeCareProgress />}
          {tab === "careplan" && <HomeCarePlan />}
          {tab === "messages" && <HomeCareMessages />}
          {tab === "more" && <HomeCareMore />}
          {tab === "medicines" && <SubScreen title="More" onBack={() => setTab("more")}><HomeCareMedicines /></SubScreen>}
          {tab === "help" && <SubScreen title="More" onBack={() => setTab("more")}><HomeCareHelp /></SubScreen>}
          {recordOpen && <RecordNow onClose={() => setRecordOpen(false)} />}
        </div>
        <BottomNav tab={tab} setTab={setTab} onRecord={() => setRecordOpen(true)} />
      </div>
    </HcProvider>
  );
}

const NAV: { key: HcTab; label: string; icon: (props: { size?: number }) => React.ReactNode }[] = [
  { key: "today", label: "Today", icon: HcIcon.Home },
  { key: "progress", label: "Progress", icon: HcIcon.Chart },
  { key: "careplan", label: "Care plan", icon: HcIcon.Life },
  { key: "messages", label: "Chat", icon: HcIcon.Chat },
  { key: "more", label: "More", icon: HcIcon.Menu },
];

/** Sections opened from More keep More lit, so the bar never looks unrelated
 *  to the screen the person is actually on. */
const UNDER_MORE: HcTab[] = ["more", "medicines", "help"];

function BottomNav({ tab, setTab, onRecord }: { tab: HcTab; setTab: (next: HcTab) => void; onRecord: () => void }) {
  return (
    <nav className="hc-nav" aria-label="Home Care sections">
      <div className="hc-nav-in">
        {NAV.map((item, i) => {
          const Icon = item.icon;
          const on = item.key === "more" ? UNDER_MORE.includes(tab) : tab === item.key;
          return (
            <Fragment key={item.key}>
              {/* Recording sits at the centre of the bar, not in a corner:
                  capture is what a caregiver opens this app to do, and it is
                  reachable from every tab rather than only from Today. */}
              {i === 2 && (
                <button type="button" className="hc-nav-rec" aria-label="Record something" onClick={onRecord}>
                  <HcIcon.Plus size={24} />
                </button>
              )}
              <button type="button" className={`hc-navbtn${on ? " on" : ""}`}
                aria-current={on ? "page" : undefined} onClick={() => setTab(item.key)}>
                <span className="nb-ic"><Icon size={22} /></span>
                <span>{item.label}</span>
              </button>
            </Fragment>
          );
        })}
      </div>
    </nav>
  );
}

/** A screen reached from More gets one way back — no browser history to rely on. */
function SubScreen({ title, onBack, children }: { title: string; onBack: () => void; children: React.ReactNode }) {
  return (
    <>
      <button type="button" className="hc-back" onClick={onBack}>
        <HcIcon.Left size={16} /> {title}
      </button>
      {children}
    </>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="hc"><div className="hc-app"><div style={{ paddingTop: 18 }}>{children}</div></div></div>;
}

function Info({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="hc-empty" style={{ marginTop: 24 }}><b>{title}</b><p>{children}</p></div>;
}
