/*
 * Where a compiled programme becomes care.
 *
 * The compiler proposes; a clinician decides. This screen exists so that
 * decision is a real one: every activity states WHERE IT CAME FROM, the
 * clinician can drop anything they do not want, and only then does the treating
 * doctor approve. Until that moment the patient sees nothing — a draft
 * materialises no scheduled care and a household account cannot even read it.
 *
 * Nothing here is specialty-aware. It lists whatever activities the programme
 * contains, grouped by what kind of care they are.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  approvePatientProgramme, compileCarePlan, getPatientProgrammes, reviseProgrammeDraft,
  type PatientProgrammeRow,
} from "../../lib/db";
import {
  BASIS_LABEL, validateCareActivities,
  type ActivityBasis, type CareActivity,
} from "../../domain/careActivityModel";
import { scheduleLabel } from "../patient/care/CareShell";
import {
  Card, ErrorNote, GhostButton, PrimaryButton, SectionHeader, Skeleton,
} from "../../components/system";

const BASIS_TONE: Record<ActivityBasis, string> = {
  document: "bg-good-100 text-good-700",
  provider_default: "bg-mist-100 text-sage-600",
  ai_suggested: "bg-warn-100 text-warn-600",
};

/** Grouped by the interaction, which is what keeps this free of specialties. */
const GROUPS: { title: string; types: string[] }[] = [
  { title: "Medicines", types: ["dose"] },
  { title: "Therapy and exercises", types: ["exercise"] },
  { title: "Feeding and fluids", types: ["intake"] },
  { title: "Daily care", types: ["task"] },
  { title: "What the family records", types: ["measurement", "observation", "symptom"] },
  { title: "Things to read", types: ["education"] },
];

export default function ProgrammeReview({ patientId }: { patientId: string }) {
  const [rows, setRows] = useState<PatientProgrammeRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"compile" | "approve" | null>(null);
  const [dropped, setDropped] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    try {
      setRows(await getPatientProgrammes(patientId));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the care programme.");
      setRows([]);
    }
  }, [patientId]);

  useEffect(() => { void load(); }, [load]);

  const approved = rows?.find((r) => r.status === "approved") ?? null;
  const draft = rows?.find((r) => r.status === "draft") ?? null;

  const draftActivities: CareActivity[] = useMemo(() => {
    if (!draft) return [];
    const r = validateCareActivities(draft.activities);
    return r.ok ? r.activities : [];
  }, [draft]);

  const kept = draftActivities.filter((a) => !dropped.has(a.key));

  const compile = async () => {
    setBusy("compile"); setError(null);
    try {
      await compileCarePlan(patientId);
      setDropped(new Set());
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not compile a programme.");
    } finally {
      setBusy(null);
    }
  };

  const approve = async () => {
    if (!draft) return;
    setBusy("approve"); setError(null);
    try {
      // Save the clinician's edits first, so what is approved is what they read.
      if (dropped.size > 0) {
        const keptKeys = new Set(kept.map((a) => a.key));
        const raw = (draft.activities as Record<string, unknown>[]).filter((a) => keptKeys.has(String(a.key)));
        await reviseProgrammeDraft(
          draft.id,
          raw,
          draft.quick_records.filter((k) => keptKeys.has(k)),
        );
      }
      await approvePatientProgramme(draft.id, note.trim() || undefined);
      setDropped(new Set());
      setNote("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not approve the programme.");
    } finally {
      setBusy(null);
    }
  };

  if (rows === null) return <Card><Skeleton className="h-28" /></Card>;

  const compiledFrom = (draft?.compiled_from ?? {}) as Record<string, unknown>;
  const notes = Array.isArray(compiledFrom.notes_for_clinician)
    ? (compiledFrom.notes_for_clinician as string[]) : [];

  return (
    <Card>
      <SectionHeader
        title="Care programme"
        sub={
          approved
            ? "This patient is following the programme below. Compiling again creates a new version to review."
            : "Compile a candidate programme from this patient's records, the provider's approved service and the clinical domain's knowledge. Nothing reaches the family until you approve it."
        }
        action={
          approved ? (
            <span className="rounded-full bg-good-100 px-2.5 py-1 text-[12px] font-semibold text-good-700">
              Approved v{approved.version}
            </span>
          ) : undefined
        }
      />

      {error && <div className="mt-4"><ErrorNote>{error}</ErrorNote></div>}

      {/* ---------------------------- the draft ---------------------------- */}
      {draft && (
        <div className="mt-5 rounded-2xl border border-warn-500/25 bg-warn-50/40 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-display text-[16px] font-semibold text-ink">
              Draft v{draft.version} — awaiting your approval
            </p>
            <span className="text-[12.5px] text-sage-600">
              {kept.length} of {draftActivities.length} activities selected
            </span>
          </div>
          <p className="mt-1 text-[13px] leading-relaxed text-sage-600">
            The patient cannot see this and no care is scheduled from it. Uncheck anything you do not
            want; what you approve is what the family will follow.
          </p>

          {compiledFrom.clinical_domain != null && (
            <p className="mt-2 text-[12px] text-sage-500">
              Compiled from {String(compiledFrom.clinical_domain)}
              {compiledFrom.knowledge_pack_version != null && ` knowledge v${String(compiledFrom.knowledge_pack_version)}`}
              {compiledFrom.had_patient_facts === true
                ? ", and this patient's own records"
                : ", with no extracted patient records"}
              {draft.ai_model ? ` · drafted by ${draft.ai_model}` : " · no model was used"}.
            </p>
          )}

          {notes.length > 0 && (
            <ul className="mt-3 space-y-1">
              {notes.map((n, i) => (
                <li key={i} className="text-[13px] leading-relaxed text-sage-700">— {n}</li>
              ))}
            </ul>
          )}

          <div className="mt-4 space-y-4">
            {GROUPS.map((g) => {
              const items = draftActivities.filter((a) => g.types.includes(a.activityType));
              if (items.length === 0) return null;
              return (
                <div key={g.title}>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-sage-500">{g.title}</p>
                  <ul className="mt-1.5 space-y-1.5">
                    {items.map((a) => {
                      const on = !dropped.has(a.key);
                      return (
                        <li key={a.key} className="rounded-xl bg-white p-3 ring-1 ring-ink/[0.05]">
                          <label className="flex items-start gap-3">
                            <input
                              type="checkbox"
                              checked={on}
                              onChange={() =>
                                setDropped((prev) => {
                                  const next = new Set(prev);
                                  if (on) next.add(a.key);
                                  else next.delete(a.key);
                                  return next;
                                })
                              }
                              className="mt-1 h-5 w-5 shrink-0 rounded border-line text-sky-600"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="flex flex-wrap items-center gap-2">
                                <span className={`text-[14.5px] font-semibold ${on ? "text-ink" : "text-sage-400 line-through"}`}>
                                  {a.title}
                                </span>
                                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${BASIS_TONE[a.basis]}`}>
                                  {BASIS_LABEL[a.basis]}
                                </span>
                              </span>
                              {a.instructions && (
                                <span className="mt-1 block text-[13px] leading-relaxed text-sage-600">{a.instructions}</span>
                              )}
                              <span className="mt-1 block text-[12px] text-sage-500">
                                {scheduleLabel(a)}
                                {a.rationale ? ` · ${a.rationale}` : ""}
                              </span>
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>

          <label className="mt-5 block">
            <span className="mb-1.5 block text-[12.5px] font-semibold text-sage-600">
              Approval note (optional — kept with the record)
            </span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Reviewed against the discharge summary; swallow activities removed."
              className="w-full rounded-xl bg-white px-3.5 py-2.5 text-[14px] text-ink ring-1 ring-ink/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
            />
          </label>

          <div className="mt-4 flex flex-wrap gap-2">
            <PrimaryButton onClick={approve} disabled={busy !== null || kept.length === 0}>
              {busy === "approve" ? "Approving…" : `Approve ${kept.length} activit${kept.length === 1 ? "y" : "ies"}`}
            </PrimaryButton>
            <GhostButton onClick={compile} disabled={busy !== null}>
              {busy === "compile" ? "Compiling…" : "Compile again"}
            </GhostButton>
          </div>
          {kept.length === 0 && (
            <p className="mt-2 text-[12.5px] text-sage-500">
              Select at least one activity, or compile again.
            </p>
          )}
        </div>
      )}

      {/* --------------------------- what is live -------------------------- */}
      {approved && (
        <div className="mt-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-sage-500">
            What the family is following
          </p>
          <ApprovedSummary programme={approved} />
        </div>
      )}

      {!draft && !approved && (
        <div className="mt-5">
          <PrimaryButton onClick={compile} disabled={busy !== null}>
            {busy === "compile" ? "Compiling…" : "Compile a care programme"}
          </PrimaryButton>
        </div>
      )}

      {!draft && approved && (
        <div className="mt-4">
          <GhostButton onClick={compile} disabled={busy !== null}>
            {busy === "compile" ? "Compiling…" : "Compile a new version"}
          </GhostButton>
        </div>
      )}
    </Card>
  );
}

function ApprovedSummary({ programme }: { programme: PatientProgrammeRow }) {
  const result = validateCareActivities(programme.activities);
  const activities = result.ok ? result.activities : [];
  return (
    <>
      <p className="mt-1 text-[13px] text-sage-600">
        {activities.length} {activities.length === 1 ? "activity" : "activities"}
        {programme.approved_at &&
          ` · approved ${new Date(programme.approved_at).toLocaleDateString([], { day: "numeric", month: "long", year: "numeric" })}`}
      </p>
      {programme.approval_note && (
        <p className="mt-1 text-[13px] italic text-sage-600">&ldquo;{programme.approval_note}&rdquo;</p>
      )}
      <ul className="mt-3 space-y-1.5">
        {activities.map((a) => (
          <li key={a.key} className="flex flex-wrap items-baseline gap-x-2 text-[13.5px]">
            <span className="font-medium text-ink">{a.title}</span>
            <span className="text-[12px] text-sage-500">{scheduleLabel(a)}</span>
            <span className={`rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold ${BASIS_TONE[a.basis]}`}>
              {BASIS_LABEL[a.basis]}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}
