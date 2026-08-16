import { useEffect, useState } from "react";
import {
  Avatar, Button, Disclosure, EmptyState, Input, MetricCard, RecoveryTrajectory,
  SectionLabel, StatusTag, Textarea, type Tone,
} from "../../components/clinical";
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

/** Parse a numeric series (e.g. systolic BP) from readings for a trend. */
function series(readings: ReadingRow[], pick: (r: ReadingRow) => string | null): number[] {
  return readings
    .map((r) => Number((pick(r) ?? "").toString().replace(/[^0-9.].*$/, "").replace(/[^0-9.]/g, "")))
    .filter((n) => Number.isFinite(n) && n > 0);
}

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
  const bp = series(readings, (r) => r.bp);
  const bpTone: Tone =
    bp.length >= 2 ? (bp[bp.length - 1] < bp[0] ? "recovery" : bp[bp.length - 1] > bp[0] ? "attention" : "neutral") : "neutral";

  return (
    <div className="min-h-full bg-mist">
      {/* Midnight clinical hero — consistent with the nurse & doctor detail screens. */}
      <div className="bg-midnight-900">
        <div className="mx-auto max-w-[1100px] px-5 py-6 lg:px-8 lg:py-8">
          <button type="button" onClick={onBack} className="tap text-[13px] font-semibold text-haze-300 hover:text-haze-100">
            ← Patients
          </button>
          <div className="mt-4 flex flex-wrap items-start justify-between gap-6">
            <div className="flex min-w-0 items-center gap-4">
              <Avatar name={patient.full_name} tone="calm" size={52} />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h1 className="font-display text-[24px] font-semibold tracking-[-0.01em] text-haze-100">{patient.full_name}</h1>
                  <StatusTag tone="calm">Clinical review</StatusTag>
                </div>
                <p className="mt-1 text-[13px] text-haze-300">
                  {patient.age ?? "—"} {patient.sex ?? ""}
                  {patient.location ? ` · ${patient.location}` : ""} · Day {dayAtHome(patient)}
                </p>
                {patient.diagnosis.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {patient.diagnosis.map((dx) => (
                      <span key={dx} className="rounded-full bg-white/[0.06] px-2.5 py-1 text-[12px] font-medium text-haze-200 ring-1 ring-white/10">{dx}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {bp.length >= 2 && (
              <div className="w-full max-w-[280px] rounded-2xl bg-white/[0.06] p-4 ring-1 ring-white/10">
                <div className="flex items-center justify-between">
                  <SectionLabel onDark>Blood pressure</SectionLabel>
                  <span className={`text-[12px] font-semibold ${bpTone === "recovery" ? "text-brand-300" : bpTone === "attention" ? "text-warn-300" : "text-haze-300"}`}>
                    {bpTone === "recovery" ? "improving" : bpTone === "attention" ? "watch" : "steady"}
                  </span>
                </div>
                <div className="mt-2"><RecoveryTrajectory values={bp} tone={bpTone} height={40} onDark animate={false} /></div>
                {latest?.bp && <div className="mt-1 text-[13px] font-semibold text-haze-100 tabular-nums">{latest.bp} <span className="font-normal text-haze-400">latest</span></div>}
              </div>
            )}
          </div>
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
  if (!latest) {
    return (
      <Section title="Readings">
        <EmptyState title="No readings yet">The caregiver hasn&rsquo;t recorded readings for this patient yet.</EmptyState>
      </Section>
    );
  }
  const cards: { label: string; value: string | null; unit: string; s: number[] }[] = [
    { label: "BP", value: latest.bp, unit: "mmHg", s: series(history, (r) => r.bp) },
    { label: "Blood sugar", value: latest.grbs, unit: "mg/dL", s: series(history, (r) => r.grbs) },
    { label: "Urine", value: latest.urine_ml, unit: "mL", s: series(history, (r) => r.urine_ml) },
    { label: "Pulse", value: latest.pulse, unit: "bpm", s: series(history, (r) => r.pulse) },
  ].filter((c) => (c.value ?? "").toString().trim());

  return (
    <Section title="Readings">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cards.map((c) => (
          <MetricCard
            key={c.label}
            label={c.label}
            value={(c.value ?? "").toString().trim() || "—"}
            unit={c.unit}
            values={c.s.length >= 2 ? c.s : undefined}
            tone="calm"
          />
        ))}
      </div>
      {history.length > 1 && (
        <Disclosure className="mt-4" summary={<span className="text-[13px] font-semibold text-sky-700">View 7-day table</span>}>
          <div className="overflow-x-auto">
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
        </Disclosure>
      )}
    </Section>
  );
}

/* ---------------- Medicines + suggest a change ---------------- */

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
      action={!sent && <Button size="sm" onClick={() => setOpen((o) => !o)}>Suggest a change</Button>}
    >
      {sent && (
        <p className="mb-3 rounded-2xl bg-good-100 px-3.5 py-2.5 text-[13px] font-medium text-good-600">
          ✓ Suggestion sent to the doctor for approval.
        </p>
      )}

      {open && !sent && (
        <div className="mb-3 space-y-2.5 rounded-2xl bg-mist p-3.5 ring-1 ring-ink/[0.05]">
          <Input value={med} onChange={(e) => setMed(e.target.value)} placeholder="Which medicine" list="med-list" />
          <datalist id="med-list">
            {meds.map((m) => (
              <option key={m.id} value={m.name} />
            ))}
          </datalist>
          <Input value={change} onChange={(e) => setChange(e.target.value)} placeholder="Suggested change (e.g. reduce to alternate days)" />
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="Reason / clinical note" />
          {error && <p className="text-[12px] text-coral-600">{error}</p>}
          <div className="flex gap-2">
            <Button size="sm" busy={busy} onClick={submit}>{busy ? "Sending…" : "Send to doctor"}</Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
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
