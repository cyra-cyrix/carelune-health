import { useState } from "react";
import HospitalHeader from "../../components/HospitalHeader";
import { Timeline } from "../../components/Timeline";
import { TemplateDetail } from "../shared/TemplateView";
import { ROLE_META, type Persona } from "../../domain/roles";
import { useCarelune } from "../../store/carelune";
import RoleScope from "../../components/RoleScope";

const PMR = ROLE_META.pmr.persona as Persona;

/** Dr. Meera's governance workspace — review metadata, approve/return, note, audit. */
export default function TemplateGovernance() {
  const { templateGovernanceStatus, setTemplateGovernanceStatus, addTemplateNote, audit } =
    useCarelune();
  const [note, setNote] = useState("");

  const act = (kind: "approve" | "return" | "note") => {
    const text = note.trim();
    if (kind === "note") {
      if (!text) return;
      addTemplateNote(text);
    } else if (kind === "approve") {
      setTemplateGovernanceStatus("approved", text || "Re-approved for demo use after governance review.");
    } else {
      setTemplateGovernanceStatus("draft", text || "Returned for revision — see governance note.");
    }
    setNote("");
  };

  return (
    <div className="min-h-full bg-mist">
      <HospitalHeader crumb="Template governance" persona={PMR} />
      <main className="mx-auto max-w-[1100px] px-5 py-6 lg:px-8">
        <h1 className="font-display text-2xl font-semibold text-ink">Protocol governance</h1>
        <p className="mt-1 max-w-2xl text-[15px] text-sage-500">
          PM&amp;R owns pathway/template versions. Approvals here are simulated for the demo and
          fully audited — no template is real clinical guidance.
        </p>

        {/* Scope panel — what this role owns, may do, and must not do. */}
        <div className="mt-4">
          <RoleScope role="pmr" />
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[1.5fr_1fr] lg:gap-5">
          <TemplateDetail />

          <div className="space-y-4">
            <section className="card p-5">
              <h2 className="font-display text-[17px] font-semibold text-ink">Governance actions</h2>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="Governance note / reason (recorded in change history and audit)…"
                aria-label="Governance note"
                className="mt-2.5 w-full rounded-2xl bg-white px-3.5 py-2.5 text-[13px] text-ink ring-1 ring-ink/10 placeholder:text-sage-500"
              />
              <div className="mt-2.5 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={templateGovernanceStatus === "approved"}
                  onClick={() => act("approve")}
                  className="tap rounded-full bg-good-500 px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-40"
                >
                  Approve (simulated)
                </button>
                <button
                  type="button"
                  disabled={templateGovernanceStatus === "draft"}
                  onClick={() => act("return")}
                  className="tap rounded-full bg-warn-100 px-4 py-2 text-[13px] font-semibold text-warn-600 ring-1 ring-warn-500/20 disabled:opacity-40"
                >
                  Return for revision
                </button>
                <button
                  type="button"
                  disabled={!note.trim()}
                  onClick={() => act("note")}
                  className="tap rounded-full bg-brand-600 px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-40"
                >
                  Add governance note
                </button>
              </div>
              <p className="mt-2.5 text-[12px] leading-relaxed text-sage-600">
                While the template is returned to draft, the Lead Physiotherapist can continue the
                active plan but cannot cite the template for new additions — the demo shows the
                status on every template reference.
              </p>
            </section>

            <section className="card p-5">
              <h2 className="font-display text-[17px] font-semibold text-ink">Recent audit</h2>
              <div className="mt-3">
                <Timeline events={audit} limit={8} />
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
