import { useEffect, useRef, useState } from "react";
import {
  getPatient, extractFacts, getPatientDocuments, uploadPatientDocument,
  savePlanIntake, generatePlan, getPatientPlan, savePlan, activateCarePlan,
  type PatientRow, type PatientPlanRow, type DocumentRow,
} from "../../lib/db";
import { acceptAllProposed, acceptProposed, listProposed, removeProposed } from "../../lib/pathwayValidation";
import type { PlanDraft, PlanFact, PlanMedicine, PlanTask } from "../../lib/pathwayValidation";
import {
  Field, inputCls, PrimaryButton, GhostButton, ErrorNote, Skeleton,
} from "../../components/system";
import {
  Panel, SectionLabel, StatusTag, JourneySteps, ProvenanceTag, Reveal, type JourneyState,
} from "../../components/clinical";
import { useBranding } from "../../branding/BrandingProvider";

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
            <button type="button" onClick={onExit} className="tap inline-flex min-h-[44px] items-center pr-3 text-[13px] font-semibold text-haze-300 hover:text-haze-100">← Back to caseload</button>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0">
                <SectionLabel onDark>AI Plan Studio</SectionLabel>
                <h1 className="mt-1.5 font-display text-[24px] font-semibold tracking-[-0.02em] text-haze-100">
                  Recovery plan · {patient?.full_name ?? "…"}
                </h1>
                <p className="mt-1 max-w-2xl text-[13.5px] text-haze-300">
                  Drafted from this patient&rsquo;s discharge document against international recovery
                  standards. Diagnoses and medicines are copied, never invented. You edit and approve
                  everything — nothing reaches the family until you activate it.
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
          <PlanReview plan={plan} patient={patient} onExit={onExit} onRegeneratePrompt={() => setPlan(null)} onSaved={(pl) => setPlan(pl)} />
        ) : (
          <PreparePanel patient={patient} onPatientChanged={refreshPatient} onGenerated={(pl) => setPlan(pl)} />
        )}
      </div>
    </div>
  );
}

/* =============================== PREPARE ================================== */

/**
 * PREPARE — the whole of the doctor's work before a plan exists.
 *
 * This replaced a four-gate screen (choose an approved pathway · approve it for
 * the institution · read the document · answer three questions) that stood
 * between a doctor and a draft. None of those gates were about *this* patient.
 * What remains is: the document, an optional note, one button.
 *
 * Reading the document and drafting the programme are one action now — the
 * doctor should not have to know that extraction is a separate step.
 */
function PreparePanel({
  patient, onPatientChanged, onGenerated,
}: {
  patient: PatientRow | null;
  onPatientChanged: () => Promise<void> | void;
  onGenerated: (p: PatientPlanRow) => void;
}) {
  const [docs, setDocs] = useState<DocumentRow[] | null>(null);
  const [docId, setDocId] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [pasted, setPasted] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!patient) return;
    void getPatientDocuments(patient.id)
      .then((d) => { setDocs(d); if (d[0]) setDocId(d[0].id); })
      .catch(() => setDocs([]));
  }, [patient?.id]);

  /*
   * The document was already provided during patient setup, so asking for it a
   * second time was a screen that existed only to hold a button. When a document
   * is present we draft immediately and the doctor lands on the plan itself.
   * The ref guard means a failed attempt is not retried in a loop — the doctor
   * gets the error and an explicit retry instead.
   */
  const autoDrafted = useRef(false);
  useEffect(() => {
    if (!patient || docs === null || autoDrafted.current) return;
    if (docs.length > 0 && docId) { autoDrafted.current = true; void run(); }
  }, [patient?.id, docs, docId]);

  /*
   * Uploading lives on THIS screen. It used to be a different page, which meant a
   * doctor holding a discharge sheet had to leave the drafting screen, upload, and
   * come back. Photographs are first-class: extract-facts reads JPG/PNG with the
   * vision model, which is the common case when the sheet is paper.
   */
  const onFile = async (file: File | undefined) => {
    if (!file || !patient) return;
    setUploading(true); setErr(null);
    try {
      const row = await uploadPatientDocument(patient.id, file, "discharge_summary");
      setDocs((xs) => [row, ...(xs ?? [])]);
      setDocId(row.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not upload that file.");
    } finally { setUploading(false); }
  };

  const hasSource = !!docId || pasted.trim().length > 40;

  const run = async () => {
    if (!patient || !hasSource) return;
    setBusy(true); setErr(null); setStep(1);
    try {
      // The doctor's note is saved as a non-negotiable instruction, so it reaches
      // the model as `doctor` provenance rather than being lost.
      if (note.trim()) {
        await savePlanIntake(patient.id, {
          milestone_goal: "", milestone_by: "", monitor_focus: "", non_negotiables: note.trim(),
        });
      }
      await extractFacts(patient.id, docId ? { documentId: docId } : { dischargeText: pasted.trim() });
      setStep(2);
      const generated = await generatePlan(patient.id);
      setStep(3);
      await onPatientChanged();
      const saved = await getPatientPlan(patient.id);
      if (saved) onGenerated(saved);
      else if (generated) onGenerated(generated as unknown as PatientPlanRow);
      // Without this the screen would sit on the progress steps for ever.
      else setErr("The draft was generated but could not be loaded. Try again.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not draft the programme.");
      setStep(0);
    } finally { setBusy(false); }
  };

  const journey: { label: string; caption: string; state: JourneyState }[] = [
    { label: "Reading the discharge document", caption: "Diagnoses, medicines, restrictions", state: step > 1 ? "done" : step === 1 ? "active" : "idle" },
    { label: "Designing the recovery programme", caption: "Targets, exercise, diet, wound care, monitoring", state: step > 2 ? "done" : step === 2 ? "active" : "idle" },
    { label: "Ready for your review", caption: "You edit and approve everything", state: step > 2 ? "done" : "idle" },
  ];

  const drafting = busy || (docs !== null && docs.length > 0 && !err);

  if (drafting) {
    return (
      <div className="mx-auto max-w-[560px]">
        <Panel label="Working" title="Drafting the recovery programme">
          <p className="-mt-2 mb-4 text-[13px] leading-relaxed text-sage-600">
            Reading {docs?.find((d) => d.id === docId)?.file_name ?? "the discharge document"} and
            building a 30-day programme — targets, exercise, diet, medicines, wound care and what to
            monitor, each with dates.
          </p>
          <JourneySteps steps={journey} />
        </Panel>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[620px]">
      <Panel label="Needed" title="Add the discharge document">
        <p className="-mt-2 mb-4 text-[13px] leading-relaxed text-sage-600">
          Carelune drafts the recovery programme from it. A clear photo of the sheet works.
        </p>

        <input
          ref={fileRef}
          type="file"
          accept="application/pdf,image/jpeg,image/png"
          className="hidden"
          onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ""; }}
        />
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ""; }}
        />
        <div className="flex flex-wrap gap-2">
          <PrimaryButton onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? "Uploading…" : "Upload PDF or photo"}
          </PrimaryButton>
          <GhostButton onClick={() => cameraRef.current?.click()} disabled={uploading}>Take a photo</GhostButton>
        </div>

        <details className="mt-3">
          <summary className="tap cursor-pointer list-none text-[12.5px] font-semibold text-sky-700 hover:text-sky-800">
            No file? Paste the text instead
          </summary>
          <div className="mt-2 space-y-3">
            <textarea
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              rows={7}
              placeholder="Paste the discharge summary text here…"
              className={`${inputCls} resize-y`}
              aria-label="Paste the discharge summary"
            />
            <Field label="Anything you want included? (optional)" hint="Carried through as a non-negotiable.">
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. No weight-bearing on the left leg for 3 weeks"
                className={inputCls}
              />
            </Field>
            <PrimaryButton onClick={run} disabled={!hasSource}>Draft from pasted text</PrimaryButton>
          </div>
        </details>

        {err && <div className="mt-4"><ErrorNote>{err}</ErrorNote></div>}
        {err && (
          <div className="mt-3">
            <GhostButton onClick={() => { autoDrafted.current = false; void run(); }} disabled={!hasSource}>
              Try again
            </GhostButton>
          </div>
        )}

        <p className="mt-4 border-t border-line pt-3 text-[11.5px] leading-relaxed text-sage-500">
          Drafted with reference to international continuing-care guidance — WHO Rehabilitation 2030,
          AHA/ASA stroke recovery, ERAS post-operative recovery, NICE rehabilitation, ACSM exercise
          prescription, ESPEN nutrition and WOCN/EWMA wound care. A draft for your clinical judgement,
          not a certified protocol. Diagnoses and medicines are copied from the document and never
          invented; anything Carelune proposes is marked for your approval.
        </p>
      </Panel>
    </div>
  );

}


const SECTION_LABEL: Record<string, string> = {
  diet: "Diet", precautions: "Safety boundaries", targets: "Recovery target",
  daily_tasks: "Daily task", therapy_tasks: "Exercise / therapy", wound_care: "Wound care",
};

const APPROVER_ROLE: Record<string, string> = {
  pmr: "Doctor", duty_doctor: "Duty doctor", nurse: "Nurse",
};

function PlanReview({
  plan, patient, onExit, onRegeneratePrompt, onSaved,
}: {
  plan: PatientPlanRow;
  patient: PatientRow | null;
  onExit: () => void;
  onRegeneratePrompt: () => void;
  onSaved: (p: PatientPlanRow) => void;
}) {
  // Approval is attributed to the signed-in account, not to a generic "doctor".
  // An institution admin signing in does not become the approving clinician.
  const { profile } = useBranding();
  const approverName = profile?.full_name?.trim() || "this account";
  const approverRole = profile?.is_admin && profile?.role !== "pmr" ? "Admin" : APPROVER_ROLE[profile?.role ?? ""] ?? "Staff";
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

  // Activation is a separate, deliberate step: it can only run on a plan that is
  // already approved, so approving and going live are never one ambiguous tap.
  const activate = async () => {
    setBusy("activate"); setErr(null);
    try {
      await activateCarePlan(plan.id);
      onExit();
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not activate the care plan."); setBusy(null); }
  };

  /*
   * docs/DECISIONS.md D-002, control 2. Every line the model PROPOSED (rather than
   * copied from the document) must be ruled on by the doctor before this plan can
   * become live care. Editing a proposed line re-marks it as the doctor's, which is
   * what clears it from this count.
   */
  const proposals = listProposed(draft);
  const unreviewed = proposals.length;

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

        {(draft.wound_care?.length ?? 0) > 0 && (
          <Reveal index={4}>
            <EditableTaskCard title="Wound & surgical site care" editing={editing}
              rows={draft.wound_care ?? []}
              onChange={(rows) => setDraft({ ...draft, wound_care: rows })}
            />
          </Reveal>
        )}

        {(draft.targets?.length ?? 0) > 0 && (
          <Reveal index={4}>
            <Panel label="Recovery" title="What we are aiming for">
              <ul className="space-y-2">
                {(draft.targets ?? []).map((t, i) => (
                  <li key={i} className="flex flex-wrap items-baseline gap-x-2 text-[13.5px] text-ink">
                    <span className="min-w-0">{t.text}</span>
                    {t.by_day != null && <span className="text-[12px] font-semibold text-sage-500">by day {t.by_day}</span>}
                    <ProvenanceTag p={t.provenance} />
                  </li>
                ))}
              </ul>
            </Panel>
          </Reveal>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {/* Diet is editable: a discharge summary that says nothing about diet
              used to leave a "Missing: diet" flag with no way to answer it. */}
          <Reveal index={5}>
            <EditableFactCard title="Diet" subtitle="Add what the document did not state — your entry is marked as yours." editing={editing}
              rows={draft.diet ?? []}
              render={(d) => (
                <span className="flex flex-wrap items-baseline gap-x-2 text-[13.5px] text-ink">
                  <span className="min-w-0">{d.text}</span>
                  <ProvenanceTag p={d.provenance} />
                </span>
              )}
              empty="No diet instructions."
              editor={(d, set) => (
                <input value={d.text} onChange={(e) => set({ ...d, text: e.target.value, provenance: "doctor" })}
                  placeholder="e.g. Soft diet, thickened fluids" className={`${inputCls} w-full`} />
              )}
              onChange={(rows) => setDraft({ ...draft, diet: rows as PlanFact[] })}
              blank={{ text: "", provenance: "doctor" } as PlanFact}
            />
          </Reveal>
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
              <p className="text-[13.5px] font-semibold text-ink">Activate this care plan?</p>
              {/* What is going live, for whom, under which pathway, and what it
                  changes — stated before the irreversible-feeling step. */}
              <dl className="mt-2.5 space-y-1.5 text-[12.5px]">
                <div className="flex gap-2">
                  <dt className="w-[74px] shrink-0 font-semibold text-sage-500">Patient</dt>
                  <dd className="min-w-0 flex-1 font-semibold text-ink">{patient?.full_name ?? "This patient"}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-[74px] shrink-0 font-semibold text-sage-500">Source</dt>
                  <dd className="min-w-0 flex-1 text-ink">This patient&rsquo;s discharge document, reviewed by you</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-[74px] shrink-0 font-semibold text-sage-500">Version</dt>
                  <dd className="min-w-0 flex-1 text-ink">v{plan.version}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-[74px] shrink-0 font-semibold text-sage-500">Effect</dt>
                  <dd className="min-w-0 flex-1 text-ink">
                    {medCount} medicine{medCount === 1 ? "" : "s"} and {taskCount} daily task{taskCount === 1 ? "" : "s"} become live care.
                    The family, caregiver, nurse and duty doctor start following this plan today. Earlier versions are preserved.
                  </dd>
                </div>
              </dl>
              {unreviewed > 0 && (
                <div className="mt-3 rounded-xl bg-warn-100 p-3.5 ring-1 ring-warn-500/25">
                  <p className="text-[12.5px] leading-relaxed text-ink">
                    <span className="font-semibold">
                      Carelune suggested {unreviewed} {unreviewed === 1 ? "line" : "lines"}
                    </span>{" "}
                    from standard recovery practice, because the discharge document did not cover
                    {unreviewed === 1 ? " it" : " them"}. Keep or remove each one — keeping makes it yours.
                  </p>
                  <ul className="mt-2.5 space-y-1.5">
                    {proposals.map((ref) => (
                      <li key={`${ref.section}-${ref.index}`} className="rounded-lg bg-white/70 px-2.5 py-2">
                        <p className="text-[12px] leading-snug text-ink">{ref.text || "(untitled)"}</p>
                        <p className="mt-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-sage-500">
                          {SECTION_LABEL[ref.section] ?? ref.section}
                        </p>
                        <div className="mt-1.5 flex gap-2">
                          <button
                            type="button"
                            onClick={() => setDraft(acceptProposed(draft, ref))}
                            className="tap rounded-lg bg-sky-600 px-2.5 py-1 text-[11.5px] font-semibold text-white hover:bg-sky-700"
                          >
                            Keep
                          </button>
                          <button
                            type="button"
                            onClick={() => setDraft(removeProposed(draft, ref))}
                            className="tap rounded-lg px-2.5 py-1 text-[11.5px] font-semibold text-sage-600 hover:text-ink"
                          >
                            Remove
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={() => setDraft(acceptAllProposed(draft))}
                    className="tap mt-2.5 text-[12px] font-semibold text-sky-700 hover:text-sky-800"
                  >
                    Keep all {unreviewed}
                  </button>
                  <p className="mt-2 text-[11px] leading-relaxed text-sage-600">
                    Save the plan after deciding, so your choices are recorded.
                  </p>
                </div>
              )}
              <div className="mt-3 space-y-2">
                <PrimaryButton onClick={activate} disabled={busy === "activate" || unreviewed > 0} className="w-full">{busy === "activate" ? "Activating…" : "Confirm — activate care plan"}</PrimaryButton>
                <GhostButton onClick={() => setConfirmActivate(false)} disabled={busy === "activate"} className="w-full">Cancel</GhostButton>
              </div>
            </div>
          ) : (
            <div className="mt-4">
              {activated ? (
                <div className="space-y-2">
                  <PrimaryButton onClick={onExit} className="w-full">Back to caseload</PrimaryButton>
                  <GhostButton onClick={onRegeneratePrompt} className="w-full">Amend (new version)</GhostButton>
                </div>
              ) : (
                <>
                  {savedNote && <p className="mb-2 text-center text-[12.5px] font-semibold text-brand-700">{savedNote} ✓</p>}

                  {/* Three distinct steps, never two look-alike buttons side by
                      side: keep working · record your clinical approval · make it
                      live. Activation is only offered once the plan is approved. */}
                  <ol className="space-y-2.5">
                    <li className="rounded-2xl border border-line bg-white p-3">
                      <p className="text-[13px] font-semibold text-ink">1 · Save draft</p>
                      <p className="mt-0.5 text-[12px] leading-relaxed text-sage-600">Keeps your edits. Nothing is approved and no care changes.</p>
                      <GhostButton onClick={() => persist(false)} disabled={!!busy} className="mt-2 w-full">{busy === "save" ? "Saving…" : "Save draft"}</GhostButton>
                    </li>

                    <li className={`rounded-2xl border p-3 ${approved ? "border-brand-200 bg-brand-50/50" : "border-line bg-white"}`}>
                      <p className="text-[13px] font-semibold text-ink">2 · Approve draft</p>
                      <p className="mt-0.5 text-[12px] leading-relaxed text-sage-600">
                        {approved
                          ? "Approved. The home team is not following it yet — activate it below."
                          : "Records your clinical approval of this version. Care is still not live."}
                      </p>
                      <p className="mt-1 text-[11.5px] text-sage-500">Recorded against {approverName} · {approverRole}.</p>
                      <GhostButton onClick={() => persist(true)} disabled={!!busy} className="mt-2 w-full">
                        {busy === "approve" ? "Approving…" : approved ? "Re-approve after edits" : "Approve draft"}
                      </GhostButton>
                    </li>

                    <li className={`rounded-2xl border p-3 ${approved ? "border-line bg-white" : "border-dashed border-line bg-mist/60"}`}>
                      <p className="text-[13px] font-semibold text-ink">3 · Activate plan</p>
                      <p className="mt-0.5 text-[12px] leading-relaxed text-sage-600">
                        {approved
                          ? "Makes this the live plan the home team follows from today."
                          : "Available once the draft is approved."}
                      </p>
                      <button
                        type="button"
                        onClick={() => setConfirmActivate(true)}
                        disabled={!!busy || !approved}
                        className="tap mt-2 w-full rounded-2xl bg-brand-800 px-4 py-3 text-[14px] font-semibold text-white shadow-sm transition-colors hover:bg-brand-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 disabled:opacity-40"
                      >
                        Activate care plan
                      </button>
                    </li>
                  </ol>

                  <button type="button" onClick={onRegeneratePrompt} disabled={!!busy} className="tap mt-3 w-full py-1 text-center text-[12.5px] font-semibold text-sage-500 hover:text-ink">Regenerate from sources</button>
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
