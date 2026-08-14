import { useEffect, useMemo, useState } from "react";
import { Icon } from "../../components/ui";
import { useBranding } from "../../branding/BrandingProvider";
import {
  RecoveryTrajectory, SegmentedFilter, StatusTag, SignalDot, Avatar, SectionLabel, Reveal,
  type Tone,
} from "../../components/clinical";
import {
  listPatients,
  getPendingApprovalCounts,
  getFamilyQueryCounts,
  getReadingHistory,
  type PatientRow,
  type PendingCount,
  type ReadingRow,
} from "../../lib/db";

/** Whole days since journey start, 1-indexed. */
function dayAtHome(p: PatientRow): number {
  const start = new Date(p.journey_start).getTime();
  return Math.max(1, Math.floor((Date.now() - start) / 86_400_000) + 1);
}

function num(v: string | null | undefined): number {
  const n = Number((v ?? "").toString().replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : NaN;
}

/** A per-patient recovery signal computed from real caregiver readings — never a
 *  composite "recovery score"; just the most salient available vital trend. */
type Signal = {
  values: number[];
  label: string;
  change: string;
  tone: Tone;
  improving: boolean | null;
};

function computeSignal(readings: ReadingRow[]): Signal | null {
  // Prefer systolic BP, then GRBS, then urine output — whichever has a real trend.
  const series: { label: string; values: number[]; goodDir: "up" | "down" }[] = [
    { label: "BP", values: readings.map((r) => num((r.bp ?? "").split("/")[0])).filter(Number.isFinite), goodDir: "down" },
    { label: "GRBS", values: readings.map((r) => num(r.grbs)).filter(Number.isFinite), goodDir: "down" },
    { label: "Urine", values: readings.map((r) => num(r.urine_ml)).filter(Number.isFinite), goodDir: "up" },
  ];
  const pick = series.find((s) => s.values.length >= 2);
  if (!pick) return null;
  const first = pick.values[0];
  const last = pick.values[pick.values.length - 1];
  const improving = pick.goodDir === "down" ? last < first : last > first;
  const steady = last === first;
  return {
    values: pick.values,
    label: pick.label,
    change: `${pick.label} ${first} → ${last}`,
    tone: steady ? "neutral" : improving ? "recovery" : "attention",
    improving: steady ? null : improving,
  };
}

type FilterKey = "attention" | "new" | "active" | "improving" | "all";

/**
 * Doctor Recovery Command Centre — the first screen answers, in five seconds,
 * who needs attention, who is progressing, and what decision is waiting. Real
 * computable data only; neutral language where a signal isn't available yet.
 * (Shared with the nurse/duty caseload via props — labels adapt, layout holds.)
 */
export default function Caseload({
  onOpen,
  heading,
  subtitle,
  showPending = true,
  countType = "all",
}: {
  onOpen: (id: string, status?: string) => void;
  heading?: string;
  subtitle?: string;
  showPending?: boolean;
  /** "all" = every pending approval (doctor); "family" = family messages only (nurse). */
  countType?: "all" | "family";
}) {
  const { profile } = useBranding();
  const [patients, setPatients] = useState<PatientRow[]>([]);
  const [pending, setPending] = useState<Record<string, PendingCount>>({});
  const [signals, setSignals] = useState<Record<string, Signal | null>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>("attention");

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const ps = await listPatients();
        if (!active) return;
        setPatients(ps);
        const ids = ps.map((p) => p.id);
        const counts = !showPending
          ? ({} as Record<string, PendingCount>)
          : countType === "family"
            ? await getFamilyQueryCounts(ids)
            : await getPendingApprovalCounts(ids);
        if (!active) return;
        setPending(counts);
        setLoading(false);
        // Trajectories load progressively — a slow/failed read never blocks the list.
        for (const p of ps.filter((x) => x.status === "active").slice(0, 24)) {
          getReadingHistory(p.id, 7)
            .then((r) => active && setSignals((s) => ({ ...s, [p.id]: computeSignal(r) })))
            .catch(() => active && setSignals((s) => ({ ...s, [p.id]: null })));
        }
      } catch (e) {
        if (active) {
          setError(e instanceof Error ? e.message : "Could not load your patients.");
          setLoading(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [showPending, countType]);

  /* ---- derived groupings (real data) ---- */
  const enrich = useMemo(() => {
    return patients.map((p) => {
      const c = pending[p.id];
      const urgent = c?.urgent ?? 0;
      const count = c?.pending ?? 0;
      const isNew = p.status === "pending";
      const isActive = p.status === "active";
      const sig = signals[p.id];
      const needsAttention = isNew || (showPending && (urgent > 0 || count > 0));
      const improving = isActive && sig?.improving === true;
      const attentionReason = isNew
        ? "New — needs a recovery plan"
        : urgent > 0
          ? `${urgent} urgent to review`
          : count > 0
            ? countType === "family"
              ? `${count} to answer`
              : `${count} awaiting your decision`
            : sig?.improving === false
              ? `${sig.label} trending the wrong way`
              : "";
      return { p, urgent, count, isNew, isActive, sig, needsAttention, improving, attentionReason };
    });
  }, [patients, pending, signals, showPending, countType]);

  const activeCount = enrich.filter((e) => e.isActive).length;
  const newCount = enrich.filter((e) => e.isNew).length;
  const attentionList = enrich.filter((e) => e.needsAttention);
  const improvingCount = enrich.filter((e) => e.improving).length;
  const progressingCount = enrich.filter((e) => e.isActive && !e.needsAttention).length;
  const totalPending = Object.values(pending).reduce((a, b) => a + b.pending, 0);
  const totalUrgent = Object.values(pending).reduce((a, b) => a + b.urgent, 0);

  const filtered = useMemo(() => {
    switch (filter) {
      case "attention": return attentionList;
      case "new": return enrich.filter((e) => e.isNew);
      case "active": return enrich.filter((e) => e.isActive);
      case "improving": return enrich.filter((e) => e.improving);
      default: return enrich;
    }
  }, [filter, enrich, attentionList]);

  const greetName = useMemo(() => {
    const raw = profile?.full_name?.trim();
    if (!raw) return null;
    const isDoc = profile?.role === "pmr" || profile?.role === "duty_doctor";
    return isDoc && !/^dr\.?\s/i.test(raw) ? `Dr. ${raw}` : raw;
  }, [profile]);

  const greeting = (() => {
    const h = new Date().getHours();
    return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  })();

  return (
    <div className="min-h-full bg-mist">
      {/* ---- Dominant recovery overview (midnight hero) ---- */}
      <div className="bg-midnight-900">
        <div className="relative mx-auto max-w-[1120px] overflow-hidden px-5 py-8 lg:px-8 lg:py-10">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{ background: "radial-gradient(90% 120% at 100% 0%, rgba(42,111,199,0.22), transparent 60%)" }}
          />
          <div className="relative flex flex-wrap items-end justify-between gap-6">
            <div className="min-w-0">
              <SectionLabel onDark>{heading ?? "Recovery command centre"}</SectionLabel>
              <h1 className="mt-2 font-display text-[26px] font-semibold tracking-[-0.02em] text-haze-100 sm:text-[30px]">
                {greeting}{greetName ? `, ${greetName}` : ""}
              </h1>
              {loading ? (
                <div className="mt-3 h-5 w-64 animate-pulse rounded bg-white/10" />
              ) : (
                <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-haze-300">
                  {activeCount > 0 ? (
                    <>
                      <span className="font-semibold text-haze-100">{activeCount} patient{activeCount === 1 ? "" : "s"}</span> recovering at home
                      {attentionList.length > 0 || progressingCount > 0 ? " · " : ""}
                      {attentionList.length > 0 && <span className="font-semibold text-warn-300">{attentionList.length} need{attentionList.length === 1 ? "s" : ""} attention</span>}
                      {attentionList.length > 0 && progressingCount > 0 && " · "}
                      {progressingCount > 0 && <span className="text-brand-300">{progressingCount} progressing as expected</span>}
                    </>
                  ) : newCount > 0 ? (
                    <><span className="font-semibold text-haze-100">{newCount} new registration{newCount === 1 ? "" : "s"}</span> waiting for a recovery plan.</>
                  ) : (
                    "No patients in recovery yet. Share your registration link to begin."
                  )}
                </p>
              )}
            </div>

            {/* What decision is waiting for me? */}
            {showPending && !loading && (totalPending > 0 || totalUrgent > 0) && (
              <div className="rounded-2xl bg-white/[0.06] p-4 ring-1 ring-white/10 backdrop-blur-sm">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-haze-400">Waiting on you</div>
                <div className="mt-2 flex items-center gap-4">
                  {totalUrgent > 0 && (
                    <div>
                      <div className="text-[22px] font-semibold leading-none text-coral-400 tabular-nums">{totalUrgent}</div>
                      <div className="mt-1 text-[11.5px] text-haze-300">urgent</div>
                    </div>
                  )}
                  <div>
                    <div className="text-[22px] font-semibold leading-none text-haze-100 tabular-nums">{totalPending}</div>
                    <div className="mt-1 text-[11.5px] text-haze-300">{countType === "family" ? "to answer" : "to review"}</div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* slim recovery distribution — one composed overview, not KPI cards */}
          {!loading && activeCount + newCount > 0 && (
            <div className="relative mt-7">
              <div className="flex h-2 w-full overflow-hidden rounded-full bg-white/10">
                {attentionList.length > 0 && <div className="h-full bg-warn-400" style={{ width: `${(attentionList.length / (activeCount + newCount)) * 100}%` }} />}
                {progressingCount > 0 && <div className="h-full bg-brand-400" style={{ width: `${(progressingCount / (activeCount + newCount)) * 100}%` }} />}
                {newCount > 0 && <div className="h-full bg-sky-500" style={{ width: `${(newCount / (activeCount + newCount)) * 100}%` }} />}
              </div>
              <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-haze-300">
                {attentionList.length > 0 && <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-warn-400" />Needs attention</span>}
                {progressingCount > 0 && <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-brand-400" />Progressing</span>}
                {newCount > 0 && <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-sky-500" />New registration</span>}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ---- body ---- */}
      <div className="mx-auto max-w-[1120px] px-5 py-6 lg:px-8">
        {subtitle && <p className="-mt-1 mb-4 text-[13.5px] text-sage-600">{subtitle}</p>}

        {loading && (
          <ul className="space-y-3">
            {[0, 1, 2].map((i) => <li key={i} className="h-[84px] animate-pulse rounded-2xl bg-white/70" />)}
          </ul>
        )}

        {!loading && error && (
          <div className="rounded-2xl bg-white p-5 shadow-panel ring-1 ring-ink/[0.05]">
            <p className="text-[14px] font-semibold text-ink">Couldn&rsquo;t load your patients</p>
            <p className="mt-1 text-[13px] text-sage-600">{error}</p>
          </div>
        )}

        {!loading && !error && patients.length === 0 && (
          <div className="rounded-3xl bg-white p-10 text-center shadow-panel ring-1 ring-ink/[0.05]">
            <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-sky-50 text-sky-600 ring-1 ring-sky-200"><Icon.ChevronRight width={20} height={20} /></div>
            <p className="text-[15px] font-semibold text-ink">No patients yet</p>
            <p className="mx-auto mt-1 max-w-sm text-[13px] leading-relaxed text-sage-600">
              Share your registration link so a family can register the first patient. New registrations appear here the moment they arrive.
            </p>
          </div>
        )}

        {!loading && !error && patients.length > 0 && (
          <>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="-mb-1 min-w-0 flex-1 overflow-x-auto pb-1">
                <SegmentedFilter<FilterKey>
                  value={filter}
                  onChange={setFilter}
                  options={[
                    { key: "attention", label: "Attention", count: attentionList.length, tone: "attention" },
                    { key: "new", label: "New", count: newCount, tone: "calm" },
                    { key: "active", label: "Active", count: activeCount },
                    { key: "improving", label: "Improving", count: improvingCount, tone: "recovery" },
                    { key: "all", label: "All" },
                  ]}
                />
              </div>
              <span className="hidden shrink-0 text-[12.5px] text-sage-500 sm:block">{filtered.length} shown</span>
            </div>

            {filtered.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-line bg-white/60 p-8 text-center">
                <p className="text-[14px] font-semibold text-ink">
                  {filter === "attention" ? "Nothing needs your attention" : filter === "improving" ? "No improving trends recorded yet" : "No patients in this view"}
                </p>
                <p className="mt-1 text-[13px] text-sage-500">
                  {filter === "attention" ? "Every active patient is progressing as expected." : "Trends appear here as the home team records daily readings."}
                </p>
              </div>
            ) : (
              <ul className="space-y-2.5">
                {filtered.map((e, i) => (
                  <Reveal key={e.p.id} index={i}>
                    <PatientRow
                      e={e}
                      onOpen={() => onOpen(e.p.id, e.p.status)}
                      showPending={showPending}
                    />
                  </Reveal>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------- patient row ------------------------------ */

function PatientRow({
  e, onOpen,
}: {
  e: {
    p: PatientRow; urgent: number; count: number; isNew: boolean; isActive: boolean;
    sig: Signal | null | undefined; needsAttention: boolean; improving: boolean; attentionReason: string;
  };
  onOpen: () => void;
  showPending: boolean;
}) {
  const { p, urgent, sig, isNew, needsAttention, attentionReason } = e;
  const headline = p.diagnosis[0] ?? "Recovery at home";
  const avatarTone: Tone = isNew ? "calm" : urgent > 0 ? "escalation" : needsAttention ? "attention" : "recovery";

  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className={`tap group flex w-full items-center gap-4 rounded-2xl bg-white p-4 text-left shadow-panel ring-1 transition-all hover:shadow-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
          urgent > 0 ? "ring-coral-500/25" : isNew ? "ring-sky-500/25" : "ring-ink/[0.05]"
        }`}
      >
        <Avatar name={p.full_name} tone={avatarTone} size={46} />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-display text-[16px] font-semibold tracking-[-0.01em] text-ink">{p.full_name}</span>
            {isNew ? (
              <StatusTag tone="calm">New</StatusTag>
            ) : p.status === "active" ? (
              needsAttention ? <StatusTag tone={urgent > 0 ? "escalation" : "attention"}>Needs review</StatusTag>
                : <StatusTag tone="recovery">On track</StatusTag>
            ) : (
              <StatusTag tone="neutral">{p.status === "in_review" ? "In review" : "Discharged"}</StatusTag>
            )}
          </div>
          <div className="mt-0.5 truncate text-[13px] text-sage-500">
            {isNew
              ? `${p.age ?? "—"}${p.sex ? " " + p.sex : ""} · registered · tap to build the plan`
              : `${p.age ?? "—"}${p.sex ? " " + p.sex : ""} · Day ${dayAtHome(p)} · ${headline}`}
          </div>
          {/* meaningful change since yesterday */}
          {!isNew && (needsAttention && attentionReason ? (
            <div className={`mt-1.5 inline-flex items-center gap-1.5 text-[12.5px] font-medium ${urgent > 0 ? "text-coral-600" : "text-warn-600"}`}>
              <SignalDot tone={urgent > 0 ? "escalation" : "attention"} pulse={urgent > 0} />
              {attentionReason}
            </div>
          ) : sig ? (
            <div className={`mt-1.5 inline-flex items-center gap-1.5 text-[12.5px] font-medium ${sig.tone === "recovery" ? "text-brand-700" : "text-sage-600"}`}>
              <SignalDot tone={sig.tone} />
              {sig.change}{sig.improving === true ? " · improving" : sig.improving === false ? " · watch" : " · steady"}
            </div>
          ) : (
            <div className="mt-1.5 text-[12.5px] text-sage-400">Awaiting today&rsquo;s readings</div>
          ))}
        </div>

        {/* trajectory */}
        {!isNew && sig && sig.values.length >= 2 && (
          <div className="hidden w-[132px] shrink-0 sm:block">
            <RecoveryTrajectory values={sig.values} tone={sig.tone} height={38} animate={false} />
          </div>
        )}

        <Icon.ChevronRight width={18} height={18} className="shrink-0 text-sage-400 transition-colors group-hover:text-sky-600" />
      </button>
    </li>
  );
}
