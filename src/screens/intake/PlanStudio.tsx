import { useEffect, useRef, useState } from "react";
import {
  getPatient, getPackPathways, approvePathwayVersion, assignGoverningVersion,
  extractFacts, getDocumentFacts, saveDocumentFacts, getPatientDocuments,
  getPlanIntake, savePlanIntake, generatePlan, getPatientPlan, savePlan, activateCarePlan,
  type PatientRow, type PackPathway, type PlanIntake, type PatientPlanRow,
  type DocumentFacts, type DocumentRow, type FactItem, type FactMedicine,
} from "../../lib/db";
import type { PlanDraft, PlanFact, PlanMedicine, PlanTask } from "../../lib/pathwayValidation";
import {
  Field, inputCls, PrimaryButton, GhostButton, PathwayStatusBadge, ErrorNote, Skeleton,
} from "../../components/system";
import {
  Panel, SectionLabel, StatusTag, JourneySteps, ProvenanceTag, Reveal, type JourneyState,
} from "../../components/clinical";

/**
 * AI Plan Studio — the doctor-led journey after patient setup, presented as a
 * two-pane workspace: SOURCES on the left (approved pathway · governing discharge
 * document · extracted facts · three instructions), the GENERATED PLAN & evidence
 * on the right. The model reads the selected document, structures facts, applies
 * the approved pathway and flags gaps — the doctor edits, approves and activates.
 * Provenance is visible but quiet. Nothing here becomes active care until the
 * doctor approves AND activates.
 */
export default function PlanStudio({ patientId, onExit }: { patientId: string; onExit: () => void }) {
  const [patient, setPatient] = useState<PatientRow | null>(null);
  const [plan, setPlan] = useState<PatientPlanRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const [p, pl] = await Promise.all([getPatient(patientId), getPatientPlan(patientId)]);
      setPatient(p); setPlan(pl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the patient.");
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [patientId]);

  const refreshPatient = async () => setPatient(await getPatient(patientId));

  if (loading) return <div className="min-h-full bg-mist p-6"><Skeleton className="h-64" /></div>;

  const activated = !!plan?.activated_at;
  const statusTone = activated ? "recovery" : plan?.status === "approved" ? "calm" : "attention";
  const statusLabel = activated ? `Active · v${plan?.version}` : plan?.status === "approved" ? `Approved · v${plan?.version}` : plan ? `Draft · v${plan?.version}` : "Not started";

  return (
    <div className="min-h-full bg-mist">
      {/* hero */}
      <div className="bg-midnight-900">
        <div className="relative mx-auto max-w-[1180px] overflow-hidden px-5 py-6 lg:px-8">
          <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(70% 120% at 100% 0%, rgba(23,179,161,0.18), transparent 60%)" }} />
          <div className="relative">
            <button type="button" onClick={onExit} className="tap text-[13px] font-semibold text-haze-300 hover:text-haze-100">← Back to caseload</button>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0">
                <SectionLabel onDark>AI Plan Studio</SectionLabel>
                <h1 className="mt-1.5 font-display text-[24px] font-semibold tracking-[-0.02em] text-haze-100">
                  Recovery plan · {patient?.full_name ?? "…"}
                </h1>
                <p className="mt-1 max-w-2xl text-[13.5px] text-haze-300">
                  Based on the discharge summary and your approved pathway. You edit and approve everything —
                  nothing is invented, nothing goes live until you activate it.
                </p>
              </div>
              <StatusTag tone={statusTone}>{statusLabel}</StatusTag>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1180px] px-5 py-6 lg:px-8">
        {error && <div className="mb-4"><ErrorNote>{error}</ErrorNote></div>}
        {plan ? (
          <PlanReview plan={plan} onExit={onExit} onRegeneratePrompt={() => setPlan(null)} onSaved={(pl) => setPlan(pl)} />
        ) : (
          <PreparePanel patient={patient} onPatientChanged={refreshPatient} onGenerated={(pl) => setPlan(pl)} />
        )}
      </div>
    </div>
  );
}

/* =============================== PREPARE ================================== */

function PreparePanel({
  patient, onPatientChanged, onGenerated,
}: {
  patient: PatientRow | null;
  onPatientChanged: () => Promise<void> | void;
  onGenerated: (p: PatientPlanRow) => void;
}) {
  const [pathways, setPathways] = useState<PackPathway[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [docs, setDocs] = useState<DocumentRow[]>([]);
  const [selectedDoc, setSelectedDoc] = useState("");
  const [mode, setMode] = useState<"document" | "paste">("document");
  const [dischargeText, setDischargeText] = useState("");
  const [facts, setFacts] = useState<DocumentFacts | null>(null);

  const [intake, setIntake] = useState<PlanIntake>({ milestone_goal: "", milestone_by: "", monitor_focus: "", non_negotiables: "" });

  // guided-journey animation state
  const [genStep, setGenStep] = useState(-1);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!patient?.pathway_pack_id) { setPathways([]); return; }
    void getPackPathways(patient.pathway_pack_id).then(setPathways).catch(() => setPathways([]));
    void getPatientDocuments(patient.id).then((d) => { setDocs(d); const disc = d.find((x) => x.doc_type === "discharge_summary"); if (disc) setSelectedDoc(disc.id); });
    void getDocumentFacts(patient.id).then((f) => { if (f) setFacts(f.facts); });
    void getPlanIntake(patient.id).then((i) => { if (i) setIntake(i); });
  }, [patient?.id, patient?.pathway_pack_id]);

  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  if (!patient?.pathway_pack_id) {
    return <Panel title="Assign a pathway first"><p className="text-[13.5px] text-sage-600">Assign a clinical pathway in patient setup, then return here to build the plan.</p></Panel>;
  }

  const governing = patient.pathway_version_id;
  const governingPathway = pathways?.find((p) => p.version_id === governing) ?? null;

  const approve = async (p: PackPathway) => {
    if (!p.version_id) return;
    setBusy(`approve:${p.pathway_id}`); setErr(null);
    try {
      await approvePathwayVersion(p.version_id);
      if (patient.pathway_pack_id) setPathways(await getPackPathways(patient.pathway_pack_id));
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not approve."); }
    finally { setBusy(null); }
  };
  const useVersion = async (p: PackPathway) => {
    if (!p.version_id) return;
    setBusy(`use:${p.pathway_id}`); setErr(null);
    try { await assignGoverningVersion(patient.id, p.version_id); await onPatientChanged(); }
    catch (e) { setErr(e instanceof Error ? e.message : "Could not set the governing version."); }
    finally { setBusy(null); }
  };

  const extract = async () => {
    setBusy("facts"); setErr(null);
    try {
      const f = mode === "document"
        ? await extractFacts(patient.id, { documentId: selectedDoc })
        : await extractFacts(patient.id, { dischargeText });
      setFacts(f);
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not extract facts."); }
    finally { setBusy(null); }
  };

  const questionsFilled = !!(intake.milestone_goal.trim() && intake.monitor_focus.trim() && intake.non_negotiables.trim());
  const factCount = facts ? (facts.diagnoses.length + facts.medicines.length + facts.precautions.length + facts.diet.length + (facts.procedure ? 1 : 0)) : 0;
  const canGenerate = !!governing && !!facts && questionsFilled && !busy;

  const generate = async () => {
    setBusy("generate"); setErr(null); setGenStep(0);
    // advance the visible journey while the model works
    timer.current = setInterval(() => setGenStep((s) => (s < 3 ? s + 1 : s)), 650);
    try {
      if (facts) await saveDocumentFacts(patient.id, facts);
      await savePlanIntake(patient.id, intake);
      await generatePlan(patient.id);
      const pl = await getPatientPlan(patient.id);
      if (timer.current) clearInterval(timer.current);
      setGenStep(4);
      if (pl) { await new Promise((r) => setTimeout(r, 320)); onGenerated(pl); }
    } catch (e) {
      if (timer.current) clearInterval(timer.current);
      setGenStep(-1);
      setErr(e instanceof Error ? e.message : "Could not generate the plan.");
    } finally { setBusy(null); }
  };

  const generating = busy === "generate";

  // journey states for the right pane
  const journey: { label: string; caption?: string; state: JourneyState }[] = [
    { label: "Reading the discharge document", caption: mode === "document" ? (docs.find((d) => d.id === selectedDoc)?.file_name ?? "Selected document") : "Pasted text", state: genStep > 0 ? "done" : generating ? "active" : facts ? "done" : "idle" },
    { label: "Structuring diagnoses, medicines & restrictions", caption: facts ? `${factCount} facts extracted` : "From the document only", state: genStep > 1 ? "done" : genStep === 1 ? "active" : facts ? "done" : "idle" },
    { label: "Applying your approved pathway", caption: governingPathway?.name ?? "Governing version", state: genStep > 2 ? "done" : genStep === 2 ? "active" : "idle" },
    { label: "Checking for missing or conflicting information", state: genStep > 3 ? "done" : genStep === 3 ? "active" : "idle" },
    { label: "Draft ready for your review", state: genStep >= 4 ? "done" : "idle" },
  ];

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,440px)_1fr]">
      {/* -------------------------- LEFT: sources -------------------------- */}
      <div className="space-y-5">
        {err && <ErrorNote>{err}</ErrorNote>}

        {/* pathway */}
        <Panel label="Source" title="Approved pathway">
          <p className="-mt-2 mb-3 text-[12.5px] text-sage-500">A plan can only be built from a pathway version your institution has clinically approved. Draft templates are not national standards.</p>
          <div className="space-y-2.5">
            {pathways === null ? <Skeleton className="h-20" /> : pathways.filter((p) => p.version_id).length === 0 ? (
              <p className="text-[13px] text-sage-500">This pack has no pathway version yet.</p>
            ) : (
              pathways.filter((p) => p.version_id).map((p) => {
                const isGoverning = p.version_id === governing;
                return (
                  <div key={p.pathway_id} className={`rounded-2xl border p-3.5 transition-colors ${isGoverning ? "border-brand-300 bg-brand-50/60" : "border-line bg-white"}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[14px] font-semibold text-ink">{p.name}</span>
                      {p.version_status && <PathwayStatusBadge status={p.version_status} />}
                      {p.institution_approved && <StatusTag tone="recovery">Approved</StatusTag>}
                      {isGoverning && <StatusTag tone="calm">Governing</StatusTag>}
                    </div>
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      {!p.institution_approved ? (
                        <PrimaryButton onClick={() => approve(p)} disabled={busy === `approve:${p.pathway_id}`}>{busy === `approve:${p.pathway_id}` ? "Approving…" : "Approve for our institution"}</PrimaryButton>
                      ) : !isGoverning ? (
                        <PrimaryButton onClick={() => useVersion(p)} disabled={busy === `use:${p.pathway_id}`}>{busy === `use:${p.pathway_id}` ? "Setting…" : "Use for this patient"}</PrimaryButton>
                      ) : (
                        <span className="text-[12.5px] font-semibold text-brand-700">✓ Ready</span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Panel>

        {/* document → facts */}
        <Panel
          label="Source"
          title="Governing discharge document"
          aside={
            <div className="flex gap-1 rounded-lg bg-mist-100 p-0.5 text-[12px] font-semibold">
              <button type="button" onClick={() => setMode("document")} className={`rounded-md px-2.5 py-1 ${mode === "document" ? "bg-white text-sky-700 shadow-sm" : "text-sage-500"}`}>Document</button>
              <button type="button" onClick={() => setMode("paste")} className={`rounded-md px-2.5 py-1 ${mode === "paste" ? "bg-white text-sky-700 shadow-sm" : "text-sage-500"}`}>Paste</button>
            </div>
          }
        >
          <div className="space-y-3">
            {mode === "document" ? (
              docs.length === 0 ? (
                <p className="text-[13px] text-sage-500">No documents uploaded. Upload the discharge summary in patient setup, or paste the text.</p>
              ) : (
                <Field label="Only this document is read">
                  <select value={selectedDoc} onChange={(e) => setSelectedDoc(e.target.value)} className={inputCls}>
                    <option value="">— Select a document —</option>
                    {docs.map((d) => <option key={d.id} value={d.id}>{d.file_name} ({d.doc_type.replace("_", " ")})</option>)}
                  </select>
                </Field>
              )
            ) : (
              <Field label="Discharge summary text (fallback)">
                <textarea value={dischargeText} onChange={(e) => setDischargeText(e.target.value)} rows={5} placeholder="Paste the discharge summary text…" className={`${inputCls} resize-y font-mono text-[13px]`} />
              </Field>
            )}
            <div className="flex items-center gap-3">
              <PrimaryButton onClick={extract} disabled={busy === "facts" || (mode === "document" ? !selectedDoc : dischargeText.trim().length < 20)}>
                {busy === "facts" ? "Reading…" : facts ? "Re-read document" : "Read document"}
              </PrimaryButton>
              {facts && <StatusTag tone="calm">{factCount} facts</StatusTag>}
            </div>
            {facts && <FactsReview facts={facts} onChange={setFacts} />}
          </div>
        </Panel>

        {/* three instructions */}
        <Panel label="Source" title="Your instructions">
          <p className="-mt-2 mb-3 text-[12.5px] text-sage-500">Three answers that steer the plan. Kept with your provenance.</p>
          <div className="space-y-4">
            <Field label="Recovery milestone you expect, and by when">
              <div className="grid gap-2 sm:grid-cols-[1fr_150px]">
                <input value={intake.milestone_goal} onChange={(e) => setIntake({ ...intake, milestone_goal: e.target.value })} placeholder="e.g. Independent indoor walking" className={inputCls} />
                <input value={intake.milestone_by} onChange={(e) => setIntake({ ...intake, milestone_by: e.target.value })} placeholder="By week 4" className={inputCls} />
              </div>
            </Field>
            <Field label="What to monitor more closely than usual">
              <textarea value={intake.monitor_focus} onChange={(e) => setIntake({ ...intake, monitor_focus: e.target.value })} rows={2} placeholder="e.g. Wound at the graft site; blood sugar" className={`${inputCls} resize-y`} />
            </Field>
            <Field label="Non-negotiable instructions or safety boundaries">
              <textarea value={intake.non_negotiables} onChange={(e) => setIntake({ ...intake, non_negotiables: e.target.value })} rows={2} placeholder="e.g. No bending/twisting/lifting > 2 kg for 6 weeks" className={`${inputCls} resize-y`} />
            </Field>
          </div>
        </Panel>
      </div>

      {/* ---------------------- RIGHT: generated plan --------------------- */}
      <div className="lg:sticky lg:top-4 lg:self-start">
        <div className="overflow-hidden rounded-3xl bg-white shadow-panel ring-1 ring-ink/[0.05]">
          <div className="border-b border-line bg-gradient-to-b from-sky-50/60 to-white px-6 py-4">
            <SectionLabel>Generated care plan</SectionLabel>
            <h2 className="mt-1 font-display text-[17px] font-semibold tracking-[-0.01em] text-ink">
              {generating ? "Building the recovery plan…" : "Ready when your sources are"}
            </h2>
          </div>

          <div className="p-6">
            <JourneySteps steps={journey} />

            {!generating && (
              <div className="mt-4 rounded-2xl bg-mist p-4 ring-1 ring-ink/[0.04]">
                <SectionLabel>Before you generate</SectionLabel>
                <ul className="mt-2 space-y-1.5 text-[13px]">
                  <ReadyRow ok={!!governing} label="Approved pathway selected" />
                  <ReadyRow ok={!!facts} label={facts ? `${factCount} facts read from the document` : "Read the discharge document"} />
                  <ReadyRow ok={questionsFilled} label="Three instructions answered" />
                </ul>
              </div>
            )}

            <div className="mt-5">
              <button
                type="button"
                onClick={generate}
                disabled={!canGenerate}
                className="tap flex w-full items-center justify-center gap-2 rounded-2xl bg-sky-600 px-5 py-3.5 text-[15px] font-semibold text-white shadow-sm transition-colors hover:bg-sky-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 disabled:opacity-50"
              >
                {generating ? "Generating draft…" : "Generate recovery plan"}
              </button>
              {!canGenerate && !generating && (
                <p className="mt-2 text-center text-[12px] text-sage-500">
                  {!governing ? "Select an approved pathway to continue." : !facts ? "Read the discharge document first." : "Answer the three instructions."}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReadyRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2.5">
      <span className={`grid h-4 w-4 shrink-0 place-items-center rounded-full text-[10px] ${ok ? "bg-brand-500 text-white" : "bg-mist-200 text-sage-500"}`}>{ok ? "✓" : ""}</span>
      <span className={ok ? "text-ink" : "text-sage-500"}>{label}</span>
    </li>
  );
}

/* ----------------------------- facts review ------------------------------- */

function FactsReview({ facts, onChange }: { facts: DocumentFacts; onChange: (f: DocumentFacts) => void }) {
  const setItems = (key: "diagnoses" | "investigations" | "precautions" | "diet", rows: FactItem[]) => onChange({ ...facts, [key]: rows });
  return (
    <div className="rounded-2xl border border-sky-200 bg-sky-50/40 p-4">
      <div className="flex items-center gap-2">
        <ProvenanceTag p="document" />
        <p className="text-[12.5px] font-semibold text-sky-800">Facts read from the document — correct before generating</p>
      </div>
      <p className="mt-0.5 text-[11.5px] text-sage-600">Your edits carry your (doctor) provenance.</p>

      {(facts.missing.length > 0 || facts.conflicts.length > 0) && (
        <div className="mt-2.5 space-y-1">
          {facts.conflicts.map((c, i) => <p key={`c${i}`} className="text-[12px] text-coral-600"><span className="font-semibold">Conflict:</span> {c}</p>)}
          {facts.missing.map((m, i) => <p key={`m${i}`} className="text-[12px] text-warn-600"><span className="font-semibold">Missing:</span> {m}</p>)}
        </div>
      )}

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <FactEditList label="Diagnoses" rows={facts.diagnoses} onChange={(r) => setItems("diagnoses", r)} />
        <div>
          <span className="mb-1 block text-[12px] font-semibold text-sage-600">Procedure</span>
          <input value={facts.procedure?.text ?? ""} onChange={(e) => onChange({ ...facts, procedure: e.target.value.trim() ? { text: e.target.value, provenance: facts.procedure?.provenance ?? "doctor" } : null })} placeholder="e.g. L4-L5 fusion" className={inputCls} />
        </div>
      </div>

      <div className="mt-3">
        <span className="mb-1 block text-[12px] font-semibold text-sage-600">Medicines</span>
        <div className="space-y-2">
          {facts.medicines.map((m, i) => (
            <div key={i} className="rounded-xl bg-white/70 p-2 ring-1 ring-sky-100">
              <div className="flex items-center gap-1.5">
                <input value={m.name} onChange={(e) => onChange({ ...facts, medicines: facts.medicines.map((x, j) => j === i ? { ...x, name: e.target.value } : x) })} placeholder="Medicine name" className={`${inputCls} flex-1`} />
                <button type="button" onClick={() => onChange({ ...facts, medicines: facts.medicines.filter((_, j) => j !== i) })} aria-label="Remove medicine" className="shrink-0 px-1.5 text-[13px] font-semibold text-sage-500 hover:text-coral-600">✕</button>
              </div>
              <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                <input value={m.dose} onChange={(e) => onChange({ ...facts, medicines: facts.medicines.map((x, j) => j === i ? { ...x, dose: e.target.value } : x) })} placeholder="Dose" className={inputCls} />
                <input value={m.freq} onChange={(e) => onChange({ ...facts, medicines: facts.medicines.map((x, j) => j === i ? { ...x, freq: e.target.value } : x) })} placeholder="1-0-1" className={inputCls} />
                <input value={m.timing} onChange={(e) => onChange({ ...facts, medicines: facts.medicines.map((x, j) => j === i ? { ...x, timing: e.target.value } : x) })} placeholder="After food" className={inputCls} />
              </div>
            </div>
          ))}
          <button type="button" onClick={() => onChange({ ...facts, medicines: [...facts.medicines, { name: "", dose: "", freq: "", timing: "", note: "", provenance: "doctor" } as FactMedicine] })} className="text-[12px] font-semibold text-sky-700 hover:text-sky-800">+ Add medicine</button>
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <FactEditList label="Precautions / boundaries" rows={facts.precautions} onChange={(r) => setItems("precautions", r)} />
        <FactEditList label="Diet" rows={facts.diet} onChange={(r) => setItems("diet", r)} />
      </div>
    </div>
  );
}

function FactEditList({ label, rows, onChange }: { label: string; rows: FactItem[]; onChange: (r: FactItem[]) => void }) {
  return (
    <div>
      <span className="mb-1 block text-[12px] font-semibold text-sage-600">{label}</span>
      <div className="space-y-1.5">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <input value={r.text} onChange={(e) => onChange(rows.map((x, j) => j === i ? { ...x, text: e.target.value } : x))} className={`${inputCls} flex-1`} />
            <button type="button" onClick={() => onChange(rows.filter((_, j) => j !== i))} className="px-1.5 text-[12px] font-semibold text-sage-500 hover:text-coral-600">✕</button>
          </div>
        ))}
        <button type="button" onClick={() => onChange([...rows, { text: "", provenance: "doctor" }])} className="text-[12px] font-semibold text-sky-700 hover:text-sky-800">+ Add</button>
      </div>
    </div>
  );
}

/* =============================== REVIEW ================================== */

function PlanReview({
  plan, onExit, onRegeneratePrompt, onSaved,
}: {
  plan: PatientPlanRow;
  onExit: () => void;
  onRegeneratePrompt: () => void;
  onSaved: (p: PatientPlanRow) => void;
}) {
  const [draft, setDraft] = useState<PlanDraft>(plan.content);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<"save" | "approve" | "activate" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const [confirmActivate, setConfirmActivate] = useState(false);
  const approved = plan.status === "approved";
  const activated = !!plan.activated_at;

  const persist = async (approve: boolean) => {
    setBusy(approve ? "approve" : "save"); setErr(null); setSavedNote(null);
    try {
      await savePlan(plan.id, draft, approve);
      onSaved({ ...plan, content: draft, status: approve ? "approved" : "draft" });
      setSavedNote(approve ? "Approved" : "Draft saved"); setEditing(false);
      setTimeout(() => setSavedNote(null), 2000);
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not save."); }
    finally { setBusy(null); }
  };

  const activate = async () => {
    setBusy("activate"); setErr(null);
    try {
      if (!approved) await savePlan(plan.id, draft, true);
      await activateCarePlan(plan.id);
      onExit();
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not activate the care plan."); setBusy(null); }
  };

  const medCount = draft.medicines?.length ?? 0;
  const taskCount = (draft.daily_tasks?.length ?? 0) + (draft.therapy_tasks?.length ?? 0);
  const obsCount = draft.observations?.length ?? 0;
  const dietCount = draft.diet?.length ?? 0;
  const facts = draft.diagnosis ?? [];
  const hasFlags = !!(draft.missing?.length || draft.conflicts?.length);

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_minmax(0,340px)]">
      {/* plan body */}
      <div className="space-y-4">
        {activated && (
          <div className="rounded-2xl bg-brand-50 p-4 ring-1 ring-brand-500/20">
            <p className="text-[13px] font-semibold text-brand-700">Care plan v{plan.version} is active. The caregiver, family, nurse and doctor now see it on their screens.</p>
          </div>
        )}
        {err && <ErrorNote>{err}</ErrorNote>}

        {hasFlags && (
          <Reveal>
            <Panel tone="attention" label="Needs your attention" title="Gaps & conflicts">
              <p className="-mt-2 mb-3 text-[12.5px] text-sage-600">The AI flagged these rather than guessing.</p>
              <div className="space-y-2">
                {draft.conflicts?.map((c, i) => <p key={`c${i}`} className="flex gap-2 text-[13px] text-ink"><span className="font-semibold text-coral-600">Conflict:</span> {c}</p>)}
                {draft.missing?.map((m, i) => <p key={`m${i}`} className="flex gap-2 text-[13px] text-ink"><span className="font-semibold text-warn-600">Missing:</span> {m}</p>)}
              </div>
            </Panel>
          </Reveal>
        )}

        <Reveal index={1}>
          <Panel
            label="Facts · from the document"
            title="Patient & diagnosis"
            aside={activated ? <StatusTag tone="recovery">Active</StatusTag> : (
              <button type="button" onClick={() => setEditing((v) => !v)} className="text-[12.5px] font-semibold text-sky-700 hover:text-sky-800">{editing ? "Done editing" : "Edit"}</button>
            )}
          >
            {editing ? (
              <textarea value={draft.clinical_summary} onChange={(e) => setDraft({ ...draft, clinical_summary: e.target.value })} rows={2} className={`${inputCls} resize-y`} />
            ) : (
              <p className="text-[14px] leading-relaxed text-ink">{draft.clinical_summary || "—"}</p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {facts.length === 0 ? <span className="text-[13px] text-sage-500">No diagnosis captured.</span> :
                facts.map((d, i) => (
                  <span key={i} className="inline-flex items-center gap-1.5 rounded-full bg-mist-100 px-3 py-1 text-[12.5px] text-ink ring-1 ring-ink/[0.05]">{d.text} <ProvenanceTag p={d.provenance} /></span>
                ))}
            </div>
            {draft.procedure?.text && <p className="mt-2 text-[13px] text-sage-700">Procedure: <span className="font-semibold text-ink">{draft.procedure.text}</span> <ProvenanceTag p={draft.procedure.provenance} /></p>}
          </Panel>
        </Reveal>

        <Reveal index={2}>
          <EditableFactCard title="Medicines" subtitle="Copied exactly from the discharge document — verify before activating." editing={editing}
            rows={draft.medicines ?? []}
            render={(m) => (
              <span className="flex flex-wrap items-baseline gap-x-2 text-[13.5px] text-ink">
                <span className="font-semibold">{m.name}</span>
                <span className="text-sage-600">{[m.dose, m.freq, m.timing].filter(Boolean).join(" · ")}</span>
                {m.note && <span className="text-sage-500">— {m.note}</span>}
                <ProvenanceTag p={m.provenance} />
              </span>
            )}
            empty="No medicines listed in the document."
            editor={(m, set) => (
              <div className="flex flex-wrap gap-1.5">
                <input value={m.name} onChange={(e) => set({ ...m, name: e.target.value })} placeholder="Name" className={`${inputCls} min-w-[130px] flex-1`} />
                <input value={m.dose} onChange={(e) => set({ ...m, dose: e.target.value })} placeholder="Dose" className={`${inputCls} w-[84px]`} />
                <input value={m.freq} onChange={(e) => set({ ...m, freq: e.target.value })} placeholder="1-0-1" className={`${inputCls} w-[76px]`} />
                <input value={m.timing} onChange={(e) => set({ ...m, timing: e.target.value })} placeholder="After food" className={`${inputCls} w-[110px]`} />
              </div>
            )}
            onChange={(rows) => setDraft({ ...draft, medicines: rows as PlanMedicine[] })}
            blank={{ name: "", dose: "", freq: "", timing: "", note: "", provenance: "doctor" } as PlanMedicine}
          />
        </Reveal>

        <Reveal index={3}>
          <Panel label="Pathway" title="Daily monitoring · vitals & pain">
            <p className="-mt-2 mb-3 text-[12.5px] text-sage-500">Governed by the approved pathway — recorded by the home team.</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {(draft.observations ?? []).length === 0 ? <span className="text-[13px] text-sage-500">No monitoring modules.</span> :
                draft.observations.map((o, i) => (
                  <div key={i} className="flex items-center justify-between rounded-xl bg-mist-100 px-3 py-2 ring-1 ring-ink/[0.04]">
                    <span className="text-[13px] font-medium text-ink">{moduleLabel(o.module)}</span>
                    <span className="text-[11.5px] text-sage-500">{o.frequency} · {o.recorded_by}</span>
                  </div>
                ))}
            </div>
          </Panel>
        </Reveal>

        <Reveal index={4}>
          <EditableTaskCard title="Mobility, physiotherapy & daily tasks" editing={editing}
            rows={[...(draft.daily_tasks ?? []), ...(draft.therapy_tasks ?? [])]}
            onChange={(rows) => setDraft({ ...draft, daily_tasks: rows, therapy_tasks: [] })}
          />
        </Reveal>

        <div className="grid gap-4 sm:grid-cols-2">
          <Reveal index={5}><FactListCard title="Diet" rows={draft.diet ?? []} empty="No diet instructions." /></Reveal>
          <Reveal index={5}><FactListCard title="Safety boundaries" rows={draft.precautions ?? []} empty="No precautions captured." /></Reveal>
        </div>

        <Reveal index={6}>
          <Panel label="Pathway + your goal" title="Milestones">
            <div className="space-y-1.5">
              {(draft.milestones ?? []).length === 0 ? <span className="text-[13px] text-sage-500">No milestones.</span> :
                draft.milestones.map((m, i) => (
                  <p key={i} className="flex items-center gap-2 text-[13.5px] text-ink"><span className="grid h-5 w-5 place-items-center rounded-full bg-sky-100 text-[11px] font-bold text-sky-700">{i + 1}</span>{m.name}{m.by_day != null && <span className="text-sage-500">· by day {m.by_day}</span>}</p>
                ))}
            </div>
          </Panel>
        </Reveal>

        <Reveal index={7}>
          <Panel label="Pathway · safety" title="Warning signs & escalation">
            <ul className="space-y-1.5">
              {(draft.warning_signs ?? []).map((w, i) => (
                <li key={i} className="flex items-start gap-2 text-[13.5px] text-ink"><span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${w.severity === "urgent" ? "bg-coral-500" : "bg-warn-500"}`} />{w.text}</li>
              ))}
            </ul>
            <div className="mt-3 rounded-xl bg-mist-100 px-3.5 py-2.5 text-[12.5px] text-sage-700 ring-1 ring-ink/[0.04]">
              Routine → <span className="font-semibold text-ink">{draft.escalation?.routine}</span> · Urgent → <span className="font-semibold text-ink">{draft.escalation?.urgent}</span> · Emergency → <span className="font-semibold text-ink">{draft.escalation?.emergency}</span>
            </div>
          </Panel>
        </Reveal>
      </div>

      {/* action rail */}
      <div className="lg:sticky lg:top-4 lg:self-start">
        <div className="rounded-3xl bg-white p-5 shadow-panel ring-1 ring-ink/[0.05]">
          <SectionLabel>Evidence & provenance</SectionLabel>
          <p className="mt-2 text-[12.5px] leading-relaxed text-sage-600">
            <ProvenanceTag p="document" /> facts and medicines are copied from the discharge summary.
            <span className="mt-1.5 block"><ProvenanceTag p="doctor" /> reflects your instructions.</span>
            <span className="mt-1.5 block"><ProvenanceTag p="pathway" /> monitoring, warning signs and escalation come from the approved pathway.</span>
          </p>

          <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl bg-mist p-3 text-center ring-1 ring-ink/[0.04]">
            <Stat n={medCount} label="medicines" />
            <Stat n={taskCount} label="daily tasks" />
            <Stat n={obsCount} label="monitored" />
            <Stat n={dietCount} label="diet notes" />
          </div>

          {confirmActivate && !activated ? (
            <div className="mt-4 rounded-2xl bg-sky-50 p-4 ring-1 ring-sky-200">
              <p className="text-[13px] font-semibold text-ink">Activate this care plan?</p>
              <p className="mt-1 text-[12px] text-sage-600">It becomes the live plan the home team follows. It can be re-run safely and preserves earlier versions.</p>
              <div className="mt-3 space-y-2">
                <PrimaryButton onClick={activate} disabled={busy === "activate"} className="w-full">{busy === "activate" ? "Activating…" : "Confirm — activate care plan"}</PrimaryButton>
                <GhostButton onClick={() => setConfirmActivate(false)} disabled={busy === "activate"} className="w-full">Cancel</GhostButton>
              </div>
            </div>
          ) : (
            <div className="mt-4 space-y-2">
              {activated ? (
                <>
                  <PrimaryButton onClick={onExit} className="w-full">Back to caseload</PrimaryButton>
                  <GhostButton onClick={onRegeneratePrompt} className="w-full">Amend (new version)</GhostButton>
                </>
              ) : (
                <>
                  {savedNote && <p className="text-center text-[12.5px] font-semibold text-brand-700">{savedNote} ✓</p>}
                  <button
                    type="button"
                    onClick={() => setConfirmActivate(true)}
                    disabled={!!busy}
                    className="tap w-full rounded-2xl bg-sky-600 px-4 py-3 text-[14.5px] font-semibold text-white shadow-sm transition-colors hover:bg-sky-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 disabled:opacity-50"
                  >
                    Approve &amp; activate care plan
                  </button>
                  <div className="flex gap-2">
                    <GhostButton onClick={() => persist(true)} disabled={!!busy} className="flex-1">{busy === "approve" ? "Approving…" : "Approve only"}</GhostButton>
                    <GhostButton onClick={() => persist(false)} disabled={!!busy} className="flex-1">{busy === "save" ? "Saving…" : "Save draft"}</GhostButton>
                  </div>
                  <button type="button" onClick={onRegeneratePrompt} disabled={!!busy} className="tap w-full py-1 text-center text-[12.5px] font-semibold text-sage-500 hover:text-ink">Regenerate from sources</button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div>
      <div className="text-[18px] font-semibold leading-none text-ink tabular-nums">{n}</div>
      <div className="mt-1 text-[11px] text-sage-500">{label}</div>
    </div>
  );
}

/* --------------------------- small review helpers ------------------------- */

function moduleLabel(key: string): string {
  return key.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function FactListCard({ title, rows, empty }: { title: string; rows: PlanFact[]; empty: string }) {
  return (
    <Panel title={title}>
      <div className="space-y-1.5">
        {rows.length === 0 ? <span className="text-[13px] text-sage-500">{empty}</span> :
          rows.map((r, i) => (
            <p key={i} className="flex items-start gap-2 text-[13.5px] text-ink"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-400" />{r.text} <ProvenanceTag p={r.provenance} /></p>
          ))}
      </div>
    </Panel>
  );
}

function EditableFactCard<T extends { provenance: string }>({
  title, subtitle, editing, rows, render, editor, onChange, blank, empty,
}: {
  title: string; subtitle: string; editing: boolean; rows: T[]; empty: string;
  render: (r: T) => React.ReactNode;
  editor: (r: T, set: (v: T) => void) => React.ReactNode;
  onChange: (rows: T[]) => void;
  blank: T;
}) {
  return (
    <Panel
      label="Facts · from the document"
      title={title}
      aside={editing ? <button type="button" onClick={() => onChange([...rows, blank])} className="text-[12.5px] font-semibold text-sky-700 hover:text-sky-800">+ Add</button> : undefined}
    >
      <p className="-mt-2 mb-3 text-[12.5px] text-sage-500">{subtitle}</p>
      <div className="space-y-2">
        {rows.length === 0 && <span className="text-[13px] text-sage-500">{empty}</span>}
        {rows.map((r, i) => (
          <div key={i} className="flex items-start gap-2 rounded-xl bg-white px-1 py-1">
            <div className="min-w-0 flex-1">{editing ? editor(r, (v) => onChange(rows.map((x, j) => (j === i ? v : x)))) : render(r)}</div>
            {editing && <button type="button" onClick={() => onChange(rows.filter((_, j) => j !== i))} className="shrink-0 rounded-lg px-2 py-1 text-[12px] font-semibold text-sage-500 hover:text-coral-600" aria-label="Remove">Remove</button>}
          </div>
        ))}
      </div>
    </Panel>
  );
}

function EditableTaskCard({ title, editing, rows, onChange }: {
  title: string; editing: boolean; rows: PlanTask[]; onChange: (rows: PlanTask[]) => void;
}) {
  return (
    <Panel
      label="Document + pathway"
      title={title}
      aside={editing ? <button type="button" onClick={() => onChange([...rows, { time_label: "08:00", discipline: "General care", title: "", detail: "", provenance: "doctor" }])} className="text-[12.5px] font-semibold text-sky-700 hover:text-sky-800">+ Add task</button> : undefined}
    >
      <div className="space-y-2">
        {rows.length === 0 && <span className="text-[13px] text-sage-500">No tasks.</span>}
        {rows.map((t, i) => (
          <div key={i} className="rounded-xl bg-mist-100 p-2.5 ring-1 ring-ink/[0.04]">
            {editing ? (
              <div className="flex flex-wrap gap-1.5">
                <input value={t.time_label} onChange={(e) => onChange(rows.map((x, j) => j === i ? { ...x, time_label: e.target.value } : x))} className={`${inputCls} w-[74px]`} />
                <input value={t.title} onChange={(e) => onChange(rows.map((x, j) => j === i ? { ...x, title: e.target.value } : x))} placeholder="Task" className={`${inputCls} min-w-[160px] flex-1`} />
                <button type="button" onClick={() => onChange(rows.filter((_, j) => j !== i))} className="shrink-0 rounded-lg px-2 text-[12px] font-semibold text-sage-500 hover:text-coral-600">Remove</button>
              </div>
            ) : (
              <div className="flex items-baseline gap-2">
                <span className="w-[54px] shrink-0 text-[12px] font-semibold text-sky-700">{t.time_label}</span>
                <span className="flex-1 text-[13.5px] text-ink">{t.title}{t.detail && <span className="text-sage-500"> — {t.detail}</span>}</span>
                <ProvenanceTag p={t.provenance} />
              </div>
            )}
          </div>
        ))}
      </div>
    </Panel>
  );
}
