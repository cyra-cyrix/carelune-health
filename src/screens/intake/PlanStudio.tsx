import { useEffect, useState } from "react";
import {
  getPatient, getPackPathways, approvePathwayVersion, assignGoverningVersion,
  extractFacts, getDocumentFacts, saveDocumentFacts, getPatientDocuments,
  getPlanIntake, savePlanIntake, generatePlan, getPatientPlan, savePlan, activateCarePlan,
  type PatientRow, type PackPathway, type PlanIntake, type PatientPlanRow,
  type DocumentFacts, type DocumentRow, type FactItem, type FactMedicine,
} from "../../lib/db";
import type { PlanDraft, PlanFact, PlanMedicine, PlanTask } from "../../lib/pathwayValidation";
import {
  Card, Field, inputCls, PrimaryButton, GhostButton, Chip, PathwayStatusBadge,
  ErrorNote, Skeleton, SectionHeader,
} from "../../components/system";

/* ------------------------------ provenance -------------------------------- */

function ProvChip({ p }: { p: string }) {
  const map: Record<string, { label: string; tone: "sky" | "grey" | "good" | "warn" }> = {
    document: { label: "Discharge doc", tone: "sky" },
    doctor: { label: "Doctor", tone: "good" },
    pathway: { label: "Pathway", tone: "grey" },
    ai_structured: { label: "AI", tone: "warn" },
    missing: { label: "Missing", tone: "warn" },
  };
  const m = map[p] ?? { label: p, tone: "grey" as const };
  return <Chip tone={m.tone}>{m.label}</Chip>;
}

/**
 * Plan Studio — the doctor-led journey after patient setup:
 *   prepare (approve pathway version · extract facts from the selected discharge
 *   document · review/correct facts · three answers) → generate a governed,
 *   server-validated DRAFT → review → approve → ATOMICALLY activate the care plan.
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

  return (
    <div className="min-h-full bg-mist">
      <div className="mx-auto max-w-[960px] px-5 py-6 lg:px-8">
        <GhostButton onClick={onExit} className="!px-3 !py-1.5 text-[13px]">← Back to caseload</GhostButton>
        <div className="mt-3 flex flex-wrap items-center gap-2.5">
          <h1 className="font-display text-[24px] font-semibold tracking-tight text-ink">
            Recovery plan · {patient?.full_name ?? "…"}
          </h1>
          {plan && <Chip tone={plan.activated_at ? "good" : plan.status === "approved" ? "sky" : "warn"}>
            {plan.activated_at ? `Active · v${plan.version}` : plan.status === "approved" ? `Approved · v${plan.version}` : `Draft · v${plan.version}`}
          </Chip>}
        </div>
        <p className="mt-1 text-[14px] text-sage-500">
          {(patient?.diagnosis?.length ? patient.diagnosis.join(", ") : "Diagnosis set from the discharge summary")} · governed AI draft — you edit and approve everything.
        </p>

        {error && <div className="mt-4"><ErrorNote>{error}</ErrorNote></div>}

        <div className="mt-5">
          {plan ? (
            <PlanReview
              plan={plan}
              onExit={onExit}
              onRegeneratePrompt={() => setPlan(null)}
              onSaved={(pl) => setPlan(pl)}
            />
          ) : (
            <PreparePanel
              patient={patient}
              onPatientChanged={refreshPatient}
              onGenerated={(pl) => setPlan(pl)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------- prepare ---------------------------------- */

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

  useEffect(() => {
    if (!patient?.pathway_pack_id) { setPathways([]); return; }
    void getPackPathways(patient.pathway_pack_id).then(setPathways).catch(() => setPathways([]));
    void getPatientDocuments(patient.id).then((d) => { setDocs(d); const disc = d.find((x) => x.doc_type === "discharge_summary"); if (disc) setSelectedDoc(disc.id); });
    void getDocumentFacts(patient.id).then((f) => { if (f) setFacts(f.facts); });
    void getPlanIntake(patient.id).then((i) => { if (i) setIntake(i); });
  }, [patient?.id, patient?.pathway_pack_id]);

  if (!patient?.pathway_pack_id) {
    return <Card><p className="text-[13.5px] text-sage-600">Assign a clinical pathway in patient setup first, then return here to build the plan.</p></Card>;
  }

  const governing = patient.pathway_version_id;

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

  const questionsFilled = intake.milestone_goal.trim() && intake.monitor_focus.trim() && intake.non_negotiables.trim();
  const canGenerate = !!governing && !!facts && questionsFilled && !busy;

  const generate = async () => {
    setBusy("generate"); setErr(null);
    try {
      if (facts) await saveDocumentFacts(patient.id, facts); // persist any corrections
      await savePlanIntake(patient.id, intake);
      await generatePlan(patient.id);
      const pl = await getPatientPlan(patient.id);
      if (pl) onGenerated(pl);
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not generate the plan."); }
    finally { setBusy(null); }
  };

  return (
    <div className="space-y-5">
      {err && <ErrorNote>{err}</ErrorNote>}

      {/* 1 · pathway version approval */}
      <Card>
        <SectionHeader title="1 · Clinical pathway version" sub="A plan may only be generated from a pathway version your institution has clinically approved. Draft/review templates are not national standards." />
        <div className="mt-4 space-y-2.5">
          {pathways === null ? <Skeleton className="h-20" /> : pathways.filter((p) => p.version_id).length === 0 ? (
            <p className="text-[13px] text-sage-500">This pack has no pathway version yet.</p>
          ) : (
            pathways.filter((p) => p.version_id).map((p) => {
              const isGoverning = p.version_id === governing;
              return (
                <div key={p.pathway_id} className={`rounded-2xl border p-3.5 ${isGoverning ? "border-sky-500 bg-sky-50/60" : "border-line bg-white"}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[14.5px] font-semibold text-ink">{p.name}</span>
                    {p.version_status && <PathwayStatusBadge status={p.version_status} />}
                    {p.institution_approved && <Chip tone="good">Approved for your institution</Chip>}
                    {isGoverning && <Chip tone="sky">Governing this patient</Chip>}
                  </div>
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {!p.institution_approved ? (
                      <PrimaryButton onClick={() => approve(p)} disabled={busy === `approve:${p.pathway_id}`}>{busy === `approve:${p.pathway_id}` ? "Approving…" : "Approve for our institution"}</PrimaryButton>
                    ) : !isGoverning ? (
                      <PrimaryButton onClick={() => useVersion(p)} disabled={busy === `use:${p.pathway_id}`}>{busy === `use:${p.pathway_id}` ? "Setting…" : "Use for this patient"}</PrimaryButton>
                    ) : (
                      <span className="text-[12.5px] font-semibold text-good-600">✓ Ready to generate</span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </Card>

      {/* 2 · discharge document → facts */}
      <Card>
        <SectionHeader title="2 · Discharge document → facts"
          sub="Select the governing discharge summary. Only that document is read; facts are extracted once, reused, and never mix with unrelated documents."
          action={<div className="flex gap-1 rounded-lg bg-mist-100 p-0.5 text-[12px] font-semibold">
            <button type="button" onClick={() => setMode("document")} className={`rounded-md px-2.5 py-1 ${mode === "document" ? "bg-white text-sky-700 shadow-sm" : "text-sage-500"}`}>Document</button>
            <button type="button" onClick={() => setMode("paste")} className={`rounded-md px-2.5 py-1 ${mode === "paste" ? "bg-white text-sky-700 shadow-sm" : "text-sage-500"}`}>Paste (fallback)</button>
          </div>} />
        <div className="mt-4 space-y-3">
          {mode === "document" ? (
            docs.length === 0 ? (
              <p className="text-[13px] text-sage-500">No documents uploaded yet. Upload the discharge summary in patient setup, or paste the text.</p>
            ) : (
              <Field label="Governing discharge document">
                <select value={selectedDoc} onChange={(e) => setSelectedDoc(e.target.value)} className={inputCls}>
                  <option value="">— Select a document —</option>
                  {docs.map((d) => <option key={d.id} value={d.id}>{d.file_name} ({d.doc_type.replace("_", " ")})</option>)}
                </select>
              </Field>
            )
          ) : (
            <Field label="Discharge summary text (fallback)">
              <textarea value={dischargeText} onChange={(e) => setDischargeText(e.target.value)} rows={6} placeholder="Paste the discharge summary text…" className={`${inputCls} resize-y font-mono text-[13px]`} />
            </Field>
          )}
          <div className="flex items-center gap-3">
            <PrimaryButton onClick={extract} disabled={busy === "facts" || (mode === "document" ? !selectedDoc : dischargeText.trim().length < 20)}>
              {busy === "facts" ? "Reading…" : facts ? "Re-extract facts" : "Extract facts"}
            </PrimaryButton>
            <p className="text-[11.5px] text-sage-500">PDF text and JPG/PNG images are read server-side. Not de-identified — synthetic data only.</p>
          </div>

          {facts && <FactsReview facts={facts} onChange={setFacts} />}
        </div>
      </Card>

      {/* 3 · three questions */}
      <Card>
        <SectionHeader title="3 · Three questions" sub="Your answers steer the plan and are preserved with 'doctor' provenance." />
        <div className="mt-4 space-y-4">
          <Field label="What recovery milestone do you expect for this patient, and by when?">
            <div className="grid gap-2 sm:grid-cols-[1fr_180px]">
              <input value={intake.milestone_goal} onChange={(e) => setIntake({ ...intake, milestone_goal: e.target.value })} placeholder="e.g. Independent indoor walking with a stick" className={inputCls} />
              <input value={intake.milestone_by} onChange={(e) => setIntake({ ...intake, milestone_by: e.target.value })} placeholder="e.g. By week 4" className={inputCls} />
            </div>
          </Field>
          <Field label="What should the care team monitor more closely than usual?">
            <textarea value={intake.monitor_focus} onChange={(e) => setIntake({ ...intake, monitor_focus: e.target.value })} rows={2} placeholder="e.g. Wound at the graft site; blood sugar (diabetic)" className={`${inputCls} resize-y`} />
          </Field>
          <Field label="What instructions or safety boundaries are non-negotiable?">
            <textarea value={intake.non_negotiables} onChange={(e) => setIntake({ ...intake, non_negotiables: e.target.value })} rows={2} placeholder="e.g. No bending/twisting/lifting > 2 kg for 6 weeks; brace whenever upright" className={`${inputCls} resize-y`} />
          </Field>
        </div>
      </Card>

      {/* generate */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12.5px] text-sage-500">
          {!governing ? "Approve & choose a pathway version first." : !facts ? "Extract the discharge facts." : !questionsFilled ? "Answer the three questions." : "Ready to generate a governed draft."}
        </p>
        <PrimaryButton onClick={generate} disabled={!canGenerate}>{busy === "generate" ? "Generating draft…" : "Generate plan draft"}</PrimaryButton>
      </div>
    </div>
  );
}

/* ----------------------------- facts review ------------------------------- */

function FactsReview({ facts, onChange }: { facts: DocumentFacts; onChange: (f: DocumentFacts) => void }) {
  const setItems = (key: "diagnoses" | "investigations" | "precautions" | "diet", rows: FactItem[]) => onChange({ ...facts, [key]: rows });
  return (
    <div className="mt-2 rounded-2xl border border-sky-200 bg-sky-50/40 p-4">
      <p className="text-[12.5px] font-semibold text-sky-800">Review &amp; correct the extracted facts</p>
      <p className="mt-0.5 text-[11.5px] text-sage-600">Copied from the document — fix anything the reader got wrong before generating. Your edits carry doctor provenance.</p>

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
        <div className="space-y-1.5">
          {facts.medicines.map((m, i) => (
            <div key={i} className="flex flex-wrap items-center gap-1.5">
              <input value={m.name} onChange={(e) => onChange({ ...facts, medicines: facts.medicines.map((x, j) => j === i ? { ...x, name: e.target.value } : x) })} placeholder="Name" className={`${inputCls} min-w-[120px] flex-1`} />
              <input value={m.dose} onChange={(e) => onChange({ ...facts, medicines: facts.medicines.map((x, j) => j === i ? { ...x, dose: e.target.value } : x) })} placeholder="Dose" className={`${inputCls} w-[80px]`} />
              <input value={m.freq} onChange={(e) => onChange({ ...facts, medicines: facts.medicines.map((x, j) => j === i ? { ...x, freq: e.target.value } : x) })} placeholder="1-0-1" className={`${inputCls} w-[74px]`} />
              <input value={m.timing} onChange={(e) => onChange({ ...facts, medicines: facts.medicines.map((x, j) => j === i ? { ...x, timing: e.target.value } : x) })} placeholder="After food" className={`${inputCls} w-[108px]`} />
              <button type="button" onClick={() => onChange({ ...facts, medicines: facts.medicines.filter((_, j) => j !== i) })} className="px-1.5 text-[12px] font-semibold text-sage-500 hover:text-coral-600">✕</button>
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

/* ------------------------------- review ----------------------------------- */

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
      if (!approved) await savePlan(plan.id, draft, true); // ensure approved first
      await activateCarePlan(plan.id);
      onExit(); // success → return to the caseload
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not activate the care plan."); setBusy(null); }
  };

  const medCount = draft.medicines?.length ?? 0;
  const taskCount = (draft.daily_tasks?.length ?? 0) + (draft.therapy_tasks?.length ?? 0);
  const obsCount = draft.observations?.length ?? 0;
  const dietCount = draft.diet?.length ?? 0;
  const facts = draft.diagnosis ?? [];

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-sky-50 p-4 ring-1 ring-sky-200">
        <p className="text-[13px] leading-relaxed text-sky-900">
          <span className="font-semibold">Governed draft — you decide.</span> Medicines, diagnoses and restrictions are copied from the
          discharge documents or your instructions (never invented); monitoring, warning signs and escalation come from the approved
          pathway. Nothing here is active care until you <span className="font-semibold">approve and activate</span>.
        </p>
      </div>

      {activated && (
        <div className="rounded-2xl bg-good-100 p-4 ring-1 ring-good-500/20">
          <p className="text-[13px] font-semibold text-good-700">This plan (v{plan.version}) is active. The caregiver, family, nurse and doctor now see it on their screens.</p>
        </div>
      )}

      {err && <ErrorNote>{err}</ErrorNote>}

      {(draft.missing?.length || draft.conflicts?.length) ? (
        <Card className="!bg-warn-100/50 ring-warn-500/20">
          <SectionHeader title="Needs your attention" sub="The AI flagged gaps or conflicts rather than guessing." />
          <div className="mt-3 space-y-2">
            {draft.conflicts?.map((c, i) => <p key={`c${i}`} className="flex gap-2 text-[13px] text-ink"><span className="font-semibold text-coral-600">Conflict:</span> {c}</p>)}
            {draft.missing?.map((m, i) => <p key={`m${i}`} className="flex gap-2 text-[13px] text-ink"><span className="font-semibold text-warn-600">Missing:</span> {m}</p>)}
          </div>
        </Card>
      ) : null}

      <Card>
        <SectionHeader title="Patient & diagnosis"
          action={activated ? <Chip tone="good">Active</Chip> : (
            <button type="button" onClick={() => setEditing((v) => !v)} className="text-[12.5px] font-semibold text-sky-700 hover:text-sky-800">{editing ? "Done editing" : "Edit"}</button>
          )} />
        {editing ? (
          <textarea value={draft.clinical_summary} onChange={(e) => setDraft({ ...draft, clinical_summary: e.target.value })} rows={2} className={`${inputCls} mt-3 resize-y`} />
        ) : (
          <p className="mt-3 text-[14px] leading-relaxed text-ink">{draft.clinical_summary || "—"}</p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          {facts.length === 0 ? <span className="text-[13px] text-sage-500">No diagnosis captured.</span> :
            facts.map((d, i) => (
              <span key={i} className="inline-flex items-center gap-1.5 rounded-full bg-mist-100 px-3 py-1 text-[12.5px] text-ink ring-1 ring-ink/[0.05]">{d.text} <ProvChip p={d.provenance} /></span>
            ))}
        </div>
        {draft.procedure?.text && <p className="mt-2 text-[13px] text-sage-700">Procedure: <span className="font-semibold text-ink">{draft.procedure.text}</span> <ProvChip p={draft.procedure.provenance} /></p>}
      </Card>

      <EditableFactCard title="Medicines" subtitle="Copied exactly from the discharge documents — verify before activating." editing={editing}
        rows={draft.medicines ?? []}
        render={(m) => (
          <span className="flex flex-wrap items-baseline gap-x-2 text-[13.5px] text-ink">
            <span className="font-semibold">{m.name}</span>
            <span className="text-sage-600">{[m.dose, m.freq, m.timing].filter(Boolean).join(" · ")}</span>
            {m.note && <span className="text-sage-500">— {m.note}</span>}
            <ProvChip p={m.provenance} />
          </span>
        )}
        empty="No medicines listed in the documents."
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

      <Card>
        <SectionHeader title="Daily monitoring · vitals & pain" sub="Governed by the approved pathway — recorded by the home team." />
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {(draft.observations ?? []).length === 0 ? <span className="text-[13px] text-sage-500">No monitoring modules.</span> :
            draft.observations.map((o, i) => (
              <div key={i} className="flex items-center justify-between rounded-xl bg-mist-100 px-3 py-2 ring-1 ring-ink/[0.04]">
                <span className="text-[13px] font-medium text-ink">{moduleLabel(o.module)}</span>
                <span className="text-[11.5px] text-sage-500">{o.frequency} · {o.recorded_by}</span>
              </div>
            ))}
        </div>
      </Card>

      <EditableTaskCard title="Mobility, physiotherapy & daily tasks" editing={editing}
        rows={[...(draft.daily_tasks ?? []), ...(draft.therapy_tasks ?? [])]}
        onChange={(rows) => setDraft({ ...draft, daily_tasks: rows, therapy_tasks: [] })}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <FactListCard title="Diet" rows={draft.diet ?? []} empty="No diet instructions." />
        <FactListCard title="Safety boundaries & precautions" rows={draft.precautions ?? []} empty="No precautions captured." />
      </div>

      <Card>
        <SectionHeader title="Milestones" sub="Pathway targets plus your stated goal." />
        <div className="mt-3 space-y-1.5">
          {(draft.milestones ?? []).length === 0 ? <span className="text-[13px] text-sage-500">No milestones.</span> :
            draft.milestones.map((m, i) => (
              <p key={i} className="flex items-center gap-2 text-[13.5px] text-ink"><span className="grid h-5 w-5 place-items-center rounded-full bg-sky-100 text-[11px] font-bold text-sky-700">{i + 1}</span>{m.name}{m.by_day != null && <span className="text-sage-500">· by day {m.by_day}</span>}</p>
            ))}
        </div>
      </Card>

      <Card>
        <SectionHeader title="Warning signs & escalation" sub="From the approved pathway — non-editable safety content." />
        <ul className="mt-3 space-y-1.5">
          {(draft.warning_signs ?? []).map((w, i) => (
            <li key={i} className="flex items-start gap-2 text-[13.5px] text-ink"><span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${w.severity === "urgent" ? "bg-coral-500" : "bg-warn-500"}`} />{w.text}</li>
          ))}
        </ul>
        <div className="mt-3 rounded-xl bg-mist-100 px-3.5 py-2.5 text-[12.5px] text-sage-700 ring-1 ring-ink/[0.04]">
          Routine → <span className="font-semibold text-ink">{draft.escalation?.routine}</span> · Urgent → <span className="font-semibold text-ink">{draft.escalation?.urgent}</span> · Emergency → <span className="font-semibold text-ink">{draft.escalation?.emergency}</span>
        </div>
      </Card>

      {/* activation confirmation summary */}
      {confirmActivate && !activated && (
        <Card className="ring-sky-300">
          <SectionHeader title="Approve & activate this care plan?" sub="This becomes the live plan the home team follows. It can be re-run safely and preserves earlier versions." />
          <ul className="mt-3 grid gap-1.5 text-[13px] text-ink sm:grid-cols-2">
            <li>💊 {medCount} medicine{medCount === 1 ? "" : "s"}</li>
            <li>✅ {taskCount} daily / therapy task{taskCount === 1 ? "" : "s"}</li>
            <li>📈 {obsCount} monitoring parameter{obsCount === 1 ? "" : "s"}</li>
            <li>🍽 {dietCount} diet instruction{dietCount === 1 ? "" : "s"}</li>
          </ul>
          <div className="mt-4 flex flex-wrap gap-3">
            <PrimaryButton onClick={activate} disabled={busy === "activate"}>{busy === "activate" ? "Activating…" : "Confirm — activate care plan"}</PrimaryButton>
            <GhostButton onClick={() => setConfirmActivate(false)} disabled={busy === "activate"}>Cancel</GhostButton>
          </div>
        </Card>
      )}

      {/* actions */}
      <div className="sticky bottom-3 flex flex-wrap items-center gap-3 rounded-2xl bg-white/90 p-3 shadow-card ring-1 ring-ink/[0.06] backdrop-blur">
        {activated ? (
          <>
            <PrimaryButton onClick={onExit}>Back to caseload</PrimaryButton>
            <GhostButton onClick={onRegeneratePrompt}>Amend (new version)</GhostButton>
          </>
        ) : (
          <>
            <GhostButton onClick={onRegeneratePrompt} disabled={!!busy}>Regenerate</GhostButton>
            <div className="flex-1" />
            {savedNote && <span className="text-[12.5px] font-semibold text-good-600">{savedNote} ✓</span>}
            <GhostButton onClick={() => persist(false)} disabled={!!busy}>{busy === "save" ? "Saving…" : "Save draft"}</GhostButton>
            {!approved && <GhostButton onClick={() => persist(true)} disabled={!!busy}>{busy === "approve" ? "Approving…" : "Approve (no activation)"}</GhostButton>}
            <PrimaryButton onClick={() => setConfirmActivate(true)} disabled={!!busy}>Approve &amp; activate care plan</PrimaryButton>
          </>
        )}
      </div>
    </div>
  );
}

/* --------------------------- small review helpers ------------------------- */

function moduleLabel(key: string): string {
  return key.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function FactListCard({ title, rows, empty }: { title: string; rows: PlanFact[]; empty: string }) {
  return (
    <Card>
      <h3 className="font-display text-[15px] font-semibold text-ink">{title}</h3>
      <div className="mt-2.5 space-y-1.5">
        {rows.length === 0 ? <span className="text-[13px] text-sage-500">{empty}</span> :
          rows.map((r, i) => (
            <p key={i} className="flex items-start gap-2 text-[13.5px] text-ink"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-400" />{r.text} <ProvChip p={r.provenance} /></p>
          ))}
      </div>
    </Card>
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
    <Card>
      <SectionHeader title={title} sub={subtitle} action={editing ? (
        <button type="button" onClick={() => onChange([...rows, blank])} className="text-[12.5px] font-semibold text-sky-700 hover:text-sky-800">+ Add</button>
      ) : undefined} />
      <div className="mt-3 space-y-2">
        {rows.length === 0 && <span className="text-[13px] text-sage-500">{empty}</span>}
        {rows.map((r, i) => (
          <div key={i} className="flex items-start gap-2 rounded-xl bg-white px-1 py-1">
            <div className="min-w-0 flex-1">{editing ? editor(r, (v) => onChange(rows.map((x, j) => (j === i ? v : x)))) : render(r)}</div>
            {editing && <button type="button" onClick={() => onChange(rows.filter((_, j) => j !== i))} className="shrink-0 rounded-lg px-2 py-1 text-[12px] font-semibold text-sage-500 hover:text-coral-600" aria-label="Remove">Remove</button>}
          </div>
        ))}
      </div>
    </Card>
  );
}

function EditableTaskCard({ title, editing, rows, onChange }: {
  title: string; editing: boolean; rows: PlanTask[]; onChange: (rows: PlanTask[]) => void;
}) {
  return (
    <Card>
      <SectionHeader title={title} action={editing ? (
        <button type="button" onClick={() => onChange([...rows, { time_label: "08:00", discipline: "General care", title: "", detail: "", provenance: "doctor" }])} className="text-[12.5px] font-semibold text-sky-700 hover:text-sky-800">+ Add task</button>
      ) : undefined} />
      <div className="mt-3 space-y-2">
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
                <ProvChip p={t.provenance} />
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
