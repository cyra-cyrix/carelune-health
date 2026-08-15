import { useEffect, useState } from "react";
import { Icon, ProgressRing } from "../../components/ui";
import RaiseConcern from "../../components/RaiseConcern";
import { useBranding } from "../../branding/BrandingProvider";
import { FOOD_OPTIONS, MOOD_OPTIONS } from "../../data/case";
import {
  getMyPatient,
  getCareTasks,
  getTodayTaskLogs,
  setTaskDone,
  getTodayReadings,
  saveReadings,
  getMedications,
  type PatientRow,
  type CareTaskRow,
  type ReadingsInput,
  type MedicationRow,
} from "../../lib/db";

type Tab = "today" | "readings" | "help";

const EMPTY_READINGS: ReadingsInput = {
  bp: "",
  grbs: "",
  urineMl: "",
  foodIntake: FOOD_OPTIONS[1],
  mood: MOOD_OPTIONS[0],
  activity: "",
  pulse: "",
  spo2: "",
  temperature: "",
  pain: "",
  fluidMl: "",
  bowel: "",
  skin: "",
  feeding: "",
  cognition: "",
};

/**
 * Caregiver home (v2 · database-backed). Same calm-premium layout as before —
 * a progress hero, a vertical timeline of the approved plan (tap to complete),
 * daily readings, and help — but now every task tick and reading is saved to
 * Supabase for the real patient this caregiver is assigned to.
 */
export default function CaregiverHome() {
  const { profile } = useBranding();
  const [tab, setTab] = useState<Tab>("today");
  const [patient, setPatient] = useState<PatientRow | null>(null);
  const [tasks, setTasks] = useState<CareTaskRow[]>([]);
  const [meds, setMeds] = useState<MedicationRow[]>([]);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Silently refetch when the tab regains focus.
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") setRefreshKey((k) => k + 1);
    };
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
          const [t, logs, m] = await Promise.all([
            getCareTasks(p.id),
            getTodayTaskLogs(p.id),
            getMedications(p.id).catch(() => [] as MedicationRow[]),
          ]);
          if (!active) return;
          setTasks(t);
          setDone(logs);
          setMeds(m);
        }
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Could not load the plan.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [refreshKey]);

  const toggle = async (id: string) => {
    if (!patient) return;
    const nextDone = !done.has(id);
    // optimistic
    setDone((s) => {
      const n = new Set(s);
      if (nextDone) n.add(id);
      else n.delete(id);
      return n;
    });
    try {
      await setTaskDone(patient.id, id, nextDone);
    } catch {
      // revert on failure
      setDone((s) => {
        const n = new Set(s);
        if (nextDone) n.delete(id);
        else n.add(id);
        return n;
      });
    }
  };

  const first = patient ? patient.full_name.split(" ")[0] : "";
  const caregiverFirst = profile?.full_name?.split(" ")[0] ?? "";
  const next = tasks.find((t) => !done.has(t.id));

  return (
    <div className="min-h-[calc(100vh-3rem)] bg-mist">
      <div className="px-4 pb-28 pt-5">
        {loading && <SkeletonToday />}
        {!loading && error && <LoadError message={error} />}
        {!loading && !error && !patient && <NoPatient />}
        {!loading && !error && patient && (
          <>
            {tab === "today" && (
              <Today first={first} caregiverName={caregiverFirst} day={dayAtHome(patient)} tasks={tasks} meds={meds} done={done} toggle={toggle} nextId={next?.id} />
            )}
            {tab === "readings" && <ReadingsTab patientId={patient.id} />}
            {tab === "help" && <HelpTab patientId={patient.id} />}
          </>
        )}
      </div>

      <nav className="pb-safe sticky bottom-0 z-10 border-t border-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[640px] items-center px-3">
          <NavItem label="Today" active={tab === "today"} onClick={() => setTab("today")} icon={<Icon.Home width={20} height={20} />} />
          <NavItem label="Readings" active={tab === "readings"} onClick={() => setTab("readings")} icon={<Icon.Pulse width={20} height={20} />} />
          <div className="flex flex-1 justify-center">
            <button
              type="button"
              onClick={() => next && toggle(next.id)}
              disabled={!next}
              aria-label="Mark the current task done"
              className="tap -mt-6 grid h-14 w-14 place-items-center rounded-full bg-brand-600 text-white shadow-lift disabled:opacity-40"
            >
              <Icon.Check width={24} height={24} />
            </button>
          </div>
          <NavItem label="Help" active={tab === "help"} onClick={() => setTab("help")} icon={<Icon.Life width={20} height={20} />} />
        </div>
      </nav>
    </div>
  );
}

/** Whole days since discharge/journey start, 1-indexed. */
function dayAtHome(p: PatientRow): number {
  const start = new Date(p.journey_start).getTime();
  return Math.max(1, Math.floor((Date.now() - start) / 86_400_000) + 1);
}

function NavItem({ label, active, onClick, icon }: { label: string; active: boolean; onClick: () => void; icon: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 ${active ? "text-brand-600" : "text-sage-500 hover:text-ink"}`}
    >
      {icon}
      <span className="text-[10px] font-medium">{label}</span>
    </button>
  );
}

/* ---------------- Today ---------------- */

function Today({
  first,
  caregiverName,
  day,
  tasks,
  meds,
  done,
  toggle,
  nextId,
}: {
  first: string;
  caregiverName: string;
  day: number;
  tasks: CareTaskRow[];
  meds: MedicationRow[];
  done: Set<string>;
  toggle: (id: string) => void;
  nextId?: string;
}) {
  const total = tasks.length;
  const next = tasks.find((t) => t.id === nextId);

  return (
    <div className="space-y-4">
      <div>
        <div className="text-[13px] text-sage-600">{first}&rsquo;s day · Day {day}</div>
        <h1 className="text-[22px] font-semibold tracking-tight text-ink">
          {caregiverName ? `Good day, ${caregiverName}.` : "Good day."}
        </h1>
      </div>

      {/* Progress hero */}
      <div className="flex items-center justify-between rounded-2xl bg-brand-600 p-5 text-white shadow-lift">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/80">Today&rsquo;s plan</div>
          <div className="mt-1 text-[22px] font-semibold">
            {done.size} of {total} done
          </div>
          <div className="mt-1 truncate text-[13px] text-white/85">
            {next ? `Up next · ${next.time_label} · ${next.title}` : total ? "All done. Thank you." : "No tasks yet."}
          </div>
        </div>
        <ProgressRing value={done.size} total={Math.max(total, 1)} size={84} onDark />
      </div>

      {/* What to do now */}
      {next && (
        <button
          type="button"
          onClick={() => toggle(next.id)}
          className="tap block w-full rounded-2xl bg-white p-4 text-left shadow-card ring-1 ring-brand-100"
        >
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-brand-600">What to do now</div>
          <div className="mt-1 text-[16px] font-semibold text-ink">{next.title}</div>
          <div className="mt-0.5 text-[13px] text-sage-600">
            {next.time_label} · {next.discipline}
            {next.detail ? ` · ${next.detail}` : ""}
          </div>
          <div className="mt-2 inline-flex items-center gap-1 text-[13px] font-semibold text-brand-600">
            Mark done <Icon.Check width={15} height={15} />
          </div>
        </button>
      )}

      {/* Timeline */}
      <div>
        <h2 className="mb-2 text-[15px] font-semibold text-ink">The whole day</h2>
        <ol className="rounded-2xl bg-white p-2 shadow-card">
          {tasks.map((t, i) => {
            const isDone = done.has(t.id);
            const isNow = t.id === nextId;
            const last = i === tasks.length - 1;
            return (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => toggle(t.id)}
                  className="tap flex w-full gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-mist-100"
                >
                  <div className="relative flex w-5 shrink-0 justify-center">
                    {!last && <span className="absolute left-1/2 top-4 h-full w-px -translate-x-1/2 bg-line" />}
                    <span
                      className={`z-10 mt-1 h-3 w-3 rounded-full ${
                        isDone
                          ? "bg-brand-600 ring-4 ring-brand-100"
                          : isNow
                            ? "bg-white ring-2 ring-brand-600"
                            : "bg-white ring-2 ring-line"
                      }`}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className={`text-[14px] font-semibold ${isDone ? "text-sage-400 line-through decoration-sage-300" : "text-ink"}`}>
                        {t.title}
                      </span>
                      <span className="shrink-0 text-[12px] tabular-nums text-sage-500">{t.time_label}</span>
                    </div>
                    <div className="text-[12px] text-sage-500">
                      {t.discipline}
                      {t.detail ? ` · ${t.detail}` : ""}
                    </div>
                  </div>
                  <span
                    className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border ${
                      isDone ? "border-brand-600 bg-brand-600 text-white" : "border-line text-transparent"
                    }`}
                    aria-hidden
                  >
                    <Icon.Check width={13} height={13} />
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      {/* Medicines — from the plan the doctor activated */}
      {meds.length > 0 && (
        <div>
          <h2 className="mb-2 text-[15px] font-semibold text-ink">Medicines</h2>
          <ul className="space-y-2 rounded-2xl bg-white p-2 shadow-card">
            {meds.map((m) => (
              <li key={m.id} className="flex items-start gap-3 rounded-xl px-2 py-2">
                <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-600">
                  <Icon.Pill width={16} height={16} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-[14px] font-semibold text-ink">{m.name}</span>
                    {m.dose && <span className="text-[13px] text-sage-600">{m.dose}</span>}
                  </span>
                  <span className="block text-[12px] text-sage-500">
                    {[m.freq, m.timing].filter(Boolean).join(" · ") || "As directed"}
                    {m.note ? ` — ${m.note}` : ""}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="px-1 text-[12px] leading-relaxed text-sage-600">
        Everything here comes from the plan the care team approved.
      </p>
    </div>
  );
}

/* ---------------- Readings ---------------- */

const FIELD =
  "w-full rounded-xl bg-white px-3 py-2 text-[14px] text-ink ring-1 ring-line focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400";

function ReadingsTab({ patientId }: { patientId: string }) {
  const [r, setR] = useState<ReadingsInput>(EMPTY_READINGS);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const existing = await getTodayReadings(patientId);
        if (active && existing) setR(existing);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [patientId]);

  const set = (k: keyof ReadingsInput, v: string) => {
    setR((prev) => ({ ...prev, [k]: v }));
    setStatus("idle");
  };

  const save = async () => {
    setStatus("saving");
    try {
      await saveReadings(patientId, r);
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-ink">Today&rsquo;s readings</h1>
        <p className="text-[13px] text-sage-600">Your care team sees these.</p>
      </div>
      <div className="rounded-2xl bg-white p-4 shadow-card">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Blood pressure">
            <input value={r.bp} onChange={(e) => set("bp", e.target.value)} inputMode="numeric" className={FIELD} disabled={loading} />
          </Field>
          <Field label="Blood sugar">
            <input value={r.grbs} onChange={(e) => set("grbs", e.target.value)} inputMode="numeric" className={FIELD} disabled={loading} />
          </Field>
          <Field label="Urine (mL)">
            <input value={r.urineMl} onChange={(e) => set("urineMl", e.target.value)} inputMode="numeric" className={FIELD} disabled={loading} />
          </Field>
          <Field label="Activity / motion">
            <input value={r.activity} onChange={(e) => set("activity", e.target.value)} className={FIELD} disabled={loading} />
          </Field>
          <Field label="Food intake">
            <select value={r.foodIntake} onChange={(e) => set("foodIntake", e.target.value)} className={FIELD} disabled={loading}>
              {FOOD_OPTIONS.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </Field>
          <Field label="Mood">
            <select value={r.mood} onChange={(e) => set("mood", e.target.value)} className={FIELD} disabled={loading}>
              {MOOD_OPTIONS.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </Field>
        </div>
        <button
          type="button"
          onClick={save}
          disabled={status === "saving" || loading}
          className="tap mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand-600 py-2.5 text-[15px] font-semibold text-white hover:bg-brand-500 disabled:opacity-60"
        >
          {status === "saved" ? (
            <>
              <Icon.Check width={16} height={16} /> Saved · shared with the care team
            </>
          ) : status === "saving" ? (
            "Saving…"
          ) : status === "error" ? (
            "Couldn't save — tap to retry"
          ) : (
            "Save today's readings"
          )}
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-semibold text-sage-600">{label}</span>
      {children}
    </label>
  );
}

/* ---------------- Help ---------------- */

function HelpTab({ patientId }: { patientId: string }) {
  return (
    <div className="space-y-4">
      <h1 className="text-[22px] font-semibold tracking-tight text-ink">Help</h1>
      <div className="rounded-2xl bg-coral-100 p-4">
        <div className="flex items-center gap-2 text-coral-600">
          <Icon.Phone width={16} height={16} />
          <span className="text-[13px] font-semibold">In an emergency</span>
        </div>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink">
          Call <span className="font-semibold">112</span> or <span className="font-semibold">108</span> immediately.
          For urgent care questions, contact the nurse line (8 AM – 8 PM).
        </p>
      </div>

      {/* Ask the care team — type or voice */}
      <RaiseConcern patientId={patientId} />
      <div className="rounded-2xl bg-white p-4 shadow-card">
        <h2 className="text-[15px] font-semibold text-ink">Your care team</h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-sage-600">
          A nurse is your first point of contact, 8 AM – 8 PM. Send a message above and the team will reply here.
          The doctor reviews your recovery and steps in when needed.
        </p>
      </div>
    </div>
  );
}

/* ---------------- Loading / empty states ---------------- */

function SkeletonToday() {
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
      <p className="mt-2 text-[12px] text-sage-500">Check your connection and pull to refresh.</p>
    </div>
  );
}

function NoPatient() {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-card">
      <h1 className="text-[17px] font-semibold text-ink">No patient assigned yet</h1>
      <p className="mt-1 text-[13px] leading-relaxed text-sage-600">
        Your centre will link your account to the patient you care for. Once that&rsquo;s done, the daily plan
        appears here.
      </p>
    </div>
  );
}
