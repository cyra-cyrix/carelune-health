import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import ConcernInbox from "../../components/ConcernInbox";
import {
  getPatient,
  getReadingHistory,
  getMedications,
  getApprovals,
  getDailyUpdates,
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
} from "../../lib/db";

/**
 * HOD (PMR) patient screen — the head clinician's live view of one patient.
 * Diagnostic summary, an approvals inbox (nurse/family queries + duty-doctor
 * medicine suggestions the HOD decides), the caregiver's real vitals trend,
 * and the medicine list the HOD owns. All reads/writes hit Supabase.
 */
export default function PatientProgress({ patientId, onBack }: { patientId: string; onBack: () => void }) {
  const [patient, setPatient] = useState<PatientRow | null>(null);
  const [readings, setReadings] = useState<ReadingRow[]>([]);
  const [meds, setMeds] = useState<MedicationRow[]>([]);
  const [approvals, setApprovals] = useState<ApprovalRow[]>([]);
  const [updates, setUpdates] = useState<UpdateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        setPatient(p);
        setReadings(r);
        setMeds(m);
        setApprovals(a);
        setUpdates(u);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Could not load this patient.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [patientId]);

  return (
    <div className="min-h-full bg-mist">
      <div className="border-b border-ink/10 bg-white">
        <div className="mx-auto max-w-[1100px] px-5 py-4 lg:px-8">
          <button type="button" onClick={onBack} className="tap text-[13px] font-semibold text-brand-700 hover:text-brand-600">
            ← My patients
          </button>
          {patient && (
            <>
              <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h1 className="font-display text-2xl font-semibold text-ink">{patient.full_name}</h1>
                  <p className="text-[13px] text-sage-500">
                    {patient.age ?? "—"} {patient.sex ?? ""}
                    {patient.location ? ` · ${patient.location}` : ""} · Day {dayAtHome(patient)}
                  </p>
                </div>
              </div>
              {patient.diagnosis.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {patient.diagnosis.map((dx) => (
                    <span key={dx} className="rounded-full bg-mist px-2.5 py-1 text-[12px] font-medium text-ink ring-1 ring-ink/[0.06]">
                      {dx}
                    </span>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <main className="mx-auto max-w-[1100px] space-y-5 px-5 py-6 lg:px-8">
        {loading && <div className="h-40 animate-pulse rounded-2xl bg-white/70" />}
        {!loading && error && (
          <div className="rounded-2xl bg-white p-5 shadow-lift ring-1 ring-ink/[0.05]">
            <p className="text-[14px] font-semibold text-ink">Couldn&rsquo;t load this patient</p>
            <p className="mt-1 text-[13px] text-sage-600">{error}</p>
          </div>
        )}
        {!loading && !error && patient && (
          <>
            <ConcernInbox patientId={patientId} />
            <ApprovalsInbox patientId={patientId} rows={approvals.filter((a) => a.type !== "patient_query")} />
            <VitalsTrend readings={readings} />
            <div className="grid gap-5 lg:grid-cols-[1.25fr_1fr]">
              <Medicines patientId={patientId} rows={meds} onChange={setMeds} />
              <DailyFeed rows={updates} />
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function dayAtHome(p: PatientRow): number {
  const start = new Date(p.journey_start).getTime();
  return Math.max(1, Math.floor((Date.now() - start) / 86_400_000) + 1);
}

/* ---------------- Card ---------------- */

function Card({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
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

/* ---------------- Approvals inbox ---------------- */

type LocalStatus = ApprovalRow["status"];
const A_META: Record<ApprovalRow["type"], { label: string; cls: string }> = {
  duty_med: { label: "Medicine suggestion", cls: "bg-brand-50 text-brand-700" },
  nurse_query: { label: "Nurse query", cls: "bg-good-100 text-good-600" },
  patient_query: { label: "Family query", cls: "bg-ink/10 text-ink" },
};

function timeAgo(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  return `${Math.round(hrs / 24)} d ago`;
}

function ApprovalsInbox({ patientId, rows }: { patientId: string; rows: ApprovalRow[] }) {
  const [items, setItems] = useState(rows);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const setStatus = (id: string, status: LocalStatus) =>
    setItems((xs) => xs.map((i) => (i.id === id ? { ...i, status } : i)));

  const decide = async (id: string, status: "approved" | "declined") => {
    setBusy(id);
    const prev = items;
    setStatus(id, status);
    try {
      await decideApproval(id, status);
    } catch {
      setItems(prev);
    } finally {
      setBusy(null);
    }
  };

  const sendSuggestion = async (it: ApprovalRow) => {
    setBusy(it.id);
    const prev = items;
    setStatus(it.id, "suggested");
    setNoteFor(null);
    const text = note.trim();
    setNote("");
    try {
      await decideApproval(it.id, "suggested");
      if (text) await addUpdate(patientId, { source: "pmr", author_name: "HOD", body: `Re: ${it.from_name ?? "query"} — ${text}` });
    } catch {
      setItems(prev);
    } finally {
      setBusy(null);
    }
  };

  const pending = items.filter((i) => i.status === "pending").length;
  // Urgent, still-pending items float to the top so the doctor sees them first.
  const rank = (i: ApprovalRow) =>
    i.status === "pending" ? (i.urgency === "urgent" ? 0 : 1) : 2;
  const ordered = [...items].sort((a, b) => rank(a) - rank(b));

  return (
    <Card
      title="Approvals inbox"
      action={
        <span
          className={`rounded-full px-2.5 py-1 text-[12px] font-semibold ${
            pending > 0 ? "bg-coral-100 text-coral-600" : "bg-good-100 text-good-600"
          }`}
        >
          {pending} pending
        </span>
      }
    >
      {items.length === 0 ? (
        <p className="text-[13px] text-sage-500">Nothing awaiting your decision.</p>
      ) : (
        <ul className="space-y-2.5">
          {ordered.map((it) => (
            <li
              key={it.id}
              className={`rounded-2xl p-3.5 ring-1 ${
                it.urgency === "urgent" && it.status === "pending" ? "bg-warn-100/50 ring-warn-500/20" : "bg-mist ring-ink/[0.05]"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide ${A_META[it.type].cls}`}>
                  {A_META[it.type].label}
                </span>
                {it.urgency === "urgent" && (
                  <span className="rounded-full bg-coral-100 px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-coral-600">
                    Urgent
                  </span>
                )}
                <span className="ml-auto text-[11px] text-sage-500">{timeAgo(it.created_at)}</span>
              </div>
              <p className="mt-1.5 text-[13px] font-semibold text-ink">{it.from_name}</p>
              <p className="mt-0.5 text-[13px] leading-snug text-sage-600">{it.message}</p>
              {it.suggestion && (
                <p className="mt-1.5 rounded-xl bg-white px-3 py-1.5 text-[13px] text-ink ring-1 ring-ink/[0.06]">
                  <span className="font-semibold text-brand-700">
                    {it.type === "patient_query" ? "Your reply: " : "Suggests: "}
                  </span>
                  {it.suggestion}
                </p>
              )}

              {it.status === "pending" ? (
                noteFor === it.id ? (
                  <div className="mt-2.5">
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      rows={2}
                      placeholder={it.type === "patient_query" ? "Your reply to the family…" : "Your suggestion back to the team…"}
                      className="w-full rounded-xl bg-white px-3 py-2 text-[13px] text-ink ring-1 ring-ink/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
                    />
                    <div className="mt-2 flex gap-2">
                      <button type="button" onClick={() => sendSuggestion(it)} disabled={busy === it.id || !note.trim()} className="tap rounded-full bg-brand-600 px-3.5 py-1.5 text-[12px] font-semibold text-white disabled:opacity-60">
                        {it.type === "patient_query" ? "Send reply" : "Send suggestion"}
                      </button>
                      <button type="button" onClick={() => { setNoteFor(null); setNote(""); }} className="tap rounded-full px-3 py-1.5 text-[12px] font-semibold text-sage-600">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {it.type === "patient_query" ? (
                      <>
                        <button type="button" onClick={() => setNoteFor(it.id)} className="tap rounded-full bg-brand-600 px-3.5 py-1.5 text-[12px] font-semibold text-white">
                          Reply
                        </button>
                        <button type="button" onClick={() => decide(it.id, "approved")} disabled={busy === it.id} className="tap rounded-full bg-white px-3.5 py-1.5 text-[12px] font-semibold text-sage-600 ring-1 ring-ink/10 disabled:opacity-60">
                          Mark reviewed
                        </button>
                      </>
                    ) : (
                      <>
                        <button type="button" onClick={() => decide(it.id, "approved")} disabled={busy === it.id} className="tap rounded-full bg-good-500 px-3.5 py-1.5 text-[12px] font-semibold text-white disabled:opacity-60">
                          Approve
                        </button>
                        <button type="button" onClick={() => setNoteFor(it.id)} className="tap rounded-full bg-brand-600 px-3.5 py-1.5 text-[12px] font-semibold text-white">
                          Suggest
                        </button>
                        <button type="button" onClick={() => decide(it.id, "declined")} disabled={busy === it.id} className="tap rounded-full bg-white px-3.5 py-1.5 text-[12px] font-semibold text-coral-600 ring-1 ring-coral-200 disabled:opacity-60">
                          Decline
                        </button>
                      </>
                    )}
                  </div>
                )
              ) : (
                <p className="mt-2 text-[12px] font-semibold text-sage-600">
                  {it.type === "patient_query"
                    ? it.status === "suggested"
                      ? "Replied · the family can see it"
                      : "Reviewed"
                    : `${it.status === "approved" ? "Approved" : it.status === "declined" ? "Declined" : "Suggestion sent"} · saved`}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ---------------- Vitals trend (from real caregiver readings) ---------------- */

function num(v: string | null): number {
  const n = Number((v ?? "").toString().replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : NaN;
}

function VitalsTrend({ readings }: { readings: ReadingRow[] }) {
  const bpSys = readings.map((r) => num((r.bp ?? "").split("/")[0])).filter(Number.isFinite);
  const bpDia = readings.map((r) => num((r.bp ?? "").split("/")[1])).filter(Number.isFinite);
  const grbs = readings.map((r) => num(r.grbs)).filter(Number.isFinite);
  const urine = readings.map((r) => num(r.urine_ml)).filter(Number.isFinite);
  const last = (a: number[]) => a[a.length - 1];

  const cards: ReactNode[] = [];
  if (bpSys.length >= 2 && bpDia.length >= 2)
    cards.push(<VitalCard key="bp" label="BP" values={bpSys} display={`${last(bpSys)}/${last(bpDia)}`} good="down" />);
  if (grbs.length >= 2) cards.push(<VitalCard key="grbs" label="GRBS" values={grbs} display={`${last(grbs)}`} good="down" />);
  if (urine.length >= 2) cards.push(<VitalCard key="urine" label="Urine (mL)" values={urine} display={`${last(urine)}`} good="up" />);

  return (
    <Card title={`Vitals — last ${readings.length || 0} day${readings.length === 1 ? "" : "s"}`}>
      {cards.length === 0 ? (
        <p className="text-[13px] text-sage-500">No readings recorded yet. They appear here as the caregiver logs them.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{cards}</div>
          <p className="mt-3 text-[12px] text-sage-500">
            Recorded daily at home by the caregiver — the trend over {readings.length} day
            {readings.length === 1 ? "" : "s"}, not a single reading.
          </p>
        </>
      )}
    </Card>
  );
}

function VitalCard({ label, values, display, good }: { label: string; values: number[]; display: string; good: "up" | "down" }) {
  const improving = good === "down" ? values[values.length - 1] < values[0] : values[values.length - 1] > values[0];
  return (
    <div className="rounded-xl bg-mist p-3">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-sage-500">{label}</span>
        <span className={`text-[11px] font-bold ${improving ? "text-good-600" : "text-coral-500"}`}>
          {improving ? "improving" : "watch"}
        </span>
      </div>
      <div className="mt-0.5 text-[17px] font-semibold tabular-nums text-ink">{display}</div>
      <div className="text-[11px] tabular-nums text-sage-500">
        7d: {values[0]} → {values[values.length - 1]}
      </div>
      <div className="mt-1.5">
        <Spark values={values} improving={improving} />
      </div>
    </div>
  );
}

function Spark({ values, improving }: { values: number[]; improving: boolean }) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = (max - min) * 0.5 || 1;
  const lo = min - pad;
  const range = max + pad - lo;
  const W = 120;
  const H = 34;
  const n = values.length;
  const px = (i: number) => (i / (n - 1)) * (W - 4) + 2;
  const py = (v: number) => H - 2 - ((v - lo) / range) * (H - 4);
  const line = values.map((v, i) => `${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" className={improving ? "text-good-500" : "text-coral-400"} aria-hidden>
      <polyline points={`2,${H - 2} ${line} ${W - 2},${H - 2}`} fill="currentColor" opacity="0.08" stroke="none" />
      <polyline points={line} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      {values.map((v, i) => (
        <circle key={i} cx={px(i)} cy={py(v)} r={i === n - 1 ? 2.4 : 1.5} fill="currentColor" />
      ))}
    </svg>
  );
}

/* ---------------- Medicines (add / edit / remove — persisted) ---------------- */

const FIELD =
  "rounded-xl bg-white px-3 py-1.5 text-[13px] text-ink ring-1 ring-ink/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400";

const emptyDraft: MedicationInput = { name: "", dose: "", freq: "", timing: "After food" };

function Medicines({ patientId, rows, onChange }: { patientId: string; rows: MedicationRow[]; onChange: (m: MedicationRow[]) => void }) {
  const [editId, setEditId] = useState<string | null>(null); // "new" = adding
  const [draft, setDraft] = useState<MedicationInput>(emptyDraft);
  const [busy, setBusy] = useState(false);

  const startAdd = () => {
    setDraft(emptyDraft);
    setEditId("new");
  };
  const startEdit = (m: MedicationRow) => {
    setDraft({ name: m.name, dose: m.dose ?? "", freq: m.freq ?? "", timing: m.timing ?? "", note: m.note ?? "" });
    setEditId(m.id);
  };

  const save = async () => {
    if (!draft.name.trim()) return;
    setBusy(true);
    try {
      if (editId === "new") {
        const created = await addMedication(patientId, draft);
        onChange([...rows, created]);
      } else if (editId) {
        await updateMedication(editId, draft);
        onChange(rows.map((m) => (m.id === editId ? { ...m, ...draft } : m)));
      }
      setEditId(null);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    const prev = rows;
    onChange(rows.filter((m) => m.id !== id));
    try {
      await removeMedication(id);
    } catch {
      onChange(prev);
    }
  };

  return (
    <Card
      title="Medicines"
      action={
        <button type="button" onClick={startAdd} className="tap rounded-full bg-brand-600 px-3 py-1.5 text-[12px] font-semibold text-white">
          + Add
        </button>
      }
    >
      {editId !== null && (
        <div className="mb-3 rounded-2xl bg-mist p-3">
          <div className="grid grid-cols-2 gap-2">
            <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Medicine name" className={FIELD} />
            <input value={draft.dose} onChange={(e) => setDraft({ ...draft, dose: e.target.value })} placeholder="Dose (e.g. 5 mg)" className={FIELD} />
            <input value={draft.freq} onChange={(e) => setDraft({ ...draft, freq: e.target.value })} placeholder="Frequency (1-0-1)" className={FIELD} />
            <input value={draft.timing} onChange={(e) => setDraft({ ...draft, timing: e.target.value })} placeholder="Timing" className={FIELD} />
          </div>
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={save} disabled={busy} className="tap rounded-full bg-good-500 px-3.5 py-1.5 text-[12px] font-semibold text-white disabled:opacity-60">
              {editId === "new" ? "Add medicine" : "Save"}
            </button>
            <button type="button" onClick={() => setEditId(null)} className="tap rounded-full px-3 py-1.5 text-[12px] font-semibold text-sage-600">
              Cancel
            </button>
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="text-[13px] text-sage-500">No medicines recorded.</p>
      ) : (
        <ul className="divide-y divide-ink/[0.05]">
          {rows.map((m) => (
            <li key={m.id} className="flex items-center gap-2 py-2">
              <span className="min-w-0 flex-1 text-[13px] text-ink">
                <span className="font-semibold">{m.name}</span> <span className="text-sage-500">{m.dose}</span>
                <span className="block text-[11px] text-sage-400">
                  {m.timing}
                  {m.note ? ` · ${m.note}` : ""}
                </span>
              </span>
              <span className="shrink-0 rounded bg-mist px-1.5 py-0.5 text-[12px] font-semibold tabular-nums text-ink">{m.freq}</span>
              <button type="button" onClick={() => startEdit(m)} className="tap shrink-0 text-[12px] font-semibold text-brand-700">
                Edit
              </button>
              <button type="button" onClick={() => remove(m.id)} aria-label={`Remove ${m.name}`} className="tap shrink-0 px-1 text-[16px] leading-none text-sage-400 hover:text-coral-500">
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[12px] text-sage-500">
        You own medicine changes. Duty-doctor suggestions arrive in the approvals inbox above.
      </p>
    </Card>
  );
}

/* ---------------- Aggregated daily feed ---------------- */

const SRC: Record<UpdateRow["source"], { label: string; cls: string }> = {
  caregiver: { label: "Caregiver", cls: "bg-brand-50 text-brand-700" },
  nurse: { label: "Nursing Coordinator", cls: "bg-good-100 text-good-600" },
  duty_doctor: { label: "Duty Doctor", cls: "bg-ink/10 text-ink" },
  pmr: { label: "HOD", cls: "bg-brand-600 text-white" },
};

function clockTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

function DailyFeed({ rows }: { rows: UpdateRow[] }) {
  return (
    <Card title="Recent — from the care team">
      {rows.length === 0 ? (
        <p className="text-[13px] text-sage-500">No updates yet today.</p>
      ) : (
        <ol className="space-y-3">
          {rows.map((u) => (
            <li key={u.id} className="flex gap-3">
              <div className="w-11 shrink-0 pt-0.5 text-[12px] font-medium tabular-nums text-sage-500">{clockTime(u.created_at)}</div>
              <div className={`min-w-0 flex-1 rounded-xl px-3 py-2 ${u.flag === "watch" ? "bg-warn-100/60 ring-1 ring-warn-500/20" : "bg-mist"}`}>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide ${SRC[u.source].cls}`}>
                    {SRC[u.source].label}
                  </span>
                  {u.author_name && <span className="text-[12px] font-medium text-sage-500">{u.author_name}</span>}
                </div>
                <p className="mt-1 text-[13px] leading-snug text-ink">{u.body}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
