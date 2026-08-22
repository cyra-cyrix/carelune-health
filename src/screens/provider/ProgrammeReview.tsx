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
  approvePatientProgramme, compileCarePlan, getPatientProgrammes, getSubscription,
  reviseProgrammeDraft,
  type PatientProgrammeRow, type SubscriptionRow,
} from "../../lib/db";
import {
  BASIS_LABEL, validateCareActivities,
  type ActivityBasis, type CareActivity,
} from "../../domain/careActivityModel";
import { countByBasis, evidenceFor, type CompiledFrom } from "../../domain/programmeEvidence";
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
  /* Whether this patient is on a service programme at all. A legacy recovery
     patient is not, and the compiler refuses them — so rather than offer an
     action that cannot work, this renders nothing for them and their cockpit is
     exactly what it was. */
  const [sub, setSub] = useState<SubscriptionRow | null | undefined>(undefined);
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
  useEffect(() => {
    let active = true;
    void getSubscription(patientId)
      .then((s) => { if (active) setSub(s); })
      .catch(() => { if (active) setSub(null); });
    return () => { active = false; };
  }, [patientId]);

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

  // Not a service enrolment -> not this card's patient. Nothing is rendered,
  // exactly as AssignProgramme renders nothing for a legacy organisation.
  if (sub !== undefined && !sub?.service_package_id) return null;
  if (rows === null || sub === undefined) return <Card><Skeleton className="h-28" /></Card>;

  const compiledFrom = (draft?.compiled_from ?? {}) as CompiledFrom;
  const notes = Array.isArray(compiledFrom.notes_for_clinician) ? compiledFrom.notes_for_clinician : [];
  const counts = countByBasis(draftActivities);

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

          {/* What kind of thing is being asked for. A draft that is entirely
              records and provider defaults is a different review from one
              carrying candidates nobody has agreed to. */}
          <div className="mt-3 flex flex-wrap gap-2">
            <BasisCount tone={BASIS_TONE.document} n={counts.document} label="from this patient's records" />
            <BasisCount tone={BASIS_TONE.provider_default} n={counts.provider_default} label="from the approved programme" />
            <BasisCount tone={BASIS_TONE.ai_suggested} n={counts.ai_suggested} label="candidates needing your decision" />
          </div>

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
                    {items.map((a) => (
                      <ReviewRow
                        key={a.key}
                        activity={a}
                        compiledFrom={compiledFrom}
                        included={!dropped.has(a.key)}
                        onToggle={() =>
                          setDropped((prev) => {
                            const next = new Set(prev);
                            if (next.has(a.key)) next.delete(a.key);
                            else next.add(a.key);
                            return next;
                          })
                        }
                      />
                    ))}
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

function BasisCount({ tone, n, label }: { tone: string; n: number; label: string }) {
  if (n === 0) return null;
  return (
    <span className={`rounded-full px-2.5 py-1 text-[12px] font-semibold ${tone}`}>
      {n} {label}
    </span>
  );
}

/**
 * One activity, as a clinician reviews it.
 *
 * Five things, in the order a reviewer needs them: what it is, when it happens,
 * what kind of thing it is, where it came from, and whether to keep it.
 */
function ReviewRow({
  activity, compiledFrom, included, onToggle,
}: {
  activity: CareActivity;
  compiledFrom: CompiledFrom;
  included: boolean;
  onToggle: () => void;
}) {
  const evidence = evidenceFor(activity, compiledFrom);
  return (
    <li className={`rounded-xl bg-white p-3 ring-1 ${evidence.needsDecision ? "ring-warn-500/30" : "ring-ink/[0.05]"}`}>
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={included}
          onChange={onToggle}
          aria-label={`Include ${activity.title}`}
          className="mt-1 h-5 w-5 shrink-0 rounded border-line text-sky-600"
        />
        <span className="min-w-0 flex-1">
          {/* activity */}
          <span className="flex flex-wrap items-center gap-2">
            <span className={`text-[14.5px] font-semibold ${included ? "text-ink" : "text-sage-400 line-through"}`}>
              {activity.title}
            </span>
            {/* basis */}
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${BASIS_TONE[activity.basis]}`}>
              {BASIS_LABEL[activity.basis]}
            </span>
          </span>

          {activity.instructions && (
            <span className="mt-1 block text-[13px] leading-relaxed text-sage-600">{activity.instructions}</span>
          )}

          {/* schedule */}
          <span className="mt-1.5 block text-[12.5px] font-medium text-ink">{scheduleLabel(activity)}</span>

          {/* source / evidence — omitted where it would only restate the
              basis chip above it */}
          {(evidence.specific || evidence.rationale) && (
            <span className="mt-1 block text-[12px] leading-relaxed text-sage-500">
              {evidence.specific && (
                <>
                  <span className="font-semibold uppercase tracking-[0.08em] text-sage-400">Source </span>
                  {evidence.source}
                </>
              )}
              {evidence.rationale ? <span className="block">{evidence.rationale}</span> : null}
            </span>
          )}
        </span>
      </label>
    </li>
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
      <ul className="mt-3 space-y-2">
        {activities.map((a) => {
          const evidence = evidenceFor(a, programme.compiled_from as CompiledFrom);
          return (
            <li key={a.key} className="text-[13.5px]">
              <span className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium text-ink">{a.title}</span>
                <span className="text-[12px] text-sage-500">{scheduleLabel(a)}</span>
                <span className={`rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold ${BASIS_TONE[a.basis]}`}>
                  {BASIS_LABEL[a.basis]}
                </span>
              </span>
              {evidence.specific && (
                <span className="mt-0.5 block text-[12px] text-sage-500">{evidence.source}</span>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
