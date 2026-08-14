import { Icon } from "./ui";
import { RESPONSE_POLICY } from "../domain/safety";
import { ROLE_META } from "../domain/roles";
import type { ExceptionCase, ExceptionPriority, SlaState } from "../domain/types";

export const PRIORITY_META: Record<
  ExceptionPriority,
  { label: string; cls: string; rank: number }
> = {
  emergency: { label: "Emergency", cls: "bg-coral-500 text-white", rank: 0 },
  same_day_medical: { label: "Same-day medical review", cls: "bg-coral-100 text-coral-600 ring-1 ring-coral-200", rank: 1 },
  same_day_rehab: { label: "Same-day rehabilitation review", cls: "bg-warn-100 text-warn-600 ring-1 ring-warn-500/20", rank: 2 },
  nursing_review: { label: "Nursing review", cls: "bg-brand-50 text-brand-700 ring-1 ring-brand-100", rank: 3 },
  operational_followup: { label: "Operational follow-up", cls: "bg-mist-200 text-sage-600", rank: 4 },
  routine_observation: { label: "Routine observation", cls: "bg-mist-200 text-sage-500", rank: 5 },
};

export const STATUS_LABEL: Record<ExceptionCase["status"], string> = {
  open: "Open",
  assigned: "Assigned",
  acknowledged: "Acknowledged",
  in_review: "In review",
  action_taken: "Action taken",
  follow_up_pending: "Follow-up pending",
  resolved: "Resolved",
  reopened: "Reopened",
  cancelled_duplicate: "Cancelled (duplicate)",
};

/** SLA badge — never colour alone: always an icon + words. */
export function SlaBadge({ state }: { state: SlaState }) {
  const meta: Record<SlaState, { label: string; cls: string; icon: string }> = {
    within: { label: "Within pilot service target", cls: "bg-good-100 text-good-600", icon: "✓" },
    approaching: { label: "Approaching target", cls: "bg-warn-100 text-warn-600", icon: "!" },
    overdue: { label: "Overdue — escalate", cls: "bg-coral-100 text-coral-600", icon: "▲" },
    out_of_hours: { label: "Waiting — outside service hours", cls: "bg-mist-200 text-sage-600", icon: "◷" },
  };
  const m = meta[state];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${m.cls}`}>
      <span aria-hidden>{m.icon}</span>
      {m.label}
    </span>
  );
}

export function PriorityBadge({ p }: { p: ExceptionPriority }) {
  return (
    <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${PRIORITY_META[p].label ? PRIORITY_META[p].cls : ""}`}>
      {PRIORITY_META[p].label}
    </span>
  );
}

/** Full exception detail block shared by professional workspaces. */
export function ExceptionSummary({ e }: { e: ExceptionCase }) {
  const target = RESPONSE_POLICY.targets[e.priority];
  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <PriorityBadge p={e.priority} />
        <SlaBadge state={e.slaState} />
        <span className="rounded-full bg-mist-200 px-2.5 py-1 text-[11px] font-semibold text-sage-600">
          {STATUS_LABEL[e.status]}
        </span>
      </div>
      <dl className="grid gap-x-6 gap-y-1 text-[13px] sm:grid-cols-2">
        <Row k="Exception" v={e.id} />
        <Row k="Patient" v={e.patient} />
        <Row k="Trigger" v={e.trigger} />
        <Row k="Source" v={e.source} />
        <Row k="Reported by" v={`${e.reporter} (${ROLE_META[e.reporterRole].label})`} />
        <Row k="Created" v={e.createdAt} />
        <Row k="Current owner" v={ROLE_META[e.ownerRole].label} />
        <Row k="Acknowledged" v={e.acknowledgedAt ? `${e.acknowledgedAt} by ${e.acknowledgedBy}` : "Not yet"} />
        <Row k="Priority set by" v={e.prioritySource} />
        {e.priorityRuleVersion && <Row k="Rule version" v={`${e.priorityRuleId} ${e.priorityRuleVersion}`} />}
      </dl>
      <p className="rounded-xl bg-mist px-3 py-2 text-[12px] leading-snug text-sage-600">
        <span className="font-semibold text-ink">Pilot service target: </span>
        acknowledge {target.acknowledge}; {target.action}. {RESPONSE_POLICY.serviceHours}. Escalation:{" "}
        {target.escalation}. Not a clinical guarantee — emergencies go to 112/108.
      </p>
      <p className="text-[12px] text-sage-500">
        <span className="font-semibold text-ink">Closure criteria: </span>
        {e.closureCriteria}
      </p>
    </div>
  );
}

export function ClosureChecklistView({ e }: { e: ExceptionCase }) {
  const items: { k: keyof ExceptionCase["closure"]; label: string; clinical?: boolean }[] = [
    { k: "coordinatorRouting", label: "Coordinator routing complete" },
    { k: "professionalReview", label: "Professional review complete", clinical: true },
    { k: "familyUpdate", label: "Family update complete" },
    { k: "planAcknowledgement", label: "Plan update / acknowledgement complete", clinical: true },
    { k: "followUp", label: "Follow-up complete" },
    { k: "clinicalResolution", label: "Clinical exception resolved", clinical: true },
  ];
  return (
    <ul className="space-y-1.5">
      {items.map((i) => (
        <li key={i.k} className="flex items-center justify-between gap-2 rounded-xl bg-mist px-3 py-2">
          <span className="text-[13px] text-ink">
            {i.label}
            {i.clinical && (
              <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wide text-coral-500">
                clinical
              </span>
            )}
          </span>
          {e.closure[i.k] ? (
            <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-good-600">
              <Icon.Check width={14} height={14} /> Done
            </span>
          ) : (
            <span className="text-[12px] font-semibold text-sage-600">Pending</span>
          )}
        </li>
      ))}
    </ul>
  );
}

export function ActionTrail({ e }: { e: ExceptionCase }) {
  if (e.actions.length === 0 && e.handoffs.length === 0)
    return <p className="text-[13px] text-sage-500">No actions recorded yet.</p>;
  return (
    <ol className="space-y-1.5">
      {e.handoffs.map((h, i) => (
        <li key={`h${i}`} className="rounded-xl bg-brand-50 px-3 py-2 text-[12px] ring-1 ring-brand-100">
          <span className="font-semibold text-brand-700">Handoff</span> · {h.at} · {h.by}:{" "}
          {ROLE_META[h.fromRole].label} → {ROLE_META[h.toRole].label} — {h.reason}
        </li>
      ))}
      {e.actions.map((a) => (
        <li key={a.id} className="rounded-xl bg-mist px-3 py-2 text-[12px]">
          <span className="font-semibold text-ink">{a.at}</span> · {a.actor} (
          {ROLE_META[a.ownerRole].label}) — {a.description}
        </li>
      ))}
    </ol>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-ink/[0.04] py-1">
      <dt className="shrink-0 text-sage-500">{k}</dt>
      <dd className="text-right font-medium text-ink">{v}</dd>
    </div>
  );
}
