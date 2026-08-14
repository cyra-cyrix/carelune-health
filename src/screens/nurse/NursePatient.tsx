import { useEffect, useState } from "react";
import ConcernInbox from "../../components/ConcernInbox";
import {
  getPatient,
  getReadingHistory,
  getMedications,
  getDailyUpdates,
  getMyProfile,
  raiseApproval,
  type PatientRow,
  type ReadingRow,
  type MedicationRow,
  type UpdateRow,
} from "../../lib/db";

/**
 * Nurse patient view (database-backed). She reviews the caregiver's day, monitors
 * the latest readings and medicines, and raises a query to the doctor. Real data
 * for the patient she opened from the caseload.
 */
export default function NursePatient({ patientId, onBack }: { patientId: string; onBack: () => void }) {
  const [patient, setPatient] = useState<PatientRow | null>(null);
  const [reading, setReading] = useState<ReadingRow | null>(null);
  const [meds, setMeds] = useState<MedicationRow[]>([]);
  const [feed, setFeed] = useState<UpdateRow[]>([]);
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
        const [readings, m, f, prof] = await Promise.all([
          getReadingHistory(patientId, 1).catch(() => [] as ReadingRow[]),
          getMedications(patientId).catch(() => [] as MedicationRow[]),
          getDailyUpdates(patientId, 12).catch(() => [] as UpdateRow[]),
          getMyProfile().catch(() => null),
        ]);
        if (!active) return;
        setReading(readings[readings.length - 1] ?? null);
        setMeds(m);
        setFeed(f);
        setMyName(prof?.full_name ?? null);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Could not load the patient.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [patientId]);

  if (loading) return <div className="min-h-full bg-mist p-6"><div className="h-40 animate-pulse rounded-2xl bg-mist-200" /></div>;
  if (error || !patient)
    return (
      <div className="min-h-full bg-mist p-6">
        <p className="text-[14px] text-coral-600">{error ?? "Patient not found."}</p>
        <button type="button" onClick={onBack} className="tap mt-3 text-[13px] font-semibold text-brand-700">← Patients</button>
      </div>
    );

  return (
    <div className="min-h-full bg-mist">
      <div className="border-b border-ink/10 bg-white">
        <div className="mx-auto max-w-[1100px] px-5 py-4 lg:px-8">
          <button type="button" onClick={onBack} className="tap text-[13px] font-semibold text-brand-700 hover:text-brand-600">
            ← Patients
          </button>
          <h1 className="mt-2 font-display text-2xl font-semibold text-ink">{patient.full_name}</h1>
          <p className="text-[13px] text-sage-500">
            {patient.age ?? "—"} {patient.sex ?? ""}
            {patient.location ? ` · ${patient.location}` : ""} · Day {dayAtHome(patient)}
          </p>
          {patient.diagnosis.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {patient.diagnosis.map((dx) => (
                <span key={dx} className="rounded-full bg-mist px-2.5 py-1 text-[12px] font-medium text-ink ring-1 ring-ink/[0.06]">
                  {dx}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <main className="mx-auto grid max-w-[1100px] gap-5 px-5 py-6 lg:grid-cols-[1fr_1fr] lg:px-8">
        <div className="space-y-5">
          <ConcernInbox patientId={patientId} />
          <Readings reading={reading} />
          <Meds meds={meds} />
          <RaiseQuery patientId={patientId} myName={myName} />
        </div>
        <DailyFeed feed={feed} />
      </main>
    </div>
  );
}

/** Whole days since journey start, 1-indexed. */
function dayAtHome(p: PatientRow): number {
  const start = new Date(p.journey_start).getTime();
  return Math.max(1, Math.floor((Date.now() - start) / 86_400_000) + 1);
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-5 shadow-lift ring-1 ring-ink/[0.05]">
      <h2 className="font-display text-[15px] font-semibold text-ink">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/* ---------------- Latest readings (from the caregiver) ---------------- */

function Readings({ reading }: { reading: ReadingRow | null }) {
  if (!reading) {
    return (
      <Section title="Readings — from the caregiver">
        <p className="text-[13px] text-sage-500">No readings recorded yet.</p>
      </Section>
    );
  }
  const rows: [string, string | null][] = [
    ["Blood pressure", reading.bp],
    ["Blood sugar", reading.grbs],
    ["Urine (mL)", reading.urine_ml],
    ["Food intake", reading.food_intake],
    ["Mood", reading.mood],
    ["Activity / motion", reading.activity],
  ];
  return (
    <Section title={`Readings — ${niceDate(reading.reading_date)}`}>
      <dl className="grid grid-cols-2 gap-3">
        {rows.map(([k, v]) => (
          <div key={k} className="rounded-xl bg-mist p-3">
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-sage-500">{k}</dt>
            <dd className="mt-0.5 text-[15px] font-semibold text-ink">{v?.trim() || "—"}</dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}

/* ---------------- Medicines (read-only) ---------------- */

function Meds({ meds }: { meds: MedicationRow[] }) {
  return (
    <Section title="Medicines">
      {meds.length === 0 ? (
        <p className="text-[13px] text-sage-500">No medicines recorded.</p>
      ) : (
        <ul className="divide-y divide-ink/[0.05]">
          {meds.map((m) => (
            <li key={m.id} className="flex items-baseline justify-between gap-2 py-2">
              <span className="min-w-0 text-[13px] text-ink">
                <span className="font-semibold">{m.name}</span> <span className="text-sage-500">{m.dose ?? ""}</span>
                <span className="block text-[11px] text-sage-400">
                  {m.timing ?? ""}
                  {m.note ? ` · ${m.note}` : ""}
                </span>
              </span>
              {m.freq && <span className="shrink-0 rounded bg-mist px-1.5 py-0.5 text-[12px] font-semibold tabular-nums text-ink">{m.freq}</span>}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[12px] text-sage-500">Read-only — only the doctor changes medicines.</p>
    </Section>
  );
}

/* ---------------- Raise a query ---------------- */

function RaiseQuery({ patientId, myName }: { patientId: string; myName: string | null }) {
  const [urgency, setUrgency] = useState<"routine" | "urgent">("routine");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const send = async () => {
    if (!msg.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await raiseApproval(patientId, { type: "nurse_query", message: msg.trim(), urgency, from_name: myName ?? "Nurse" });
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send the query.");
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <Section title="Raise a query">
        <p className="rounded-2xl bg-good-100 px-3.5 py-2.5 text-[13px] font-medium text-good-600">
          ✓ {urgency === "urgent" ? "Urgent query" : "Query"} sent to the doctor.
        </p>
      </Section>
    );
  }

  const pill = (active: boolean) =>
    `tap rounded-full px-3.5 py-1.5 text-[12px] font-semibold ${active ? "bg-brand-600 text-white" : "bg-mist text-sage-600"}`;

  return (
    <Section title="Raise a query">
      <div className="space-y-3">
        <div>
          <span className="mb-1.5 block text-[12px] font-semibold text-sage-600">Seriousness</span>
          <div className="flex gap-2">
            <button type="button" onClick={() => setUrgency("routine")} className={pill(urgency === "routine")}>Routine</button>
            <button type="button" onClick={() => setUrgency("urgent")} className={pill(urgency === "urgent")}>Urgent</button>
          </div>
        </div>
        <textarea
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          rows={3}
          placeholder="What do you need the doctor to decide?"
          className="w-full rounded-xl bg-white px-3 py-2 text-[13px] text-ink ring-1 ring-ink/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
        />
        {error && <p className="text-[13px] text-coral-600">{error}</p>}
        <button type="button" onClick={send} disabled={busy || !msg.trim()} className="tap w-full rounded-2xl bg-brand-600 py-2.5 text-[15px] font-semibold text-white hover:bg-brand-500 disabled:opacity-60">
          {busy ? "Sending…" : "Send query"}
        </button>
      </div>
    </Section>
  );
}

/* ---------------- Care feed ---------------- */

function DailyFeed({ feed }: { feed: UpdateRow[] }) {
  return (
    <Section title="Care feed">
      {feed.length === 0 ? (
        <p className="text-[13px] text-sage-500">No updates yet.</p>
      ) : (
        <ol className="space-y-3">
          {feed.map((u) => (
            <li key={u.id} className={`rounded-xl px-3 py-2 ${u.flag === "watch" ? "bg-warn-100/60 ring-1 ring-warn-500/20" : "bg-mist"}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-brand-700">
                  {sourceLabel(u.source)}
                </span>
                <span className="text-[11px] text-sage-500">{niceDate(u.created_at)}</span>
              </div>
              {u.author_name && <p className="mt-1 text-[12px] font-medium text-sage-500">{u.author_name}</p>}
              <p className="mt-0.5 whitespace-pre-line text-[13px] leading-snug text-ink">{u.body}</p>
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}

function niceDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function sourceLabel(s: UpdateRow["source"]): string {
  return { caregiver: "Caregiver", nurse: "Nurse", duty_doctor: "Duty Doctor", pmr: "Doctor" }[s] ?? "Care team";
}
