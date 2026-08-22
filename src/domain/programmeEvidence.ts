/*
 * Where a proposed activity came from, in words a clinician can check.
 *
 * `basis` says WHICH KIND of thing it is — the patient's own records, the
 * provider's approved programme, or a suggestion. This says WHICH ONE: the
 * document it was read out of, the service it belongs to, the knowledge pack
 * and version behind the suggestion.
 *
 * That difference is the point of the review. "From the patient's own records"
 * is only meaningful if the clinician can go and read the record; "Suggested"
 * is only meaningful if they can see what it was suggested from.
 *
 * Purely presentational: it names sources, and makes no claim about whether an
 * activity is appropriate.
 */
import type { CareActivity } from "./careActivityModel";

/** What the compiler recorded about the run that produced a programme. */
export type CompiledFrom = {
  compiler_version?: string | null;
  clinical_domain?: string | null;
  care_intent?: string | null;
  service_name?: string | null;
  knowledge_pack_title?: string | null;
  knowledge_pack_version?: number | null;
  facts_document_label?: string | null;
  facts_document_id?: string | null;
  had_patient_facts?: boolean;
  provider_default_count?: number;
  notes_for_clinician?: string[];
  fallback_reason?: string | null;
};

export type ActivityEvidence = {
  /** Where it came from, named. */
  source: string;
  /** Why it was proposed, in the compiler's own words. May be empty. */
  rationale: string;
  /** True where a clinician is being asked to accept something proposed. */
  needsDecision: boolean;
};

const clean = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/**
 * The source line for one activity.
 *
 * Falls back to naming the KIND of source when the specific one was not
 * recorded — an honest "this patient's own records" beats inventing a document
 * title that may not exist.
 */
export function evidenceFor(activity: CareActivity, from: CompiledFrom | null | undefined): ActivityEvidence {
  const f = from ?? {};
  const rationale = clean(activity.rationale);

  if (activity.basis === "document") {
    const doc = clean(f.facts_document_label);
    return {
      source: doc ? `This patient's records — ${doc}` : "This patient's own records",
      rationale,
      needsDecision: false,
    };
  }

  if (activity.basis === "provider_default") {
    const svc = clean(f.service_name);
    return {
      source: svc ? `Approved programme — ${svc}` : "The provider's approved programme",
      rationale,
      needsDecision: false,
    };
  }

  // ai_suggested
  const pack = clean(f.knowledge_pack_title);
  const version = typeof f.knowledge_pack_version === "number" ? ` v${f.knowledge_pack_version}` : "";
  const domain = clean(f.clinical_domain);
  const base = pack ? `${pack}${version}` : domain ? `${domain} knowledge` : "clinical domain knowledge";
  return {
    source: `Candidate from ${base} — not in this patient's records`,
    rationale,
    needsDecision: true,
  };
}

/** How many of each basis a programme contains, for the review header. */
export function countByBasis(activities: CareActivity[]): {
  document: number; provider_default: number; ai_suggested: number;
} {
  const out = { document: 0, provider_default: 0, ai_suggested: 0 };
  for (const a of activities) out[a.basis] += 1;
  return out;
}
