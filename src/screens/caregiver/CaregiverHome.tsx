import { useEffect, useMemo, useState } from "react";
import { Icon, ProgressRing } from "../../components/ui";
import RaiseConcern from "../../components/RaiseConcern";
import { useBranding } from "../../branding/BrandingProvider";
import { prescribedParams, GROUP_LABEL, type MonitorParam, type ParamGroup } from "../../domain/monitoring";
import {
  getMyPatient,
  getCareTasks,
  getTodayTaskOutcomes,
  setTaskOutcome,
  getTodayReadings,
  saveReadings,
  getMedications,
  getMedAdminToday,
  setMedAdmin,
  getPatientPlan,
  addUpdate,
  type PatientRow,
  type CareTaskRow,
  type ReadingsInput,
  type MedicationRow,
  type TaskOutcome,
  type MedAdminStatus,
} from "../../lib/db";

type Tab = "today" | "record" | "medicines" | "messages";

/**
 * Caregiver home (recovery-loop redesign). Four calm, focused surfaces instead of
 * one long checklist: Today (what to do, with real outcomes), Record (only the
 * patient's prescribed observations, with proper inputs), Medicines (due now /
 * later / as-needed / all, with given-missed), and Messages (to the care team +
 * emergency guidance). Everything writes to the same patient the family views and
 * the doctor manages — one loop, unchanged permissions.
 */
export default function CaregiverHome({ initialTab = "today" }: { initialTab?: Tab } = {}) {
  const { profile } = useBranding();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [patient, setPatient] = useState<PatientRow | null>(null);
  const [tasks, setTasks] = useState<CareTaskRow[]>([]);
  const [outcomes, setOutcomes] = useState<Map<string, TaskOutcome>>(new Map());
  const [meds, setMeds] = useState<MedicationRow[]>([]);
  const [modules, setModules] = useState<string[]>([]);
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
          const [t, o, m, plan] = await Promise.all([
            getCareTasks(p.id),
            getTodayTaskOutcomes(p.id).catch(() => new Map<string, TaskOutcome>()),
            getMedications(p.id).catch(() => [] as MedicationRow[]),
            getPatientPlan(p.id).catch(() => null),
          ]);
          if (!active) return;
          setTasks(t);
          setOutcomes(o);
          setMeds(m);
          setModules((plan?.content?.observations ?? []).map((ob) => ob.module));
        }
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Could not load the plan.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [refreshKey]);

  const record = async (taskId: string, outcome: TaskOutcome | null) => {
    if (!patient) return;
    setOutcomes((prev) => {
      const n = new Map(prev);
      if (outcome === null) n.delete(taskId);
      else n.set(taskId, outcome);
      return n;
    });
    try {
      await setTaskOutcome(patient.id, taskId, outcome);
    } catch {
      reload(); // revert to server truth
    }
  };

  const firstName = patient?.full_name.split(" ")[0] ?? "";
  const caregiverName = profile?.full_name?.split(" ")[0] ?? "";
  const params = useMemo(
    () => prescribedParams(modules, patient?.diagnosis ?? [], tasks.map((t) => t.title)),
    [modules, patient, tasks],
  );

  return (
    <div className="min-h-[calc(100vh-3rem)] bg-mist">
      <div className="mx-auto max-w-[640px] px-4 pb-28 pt-5">
        {loading && <Skeleton />}
        {!loading && error && <LoadError message={error} />}
        {!loading && !error && !patient && <NoPatient />}
        {!loading && !error && patient && (
          <>
            {tab === "today" && (
              <TodayTab
                first={firstName}
                caregiver={caregiverName}
                day={dayAtHome(patient)}
                patientId={patient.id}
                tasks={tasks}
                outcomes={outcomes}
                onRecord={record}
              />
            )}
            {tab === "record" && <RecordTab patientId={patient.id} params={params} first={firstName} />}
            {tab === "medicines" && <MedicinesTab patientId={patient.id} meds={meds} />}
            {tab === "messages" && <MessagesTab patientId={patient.id} />}
          </>
        )}
      </div>

      {!loading && patient && (
        <nav className="pb-safe fixed inset-x-0 bottom-0 z-10 border-t border-line bg-white/95 backdrop-blur">
          <div className="mx-auto grid max-w-[640px] grid-cols-4">
            <NavItem label="Today" active={tab === "today"} onClick={() => setTab("today")} icon={<Icon.Home width={20} height={20} />} />
            <NavItem label="Record" active={tab === "record"} onClick={() => setTab("record")} icon={<Icon.Pulse width={20} height={20} />} />
            <NavItem label="Medicines" active={tab === "medicines"} onClick={() => setTab("medicines")} icon={<Icon.Pill width={20} height={20} />} />
            <NavItem label="Messages" active={tab === "messages"} onClick={() => setTab("messages")} icon={<Icon.Life width={20} height={20} />} />
          </div>
        </nav>
      )}
    </div>
  );
}

/* ============================== TODAY ============================== */

const PERIODS = [
  { key: "morning", label: "Morning", from: 0, to: 12 },
  { key: "afternoon", label: "Afternoon", from: 12, to: 17 },
  { key: "evening", label: "Evening", from: 17, to: 24 },
] as const;

function taskHour(t: CareTaskRow): number {
  const m = (t.time_label || "").match(/(\d{1,2}):(\d{2})/);
  if (!m) return 9;
  let h = Number(m[1]);
  if (/pm/i.test(t.time_label) && h < 12) h += 12;
  return h;
}
function periodOf(t: CareTaskRow): (typeof PERIODS)[number]["key"] {
  const h = taskHour(t);
  return (PERIODS.find((p) => h >= p.from && h < p.to) ?? PERIODS[0]).key;
}

const QUICK_STATUS = [
  { label: "Doing well", flag: "info", body: "Doing well today." },
  { label: "Some discomfort", flag: "watch", body: "Some discomfort today." },
  { label: "Not doing well", flag: "watch", body: "Not doing well today — please review." },
] as const;

function TodayTab({
  first, caregiver, day, patientId, tasks, outcomes, onRecord,
}: {
  first: string; caregiver: string; day: number; patientId: string;
  tasks: CareTaskRow[]; outcomes: Map<string, TaskOutcome>; onRecord: (id: string, o: TaskOutcome | null) => void;
}) {
  const { profile } = useBranding();
  const [statusSent, setStatusSent] = useState<string | null>(null);

  const acted = (t: CareTaskRow) => outcomes.has(t.id);
  const pending = tasks.filter((t) => !acted(t));
  const doneCount = [...outcomes.values()].filter((o) => o === "done").length;
  const now = pending[0];
  const upcoming = pending.slice(1, 4);

  const sendStatus = async (s: (typeof QUICK_STATUS)[number]) => {
    setStatusSent(s.label);
    try {
      await addUpdate(patientId, { source: "caregiver", author_name: profile?.full_name ?? "Caregiver", body: s.body, flag: s.flag });
    } catch { /* non-blocking */ }
  };

  return (
    <div className="space-y-4">
      <div>
        <div className="text-[13px] text-sage-600">{first}&rsquo;s recovery · Day {day}</div>
        <h1 className="text-[22px] font-semibold tracking-tight text-ink">{caregiver ? `Good day, ${caregiver}.` : "Good day."}</h1>
      </div>

      {/* Progress hero */}
      <div className="flex items-center justify-between rounded-2xl bg-brand-600 p-5 text-white shadow-lift">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/80">Today&rsquo;s plan</div>
          <div className="mt-1 text-[22px] font-semibold">{doneCount} of {tasks.length} done</div>
          <div className="mt-1 truncate text-[13px] text-white/85">
            {now ? `Up next · ${now.time_label} · ${now.title}` : tasks.length ? "All caught up. Thank you." : "No tasks yet."}
          </div>
        </div>
        <ProgressRing value={doneCount} total={Math.max(tasks.length, 1)} size={84} onDark />
      </div>

      {/* Quick status */}
      <section className="rounded-2xl bg-white p-4 shadow-card">
        <h2 className="text-[14px] font-semibold text-ink">How is {first} now?</h2>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {QUICK_STATUS.map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={() => sendStatus(s)}
              className={`tap rounded-full px-3.5 py-1.5 text-[13px] font-semibold ring-1 transition-colors ${
                statusSent === s.label ? "bg-brand-600 text-white ring-brand-600" : "bg-mist-100 text-ink ring-ink/[0.05] hover:ring-brand-300"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        {statusSent && <p className="mt-2 text-[12px] font-medium text-good-600">Shared with the care team ✓</p>}
      </section>

      {/* Do now */}
      {now && (
        <section className="rounded-2xl bg-white p-4 shadow-card ring-1 ring-brand-100">
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-brand-600">Do now</div>
          <div className="mt-1 text-[17px] font-semibold text-ink">{now.title}</div>
          <div className="mt-0.5 text-[13px] text-sage-600">
            {now.time_label} · {now.discipline}{now.detail ? ` · ${now.detail}` : ""}
          </div>
          <OutcomeButtons current={outcomes.get(now.id)} onPick={(o) => onRecord(now.id, o)} prominent />
        </section>
      )}

      {/* Next up */}
      {upcoming.length > 0 && (
        <section>
          <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-sage-500">Next up</h2>
          <ul className="space-y-2">
            {upcoming.map((t) => (
              <li key={t.id} className="flex items-center gap-3 rounded-xl bg-white px-3.5 py-2.5 shadow-card">
                <span className="shrink-0 text-[12px] font-semibold tabular-nums text-brand-600">{t.time_label}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold text-ink">{t.title}</span>
                  <span className="block truncate text-[12px] text-sage-500">{t.discipline}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Grouped by period */}
      {PERIODS.map((p) => {
        const group = tasks.filter((t) => periodOf(t) === p.key);
        if (group.length === 0) return null;
        return (
          <section key={p.key}>
            <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-sage-500">{p.label}</h2>
            <ul className="space-y-2">
              {group.map((t) => (
                <TaskCard key={t.id} task={t} outcome={outcomes.get(t.id)} onPick={(o) => onRecord(t.id, o)} />
              ))}
            </ul>
          </section>
        );
      })}

      <CompletedCollapsed tasks={tasks} outcomes={outcomes} onRecord={onRecord} />

      <p className="px-1 text-[12px] leading-relaxed text-sage-600">Everything here comes from the plan the care team approved.</p>
    </div>
  );
}

const OUTCOME_META: Record<TaskOutcome, { label: string; short: string; cls: string }> = {
  done: { label: "Done", short: "Done", cls: "bg-good-500 text-white" },
  unable: { label: "Unable", short: "Unable", cls: "bg-warn-500 text-white" },
  refused: { label: "Patient refused", short: "Refused", cls: "bg-coral-500 text-white" },
  na: { label: "Not applicable", short: "N/A", cls: "bg-sage-400 text-white" },
};
const OUTCOME_ORDER: TaskOutcome[] = ["done", "unable", "refused", "na"];

function OutcomeButtons({ current, onPick, prominent }: { current?: TaskOutcome; onPick: (o: TaskOutcome | null) => void; prominent?: boolean }) {
  return (
    <div className={`mt-3 grid grid-cols-2 gap-2 ${prominent ? "" : "sm:grid-cols-4"}`}>
      {OUTCOME_ORDER.map((o) => {
        const on = current === o;
        return (
          <button
            key={o}
            type="button"
            onClick={() => onPick(on ? null : o)}
            className={`tap rounded-xl px-3 py-2 text-[13px] font-semibold ring-1 transition-colors ${
              on ? `${OUTCOME_META[o].cls} ring-transparent` : "bg-white text-ink ring-line hover:ring-brand-300"
            }`}
          >
            {OUTCOME_META[o].label}
          </button>
        );
      })}
    </div>
  );
}

function TaskCard({ task, outcome, onPick }: { task: CareTaskRow; outcome?: TaskOutcome; onPick: (o: TaskOutcome | null) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="rounded-xl bg-white shadow-card">
      <button type="button" onClick={() => setOpen((v) => !v)} className="tap flex w-full items-center gap-3 px-3.5 py-2.5 text-left">
        <span className="shrink-0 text-[12px] font-semibold tabular-nums text-sage-500">{task.time_label}</span>
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-[14px] font-semibold ${outcome === "done" ? "text-sage-400 line-through decoration-sage-300" : "text-ink"}`}>
            {task.title}
          </span>
          <span className="block truncate text-[12px] text-sage-500">{task.discipline}{task.detail ? ` · ${task.detail}` : ""}</span>
        </span>
        {outcome ? (
          <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${OUTCOME_META[outcome].cls}`}>{OUTCOME_META[outcome].short}</span>
        ) : (
          <Icon.ChevronRight width={16} height={16} className={`shrink-0 text-sage-400 transition-transform ${open ? "rotate-90" : ""}`} />
        )}
      </button>
      {open && <div className="px-3.5 pb-3"><OutcomeButtons current={outcome} onPick={(o) => { onPick(o); setOpen(false); }} /></div>}
    </li>
  );
}

function CompletedCollapsed({ tasks, outcomes, onRecord }: { tasks: CareTaskRow[]; outcomes: Map<string, TaskOutcome>; onRecord: (id: string, o: TaskOutcome | null) => void }) {
  const [open, setOpen] = useState(false);
  const completed = tasks.filter((t) => outcomes.has(t.id));
  if (completed.length === 0) return null;
  return (
    <section>
      <button type="button" onClick={() => setOpen((v) => !v)} className="tap flex w-full items-center justify-between rounded-xl bg-mist-100 px-3.5 py-2.5 text-left ring-1 ring-ink/[0.04]">
        <span className="text-[13px] font-semibold text-ink">Completed today · {completed.length}</span>
        <Icon.ChevronRight width={16} height={16} className={`text-sage-500 transition-transform ${open ? "rotate-90" : ""}`} />
      </button>
      {open && (
        <ul className="mt-2 space-y-2">
          {completed.map((t) => (
            <TaskCard key={t.id} task={t} outcome={outcomes.get(t.id)} onPick={(o) => onRecord(t.id, o)} />
          ))}
        </ul>
      )}
    </section>
  );
}

/* ============================== RECORD ============================== */

function RecordTab({ patientId, params, first }: { patientId: string; params: MonitorParam[]; first: string }) {
  const [r, setR] = useState<ReadingsInput | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  useEffect(() => {
    let active = true;
    (async () => {
      const existing = await getTodayReadings(patientId).catch(() => null);
      if (active) setR(existing ?? EMPTY);
    })();
    return () => { active = false; };
  }, [patientId]);

  const set = (field: keyof ReadingsInput, v: string) => { setR((p) => (p ? { ...p, [field]: v } : p)); setStatus("idle"); };

  const save = async () => {
    if (!r) return;
    setStatus("saving");
    try { await saveReadings(patientId, r); setStatus("saved"); } catch { setStatus("error"); }
  };

  // Group prescribed params for calm sectioning.
  const groups = useMemo(() => {
    const order: ParamGroup[] = ["vitals", "intake", "elimination", "function", "wellbeing"];
    return order.map((g) => ({ g, items: params.filter((p) => p.group === g) })).filter((x) => x.items.length > 0);
  }, [params]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-ink">Record {first}&rsquo;s day</h1>
        <p className="text-[13px] text-sage-600">Only what the care team asked you to track. They see these.</p>
      </div>

      {r === null ? (
        <div className="h-64 animate-pulse rounded-2xl bg-mist-200" />
      ) : params.length === 0 ? (
        <p className="rounded-2xl bg-white p-4 text-[14px] text-sage-600 shadow-card">No observations are prescribed yet.</p>
      ) : (
        <>
          {groups.map(({ g, items }) => (
            <section key={g} className="rounded-2xl bg-white p-4 shadow-card">
              <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-sage-500">{GROUP_LABEL[g]}</h2>
              <div className="space-y-4">
                {items.map((p) => <ParamInput key={p.key} param={p} value={r[p.field]} onChange={(v) => set(p.field, v)} />)}
              </div>
            </section>
          ))}
          <button
            type="button"
            onClick={save}
            disabled={status === "saving"}
            className="tap sticky bottom-24 flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand-600 py-3 text-[15px] font-semibold text-white shadow-lift hover:bg-brand-500 disabled:opacity-60"
          >
            {status === "saved" ? (<><Icon.Check width={16} height={16} /> Saved · shared with the care team</>)
              : status === "saving" ? "Saving…" : status === "error" ? "Couldn't save — tap to retry" : "Save today's record"}
          </button>
        </>
      )}
    </div>
  );
}

function ParamInput({ param, value, onChange }: { param: MonitorParam; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-[13.5px] font-semibold text-ink">{param.label}</span>
        {param.unit && param.input !== "scale" && <span className="text-[11.5px] text-sage-500">{param.unit}</span>}
      </div>
      {param.input === "bp" && <BpInput value={value} onChange={onChange} />}
      {param.input === "number" && (
        <input value={value} onChange={(e) => onChange(e.target.value)} inputMode="decimal" placeholder={param.placeholder ?? "—"} className={INPUT} />
      )}
      {param.input === "scale" && <PainScale value={value} onChange={onChange} />}
      {param.input === "select" && (
        <div className="flex flex-wrap gap-2">
          {param.options!.map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => onChange(value === o ? "" : o)}
              className={`tap rounded-full px-3 py-1.5 text-[12.5px] font-semibold ring-1 transition-colors ${
                value === o ? "bg-brand-600 text-white ring-brand-600" : "bg-mist-100 text-ink ring-ink/[0.05] hover:ring-brand-300"
              }`}
            >
              {o}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const INPUT = "w-full rounded-xl bg-white px-3 py-2.5 text-[15px] text-ink ring-1 ring-line focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400";

function BpInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [sys, dia] = (value.split("/").map((s) => s.trim()) as [string?, string?]);
  const emit = (s: string, d: string) => onChange(s || d ? `${s}/${d}` : "");
  return (
    <div className="flex items-center gap-2">
      <input value={sys ?? ""} onChange={(e) => emit(e.target.value.replace(/\D/g, ""), dia ?? "")} inputMode="numeric" placeholder="120" className={`${INPUT} text-center`} />
      <span className="text-[16px] font-semibold text-sage-400">/</span>
      <input value={dia ?? ""} onChange={(e) => emit(sys ?? "", e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="80" className={`${INPUT} text-center`} />
    </div>
  );
}

function PainScale({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="grid grid-cols-11 gap-1">
      {Array.from({ length: 11 }, (_, i) => {
        const on = value === String(i);
        const tone = i <= 3 ? "bg-good-500" : i <= 6 ? "bg-warn-500" : "bg-coral-500";
        return (
          <button
            key={i}
            type="button"
            onClick={() => onChange(on ? "" : String(i))}
            className={`tap grid h-9 place-items-center rounded-lg text-[13px] font-semibold ring-1 transition-colors ${
              on ? `${tone} text-white ring-transparent` : "bg-mist-100 text-sage-600 ring-ink/[0.05]"
            }`}
          >
            {i}
          </button>
        );
      })}
    </div>
  );
}

/* ============================== MEDICINES ============================== */

type DaySlot = "morning" | "afternoon" | "evening" | "night";
const DAY_SLOTS: { key: DaySlot; label: string; from: number; to: number }[] = [
  { key: "morning", label: "Morning", from: 0, to: 12 },
  { key: "afternoon", label: "Afternoon", from: 12, to: 16 },
  { key: "evening", label: "Evening", from: 16, to: 20 },
  { key: "night", label: "Night", from: 20, to: 24 },
];
type MedPlan = { slots: DaySlot[]; interval: string | null; prn: boolean; food: "before" | "after" | null };

/** Turn a doctor's dose line (1-0-1, 1-1-1, 2-1-2-2, "every 6 hours", "SOS",
 *  "after food"…) into a day schedule. */
function parseMed(m: MedicationRow): MedPlan {
  const text = `${m.freq ?? ""} ${m.timing ?? ""} ${m.note ?? ""}`.toLowerCase();
  const prn = /need|sos|prn|required/.test(text);
  const interval = text.match(/every\s+[\w-]+\s*(?:hours?|hrs?|h)\b/)?.[0] ?? (/hourly/.test(text) ? "hourly" : null);
  const food: MedPlan["food"] = /before food|empty stomach/.test(text) ? "before" : /after food|with food|post food/.test(text) ? "after" : null;

  const slots: DaySlot[] = [];
  // The dose pattern can live in either freq or timing depending on the source.
  const pat = `${m.timing ?? ""} ${m.freq ?? ""}`.match(/\d+(?:\s*-\s*\d+){2,3}/); // 3 or 4 positions
  if (pat) {
    const nums = pat[0].split("-").map((n) => Number(n.trim()));
    const map: DaySlot[] = nums.length === 4 ? ["morning", "afternoon", "evening", "night"] : ["morning", "afternoon", "night"];
    nums.forEach((n, i) => { if (n > 0 && map[i]) slots.push(map[i]); });
  }
  if (slots.length === 0 && !prn && !interval) {
    if (/morning|breakfast|\bam\b/.test(text)) slots.push("morning");
    if (/after ?noon|lunch|noon/.test(text)) slots.push("afternoon");
    if (/evening|dinner/.test(text)) slots.push("evening");
    if (/night|bed|\bhs\b|\bpm\b/.test(text)) slots.push("night");
    if (slots.length === 0) slots.push("morning");
  }
  return { slots, interval, prn, food };
}
function currentDaySlot(): DaySlot {
  const h = new Date().getHours();
  return (DAY_SLOTS.find((s) => h >= s.from && h < s.to) ?? DAY_SLOTS[0]).key;
}

function MedicinesTab({ patientId, meds }: { patientId: string; meds: MedicationRow[] }) {
  const [admin, setAdmin] = useState<Map<string, MedAdminStatus>>(new Map());
  useEffect(() => { void getMedAdminToday(patientId).then(setAdmin).catch(() => {}); }, [patientId]);

  const mark = async (medId: string, slot: string, status: MedAdminStatus) => {
    const key = `${medId}|${slot}`;
    setAdmin((prev) => { const n = new Map(prev); n.set(key, status); return n; });
    try { await setMedAdmin(patientId, medId, slot, status); } catch { void getMedAdminToday(patientId).then(setAdmin).catch(() => {}); }
  };

  const parsed = meds.map((m) => ({ m, plan: parseMed(m) }));
  const now = currentDaySlot();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-ink">Medicines</h1>
        <p className="text-[13px] text-sage-600">The day&rsquo;s schedule. Mark each as given or missed — the care team sees this.</p>
      </div>

      {meds.length === 0 ? (
        <p className="rounded-2xl bg-white p-4 text-[14px] text-sage-600 shadow-card">No medicines in the plan yet.</p>
      ) : (
        <>
          {DAY_SLOTS.map((slot) => {
            const rows = parsed.filter((p) => p.plan.slots.includes(slot.key));
            if (rows.length === 0) return null;
            return (
              <MedSlotCard key={slot.key} title={slot.label} now={slot.key === now}>
                {rows.map(({ m, plan }) => (
                  <MedRow key={`${m.id}-${slot.key}`} med={m} slot={slot.key} food={plan.food} status={admin.get(`${m.id}|${slot.key}`)} onMark={mark} />
                ))}
              </MedSlotCard>
            );
          })}

          {parsed.some((p) => p.plan.interval) && (
            <MedSlotCard title="Round the clock">
              {parsed.filter((p) => p.plan.interval).map(({ m, plan }) => (
                <MedRow key={m.id} med={m} slot="interval" food={plan.food} hint={plan.interval ?? undefined} status={admin.get(`${m.id}|interval`)} onMark={mark} />
              ))}
            </MedSlotCard>
          )}

          {parsed.some((p) => p.plan.prn) && (
            <MedSlotCard title="As needed">
              {parsed.filter((p) => p.plan.prn).map(({ m, plan }) => (
                <MedRow key={m.id} med={m} slot="prn" food={plan.food} status={admin.get(`${m.id}|prn`)} onMark={mark} asNeeded />
              ))}
            </MedSlotCard>
          )}

          <section>
            <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-sage-500">Full medicine list</h2>
            <ul className="divide-y divide-ink/[0.05] rounded-2xl bg-white p-3 shadow-card">
              {meds.map((m) => {
                const food = parseMed(m).food;
                return (
                  <li key={m.id} className="flex items-start gap-3 py-2.5">
                    <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-600"><Icon.Pill width={15} height={15} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-baseline gap-x-2">
                        <span className="text-[14px] font-semibold text-ink">{m.name}</span>
                        {m.dose && <span className="text-[13px] text-sage-600">{m.dose}</span>}
                        {food && <FoodTag food={food} />}
                      </span>
                      <span className="block text-[12px] text-sage-500">{[m.freq, m.timing].filter(Boolean).join(" · ") || "As directed"}{m.note ? ` — ${m.note}` : ""}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

function MedSlotCard({ title, now, children }: { title: string; now?: boolean; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-sage-500">{title}</h2>
        {now && <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-700">Now</span>}
      </div>
      <div className="divide-y divide-ink/[0.05] rounded-2xl bg-white p-3 shadow-card">{children}</div>
    </section>
  );
}

function FoodTag({ food }: { food: "before" | "after" }) {
  return <span className="rounded-full bg-haze-100 px-2 py-0.5 text-[10.5px] font-semibold text-sage-600">{food === "before" ? "Before food" : "After food"}</span>;
}

function MedRow({ med, slot, food, hint, status, onMark, asNeeded }: {
  med: MedicationRow; slot: string; food: "before" | "after" | null; hint?: string; status?: MedAdminStatus;
  onMark: (medId: string, slot: string, status: MedAdminStatus) => void; asNeeded?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-[14px] font-semibold text-ink">{med.name}</span>
          {med.dose && <span className="text-[13px] text-sage-600">{med.dose}</span>}
          {food && <FoodTag food={food} />}
          {hint && <span className="rounded-full bg-mist-100 px-2 py-0.5 text-[10.5px] font-semibold text-sage-600">{hint}</span>}
        </span>
        {med.note && <span className="block text-[12px] text-sage-500">{med.note}</span>}
      </span>
      <div className="flex shrink-0 items-center gap-1.5">
        <button type="button" onClick={() => onMark(med.id, slot, "given")}
          className={`tap rounded-lg px-3 py-1.5 text-[12.5px] font-semibold ring-1 transition-colors ${status === "given" ? "bg-good-500 text-white ring-transparent" : "bg-white text-ink ring-line hover:ring-good-500"}`}>
          {asNeeded ? "Given now" : "Given"}
        </button>
        {!asNeeded && (
          <button type="button" onClick={() => onMark(med.id, slot, "missed")}
            className={`tap rounded-lg px-3 py-1.5 text-[12.5px] font-semibold ring-1 transition-colors ${status === "missed" ? "bg-coral-500 text-white ring-transparent" : "bg-white text-ink ring-line hover:ring-coral-400"}`}>
            Missed
          </button>
        )}
      </div>
    </div>
  );
}

/* ============================== MESSAGES ============================== */

function MessagesTab({ patientId }: { patientId: string }) {
  const { org } = useBranding();
  const note = org?.emergency_note?.trim();
  const number = org?.emergency_number?.trim();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-ink">Messages</h1>
        <p className="text-[13px] text-sage-600">Reach the care team and see their replies. A nurse responds 8 AM – 8 PM.</p>
      </div>

      <section className="rounded-2xl bg-coral-100/70 p-4 ring-1 ring-coral-500/20">
        <div className="flex items-center gap-2 text-coral-600"><Icon.Phone width={16} height={16} /><span className="text-[13px] font-semibold">In an emergency</span></div>
        <p className="mt-1.5 whitespace-pre-line text-[13px] leading-relaxed text-ink">
          {note || "Call your centre first. If unreachable, call 112 or 108, or go to the nearest hospital."}
        </p>
        {number && (
          <a href={`tel:${number.replace(/\s/g, "")}`} className="tap mt-2 inline-flex items-center gap-1.5 rounded-full bg-coral-600 px-3.5 py-1.5 text-[13px] font-semibold text-white hover:bg-coral-500">Call {number}</a>
        )}
      </section>

      <RaiseConcern patientId={patientId} />
    </div>
  );
}

/* ============================== shared ============================== */

const EMPTY: ReadingsInput = {
  bp: "", grbs: "", urineMl: "", foodIntake: "", mood: "", activity: "",
  pulse: "", spo2: "", temperature: "", pain: "", fluidMl: "", bowel: "", skin: "", feeding: "", cognition: "",
};

function dayAtHome(p: PatientRow): number {
  return Math.max(1, Math.floor((Date.now() - new Date(p.journey_start).getTime()) / 86_400_000) + 1);
}

function NavItem({ label, active, onClick, icon }: { label: string; active: boolean; onClick: () => void; icon: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={`flex flex-col items-center gap-0.5 py-2.5 ${active ? "text-brand-600" : "text-sage-500 hover:text-ink"}`}>
      {icon}
      <span className="text-[10px] font-medium">{label}</span>
    </button>
  );
}

function Skeleton() {
  return (
    <div className="space-y-4">
      <div className="h-5 w-40 animate-pulse rounded bg-mist-200" />
      <div className="h-28 animate-pulse rounded-2xl bg-mist-200" />
      <div className="h-64 animate-pulse rounded-2xl bg-mist-200" />
    </div>
  );
}
function LoadError({ message }: { message: string }) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-card">
      <h1 className="text-[17px] font-semibold text-ink">Couldn&rsquo;t load the plan</h1>
      <p className="mt-1 text-[13px] leading-relaxed text-sage-600">{message}</p>
    </div>
  );
}
function NoPatient() {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-card">
      <h1 className="text-[17px] font-semibold text-ink">No patient assigned yet</h1>
      <p className="mt-1 text-[13px] leading-relaxed text-sage-600">Your centre will link your account to the patient you care for. The daily plan appears here once that&rsquo;s done.</p>
    </div>
  );
}
