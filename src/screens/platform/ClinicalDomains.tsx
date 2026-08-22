/*
 * The Carelune clinical-domain catalogue (Super Admin).
 *
 * A clinical domain is a reusable Carelune-level grouping — "Neuro
 * Rehabilitation & Stroke", "Mother & Baby" — that a provider's service is
 * placed in. It carries NO authority: publishing a service is still the D-003
 * two-level confirmation, and nothing here approves anything for anybody. What
 * a domain does carry is KNOWLEDGE: a versioned pack of evidence, candidate
 * care activities and education references that the care plan compiler reads.
 *
 * This is not five applications. It is one list, and only Neuro is populated —
 * the other four exist so a service can be grouped, not so five products can be
 * built.
 *
 * KNOWLEDGE IS NEVER PATIENT-FACING. Nothing on this screen is shown to a
 * patient. It reaches a family only after the compiler has drafted a programme
 * from it AND a clinician has approved that programme.
 */
import { useEffect, useState } from "react";
import {
  listClinicalDomains, saveKnowledgePack,
  type ClinicalDomainSummary, type KnowledgePackSummary,
} from "../../lib/db";
import { validateCareActivities } from "../../domain/careActivityModel";
import {
  Card, ErrorNote, Field, GhostButton, inputCls, PrimaryButton, SectionHeader, Skeleton,
} from "../../components/system";

const STATUS_TONE: Record<string, string> = {
  published: "bg-good-100 text-good-700",
  in_review: "bg-warn-100 text-warn-600",
  draft: "bg-mist-100 text-sage-600",
  retired: "bg-mist-100 text-sage-500",
};

function StatusPill({ status }: { status: string }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${STATUS_TONE[status] ?? STATUS_TONE.draft}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

export default function ClinicalDomains({ onBack }: { onBack: () => void }) {
  const [domains, setDomains] = useState<ClinicalDomainSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<ClinicalDomainSummary | null>(null);

  const load = async () => {
    try {
      setDomains(await listClinicalDomains());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the clinical domains.");
      setDomains([]);
    }
  };
  useEffect(() => { void load(); }, []);

  return (
    <div className="min-h-screen bg-mist">
      <div className="mx-auto max-w-[1000px] px-5 py-7 lg:px-8">
        <button type="button" onClick={onBack} className="tap text-[13px] font-semibold text-sky-700 hover:text-sky-600">
          ← Back to care providers
        </button>
        <h1 className="mt-2 font-display text-[26px] font-semibold tracking-tight text-ink">Clinical domains</h1>
        <p className="mt-1 max-w-2xl text-[14px] leading-relaxed text-sage-500">
          The bodies of care Carelune supports. A provider&rsquo;s service is placed in one, and the
          domain&rsquo;s published knowledge pack is what the care plan compiler reads when it drafts a
          patient&rsquo;s programme. Nothing here is shown to a patient, and placing a service in a domain
          approves nothing — a service still goes through both confirmations.
        </p>

        {error && <div className="mt-5"><ErrorNote>{error}</ErrorNote></div>}

        {domains === null && (
          <div className="mt-6 space-y-3"><Skeleton className="h-24" /><Skeleton className="h-24" /></div>
        )}

        <div className="mt-6 space-y-4">
          {(domains ?? []).map((d) => (
            <DomainCard key={d.id} domain={d} onAddPack={() => setEditing(d)} />
          ))}
        </div>
      </div>

      {editing && (
        <PackEditor
          domain={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await load(); }}
        />
      )}
    </div>
  );
}

function DomainCard({ domain, onAddPack }: { domain: ClinicalDomainSummary; onAddPack: () => void }) {
  const [open, setOpen] = useState(false);
  const published = domain.packs.find((p) => p.status === "published");

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-display text-[18px] font-semibold tracking-tight text-ink">{domain.name}</h2>
          {domain.summary && <p className="mt-1 max-w-xl text-[13.5px] leading-relaxed text-sage-600">{domain.summary}</p>}
          <p className="mt-2 text-[12.5px] text-sage-500">
            <code className="rounded bg-mist px-1.5 py-0.5 text-[11.5px]">{domain.key}</code>
            {" · "}
            {domain.service_count} {domain.service_count === 1 ? "service" : "services"}
            {" · "}
            {published
              ? `knowledge pack v${published.version} published`
              : domain.packs.length > 0
                ? `${domain.packs.length} pack${domain.packs.length === 1 ? "" : "s"}, none published`
                : "no knowledge pack yet"}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          {domain.packs.length > 0 && (
            <GhostButton onClick={() => setOpen((v) => !v)}>{open ? "Hide" : "Knowledge"}</GhostButton>
          )}
          <GhostButton onClick={onAddPack}>Add knowledge version</GhostButton>
        </div>
      </div>

      {open && (
        <div className="mt-5 space-y-3 border-t border-line pt-4">
          {domain.packs.map((p) => <PackRow key={p.id} pack={p} />)}
        </div>
      )}
    </Card>
  );
}

function PackRow({ pack }: { pack: KnowledgePackSummary }) {
  return (
    <div className="rounded-xl bg-mist/60 p-4 ring-1 ring-ink/[0.04]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-display text-[15px] font-semibold text-ink">
          v{pack.version} · {pack.title}
        </span>
        <div className="flex items-center gap-2">
          <StatusPill status={pack.status} />
          {pack.source_provenance === "ai_drafted" && (
            <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11.5px] font-semibold text-sky-700">
              AI drafted
            </span>
          )}
        </div>
      </div>
      {pack.summary && <p className="mt-1.5 text-[13.5px] leading-relaxed text-sage-600">{pack.summary}</p>}
      {pack.reviewed_at && (
        <p className="mt-1 text-[12px] text-sage-500">
          Reviewed {new Date(pack.reviewed_at).toLocaleDateString([], { day: "numeric", month: "long", year: "numeric" })}
        </p>
      )}
      {pack.sources.length > 0 && (
        <>
          <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-sage-500">Sources</p>
          <ul className="mt-1.5 space-y-1">
            {pack.sources.map((s) => (
              <li key={s.id} className="text-[13px] text-sage-600">
                {s.url ? (
                  <a href={s.url} target="_blank" rel="noreferrer" className="text-sky-700 underline underline-offset-2">
                    {s.title}
                  </a>
                ) : s.title}
                {s.publisher && <span className="text-sage-500"> · {s.publisher}</span>}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/**
 * A new VERSION of a domain's knowledge.
 *
 * Packs are never edited in place: a service can stay pinned to the version it
 * was configured against, and every compiled programme records which version it
 * drew on. So this only ever creates the next version.
 */
function PackEditor({
  domain, onClose, onSaved,
}: { domain: ClinicalDomainSummary; onClose: () => void; onSaved: () => Promise<void> }) {
  const nextVersion = Math.max(0, ...domain.packs.map((p) => p.version)) + 1;
  const [title, setTitle] = useState(`${domain.name} reference v${nextVersion}`);
  const [summary, setSummary] = useState("");
  const [knowledgeText, setKnowledgeText] = useState(
    JSON.stringify({ candidate_activities: [], education: [], protocol_guidance: [] }, null, 2),
  );
  const [sourcesText, setSourcesText] = useState("");
  const [publish, setPublish] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true); setError(null);
    try {
      let knowledge: Record<string, unknown>;
      try {
        knowledge = JSON.parse(knowledgeText);
      } catch {
        throw new Error("The knowledge is not valid JSON.");
      }
      if (typeof knowledge !== "object" || knowledge === null || Array.isArray(knowledge)) {
        throw new Error("The knowledge must be a JSON object.");
      }
      // Candidate activities are checked here as well as on the server, so the
      // operator sees what is wrong before the round trip.
      if (knowledge.candidate_activities !== undefined) {
        const check = validateCareActivities(knowledge.candidate_activities);
        if (!check.ok) throw new Error(`Candidate activities: ${check.errors.slice(0, 3).join("; ")}`);
      }

      const sources = sourcesText
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          // "Title | Publisher | https://…"
          const [t, publisher, url] = line.split("|").map((x) => x.trim());
          return { title: t, publisher: publisher || null, url: url || null, kind: "guideline" };
        });

      await saveKnowledgePack({
        clinical_domain_id: domain.id,
        title: title.trim(),
        summary: summary.trim(),
        knowledge,
        status: publish ? "published" : "draft",
        source_provenance: "carelune_curated",
        sources,
      });
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the knowledge pack.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-ink/30 p-4 backdrop-blur-[2px]"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`New knowledge version for ${domain.name}`}
        onClick={(e) => e.stopPropagation()}
        className="my-8 w-full max-w-[720px] rounded-2xl bg-white p-6 shadow-lift"
      >
        <SectionHeader
          title={`Knowledge v${nextVersion} · ${domain.name}`}
          sub="A new version. Existing services stay pinned to the version they were configured against."
        />

        <div className="mt-5 space-y-4">
          <Field label="Title">
            <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Summary">
            <input
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              className={inputCls}
              placeholder="What this version covers and what changed"
            />
          </Field>
          <Field label="Structured knowledge (JSON)">
            <textarea
              rows={12}
              value={knowledgeText}
              onChange={(e) => setKnowledgeText(e.target.value)}
              spellCheck={false}
              className={`${inputCls} font-mono text-[12.5px]`}
            />
          </Field>
          <p className="-mt-2 text-[12px] leading-relaxed text-sage-500">
            <code>candidate_activities</code> are checked against the same care-activity vocabulary the
            patient app uses, so a shape the app could not render is refused here.
            <code className="ml-1">education</code> and <code>protocol_guidance</code> are free-form
            objects the compiler reads as reference.
          </p>
          <Field label="Sources — one per line, “Title | Publisher | URL”">
            <textarea
              rows={4}
              value={sourcesText}
              onChange={(e) => setSourcesText(e.target.value)}
              className={inputCls}
              placeholder="WHO Rehabilitation 2030 | World Health Organization | https://…"
            />
          </Field>

          <label className="flex items-start gap-2.5">
            <input
              type="checkbox"
              checked={publish}
              onChange={(e) => setPublish(e.target.checked)}
              className="mt-0.5 h-5 w-5 rounded border-line text-sky-600"
            />
            <span className="text-[13.5px] leading-relaxed text-ink">
              Publish this version — the compiler will read it for new programmes in this domain.
              <span className="mt-0.5 block text-[12.5px] text-sage-500">
                Leave unticked to save it as a draft for review first.
              </span>
            </span>
          </label>
        </div>

        {error && <div className="mt-4"><ErrorNote>{error}</ErrorNote></div>}

        <div className="mt-6 flex justify-end gap-2">
          <GhostButton onClick={onClose}>Cancel</GhostButton>
          <PrimaryButton onClick={save} disabled={busy || !title.trim()}>
            {busy ? "Saving…" : `Save v${nextVersion}`}
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}
