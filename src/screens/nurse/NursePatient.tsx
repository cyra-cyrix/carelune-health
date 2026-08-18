import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import ConcernInbox from "../../components/ConcernInbox";
import {
  RecoveryTrajectory, StatusTag, Avatar, SectionLabel, Panel, Reveal, type Tone,
} from "../../components/clinical";
import {
  getPatient,
  getReadingHistory,
  getMedications,
  getDailyUpdates,
  getPatientPlan,
  getPatientQueries,
  getMyProfile,
  raiseApproval,
  type PatientRow,
  type ReadingRow,
  type MedicationRow,
  type UpdateRow,
  type ApprovalRow,
  type PatientPlanRow,
} from "../../lib/db";

/**
 * Nurse patient view — the nurse is the family's first point of contact. Redesigned
 * in the clinical design language: a hero (who · condition · what needs answering ·
 * duty window), then the family message thread, the readings recorded at home, the
 * medicine list (read-only) and the care feed. She answers families here and
 * escalates clinical questions to the doctor.
 */
export default function NursePatient({ patientId, onBack }: { patientId: string; onBack: () => void }) {
  const [patient, setPatient] = useState<PatientRow | null>(null);
  const [readings, setReadings] = useState<ReadingRow[]>([]);
  const [meds, setMeds] = useState<MedicationRow[]>([]);
  const [feed, setFeed] = useState<UpdateRow[]>([]);
  const [plan, setPlan] = useState<PatientPlanRow | null>(null);
  const [queries, setQueries] = useState<ApprovalRow[]>([]);
  const [myName, setMyName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const p = await getPatient(patientId);
        if (!active) return;
        setPatient(p);
        const [r, m, f, prof] = await Promise.all([
          getReadingHistory(patientId, 7).catch(() => [] as ReadingRow[]),
          getMedications(patientId).catch(() => [] as MedicationRow[]),
          getDailyUpdates(patientId, 12).catch(() => [] as UpdateRow[]),
          getMyProfile().catch(() => null),
        ]);
        if (!active) return;
        setReadings(r); setMeds(m); setFeed(f); setMyName(prof?.full_name ?? null);
        setLoading(false);
        getPatientPlan(patientId).then((pl) => active && setPlan(pl)).catch(() => {});
        getPatientQueries(patientId).then((q) => active && setQueries(q)).catch(() => {});
      } catch (e) {
        if (active) { setError(e instanceof Error ? e.message : "Could not load the patient."); setLoading(false); }
      }
    })();
    return () => { active = false; };
  }, [patientId]);

  if (loading) {
    return (
      <div className="min-h-full bg-mist">
        <div className="bg-midnight-900 px-5 py-10"><div className="mx-auto h-24 max-w-[1100px] animate-pulse rounded-2xl bg-white/10" /></div>
        <div className="mx-auto max-w-[1100px] px-5 py-6"><div className="h-56 animate-pulse rounded-3xl bg-white/70" /></div>
      </div>
    );
  }
  if (error || !patient) {
    return (
      <div className="min-h-full bg-mist p-6">
        <button type="button" onClick={onBack} className="tap text-[13px] font-semibold text-sky-700">← Patients</button>
        <div className="mt-4 rounded-2xl bg-white p-5 shadow-panel ring-1 ring-ink/[0.05]">
          <p className="text-[14px] font-semibold text-ink">Couldn&rsquo;t load this patient</p>
          <p className="mt-1 text-[13px] text-sage-600">{error ?? "Not found."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-mist">
      <NurseHero patient={patient} plan={plan} queries={queries} readings={readings} onBack={onBack} />

      <main className="mx-auto max-w-[1100px] px-5 py-6 lg:px-8">
        <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
          <div className="space-y-5">
            <Reveal index={0}><ConcernInbox patientId={patientId} /></Reveal>
            <Reveal index={1}><ReadingsPanel readings={readings} /></Reveal>
            <Reveal index={2}><MedsPanel meds={meds} /></Reveal>
            <Reveal index={3}><RaiseQuery patientId={patientId} myName={myName} /></Reveal>
          </div>
          <div className="space-y-5">
            <Reveal index={0}><CareFeed feed={feed} /></Reveal>
          </div>
        </div>
      </main>
    </div>
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
function niceDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

/* --------------------------------- hero ----------------------------------- */

function NurseHero({
  patient, plan, queries, readings, onBack,
}: {
  patient: PatientRow; plan: PatientPlanRow | null; queries: ApprovalRow[]; readings: ReadingRow[]; onBack: () => void;
}) {
  const day = dayAtHome(patient);
  const open = queries.filter((q) => q.status === "pending");
  const urgent = open.filter((q) => q.urgency === "urgent").length;

  const attention: { tone: Tone; label: string } = urgent > 0
    ? { tone: "escalation", label: `${urgent} urgent message${urgent === 1 ? "" : "s"} to answer` }
    : open.length > 0
      ? { tone: "attention", label: `${open.length} message${open.length === 1 ? "" : "s"} to answer` }
      : { tone: "recovery", label: "No open messages" };

  const condition = plan?.content?.clinical_summary?.trim()
    || (patient.diagnosis.length ? patient.diagnosis.join(", ") : "Recovery at home");

  const bpSys = readings.map((r) => num((r.bp ?? "").split("/")[0])).filter(Number.isFinite);
  const improving = bpSys.length >= 2 ? bpSys[bpSys.length - 1] < bpSys[0] : null;

  return (
    <div className="bg-midnight-900">
      <div className="relative mx-auto max-w-[1100px] overflow-hidden px-5 py-7 lg:px-8 lg:py-9">
        <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(80% 120% at 100% 0%, rgba(23,179,161,0.16), transparent 60%)" }} />
        <div className="relative">
          <button type="button" onClick={onBack} className="tap text-[13px] font-semibold text-haze-300 hover:text-haze-100">← Patients</button>

          <div className="mt-4 flex flex-wrap items-start justify-between gap-6">
            <div className="flex min-w-0 gap-4">
              <Avatar name={patient.full_name} tone={attention.tone} size={54} />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h1 className="font-display text-[22px] font-semibold tracking-[-0.02em] text-haze-100 sm:text-[26px]">{patient.full_name}</h1>
                  <StatusTag tone={attention.tone}>{attention.label}</StatusTag>
                </div>
                <p className="mt-1 text-[13px] text-haze-400">
                  {patient.age ?? "—"}{patient.sex ? " " + patient.sex : ""}{patient.location ? ` · ${patient.location}` : ""} · Day {day}
                </p>
                <p className="mt-2.5 max-w-xl text-[14.5px] leading-relaxed text-haze-200">{condition}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.06] px-2.5 py-1 text-[12px] font-medium text-haze-200 ring-1 ring-white/10">
                    <span className="h-1.5 w-1.5 rounded-full bg-brand-400" /> Nurse support · 8 AM–8 PM
                  </span>
                  {patient.diagnosis.slice(0, 2).map((dx) => (
                    <span key={dx} className="rounded-full bg-white/[0.06] px-2.5 py-1 text-[12px] font-medium text-haze-200 ring-1 ring-white/10">{dx}</span>
                  ))}
                </div>
              </div>
            </div>

            {bpSys.length >= 2 && (
              <div className="w-full max-w-[280px] rounded-2xl bg-white/[0.06] p-4 ring-1 ring-white/10 backdrop-blur-sm sm:w-[280px]">
                <div className="flex items-center justify-between">
                  <SectionLabel onDark>Blood pressure</SectionLabel>
                  {improving != null && <span className={`text-[11px] font-bold ${improving ? "text-brand-300" : "text-warn-300"}`}>{improving ? "improving" : "watch"}</span>}
                </div>
                <div className="mt-2"><RecoveryTrajectory values={bpSys} tone={improving === false ? "attention" : "recovery"} height={40} animate onDark /></div>
                <p className="mt-2 text-[11.5px] text-haze-400">Recorded at home by the family or caregiver</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------- readings --------------------------------- */

function ReadingsPanel({ readings }: { readings: ReadingRow[] }) {
  const latest = readings[readings.length - 1] ?? null;
  if (!latest) {
    return (
      <Panel label="Detail" title="Readings">
        <p className="text-[13.5px] text-sage-500">No readings recorded yet. They appear here as the home team logs them.</p>
      </Panel>
    );
  }
  const vitals: [string, string | null][] = [
    ["Blood pressure", latest.bp],
    ["Blood sugar", latest.grbs],
    ["Urine (mL)", latest.urine_ml],
  ];
  const qual: [string, string | null][] = [
    ["Food intake", latest.food_intake],
    ["Mood", latest.mood],
    ["Activity", latest.activity],
  ];
  return (
    <Panel label="Detail" title={`Readings · ${niceDate(latest.reading_date)}`} aside={<span className="text-[12px] text-sage-500">recorded at home</span>}>
      <div className="grid gap-3 sm:grid-cols-3">
        {vitals.map(([k, v]) => (
          <div key={k} className="rounded-2xl bg-mist p-3.5 ring-1 ring-ink/[0.04]">
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-sage-500">{k}</div>
            <div className="mt-1 text-[18px] font-semibold tabular-nums text-ink">{v?.trim() || "—"}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {qual.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between rounded-xl bg-mist-100 px-3 py-2 ring-1 ring-ink/[0.04]">
            <span className="text-[12px] font-medium text-sage-600">{k}</span>
            <span className="text-[12.5px] font-medium text-ink">{v?.trim() || "—"}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

/* ------------------------------- medicines -------------------------------- */

function MedsPanel({ meds }: { meds: MedicationRow[] }) {
  return (
    <Panel label="Detail" title="Medicines" aside={<StatusTag tone="neutral">Doctor-owned</StatusTag>}>
      {meds.length === 0 ? (
        <p className="text-[13.5px] text-sage-500">No medicines recorded.</p>
      ) : (
        <ul className="divide-y divide-ink/[0.05]">
          {meds.map((m) => (
            <li key={m.id} className="flex items-baseline justify-between gap-2 py-2.5">
              <span className="min-w-0 text-[13.5px] text-ink">
                <span className="font-semibold">{m.name}</span> <span className="text-sage-500">{m.dose ?? ""}</span>
                <span className="block text-[11px] text-sage-400">{m.timing ?? ""}{m.note ? ` · ${m.note}` : ""}</span>
              </span>
              {m.freq && <span className="shrink-0 rounded-md bg-mist px-1.5 py-0.5 text-[12px] font-semibold tabular-nums text-ink ring-1 ring-ink/[0.04]">{m.freq}</span>}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[12px] text-sage-500">Read-only — only the doctor changes medicines.</p>
    </Panel>
  );
}

/* ------------------------------ raise a query ----------------------------- */

function RaiseQuery({ patientId, myName }: { patientId: string; myName: string | null }) {
  const [urgency, setUrgency] = useState<"routine" | "urgent">("routine");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const send = async () => {
    if (!msg.trim()) return;
    setBusy(true); setError(null);
    try {
      await raiseApproval(patientId, { type: "nurse_query", message: msg.trim(), urgency, from_name: myName ?? "Nurse" });
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send the query.");
    } finally { setBusy(false); }
  };

  if (sent) {
    return (
      <Panel label="Escalate" title="Raise a query">
        <p className="rounded-2xl bg-brand-50 px-3.5 py-2.5 text-[13px] font-medium text-brand-700 ring-1 ring-brand-500/20">
          ✓ {urgency === "urgent" ? "Urgent query" : "Query"} sent to the doctor.
        </p>
      </Panel>
    );
  }

  const pill = (active: boolean, tone: "routine" | "urgent") =>
    `tap rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition-colors ${
      active ? (tone === "urgent" ? "bg-coral-600 text-white" : "bg-sky-600 text-white") : "bg-mist-100 text-sage-600 hover:text-ink"
    }`;

  return (
    <Panel label="Escalate" title="Raise a query to the doctor">
      <div className="space-y-3">
        <div>
          <span className="mb-1.5 block text-[12px] font-semibold text-sage-600">Seriousness</span>
          <div className="flex gap-2">
            <button type="button" onClick={() => setUrgency("routine")} className={pill(urgency === "routine", "routine")}>Routine</button>
            <button type="button" onClick={() => setUrgency("urgent")} className={pill(urgency === "urgent", "urgent")}>Urgent</button>
          </div>
        </div>
        <textarea
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          rows={3}
          placeholder="What do you need the doctor to decide?"
          className="w-full rounded-xl bg-white px-3 py-2 text-[13px] text-ink ring-1 ring-line focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
        />
        {error && <p className="text-[13px] text-coral-600">{error}</p>}
        <button type="button" onClick={send} disabled={busy || !msg.trim()} className="tap w-full rounded-2xl bg-brand-800 py-2.5 text-[15px] font-semibold text-white transition-colors hover:bg-brand-900 disabled:opacity-60">
          {busy ? "Sending…" : "Send query"}
        </button>
      </div>
    </Panel>
  );
}

/* ------------------------------- care feed -------------------------------- */

const SRC: Record<UpdateRow["source"], { label: string; tone: Tone }> = {
  caregiver: { label: "From home", tone: "calm" },
  nurse: { label: "Rehab nurse", tone: "recovery" },
  duty_doctor: { label: "Duty doctor", tone: "neutral" },
  pmr: { label: "Lead clinician", tone: "attention" },
};

function CareFeed({ feed }: { feed: UpdateRow[] }): ReactNode {
  return (
    <Panel label="Context" title="Care feed">
      {feed.length === 0 ? (
        <p className="text-[13.5px] text-sage-500">No updates yet.</p>
      ) : (
        <ol className="space-y-3">
          {feed.map((u) => (
            <li key={u.id} className={`rounded-xl px-3 py-2.5 ${u.flag === "watch" ? "bg-warn-100/60 ring-1 ring-warn-500/20" : "bg-mist"}`}>
              <div className="flex items-center justify-between gap-2">
                <StatusTag tone={SRC[u.source]?.tone ?? "neutral"}>{SRC[u.source]?.label ?? "Care team"}</StatusTag>
                <span className="text-[11px] text-sage-500">{niceDate(u.created_at)}</span>
              </div>
              {u.author_name && <p className="mt-1 text-[12px] font-medium text-sage-500">{u.author_name}</p>}
              <p className="mt-0.5 whitespace-pre-line text-[13px] leading-snug text-ink">{u.body}</p>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}
