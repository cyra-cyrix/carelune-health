import { useEffect, useState } from "react";
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
 * Duty Doctor patient view (database-backed). He confirms the summary, monitors
 * the readings, and can SUGGEST a medicine change — which lands in the doctor's
 * approvals inbox. He does not change medicines himself. Real patient data.
 */
export default function DutyPatient({ patientId, onBack }: { patientId: string; onBack: () => void }) {
  const [patient, setPatient] = useState<PatientRow | null>(null);
  const [readings, setReadings] = useState<ReadingRow[]>([]);
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
        const [r, m, f, prof] = await Promise.all([
          getReadingHistory(patientId, 7).catch(() => [] as ReadingRow[]),
          getMedications(patientId).catch(() => [] as MedicationRow[]),
          getDailyUpdates(patientId, 12).catch(() => [] as UpdateRow[]),
          getMyProfile().catch(() => null),
        ]);
        if (!active) return;
        setReadings(r);
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

  const latest = readings[readings.length - 1] ?? null;

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

      <main className="mx-auto max-w-[1100px] space-y-5 px-5 py-6 lg:px-8">
        <div className="rounded-2xl bg-brand-50 p-4 ring-1 ring-brand-200">
          <p className="text-[13px] leading-relaxed text-ink">
            <span className="font-semibold">You confirm and suggest — the doctor approves.</span>{" "}
            Flag concerns and suggest medicine changes; anything serious escalates.
          </p>
        </div>

        <Vitals latest={latest} history={readings} />

        <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
          <Medicines patientId={patientId} meds={meds} myName={myName} />
          <DailyFeed feed={feed} />
        </div>
      </main>
    </div>
  );
}

/** Whole days since journey start, 1-indexed. */
function dayAtHome(p: PatientRow): number {
  const start = new Date(p.journey_start).getTime();
  return Math.max(1, Math.floor((Date.now() - start) / 86_400_000) + 1);
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-5 shadow-lift ring-1 ring-ink/[0.05]">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-[15px] font-semibold text-ink">{title}</h2>
        {action}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/* ---------------- Vitals (latest + recent) ---------------- */

function Vitals({ latest, history }: { latest: ReadingRow | null; history: ReadingRow[] }) {
  return (
    <Section title="Readings">
      {!latest ? (
        <p className="text-[13px] text-sage-500">No readings recorded yet.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <VitalCard label="BP" value={latest.bp} />
            <VitalCard label="Blood sugar" value={latest.grbs} />
            <VitalCard label="Urine (mL)" value={latest.urine_ml} />
            <VitalCard label="Food" value={latest.food_intake} />
          </div>
          {history.length > 1 && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-[12px]">
                <thead>
                  <tr className="text-sage-500">
                    <th className="py-1 pr-3 font-semibold">Date</th>
                    <th className="py-1 pr-3 font-semibold">BP</th>
                    <th className="py-1 pr-3 font-semibold">Sugar</th>
                    <th className="py-1 pr-3 font-semibold">Mood</th>
                  </tr>
                </thead>
                <tbody>
                  {[...history].reverse().map((r) => (
                    <tr key={r.id} className="border-t border-ink/[0.05] text-ink">
                      <td className="py-1 pr-3 tabular-nums text-sage-500">{niceDate(r.reading_date)}</td>
                      <td className="py-1 pr-3">{r.bp?.trim() || "—"}</td>
                      <td className="py-1 pr-3">{r.grbs?.trim() || "—"}</td>
                      <td className="py-1 pr-3">{r.mood?.trim() || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Section>
  );
}

function VitalCard({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="rounded-xl bg-mist p-3">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-sage-500">{label}</span>
      <div className="mt-0.5 text-[17px] font-semibold tabular-nums text-ink">{value?.trim() || "—"}</div>
    </div>
  );
}

/* ---------------- Medicines + suggest a change ---------------- */

const FIELD =
  "w-full rounded-xl bg-white px-3 py-2 text-[13px] text-ink ring-1 ring-ink/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400";

function Medicines({ patientId, meds, myName }: { patientId: string; meds: MedicationRow[]; myName: string | null }) {
  const [open, setOpen] = useState(false);
  const [med, setMed] = useState("");
  const [change, setChange] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const submit = async () => {
    if (!med.trim() || !change.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await raiseApproval(patientId, {
        type: "duty_med",
        message: `${med.trim()} — ${change.trim()}${reason.trim() ? ` (${reason.trim()})` : ""}`,
        suggestion: change.trim(),
        urgency: "routine",
        from_name: myName ?? "Duty Doctor",
      });
      setSent(true);
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send the suggestion.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section
      title="Medicines"
      action={
        !sent && (
          <button type="button" onClick={() => setOpen((o) => !o)} className="tap rounded-full bg-brand-600 px-3 py-1.5 text-[12px] font-semibold text-white">
            Suggest a change
          </button>
        )
      }
    >
      {sent && (
        <p className="mb-3 rounded-2xl bg-good-100 px-3.5 py-2.5 text-[13px] font-medium text-good-600">
          ✓ Suggestion sent to the doctor for approval.
        </p>
      )}

      {open && !sent && (
        <div className="mb-3 space-y-2 rounded-2xl bg-mist p-3">
          <input value={med} onChange={(e) => setMed(e.target.value)} placeholder="Which medicine" className={FIELD} list="med-list" />
          <datalist id="med-list">
            {meds.map((m) => (
              <option key={m.id} value={m.name} />
            ))}
          </datalist>
          <input value={change} onChange={(e) => setChange(e.target.value)} placeholder="Suggested change (e.g. reduce to alternate days)" className={FIELD} />
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="Reason / clinical note" className={FIELD} />
          {error && <p className="text-[12px] text-coral-600">{error}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={submit} disabled={busy} className="tap rounded-full bg-brand-600 px-3.5 py-1.5 text-[12px] font-semibold text-white disabled:opacity-60">
              {busy ? "Sending…" : "Send to doctor"}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="tap rounded-full px-3 py-1.5 text-[12px] font-semibold text-sage-600">
              Cancel
            </button>
          </div>
        </div>
      )}

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
      <p className="mt-2 text-[12px] text-sage-500">Read-only — you suggest changes; the doctor approves them.</p>
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
