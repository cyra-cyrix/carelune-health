import { EMERGENCY_COPY } from "../../domain/roles";
import { HcIcon, useHc } from "./hc-kit";

/**
 * Care Plan — the approved programme, read-only, in the household's words.
 *
 * The caregiver could previously only see today's slice. When something is
 * unclear at 9pm, "what did the doctor actually say?" is the question, and the
 * answer lived only in the clinician workspace. This shows the approved plan
 * without offering any way to change it: the doctor owns the content, the
 * household owns the doing.
 */
export function HomeCarePlan() {
  const { plan, patient } = useHc();
  const content = plan?.content;
  const activated = !!plan?.activated_at;

  if (!content || !activated) {
    return (
      <div style={{ paddingTop: 8 }}>
        <div className="hc-empty">
          <b>No approved plan yet</b>
          <p>The care team is preparing {patient.full_name.split(" ")[0]}&rsquo;s recovery plan. It appears here once the doctor approves it.</p>
        </div>
      </div>
    );
  }

  const targets = content.targets ?? [];
  const precautions = content.precautions ?? [];
  const diet = content.diet ?? [];
  const warnings = content.warning_signs ?? [];

  return (
    <div style={{ paddingTop: 8 }}>
      <h1 className="hc-h2" style={{ fontSize: 20 }}>Care plan</h1>
      <p className="hc-muted" style={{ marginTop: 2 }}>
        Approved by the care team{plan?.version ? ` · version ${plan.version}` : ""}. Only they can change it.
      </p>

      {content.clinical_summary && (
        <div className="hc-card" style={{ marginTop: 12 }}>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55 }}>{content.clinical_summary}</p>
        </div>
      )}

      <PlanList title="What we are aiming for" icon={<HcIcon.Chart size={15} />} empty="No targets recorded."
        rows={targets.map((t) => ({ text: t.text, note: t.by_day != null ? `by day ${t.by_day}` : "" }))} />

      <PlanList title="Diet" icon={<HcIcon.Food size={15} />} empty="No diet instructions recorded."
        rows={diet.map((d) => ({ text: d.text, note: "" }))} />

      <PlanList title="Things to be careful about" icon={<HcIcon.Warn size={15} />} empty="No precautions recorded."
        rows={precautions.map((p) => ({ text: p.text, note: "" }))} />

      {warnings.length > 0 && (
        <section className="hc-card" style={{ marginTop: 12 }}>
          <h2 className="hc-h2"><HcIcon.Warn size={15} /> Call the care team if you see</h2>
          <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
            {warnings.map((w, i) => (
              <li key={i} style={{ fontSize: 13.5, lineHeight: 1.6 }}>{w.text}</li>
            ))}
          </ul>
        </section>
      )}

      <p className="hc-emerg" style={{ marginTop: 14 }}>{EMERGENCY_COPY}</p>
    </div>
  );
}

function PlanList({
  title, icon, rows, empty,
}: {
  title: string;
  icon: React.ReactNode;
  rows: { text: string; note: string }[];
  empty: string;
}) {
  return (
    <section className="hc-card" style={{ marginTop: 12 }}>
      <h2 className="hc-h2">{icon} {title}</h2>
      {rows.length === 0 ? (
        <p className="hc-muted" style={{ marginTop: 6, fontSize: 13 }}>{empty}</p>
      ) : (
        <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
          {rows.map((r, i) => (
            <li key={i} style={{ fontSize: 13.5, lineHeight: 1.6 }}>
              {r.text}
              {r.note && <span className="hc-muted"> · {r.note}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
