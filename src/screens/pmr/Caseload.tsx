import { useEffect, useState } from "react";
import { Icon } from "../../components/ui";
import {
  listPatients,
  getPendingApprovalCounts,
  getFamilyQueryCounts,
  type PatientRow,
  type PendingCount,
} from "../../lib/db";

/** Whole days since journey start, 1-indexed. */
function dayAtHome(p: PatientRow): number {
  const start = new Date(p.journey_start).getTime();
  return Math.max(1, Math.floor((Date.now() - start) / 86_400_000) + 1);
}

/** Caseload — the signed-in staff member's patients, with live pending counts. */
export default function Caseload({
  onOpen,
  heading = "My patients",
  subtitle = "Recovery at home — you own every clinical decision.",
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
  const [patients, setPatients] = useState<PatientRow[]>([]);
  const [pending, setPending] = useState<Record<string, PendingCount>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Could not load your patients.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [showPending, countType]);

  const totalPending = Object.values(pending).reduce((a, b) => a + b.pending, 0);
  const totalUrgent = Object.values(pending).reduce((a, b) => a + b.urgent, 0);

  return (
    <div className="min-h-full bg-mist">
      <div className="mx-auto max-w-[1100px] px-5 py-6 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-semibold text-ink">{heading}</h1>
            <p className="mt-0.5 text-[14px] text-sage-500">{subtitle}</p>
          </div>
          {showPending && (totalPending > 0 || totalUrgent > 0) && (
            <div className="flex items-center gap-2">
              {totalUrgent > 0 && (
                <span className="inline-flex items-center gap-2 rounded-full bg-coral-100 px-3.5 py-1.5 text-[13px] font-semibold text-coral-600">
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-coral-600 text-[11px] text-white">
                    {totalUrgent}
                  </span>
                  urgent
                </span>
              )}
              {totalPending > 0 && (
                <span className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3.5 py-1.5 text-[13px] font-semibold text-brand-700">
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-brand-600 text-[11px] text-white">
                    {totalPending}
                  </span>
                  {countType === "family" ? "to answer" : "awaiting you"}
                </span>
              )}
            </div>
          )}
        </div>

        {loading && (
          <ul className="mt-5 space-y-3">
            {[0, 1, 2].map((i) => (
              <li key={i} className="h-[76px] animate-pulse rounded-2xl bg-white/70" />
            ))}
          </ul>
        )}

        {!loading && error && (
          <div className="mt-5 rounded-2xl bg-white p-5 shadow-lift ring-1 ring-ink/[0.05]">
            <p className="text-[14px] font-semibold text-ink">Couldn&rsquo;t load your patients</p>
            <p className="mt-1 text-[13px] text-sage-600">{error}</p>
          </div>
        )}

        {!loading && !error && patients.length === 0 && (
          <div className="mt-5 rounded-2xl bg-white p-6 text-center shadow-lift ring-1 ring-ink/[0.05]">
            <p className="text-[15px] font-semibold text-ink">No patients yet</p>
            <p className="mt-1 text-[13px] text-sage-600">
              Share your registration link so a family can register the first patient.
            </p>
          </div>
        )}

        {!loading && !error && patients.length > 0 && (
          <ul className="mt-5 space-y-3">
            {patients.map((p) => {
              const c = pending[p.id];
              const count = c?.pending ?? 0;
              const urgent = c?.urgent ?? 0;
              const headline = p.diagnosis[0] ?? "Recovery at home";
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => onOpen(p.id, p.status)}
                    className={`tap flex w-full items-center gap-4 rounded-2xl bg-white p-4 text-left shadow-lift ring-1 hover:ring-brand-300 ${
                      p.status === "pending" ? "ring-warn-500/30" : "ring-ink/[0.05]"
                    }`}
                  >
                    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-mist text-[15px] font-semibold text-brand-700">
                      {p.full_name.split(" ").map((w) => w[0]).join("").slice(0, 2)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="font-display text-[16px] font-semibold text-ink">{p.full_name}</span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            p.status === "active"
                              ? "bg-good-100 text-good-600"
                              : p.status === "pending"
                                ? "bg-warn-100 text-warn-600"
                                : "bg-mist text-sage-600"
                          }`}
                        >
                          {p.status === "active"
                            ? "Active"
                            : p.status === "pending"
                              ? "Needs plan"
                              : p.status === "in_review"
                                ? "In review"
                                : "Discharged"}
                        </span>
                      </span>
                      <span className="mt-0.5 block truncate text-[13px] text-sage-500">
                        {p.status === "pending"
                          ? `${p.age ?? "—"} ${p.sex ?? ""} · registered · tap to add the plan`
                          : `${p.age ?? "—"} ${p.sex ?? ""} · Day ${dayAtHome(p)} · ${headline}`}
                      </span>
                    </span>
                    {showPending && urgent > 0 && (
                      <span className="shrink-0 rounded-full bg-coral-100 px-2.5 py-1 text-[12px] font-semibold text-coral-600">
                        {urgent} urgent
                      </span>
                    )}
                    {showPending && urgent === 0 && count > 0 && (
                      <span className="shrink-0 rounded-full bg-brand-50 px-2.5 py-1 text-[12px] font-semibold text-brand-700">
                        {count} {countType === "family" ? "to answer" : "pending"}
                      </span>
                    )}
                    <Icon.ChevronRight width={18} height={18} className="shrink-0 text-brand-600" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
