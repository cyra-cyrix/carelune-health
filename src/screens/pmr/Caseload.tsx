import { useEffect, useMemo, useState } from "react";
import { Icon } from "../../components/ui";
import { useBranding } from "../../branding/BrandingProvider";
import {
  RecoveryTrajectory, StatusTag, SignalDot, Avatar, SectionLabel, Reveal,
  type Tone,
} from "../../components/clinical";
import { deriveAttention, BANDS, type Attention, type Band } from "./attention-model";
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
  /** The most recent day the home team recorded anything (ISO yyyy-mm-dd). */
  lastRecorded: string | null;
};

function computeSignal(readings: ReadingRow[]): Signal | null {
  // Prefer systolic BP, then GRBS, then urine output — whichever has a real trend.
  const series: { label: string; values: number[]; goodDir: "up" | "down" }[] = [
    { label: "BP", values: readings.map((r) => num((r.bp ?? "").split("/")[0])).filter(Number.isFinite), goodDir: "down" },
    { label: "GRBS", values: readings.map((r) => num(r.grbs)).filter(Number.isFinite), goodDir: "down" },
    { label: "Urine", values: readings.map((r) => num(r.urine_ml)).filter(Number.isFinite), goodDir: "up" },
  ];
  const dates = readings.map((r) => r.reading_date).sort();
  const lastRecorded = dates.length ? dates[dates.length - 1] : null;
  const pick = series.find((s) => s.values.length >= 2);
  if (!pick) return lastRecorded ? { values: [], label: "", change: "", tone: "neutral", improving: null, lastRecorded } : null;
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
    lastRecorded,
  };
}

type Enriched = Attention & { p: PatientRow; isNew: boolean; isActive: boolean; sig: Signal | null | undefined };

const BAND_TONE: Record<Band, Tone> = {
  decision: "escalation", change: "attention", concern: "calm", stable: "recovery",
};

type FilterKey = Band | "all";

/**
 * Doctor Recovery Command Centre — attention first. The list is not a directory:
 * it is ordered by what is waiting on the clinician, and every surfaced patient
 * states why they are there, what changed, how urgent it is, what action is
 * pending, and when the home team last recorded anything.
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
  const [queries, setQueries] = useState<Record<string, PendingCount>>({});
  const [signals, setSignals] = useState<Record<string, Signal | null>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const ps = await listPatients();
        if (!active) return;
        setPatients(ps);
        const ids = ps.map((p) => p.id);
        // The doctor view needs both totals so family concerns can be separated
        // from the approvals that are actually theirs to decide.
        const [allCounts, familyCounts] = showPending
          ? await Promise.all([
              countType === "family" ? Promise.resolve({} as Record<string, PendingCount>) : getPendingApprovalCounts(ids),
              getFamilyQueryCounts(ids),
            ])
          : [{} as Record<string, PendingCount>, {} as Record<string, PendingCount>];
        if (!active) return;
        setPending(allCounts);
        setQueries(familyCounts);
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

  /* ---- derived attention model (real data only) ---- */
  const enrich = useMemo<Enriched[]>(() => {
    return patients.map((p) => {
      const sig = signals[p.id];
      const attention = deriveAttention({
        patient: p,
        allPending: pending[p.id] ?? { pending: 0, urgent: 0 },
        concerns: queries[p.id] ?? { pending: 0, urgent: 0 },
        signal: sig ? { label: sig.label, change: sig.change, improving: sig.improving, lastRecorded: sig.lastRecorded } : null,
        showPending,
        countType,
      });
      return { ...attention, p, isNew: p.status === "pending", isActive: p.status === "active", sig };
    });
  }, [patients, pending, queries, signals, showPending, countType]);

  const bandOf = (key: Band) => enrich.filter((e) => e.band === key);
  const activeCount = enrich.filter((e) => e.isActive).length;
  const newCount = enrich.filter((e) => e.isNew).length;
  const attentionCount = enrich.filter((e) => e.band !== "stable").length;
  const stableCount = bandOf("stable").length;
  const totalPending = Object.values(pending).reduce((a, b) => a + b.pending, 0)
    || Object.values(queries).reduce((a, b) => a + b.pending, 0);
  const totalUrgent = Object.values(pending).reduce((a, b) => a + b.urgent, 0)
    || Object.values(queries).reduce((a, b) => a + b.urgent, 0);

  const visibleBands = useMemo(
    () => (filter === "all" ? BANDS : BANDS.filter((b) => b.key === filter)),
    [filter],
  );

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
        <div className="relative mx-auto max-w-[1120px] overflow-hidden px-5 py-7 lg:px-8 lg:py-8">
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
                  {attentionCount > 0 ? (
                    <><span className="font-semibold text-warn-300">{attentionCount} patient{attentionCount === 1 ? "" : "s"} need{attentionCount === 1 ? "s" : ""} attention</span>
                      {stableCount > 0 && <> · <span className="text-brand-300">{stableCount} stable</span></>}</>
                  ) : activeCount > 0 ? (
                    <>All <span className="font-semibold text-haze-100">{activeCount} patient{activeCount === 1 ? "" : "s"}</span> are progressing as expected.</>
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
        </div>
      </div>

      {/* ---- body ---- */}
      <div className="mx-auto max-w-[1120px] px-5 py-6 lg:px-8">
        {subtitle && <p className="-mt-1 mb-4 text-[13.5px] text-sage-600">{subtitle}</p>}

        {loading && (
          <ul className="space-y-3">
            {[0, 1, 2].map((i) => <li key={i} className="h-[92px] animate-pulse rounded-2xl bg-white/70" />)}
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
            <div className="mb-5 flex flex-wrap items-center gap-2" role="group" aria-label="Filter by attention">
              <FilterChip active={filter === "all"} onClick={() => setFilter("all")} label="All patients" count={enrich.length} />
              {BANDS.map((b) => (
                <FilterChip key={b.key} active={filter === b.key} onClick={() => setFilter(b.key)} label={b.label} count={bandOf(b.key).length} tone={BAND_TONE[b.key]} />
              ))}
            </div>

            {visibleBands.map((band) => {
              const rows = bandOf(band.key);
              if (rows.length === 0 && filter === "all") return null;
              return (
                <section key={band.key} className="mb-7" aria-labelledby={`band-${band.key}`}>
                  <div className="mb-2.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <h2 id={`band-${band.key}`} className="font-display text-[15px] font-semibold tracking-[-0.01em] text-ink">
                      {band.label}
                    </h2>
                    <span className="text-[12.5px] tabular-nums text-sage-500">{rows.length}</span>
                    <span className="text-[12.5px] text-sage-500">{band.blurb}</span>
                  </div>
                  {rows.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-line bg-white/60 p-6 text-center text-[13px] text-sage-500">
                      Nothing in this group.
                    </div>
                  ) : (
                    <ul className="space-y-2.5">
                      {rows.map((e, i) => (
                        <Reveal key={e.p.id} index={i}>
                          <AttentionRow e={e} onOpen={() => onOpen(e.p.id, e.p.status)} />
                        </Reveal>
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

function FilterChip({ active, onClick, label, count, tone }: {
  active: boolean; onClick: () => void; label: string; count: number; tone?: Tone;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`tap inline-flex min-h-[44px] items-center gap-2 rounded-full px-4 text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
        active ? "bg-brand-800 text-white" : "bg-white text-sage-600 ring-1 ring-line hover:text-ink"
      }`}
    >
      {tone && !active && <SignalDot tone={tone} />}
      {label}
      <span className="tabular-nums opacity-70">{count}</span>
    </button>
  );
}

/* ------------------------------- patient row ------------------------------ */

/** One surfaced patient: why · what changed · urgency · pending action · last update. */
function AttentionRow({ e, onOpen }: { e: Enriched; onOpen: () => void }) {
  const { p, sig, isNew, band, urgent } = e;
  const avatarTone: Tone = isNew ? "calm" : urgent ? "escalation" : band === "stable" ? "recovery" : "attention";
  const reasonTone: Tone = urgent ? "escalation" : band === "stable" ? "recovery" : band === "concern" ? "calm" : "attention";

  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className={`tap group flex w-full items-start gap-4 rounded-2xl bg-white p-4 text-left shadow-panel ring-1 transition-all hover:shadow-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
          urgent ? "ring-coral-500/25" : isNew ? "ring-sky-500/25" : "ring-ink/[0.05]"
        }`}
      >
        <Avatar name={p.full_name} tone={avatarTone} size={44} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-display text-[16px] font-semibold tracking-[-0.01em] text-ink">{p.full_name}</span>
            {urgent && <StatusTag tone="escalation">Urgent</StatusTag>}
            {isNew && <StatusTag tone="calm">New</StatusTag>}
            <span className="text-[12.5px] text-sage-500">
              {isNew ? "Registered" : `Day ${dayAtHome(p)}`}
              {p.diagnosis[0] ? ` · ${p.diagnosis[0]}` : ""}
            </span>
          </div>

          {/* why attention is required */}
          <div className={`mt-1.5 inline-flex items-center gap-1.5 text-[13px] font-semibold ${
            urgent ? "text-coral-600" : band === "stable" ? "text-brand-700" : band === "concern" ? "text-sky-700" : "text-warn-600"
          }`}>
            <SignalDot tone={reasonTone} pulse={urgent} />
            {e.reason}
          </div>

          {/* what changed · pending action · last update */}
          <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[12.5px] text-sage-600">
            <div className="flex gap-1.5"><dt className="font-semibold text-sage-500">Changed</dt><dd>{e.changed}</dd></div>
            <div className="flex gap-1.5"><dt className="font-semibold text-sage-500">Pending</dt><dd>{e.action}</dd></div>
            <div className="flex gap-1.5"><dt className="font-semibold text-sage-500">Updated</dt><dd>{e.lastUpdate}</dd></div>
          </dl>
        </div>

        {/* trajectory */}
        {!isNew && sig && sig.values.length >= 2 && (
          <div className="hidden w-[132px] shrink-0 sm:block">
            <RecoveryTrajectory values={sig.values} tone={sig.tone} height={38} animate={false} />
          </div>
        )}

        <Icon.ChevronRight width={18} height={18} className="mt-1 shrink-0 text-sage-400 transition-colors group-hover:text-sky-600" />
      </button>
    </li>
  );
}
