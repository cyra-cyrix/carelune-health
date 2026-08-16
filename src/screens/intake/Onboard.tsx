import { useEffect, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { Icon, LoopMark } from "../../components/ui";
import {
  getPatient,
  structureDischarge,
  activatePlan,
  type PatientRow,
  type StructuredPlan,
  type PlanTask,
  type PlanMed,
  type PlanTarget,
  type PlanPatch,
} from "../../lib/db";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

type Step = "details" | "structuring" | "review" | "saving" | "done";

const FIELD =
  "w-full rounded-xl bg-white px-3 py-2 text-[14px] text-ink ring-1 ring-line focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500";
const FIELD_MIST =
  "w-full rounded-xl bg-mist px-3 py-2 text-[14px] text-ink ring-1 ring-ink/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500";

/** Extract selectable text from a PDF in the browser (digital PDFs). */
async function extractPdfText(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  let text = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((it) => (it as { str?: string }).str ?? "").join(" ") + "\n";
  }
  return text.trim();
}

/**
 * Plan builder for a PENDING patient (registered via the org link). The doctor
 * opens the patient, uploads or types the discharge summary → OpenAI structures
 * it → the doctor edits and approves → the plan is written and the patient is
 * activated. AI never invents; nothing is saved until "Approve & activate".
 */
export default function Onboard({ patientId, onExit }: { patientId: string; onExit: () => void }) {
  const [step, setStep] = useState<Step>("details");
  const [patient, setPatient] = useState<PatientRow | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const [patch, setPatch] = useState<PlanPatch>({});
  const [dischargeText, setDischargeText] = useState("");
  const [plan, setPlan] = useState<StructuredPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const p = await getPatient(patientId);
        if (!active) return;
        setPatient(p);
        if (p) {
          setPatch({
            age: p.age != null ? String(p.age) : "",
            sex: (p.sex ?? "") as PlanPatch["sex"],
            location: p.location ?? "",
            discharged_on: p.discharged_on ?? "",
          });
        }
      } catch (e) {
        if (active) setLoadErr(e instanceof Error ? e.message : "Could not load the patient.");
      }
    })();
    return () => {
      active = false;
    };
  }, [patientId]);

  const runStructuring = async () => {
    setError(null);
    setStep("structuring");
    try {
      const result = await structureDischarge({
        patient_name: patient?.full_name ?? "",
        discharge_text: dischargeText,
      });
      setPlan(result);
      setStep("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not structure the summary.");
      setStep("details");
    }
  };

  const activate = async () => {
    if (!plan) return;
    setError(null);
    setStep("saving");
    try {
      const res = await activatePlan({ patientId, plan, patch });
      setWarnings(res.warnings);
      setStep("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the plan.");
      setStep("review");
    }
  };

  if (loadErr) {
    return (
      <div className="min-h-full bg-mist p-6">
        <p className="text-[14px] text-coral-600">{loadErr}</p>
        <button type="button" onClick={onExit} className="tap mt-3 text-[13px] font-semibold text-brand-700">← Back</button>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-mist">
      <div className="mx-auto max-w-[920px] px-5 py-7 lg:px-8">
        {step === "details" && (
          <DetailsStep
            patient={patient}
            patch={patch}
            setPatch={setPatch}
            dischargeText={dischargeText}
            setDischargeText={setDischargeText}
            error={error}
            onNext={runStructuring}
            onExit={onExit}
          />
        )}

        {step === "structuring" && <StructuringStep name={patient?.full_name ?? ""} />}

        {(step === "review" || step === "saving") && plan && (
          <ReviewStep
            name={patient?.full_name ?? "Patient"}
            plan={plan}
            setPlan={setPlan}
            saving={step === "saving"}
            error={error}
            onApprove={activate}
            onBack={() => setStep("details")}
          />
        )}

        {step === "done" && <DoneStep name={patient?.full_name ?? ""} warnings={warnings} onExit={onExit} />}
      </div>
    </div>
  );
}

/* ---------------- Step 1 · confirm details + discharge summary ---------------- */

function DetailsStep({
  patient,
  patch,
  setPatch,
  dischargeText,
  setDischargeText,
  error,
  onNext,
  onExit,
}: {
  patient: PatientRow | null;
  patch: PlanPatch;
  setPatch: (p: PlanPatch) => void;
  dischargeText: string;
  setDischargeText: (v: string) => void;
  error: string | null;
  onNext: () => void;
  onExit: () => void;
}) {
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfName, setPdfName] = useState<string | null>(null);
  const [pdfNote, setPdfNote] = useState<string | null>(null);
  const canNext = !!patient && dischargeText.trim().length >= 20;

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setPdfName(file.name);
    setPdfNote(null);
    setPdfBusy(true);
    try {
      const text = await extractPdfText(file);
      if (text.length < 20) {
        setPdfNote("This looks like a scanned PDF with no selectable text — please type the summary below.");
      } else {
        setDischargeText(text);
        setPdfNote(`Read ${text.length.toLocaleString()} characters from the PDF. Review below.`);
      }
    } catch {
      setPdfNote("Couldn't read that PDF — please type or paste the summary below.");
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <>
      <button type="button" onClick={onExit} className="tap text-[13px] font-semibold text-brand-700 hover:text-brand-600">
        ← Back to caseload
      </button>
      <h1 className="mt-2 font-display text-2xl font-semibold text-ink">
        Add plan · {patient?.full_name ?? "…"}
      </h1>
      <p className="mt-1 max-w-xl text-[14px] leading-relaxed text-sage-600">
        Upload or type the discharge summary. AI restructures it into a plan you review and approve — it
        never invents treatment. Nothing is saved until you approve.
      </p>

      <div className="mt-6 rounded-2xl bg-white p-6 shadow-lift ring-1 ring-ink/[0.05]">
        <h2 className="text-[13px] font-semibold text-ink">Patient details</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-[12px] font-semibold text-sage-600">Age</span>
            <input
              value={patch.age ?? ""}
              onChange={(e) => setPatch({ ...patch, age: e.target.value.replace(/\D/g, "") })}
              inputMode="numeric"
              className={FIELD_MIST}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[12px] font-semibold text-sage-600">Sex</span>
            <select value={patch.sex ?? ""} onChange={(e) => setPatch({ ...patch, sex: e.target.value as PlanPatch["sex"] })} className={FIELD_MIST}>
              <option value="">—</option>
              <option value="M">Male</option>
              <option value="F">Female</option>
              <option value="O">Other</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[12px] font-semibold text-sage-600">Discharged on</span>
            <input type="date" value={patch.discharged_on ?? ""} onChange={(e) => setPatch({ ...patch, discharged_on: e.target.value })} className={FIELD_MIST} />
          </label>
          <label className="block sm:col-span-3">
            <span className="mb-1 block text-[12px] font-semibold text-sage-600">Location</span>
            <input value={patch.location ?? ""} onChange={(e) => setPatch({ ...patch, location: e.target.value })} className={FIELD_MIST} />
          </label>
        </div>

        <h2 className="mt-6 text-[13px] font-semibold text-ink">Discharge summary</h2>
        <label className="mt-2 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-brand-300 bg-brand-50/50 px-6 py-6 text-center transition-colors hover:bg-brand-50">
          <span className="text-[14px] font-semibold text-ink">{pdfBusy ? "Reading PDF…" : pdfName ?? "Upload a PDF"}</span>
          <span className="mt-0.5 text-[12px] text-sage-500">Digital PDFs are read automatically. Scanned PDFs: type below.</span>
          <input type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
        {pdfNote && <p className="mt-2 text-[12px] text-sage-600">{pdfNote}</p>}

        <textarea
          value={dischargeText}
          onChange={(e) => setDischargeText(e.target.value)}
          rows={8}
          placeholder="…or paste / type the discharge summary text here."
          className={`${FIELD_MIST} mt-3 resize-y font-mono text-[13px] leading-relaxed`}
        />
        <p className="mt-1 text-[12px] text-sage-500">
          The text is sent to OpenAI to structure the plan. The family consented at registration.
        </p>

        {error && <p className="mt-3 text-[13px] text-coral-600">{error}</p>}

        <div className="mt-5 flex items-center gap-3">
          <button
            type="button"
            onClick={onNext}
            disabled={!canNext}
            className="tap inline-flex items-center gap-2 rounded-full bg-brand-800 px-5 py-2.5 text-[15px] font-semibold text-white shadow-lift hover:bg-brand-900 disabled:opacity-50"
          >
            Structure with AI <Icon.ChevronRight width={17} height={17} />
          </button>
          {!canNext && <span className="text-[12px] text-sage-500">Add the discharge summary to continue.</span>}
        </div>
      </div>
    </>
  );
}

/* ---------------- Step 2 · structuring ---------------- */

function StructuringStep({ name }: { name: string }) {
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <div className="text-center">
        <span className="inline-block animate-spin text-brand-600">
          <LoopMark size={44} />
        </span>
        <h2 className="mt-5 font-display text-xl font-semibold text-ink">Reading the discharge summary…</h2>
        <p className="mt-1 text-[14px] text-sage-600">
          Structuring a daily plan{name.trim() ? ` for ${name.trim().split(" ")[0]}` : ""} — tasks, medicines and targets.
        </p>
      </div>
    </div>
  );
}

/* ---------------- Step 3 · review, edit & approve ---------------- */

function ReviewStep({
  name,
  plan,
  setPlan,
  saving,
  error,
  onApprove,
  onBack,
}: {
  name: string;
  plan: StructuredPlan;
  setPlan: (p: StructuredPlan) => void;
  saving: boolean;
  error: string | null;
  onApprove: () => void;
  onBack: () => void;
}) {
  const setTask = (i: number, patch: Partial<PlanTask>) =>
    setPlan({ ...plan, tasks: plan.tasks.map((t, j) => (j === i ? { ...t, ...patch } : t)) });
  const removeTask = (i: number) => setPlan({ ...plan, tasks: plan.tasks.filter((_, j) => j !== i) });
  const addTask = () =>
    setPlan({ ...plan, tasks: [...plan.tasks, { time_label: "08:00", discipline: "General care", title: "", detail: "" }] });

  const setMed = (i: number, patch: Partial<PlanMed>) =>
    setPlan({ ...plan, medications: plan.medications.map((m, j) => (j === i ? { ...m, ...patch } : m)) });
  const removeMed = (i: number) => setPlan({ ...plan, medications: plan.medications.filter((_, j) => j !== i) });
  const addMed = () =>
    setPlan({ ...plan, medications: [...plan.medications, { name: "", dose: "", freq: "", timing: "", note: "" }] });

  const setTarget = (i: number, patch: Partial<PlanTarget>) =>
    setPlan({ ...plan, targets: plan.targets.map((t, j) => (j === i ? { ...t, ...patch } : t)) });
  const removeTarget = (i: number) => setPlan({ ...plan, targets: plan.targets.filter((_, j) => j !== i) });
  const addTarget = () => setPlan({ ...plan, targets: [...plan.targets, { goal: "", window: "" }] });

  return (
    <>
      <button type="button" onClick={onBack} className="tap text-[13px] font-semibold text-brand-700 hover:text-brand-600">
        ← Back
      </button>
      <h1 className="mt-2 font-display text-2xl font-semibold text-ink">Review the plan</h1>
      <p className="mt-1 text-[14px] text-sage-600">{name} · structured from the discharge summary.</p>

      <div className="mt-4 rounded-2xl bg-warn-100/70 p-4 ring-1 ring-warn-500/20">
        <p className="text-[13px] leading-relaxed text-ink">
          <span className="font-semibold">AI draft — you decide.</span> The AI only reorganised the
          discharge summary; it did not invent treatment. Edit anything below, then approve as the doctor.
        </p>
      </div>

      {plan.summary && (
        <p className="mt-4 rounded-xl bg-white px-4 py-3 text-[13px] italic text-sage-700 ring-1 ring-ink/[0.05]">
          {plan.summary}
        </p>
      )}

      {/* Diagnosis */}
      <SectionTitle>Diagnosis</SectionTitle>
      <input
        value={plan.diagnosis.join(", ")}
        onChange={(e) => setPlan({ ...plan, diagnosis: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
        placeholder="Comma-separated, e.g. Right total knee replacement"
        className={`${FIELD} mt-2`}
      />

      {/* Daily plan */}
      <SectionTitle action={<AddBtn onClick={addTask}>+ Add task</AddBtn>}>Daily plan · the caregiver follows this</SectionTitle>
      <div className="mt-2 space-y-2">
        {plan.tasks.map((t, i) => (
          <div key={i} className="rounded-2xl bg-white p-3 shadow-lift ring-1 ring-ink/[0.05]">
            <div className="flex flex-wrap items-center gap-2">
              <input value={t.time_label} onChange={(e) => setTask(i, { time_label: e.target.value })} className={`${FIELD} w-[74px] shrink-0`} placeholder="07:00" />
              <input value={t.discipline} onChange={(e) => setTask(i, { discipline: e.target.value })} className={`${FIELD} w-[150px] shrink-0`} placeholder="Discipline" />
              <input value={t.title} onChange={(e) => setTask(i, { title: e.target.value })} className={`${FIELD} min-w-[180px] flex-1`} placeholder="Task" />
              <RemoveBtn onClick={() => removeTask(i)} label="Remove task" />
            </div>
            <input value={t.detail} onChange={(e) => setTask(i, { detail: e.target.value })} className={`${FIELD} mt-2`} placeholder="Detail / precautions (optional)" />
          </div>
        ))}
        {plan.tasks.length === 0 && <p className="text-[13px] text-sage-500">No tasks yet — add one.</p>}
      </div>

      {/* Medicines */}
      <SectionTitle action={<AddBtn onClick={addMed}>+ Add medicine</AddBtn>}>Medicines</SectionTitle>
      <div className="mt-2 space-y-2">
        {plan.medications.map((m, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2 rounded-2xl bg-white p-3 shadow-lift ring-1 ring-ink/[0.05]">
            <input value={m.name} onChange={(e) => setMed(i, { name: e.target.value })} className={`${FIELD} min-w-[150px] flex-1`} placeholder="Name" />
            <input value={m.dose} onChange={(e) => setMed(i, { dose: e.target.value })} className={`${FIELD} w-[90px] shrink-0`} placeholder="Dose" />
            <input value={m.freq} onChange={(e) => setMed(i, { freq: e.target.value })} className={`${FIELD} w-[80px] shrink-0`} placeholder="1-0-1" />
            <input value={m.timing} onChange={(e) => setMed(i, { timing: e.target.value })} className={`${FIELD} w-[120px] shrink-0`} placeholder="After food" />
            <RemoveBtn onClick={() => removeMed(i)} label="Remove medicine" />
          </div>
        ))}
        {plan.medications.length === 0 && <p className="text-[13px] text-sage-500">No medicines listed.</p>}
      </div>

      {/* Targets */}
      <SectionTitle action={<AddBtn onClick={addTarget}>+ Add target</AddBtn>}>Recovery targets</SectionTitle>
      <div className="mt-2 space-y-2">
        {plan.targets.map((t, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2 rounded-xl bg-white p-2.5 ring-1 ring-ink/[0.05]">
            <input value={t.goal} onChange={(e) => setTarget(i, { goal: e.target.value })} className={`${FIELD} min-w-[180px] flex-1`} placeholder="Goal" />
            <input value={t.window} onChange={(e) => setTarget(i, { window: e.target.value })} className={`${FIELD} w-[140px] shrink-0`} placeholder="By week 4" />
            <RemoveBtn onClick={() => removeTarget(i)} label="Remove target" />
          </div>
        ))}
        {plan.targets.length === 0 && <p className="text-[13px] text-sage-500">No targets listed.</p>}
      </div>

      {error && <p className="mt-4 text-[13px] text-coral-600">{error}</p>}

      <div className="sticky bottom-3 mt-7 flex items-center gap-3 rounded-2xl bg-white/90 p-3 shadow-lift ring-1 ring-ink/[0.06] backdrop-blur">
        <button
          type="button"
          onClick={onApprove}
          disabled={saving || plan.tasks.length === 0}
          className="tap inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-brand-800 px-5 py-3 text-[15px] font-semibold text-white hover:bg-brand-900 disabled:opacity-60"
        >
          {saving ? "Saving…" : (<><Icon.Check width={17} height={17} /> Approve &amp; activate plan</>)}
        </button>
        <button type="button" onClick={onBack} disabled={saving} className="tap rounded-full px-4 py-3 text-[14px] font-semibold text-sage-600 hover:text-ink disabled:opacity-60">
          Back
        </button>
      </div>
    </>
  );
}

function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mt-6 flex items-center justify-between">
      <h2 className="font-display text-[16px] font-semibold text-ink">{children}</h2>
      {action}
    </div>
  );
}

function AddBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="text-[12px] font-semibold text-brand-700 hover:text-brand-600">
      {children}
    </button>
  );
}

function RemoveBtn({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} className="tap shrink-0 rounded-lg px-2 py-1.5 text-sage-500 hover:bg-mist hover:text-coral-600" aria-label={label}>
      <Icon.Trash width={15} height={15} />
    </button>
  );
}

/* ---------------- Step 4 · done ---------------- */

function DoneStep({ name, warnings, onExit }: { name: string; warnings: string[]; onExit: () => void }) {
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <div className="max-w-md text-center">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-good-500 text-white">
          <Icon.Check width={30} height={30} />
        </span>
        <h2 className="mt-5 font-display text-2xl font-semibold text-ink">Plan approved &amp; active</h2>
        <p className="mt-2 text-[14px] leading-relaxed text-sage-600">
          {name.trim() || "The patient"}&rsquo;s plan is live. The caregiver now follows the daily tasks,
          the team monitors, and the family sees the overview.
        </p>

        {warnings.length > 0 && (
          <div className="mt-4 rounded-2xl bg-warn-100/70 p-3.5 text-left ring-1 ring-warn-500/20">
            <p className="text-[12px] font-semibold text-ink">Saved, with notes:</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[12px] text-sage-700">
              {warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        <button
          type="button"
          onClick={onExit}
          className="tap mt-6 rounded-full bg-brand-800 px-6 py-2.5 text-[15px] font-semibold text-white hover:bg-brand-900"
        >
          Back to caseload
        </button>
      </div>
    </div>
  );
}
