import { describe, expect, it } from "vitest";
import { countByBasis, evidenceFor, type CompiledFrom } from "./programmeEvidence";
import { validateCareActivities, type CareActivity } from "./careActivityModel";
import { NEURO_ACTIVITIES } from "./careProgramme.fixtures";

const act = (basis: string, rationale = ""): CareActivity => {
  const r = validateCareActivities([{
    key: "x", activity_type: "task", title: "Something", basis, rationale,
    input_schema: [], schedule: null,
  }]);
  if (!r.ok) throw new Error(r.errors.join("; "));
  return r.activities[0];
};

const from: CompiledFrom = {
  clinical_domain: "Neuro Rehabilitation & Stroke",
  service_name: "Neuro Continuum at Home",
  knowledge_pack_title: "Neuro Rehabilitation & Stroke — reference v1",
  knowledge_pack_version: 1,
  facts_document_label: "Discharge summary",
};

describe("what the clinician is shown as the source", () => {
  it("names the document a document-based activity was read out of", () => {
    expect(evidenceFor(act("document"), from).source)
      .toBe("This patient's records — Discharge summary");
  });

  it("names the service an approved-programme activity belongs to", () => {
    expect(evidenceFor(act("provider_default"), from).source)
      .toBe("Approved programme — Neuro Continuum at Home");
  });

  it("names the knowledge and version a suggestion came from, and says it is not in the records", () => {
    const e = evidenceFor(act("ai_suggested"), from);
    expect(e.source).toBe("Candidate from Neuro Rehabilitation & Stroke — reference v1 v1 — not in this patient's records");
    expect(e.needsDecision).toBe(true);
  });

  it("asks for a decision only on a suggestion", () => {
    expect(evidenceFor(act("document"), from).needsDecision).toBe(false);
    expect(evidenceFor(act("provider_default"), from).needsDecision).toBe(false);
  });

  it("names the kind of source rather than inventing a specific one", () => {
    expect(evidenceFor(act("document"), {}).source).toBe("This patient's own records");
    expect(evidenceFor(act("provider_default"), {}).source).toBe("The provider's approved programme");
    expect(evidenceFor(act("ai_suggested"), {}).source)
      .toBe("Candidate from clinical domain knowledge — not in this patient's records");
    expect(evidenceFor(act("document"), null).source).toBe("This patient's own records");
  });

  it("carries the compiler's own reason through unchanged", () => {
    expect(evidenceFor(act("document", "Listed on the discharge medication chart."), from).rationale)
      .toBe("Listed on the discharge medication chart.");
  });
});

describe("the review header count", () => {
  it("counts every activity under exactly one basis", () => {
    const r = validateCareActivities(NEURO_ACTIVITIES);
    if (!r.ok) throw new Error("fixture invalid");
    const counts = countByBasis(r.activities);
    expect(counts.document + counts.provider_default + counts.ai_suggested).toBe(r.activities.length);
  });
});
