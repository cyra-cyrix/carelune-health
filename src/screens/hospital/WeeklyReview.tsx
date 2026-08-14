import { useState } from "react";
import HospitalHeader from "../../components/HospitalHeader";
import { Icon } from "../../components/ui";
import { ProvChip } from "../../components/Timeline";
import { PRIORITY_META as EXC_PRIORITY } from "../../components/exceptions";
import { reviewPrep } from "../../data/hospital";
import { barriers, goals } from "../../domain/planning";
import { BARRIER_CATEGORY_LABEL } from "../../domain/planning";
import { PLAN_DECISION_META } from "../../domain/reviews";
import { ROLE_META } from "../../domain/roles";
import { REPORT_META } from "../../domain/caregiver";
import type {
  BarrierState,
  GoalStatus,
  PlanDecisionKind,
  ReviewRecord,
} from "../../domain/types";
import { isClosed, useCarelune } from "../../store/carelune";

const ME = "Ravi Kumar";

const GOAL_STATES: GoalStatus[] = [
  "not_started",
  "progressing",
  "achieved",
  "revised",
  "held",
  "discontinued",
];
const BARRIER_STATES: BarrierState[] = [
  "new",
  "active",
  "improving",
  "resolved",
  "worsened",
  "referred",
  "unable_to_address",
];

/**
 * Weekly rehabilitation review (Ravi). AI supplies facts, patterns and
 * questions; every clinical judgement below is recorded by the professional
 * with rationale, evidence and a next review date.
 */
export default function WeeklyReview({ onBack }: { onBack: () => void }) {
  const {
    schedule,
    taskReports,
    exceptions,
    holds,
    plan,
    goalStates,
    barrierStates,
    updateGoal,
    updateBarrier,
    applyPlanDecision,
    recordReview,
    recommendDirectVisit,
    createSpecialistReferral,
    interventionTitle,
  } = useCarelune();

  const [observations, setObservations] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<string[]>([]);

  const reported = Object.values(taskReports);
  const byOutcome = reported.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});
  const reasons = reported
    .filter((r) => r.reason)
    .map((r) => `${r.status.replace(/_/g, " ")}: ${r.reason}`);
  const openExc = exceptions.filter((e) => !isClosed(e.status));
  const recentlyResolved = exceptions.filter((e) => e.status === "resolved");
  const activeHolds = holds.filter((h) => h.status === "active");

  const physioInterventions = plan.interventions.filter((i) => i.ownerRole === "lead_physio");
  const otherInterventions = plan.interventions.filter((i) => i.ownerRole !== "lead_physio");

  const decide = (interventionId: string, kind: PlanDecisionKind) => {
    const iv = plan.interventions.find((i) => i.id === interventionId)!;
    const res = applyPlanDecision(
      {
        interventionId,
        kind,
        reason: observations || "Weekly review decision",
        evidenceReviewed: "Caregiver-reported execution, open exceptions, clinician observation",
        effectiveDate: "Tomorrow",
        nextReviewDate: "Day 21",
        decidedBy: ME,
        decidedByRole: "lead_physio",
        caregiverAcknowledgementRequired: PLAN_DECISION_META[kind].needsCaregiverAck,
      },
      "lead_physio"
    );
    setMsg(res.ok ? `${PLAN_DECISION_META[kind].label}: ${iv.title} → ${res.reason}` : res.reason);
    if (res.ok) setDecisions((d) => [...d, `${PLAN_DECISION_META[kind].label}: ${iv.title}`]);
  };

  const setGoal = (goalId: string, to: GoalStatus) => {
    const g = goals.find((x) => x.id === goalId)!;
    const res = updateGoal(
      {
        goalId,
        from: goalStates[goalId] ?? g.status,
        to,
        reviewer: ME,
        reviewerRole: "lead_physio",
        evidenceSource: "Clinician observation at video review + caregiver-reported execution",
        rationale: observations || "Weekly review judgement",
        linkedPlanChanges: decisions,
        nextReview: "Day 21",
      },
      "lead_physio"
    );
    setMsg(res.ok ? `Goal ${goalId} → ${to}` : res.reason);
  };

  const setBarrier = (barrierId: string, to: BarrierState) => {
    const res = updateBarrier(
      {
        barrierId,
        to,
        source: "Weekly review",
        ownerRole: "lead_physio",
        actionTaken: observations || "Reviewed at weekly review",
        goalImpact: "Reviewed against current goals",
        followUp: "Day 21",
        by: ME,
      },
      "lead_physio"
    );
    setMsg(res.ok ? `Barrier ${barrierId} → ${to}` : res.reason);
  };

  const completeReview = () => {
    const rec: Omit<ReviewRecord, "id"> = {
      patient: "Anand Menon",
      type: "weekly_rehabilitation",
      reason: "Scheduled weekly rehabilitation review",
      reviewer: ME,
      reviewerRole: "lead_physio",
      scheduledDate: "Day 14",
      completedDate: `Day ${plan.version >= 1 ? 14 : 14}`,
      mode: "video",
      evidenceReviewed: [
        "Caregiver-reported task execution",
        "Open and resolved exceptions",
        "Active clinical holds",
      ],
      assessmentsReviewed: ["Barthel Index (Day 11)"],
      goalsReviewed: goals.map((g) => g.id),
      barriersReviewed: barriers.map((b) => b.id),
      exceptionsReviewed: exceptions.map((e) => e.id),
      observations: observations || "Reviewed the week with the caregiver.",
      decisions: [],
      interventionsAffected: physioInterventions.map((i) => i.id),
      referralsCreated: [],
      followUp: "Continue current plan; reassess sitting tolerance next week.",
      nextReview: "Day 21",
      familyCommunication: "Summary shared with Suresh in plain language.",
    };
    const res = recordReview(rec, "lead_physio");
    setMsg(res.ok ? "Weekly review recorded and audited." : res.reason);
  };

  return (
    <div className="min-h-full bg-mist">
      <HospitalHeader crumb="Weekly review" />
      <main className="mx-auto max-w-[1150px] px-5 py-6 lg:px-8">
        <button
          type="button"
          onClick={onBack}
          className="tap -ml-1 inline-flex items-center gap-1 text-[15px] font-semibold text-brand-600 hover:text-brand-700"
        >
          <Icon.ChevronLeft width={18} height={18} /> Anand Menon
        </button>

        <h1 className="mt-3 font-display text-2xl font-semibold text-ink">
          Weekly rehabilitation review
        </h1>
        <p className="mt-1 max-w-3xl text-[15px] text-sage-500">
          Evidence is separated by provenance. AI summarises facts and questions — every decision
          below is yours, with rationale and a next review date.
        </p>

        {msg && (
          <div className="mt-3 rounded-2xl bg-brand-50 p-3.5 text-[14px] text-ink ring-1 ring-brand-100">
            {msg}
          </div>
        )}

        <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_1fr] lg:gap-5">
          {/* ---- Evidence, by provenance ---- */}
          <div className="space-y-4">
            <section className="card p-5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-display text-[15px] font-semibold text-ink">
                  Task execution this week
                </h2>
                <ProvChip p="caregiver_reported" />
              </div>
              <dl className="mt-2.5 grid grid-cols-3 gap-2 text-center">
                {(["completed", "partial", "unable"] as const).map((k) => (
                  <div key={k} className="rounded-xl bg-mist py-2">
                    <dt className="text-[11px] text-sage-500">{REPORT_META[k].label}</dt>
                    <dd className="font-display text-[18px] font-semibold text-ink">
                      {byOutcome[k] ?? 0}
                    </dd>
                  </div>
                ))}
                {(["refused", "unwell", "need_help"] as const).map((k) => (
                  <div key={k} className="rounded-xl bg-mist py-2">
                    <dt className="text-[11px] text-sage-500">{REPORT_META[k].label}</dt>
                    <dd className="font-display text-[18px] font-semibold text-ink">
                      {byOutcome[k] ?? 0}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="mt-2 text-[12px] text-sage-500">
                Priority tasks scheduled: {schedule.filter((t) => t.priority !== "routine_support").length} of{" "}
                {schedule.length}
              </p>
              {reasons.length > 0 && (
                <>
                  <h3 className="mt-3 text-[12px] font-bold uppercase tracking-wide text-sage-500">
                    Reasons given
                  </h3>
                  <ul className="mt-1 space-y-0.5 text-[12px] text-sage-600">
                    {reasons.map((r, i) => (
                      <li key={i}>· {r}</li>
                    ))}
                  </ul>
                </>
              )}
            </section>

            <section className="card p-5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-display text-[15px] font-semibold text-ink">
                  AI-assisted summary
                </h2>
                <span className="rounded-full bg-mist-200 px-2.5 py-0.5 text-[11px] font-semibold text-sage-600">
                  Facts &amp; questions only
                </span>
              </div>
              <h3 className="mt-2.5 text-[12px] font-bold uppercase tracking-wide text-sage-500">
                Home-period summary
              </h3>
              <ul className="mt-1 space-y-1 text-[13px] text-ink/85">
                {reviewPrep.periodFacts.map((f) => (
                  <li key={f}>· {f}</li>
                ))}
              </ul>
              <h3 className="mt-2.5 text-[12px] font-bold uppercase tracking-wide text-sage-500">
                Repeated missed-task reasons
              </h3>
              <ul className="mt-1 space-y-1 text-[13px] text-ink/85">
                {reviewPrep.missedPatterns.map((f) => (
                  <li key={f}>· {f}</li>
                ))}
              </ul>
              <h3 className="mt-2.5 text-[12px] font-bold uppercase tracking-wide text-sage-500">
                Questions to consider
              </h3>
              <ul className="mt-1 space-y-1 text-[13px] text-ink/85">
                {reviewPrep.questions.map((f) => (
                  <li key={f}>· {f}</li>
                ))}
              </ul>
              <p className="mt-2 rounded-xl bg-warn-100/70 px-3 py-2 text-[12px] font-medium text-warn-600">
                AI cannot decide progression, regression, intervention change, referral, hold/release
                or goal achievement.
              </p>
            </section>

            <section className="card p-5">
              <h2 className="font-display text-[15px] font-semibold text-ink">
                Safety &amp; continuity
              </h2>
              <h3 className="mt-2 text-[12px] font-bold uppercase tracking-wide text-coral-600">
                Active clinical holds
              </h3>
              {activeHolds.length === 0 ? (
                <p className="mt-1 text-[13px] text-sage-500">None.</p>
              ) : (
                <ul className="mt-1 space-y-1.5">
                  {activeHolds.map((h) => (
                    <li key={h.id} className="rounded-xl bg-coral-100/60 px-3 py-2 text-[12px] text-ink">
                      <span className="font-semibold">{interventionTitle(h.interventionId)}</span> — {h.reason}
                      <br />
                      <span className="text-sage-600">
                        Release permitted by:{" "}
                        {h.releasableByRoles.map((r) => ROLE_META[r].label).join(", ")}
                        {h.demoReleaseLocked ? " · retained in this demo" : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <h3 className="mt-3 text-[12px] font-bold uppercase tracking-wide text-sage-500">
                Exceptions
              </h3>
              <p className="mt-1 text-[13px] text-sage-600">
                {openExc.length} open · {recentlyResolved.length} recently resolved
              </p>
              <ul className="mt-1 space-y-1 text-[12px] text-sage-600">
                {exceptions.slice(0, 4).map((e) => (
                  <li key={e.id}>
                    · {e.source} — {EXC_PRIORITY[e.priority].label} ({e.status.replace(/_/g, " ")})
                  </li>
                ))}
              </ul>
            </section>
          </div>

          {/* ---- Professional judgements ---- */}
          <div className="space-y-4">
            <section className="card p-5">
              <h2 className="font-display text-[15px] font-semibold text-ink">
                Your clinical observations
              </h2>
              <textarea
                value={observations}
                onChange={(e) => setObservations(e.target.value)}
                rows={3}
                placeholder="What you observed at the video review — this becomes the rationale on every decision below…"
                aria-label="Clinical observations"
                className="mt-2 w-full rounded-2xl bg-white px-3.5 py-2.5 text-[13px] text-ink ring-1 ring-ink/10"
              />
              <ProvChip p="clinician_assessed" className="mt-2 inline-block" />
            </section>

            {/* Goals */}
            <section className="card p-5">
              <h2 className="font-display text-[15px] font-semibold text-ink">Goal review</h2>
              <p className="mt-1 text-[12px] text-sage-500">
                A goal is never achieved automatically because tasks were completed.
              </p>
              <ul className="mt-2.5 space-y-2.5">
                {goals.map((g) => {
                  const cur = goalStates[g.id] ?? g.status;
                  const mine = g.ownerRole === "lead_physio";
                  return (
                    <li key={g.id} className="rounded-xl bg-mist p-3">
                      <p className="text-[13px] font-semibold text-ink">{g.clinicalFormulation}</p>
                      <p className="text-[11px] text-sage-500">
                        {g.id} · owner {ROLE_META[g.ownerRole].label} · now {cur.replace(/_/g, " ")}
                      </p>
                      {mine ? (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {GOAL_STATES.map((s) => (
                            <button
                              key={s}
                              onClick={() => setGoal(g.id, s)}
                              className={`tap rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                                cur === s
                                  ? "bg-brand-600 text-white"
                                  : "bg-white text-sage-600 ring-1 ring-ink/10"
                              }`}
                            >
                              {s.replace(/_/g, " ")}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-1 text-[11px] font-medium text-coral-600">
                          Owned by the {ROLE_META[g.ownerRole].label} — you cannot change its status.
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>

            {/* Barriers */}
            <section className="card p-5">
              <h2 className="font-display text-[15px] font-semibold text-ink">Barrier review</h2>
              <ul className="mt-2.5 space-y-2">
                {barriers.map((b) => {
                  const cur = barrierStates[b.id] ?? "active";
                  return (
                    <li key={b.id} className="rounded-xl bg-mist p-3">
                      <p className="text-[13px] text-ink">
                        <span className="font-semibold">{BARRIER_CATEGORY_LABEL[b.category]}</span> —{" "}
                        {b.label}
                      </p>
                      <p className="text-[11px] text-sage-500">
                        Owner {ROLE_META[b.ownerRole].label} · now {cur.replace(/_/g, " ")}
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {BARRIER_STATES.map((s) => (
                          <button
                            key={s}
                            onClick={() => setBarrier(b.id, s)}
                            className={`tap rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                              cur === s
                                ? "bg-brand-600 text-white"
                                : "bg-white text-sage-600 ring-1 ring-ink/10"
                            }`}
                          >
                            {s.replace(/_/g, " ")}
                          </button>
                        ))}
                      </div>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-2 text-[11px] text-sage-600">
                Barriers are tracked individually — no composite barrier score.
              </p>
            </section>

            {/* Plan decisions */}
            <section className="card p-5">
              <h2 className="font-display text-[15px] font-semibold text-ink">Plan decisions</h2>
              <p className="mt-1 text-[12px] text-sage-500">
                You may decide on physiotherapy-owned interventions only.
              </p>
              <ul className="mt-2.5 space-y-2">
                {physioInterventions.map((iv) => (
                  <li key={iv.id} className="rounded-xl bg-mist p-3">
                    <p className="text-[13px] font-semibold text-ink">{iv.title}</p>
                    <p className="text-[11px] text-sage-500">
                      {iv.dose} · {iv.frequency} · status {iv.status}
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {(Object.keys(PLAN_DECISION_META) as PlanDecisionKind[]).map((k) => (
                        <button
                          key={k}
                          onClick={() => decide(iv.id, k)}
                          className="tap rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-sage-600 ring-1 ring-ink/10 hover:bg-brand-50"
                        >
                          {PLAN_DECISION_META[k].label}
                        </button>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
              {otherInterventions.length > 0 && (
                <>
                  <h3 className="mt-3 text-[12px] font-bold uppercase tracking-wide text-coral-600">
                    Other disciplines — pending their approval
                  </h3>
                  <ul className="mt-1 space-y-1 text-[12px] text-sage-600">
                    {otherInterventions.map((iv) => (
                      <li key={iv.id}>
                        · {iv.title} — {ROLE_META[iv.ownerRole].label}
                        {iv.status === "held" ? " (held)" : ""}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>

            {/* Referrals & direct visit */}
            <section className="card p-5">
              <h2 className="font-display text-[15px] font-semibold text-ink">
                Referrals &amp; direct visits
              </h2>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  onClick={() => {
                    createSpecialistReferral(
                      "occupational_therapist",
                      "Self-care participation goal needs OT-owned assessment and interventions.",
                      "Weekly review",
                      { requestedBy: ME, requestedByRole: "lead_physio" }
                    );
                    setMsg("OT referral raised (clinically indicated).");
                  }}
                  className="tap rounded-full bg-brand-50 px-3.5 py-2 text-[13px] font-semibold text-brand-700 ring-1 ring-brand-100"
                >
                  Refer to Occupational Therapy
                </button>
                <button
                  onClick={() => {
                    recommendDirectVisit(
                      "Transfer technique needs hands-on assessment at home.",
                      "lead_physio",
                      ME
                    );
                    setMsg("Direct home visit recommended — arranged and paid directly to the professional.");
                  }}
                  className="tap rounded-full bg-brand-50 px-3.5 py-2 text-[13px] font-semibold text-brand-700 ring-1 ring-brand-100"
                >
                  Recommend direct home visit
                </button>
              </div>
            </section>

            <button
              onClick={completeReview}
              className="tap w-full rounded-full bg-brand-600 py-3 text-[15px] font-semibold text-white shadow-lift hover:bg-brand-700"
            >
              Complete &amp; record weekly review
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
