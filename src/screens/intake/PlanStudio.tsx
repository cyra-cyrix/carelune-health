import { useEffect, useState } from "react";
import {
  getPatient, getPackPathways, approvePathwayVersion, assignGoverningVersion,
  extractFacts, hasDocumentFacts, getPlanIntake, savePlanIntake, generatePlan,
  getPatientPlan, savePlan,
  type PatientRow, type PackPathway, type PlanIntake, type PatientPlanRow,
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
 *   prepare (approve the pathway version · extract document facts · three answers)
 *   → generate a governed, server-validated DRAFT
 *   → review workspace (edit · save draft · approve). A draft never activates care.
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
          {plan && <Chip tone={plan.status === "approved" ? "good" : "warn"}>{plan.status === "approved" ? "Approved draft" : "Draft"}</Chip>}
        </div>
        <p className="mt-1 text-[14px] text-sage-500">
          {(patient?.diagnosis?.length ? patient.diagnosis.join(", ") : "Diagnosis set from the discharge summary")} · governed AI draft — you edit and approve everything.
        </p>

        {error && <div className="mt-4"><ErrorNote>{error}</ErrorNote></div>}

        <div className="mt-5">
          {plan ? (
            <PlanReview
              plan={plan}
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

  const [dischargeText, setDischargeText] = useState("");
  const [factsReady, setFactsReady] = useState(false);

  const [intake, setIntake] = useState<PlanIntake>({ milestone_goal: "", milestone_by: "", monitor_focus: "", non_negotiables: "" });

  useEffect(() => {
    if (!patient?.pathway_pack_id) { setPathways([]); return; }
    void getPackPathways(patient.pathway_pack_id).then(setPathways).catch(() => setPathways([]));
    void hasDocumentFacts(patient.id).then(setFactsReady);
    void getPlanIntake(patient.id).then((i) => { if (i) setIntake(i); });
  }, [patient?.id, patient?.pathway_pack_id]);

  if (!patient?.pathway_pack_id) {
    return <Card><p className="text-[13.5px] text-sage-600">Assign a clinical pathway in patient setup first, then return here to build the plan.</p></Card>;
  }

  const governing = patient.pathway_version_id;
  const chosen = pathways?.find((p) => p.version_id === governing) ?? null;

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
    try {
      await assignGoverningVersion(patient.id, p.version_id);
      await onPatientChanged();
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not set the governing version."); }
    finally { setBusy(null); }
  };

  const extract = async () => {
    setBusy("facts"); setErr(null);
    try {
      await extractFacts(patient.id, dischargeText);
      setFactsReady(true);
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not extract facts."); }
    finally { setBusy(null); }
  };

  const questionsFilled = intake.milestone_goal.trim() && intake.monitor_focus.trim() && intake.non_negotiables.trim();
  const canGenerate = !!governing && factsReady && questionsFilled && !busy;

  const generate = async () => {
    setBusy("generate"); setErr(null);
    try {
      await savePlanIntake(patient.id, intake);
      const res = await generatePlan(patient.id);
      const pl = await getPatientPlan(patient.id);
      if (pl) onGenerated(pl);
      else if (!res.validation.ok) setErr("The draft did not pass validation. Please try again.");
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not generate the plan."); }
    finally { setBusy(null); }
  };

  return (
    <div className="space-y-5">
      {err && <ErrorNote>{err}</ErrorNote>}

      {/* 1 · pathway version approval */}
      <Card>
        <SectionHeader title="1 · Clinical pathway version" sub="A patient plan may only be generated from a pathway version your institution has clinically approved. Draft/review templates are not national standards." />
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
                      <PrimaryButton onClick={() => approve(p)} disabled={busy === `approve:${p.pathway_id}`}>
                        {busy === `approve:${p.pathway_id}` ? "Approving…" : "Approve for our institution"}
                      </PrimaryButton>
                    ) : !isGoverning ? (
                      <PrimaryButton onClick={() => useVersion(p)} disabled={busy === `use:${p.pathway_id}`}>
                        {busy === `use:${p.pathway_id}` ? "Setting…" : "Use for this patient"}
                      </PrimaryButton>
                    ) : (
                      <span className="text-[12.5px] font-semibold text-good-600">✓ Ready to generate</span>
                    )}
                  </div>
                </div>
              );
            })
          )}
          {chosen && <p className="text-[11.5px] text-sage-500">Institutional clinical approval recorded — the platform template itself is unchanged.</p>}
        </div>
      </Card>

      {/* 2 · documents / facts */}
      <Card>
        <SectionHeader title="2 · Discharge facts" sub="Paste the discharge summary text. Facts are extracted once and reused — the pathway is never resent." />
        <div className="mt-4 space-y-3">
          {factsReady && (
            <p className="rounded-xl bg-good-100 px-3.5 py-2 text-[12.5px] font-semibold text-good-600 ring-1 ring-good-500/20">
              ✓ Document facts extracted. Re-extract below if you upload a newer summary.
            </p>
          )}
          <Field label="Discharge summary text">
            <textarea value={dischargeText} onChange={(e) => setDischargeText(e.target.value)} rows={6} placeholder="Paste the discharge summary here (the uploaded documents are on the patient record)…" className={`${inputCls} resize-y font-mono text-[13px]`} />
          </Field>
          <p className="text-[11.5px] text-sage-500">Sent to the extraction service; the family consented at registration. Not de-identified — for synthetic data only.</p>
          <PrimaryButton onClick={extract} disabled={busy === "facts" || dischargeText.trim().length < 20}>
            {busy === "facts" ? "Extracting…" : factsReady ? "Re-extract facts" : "Extract facts"}
          </PrimaryButton>
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
          {!governing ? "Approve & choose a pathway version first." : !factsReady ? "Extract the discharge facts." : !questionsFilled ? "Answer the three questions." : "Ready to generate a governed draft."}
        </p>
        <PrimaryButton onClick={generate} disabled={!canGenerate}>
          {busy === "generate" ? "Generating draft…" : "Generate plan draft"}
        </PrimaryButton>
      </div>
    </div>
  );
}

/* ------------------------------- review ----------------------------------- */

function PlanReview({
  plan, onRegeneratePrompt, onSaved,
}: {
  plan: PatientPlanRow;
  onRegeneratePrompt: () => void;
  onSaved: (p: PatientPlanRow) => void;
}) {
  const [draft, setDraft] = useState<PlanDraft>(plan.content);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<"save" | "approve" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const approved = plan.status === "approved";

  const persist = async (approve: boolean) => {
    setBusy(approve ? "approve" : "save"); setErr(null); setSavedNote(null);
    try {
      await savePlan(plan.id, draft, approve);
      onSaved({ ...plan, content: draft, status: approve ? "approved" : "draft" });
      setSavedNote(approve ? "Approved" : "Draft saved");
      setEditing(false);
      setTimeout(() => setSavedNote(null), 2000);
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not save."); }
    finally { setBusy(null); }
  };

  const facts = draft.diagnosis ?? [];
  return (
    <div className="space-y-4">
      {/* AI/governance banner */}
      <div className="rounded-2xl bg-sky-50 p-4 ring-1 ring-sky-200">
        <p className="text-[13px] leading-relaxed text-sky-900">
          <span className="font-semibold">Governed draft — you decide.</span> Medicines, diagnoses and restrictions are copied from the
          discharge documents or your instructions (never invented); monitoring, warning signs and escalation come from the approved
          pathway. Nothing here is active care until you approve — and approval does not switch on the daily plan by itself.
        </p>
      </div>

      {err && <ErrorNote>{err}</ErrorNote>}

      {/* missing / conflicts */}
      {(draft.missing?.length || draft.conflicts?.length) ? (
        <Card className="!bg-warn-100/50 ring-warn-500/20">
          <SectionHeader title="Needs your attention" sub="The AI flagged gaps or conflicts rather than guessing." />
          <div className="mt-3 space-y-2">
            {draft.conflicts?.map((c, i) => (
              <p key={`c${i}`} className="flex gap-2 text-[13px] text-ink"><span className="font-semibold text-coral-600">Conflict:</span> {c}</p>
            ))}
            {draft.missing?.map((m, i) => (
              <p key={`m${i}`} className="flex gap-2 text-[13px] text-ink"><span className="font-semibold text-warn-600">Missing:</span> {m}</p>
            ))}
          </div>
        </Card>
      ) : null}

      {/* summary + diagnosis */}
      <Card>
        <SectionHeader
          title="Patient & diagnosis"
          action={approved ? <Chip tone="good">Approved</Chip> : (
            <button type="button" onClick={() => setEditing((v) => !v)} className="text-[12.5px] font-semibold text-sky-700 hover:text-sky-800">
              {editing ? "Done editing" : "Edit"}
            </button>
          )}
        />
        {editing ? (
          <textarea value={draft.clinical_summary} onChange={(e) => setDraft({ ...draft, clinical_summary: e.target.value })} rows={2} className={`${inputCls} mt-3 resize-y`} />
        ) : (
          <p className="mt-3 text-[14px] leading-relaxed text-ink">{draft.clinical_summary || "—"}</p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          {facts.length === 0 ? <span className="text-[13px] text-sage-500">No diagnosis captured.</span> :
            facts.map((d, i) => (
              <span key={i} className="inline-flex items-center gap-1.5 rounded-full bg-mist-100 px-3 py-1 text-[12.5px] text-ink ring-1 ring-ink/[0.05]">
                {d.text} <ProvChip p={d.provenance} />
              </span>
            ))}
        </div>
        {draft.procedure?.text && (
          <p className="mt-2 text-[13px] text-sage-700">Procedure: <span className="font-semibold text-ink">{draft.procedure.text}</span> <ProvChip p={draft.procedure.provenance} /></p>
        )}
      </Card>

      {/* medicines */}
      <EditableFactCard
        title="Medicines" subtitle="Copied exactly from the discharge documents — verify before approving."
        editing={editing}
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

      {/* daily monitoring (pathway-governed, read-only) */}
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

      {/* mobility / physiotherapy + daily tasks */}
      <EditableTaskCard title="Mobility, physiotherapy & daily tasks" editing={editing}
        rows={[...(draft.daily_tasks ?? []), ...(draft.therapy_tasks ?? [])]}
        onChange={(rows) => setDraft({ ...draft, daily_tasks: rows, therapy_tasks: [] })}
      />

      {/* diet + precautions */}
      <div className="grid gap-4 sm:grid-cols-2">
        <FactListCard title="Diet" rows={draft.diet ?? []} empty="No diet instructions." />
        <FactListCard title="Safety boundaries & precautions" rows={draft.precautions ?? []} empty="No precautions captured." />
      </div>

      {/* milestones */}
      <Card>
        <SectionHeader title="Milestones" sub="Pathway targets plus your stated goal." />
        <div className="mt-3 space-y-1.5">
          {(draft.milestones ?? []).length === 0 ? <span className="text-[13px] text-sage-500">No milestones.</span> :
            draft.milestones.map((m, i) => (
              <p key={i} className="flex items-center gap-2 text-[13.5px] text-ink">
                <span className="grid h-5 w-5 place-items-center rounded-full bg-sky-100 text-[11px] font-bold text-sky-700">{i + 1}</span>
                {m.name}{m.by_day != null && <span className="text-sage-500">· by day {m.by_day}</span>}
              </p>
            ))}
        </div>
      </Card>

      {/* warning signs + escalation */}
      <Card>
        <SectionHeader title="Warning signs & escalation" sub="From the approved pathway — non-editable safety content." />
        <ul className="mt-3 space-y-1.5">
          {(draft.warning_signs ?? []).map((w, i) => (
            <li key={i} className="flex items-start gap-2 text-[13.5px] text-ink">
              <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${w.severity === "urgent" ? "bg-coral-500" : "bg-warn-500"}`} />
              {w.text}
            </li>
          ))}
        </ul>
        <div className="mt-3 rounded-xl bg-mist-100 px-3.5 py-2.5 text-[12.5px] text-sage-700 ring-1 ring-ink/[0.04]">
          Routine → <span className="font-semibold text-ink">{draft.escalation?.routine}</span> · Urgent → <span className="font-semibold text-ink">{draft.escalation?.urgent}</span> · Emergency → <span className="font-semibold text-ink">{draft.escalation?.emergency}</span>
        </div>
      </Card>

      {/* actions */}
      <div className="sticky bottom-3 flex flex-wrap items-center gap-3 rounded-2xl bg-white/90 p-3 shadow-card ring-1 ring-ink/[0.06] backdrop-blur">
        <GhostButton onClick={onRegeneratePrompt} disabled={!!busy}>Regenerate</GhostButton>
        <div className="flex-1" />
        {savedNote && <span className="text-[12.5px] font-semibold text-good-600">{savedNote} ✓</span>}
        {!approved && <GhostButton onClick={() => persist(false)} disabled={!!busy}>{busy === "save" ? "Saving…" : "Save draft"}</GhostButton>}
        {!approved && <PrimaryButton onClick={() => persist(true)} disabled={!!busy}>{busy === "approve" ? "Approving…" : "Approve plan"}</PrimaryButton>}
        {approved && <Chip tone="good">Approved — activation is the next step</Chip>}
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
            <div className="min-w-0 flex-1">
              {editing ? editor(r, (v) => onChange(rows.map((x, j) => (j === i ? v : x)))) : render(r)}
            </div>
            {editing && (
              <button type="button" onClick={() => onChange(rows.filter((_, j) => j !== i))} className="shrink-0 rounded-lg px-2 py-1 text-[12px] font-semibold text-sage-500 hover:text-coral-600" aria-label="Remove">Remove</button>
            )}
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
