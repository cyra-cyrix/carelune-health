/*
 * Putting a patient on a continuing-care programme (0028).
 *
 * The provider picks one of their own published packages; everything the
 * patient will be held to — price, platform fee, monitoring, cadences, the
 * programme itself — is read out of that package by the database and frozen
 * onto the enrolment. This screen therefore sends two things: the patient and
 * the chosen package. It shows what is about to be frozen so the choice is an
 * informed one, and nothing else.
 *
 * It renders nothing at all for an organisation with no published service, so
 * a legacy recovery centre's setup page is exactly what it was.
 */
import { useEffect, useState } from "react";
import {
  assignServicePackage,
  getCentreServices,
  getSubscription,
  type CentreServiceRow,
  type ServicePackageRow,
  type SubscriptionRow,
} from "../../lib/db";
import { periodsForPackage, type SuggestedPackage } from "../../domain/serviceDraft";
import { Card, ErrorNote, PrimaryButton, SectionHeader, Skeleton } from "../../components/system";
import { DomainChips } from "../platform/programme-kit";

const inr = (n: number | null | undefined, currency = "INR") =>
  n == null ? "Price not set" : currency === "INR" ? `₹${n.toLocaleString("en-IN")}` : `${currency} ${n.toLocaleString()}`;

const asSuggested = (p: ServicePackageRow): SuggestedPackage => ({
  name: p.name,
  positioning: p.positioning ?? "",
  duration_days: p.duration_days,
  monitoring_domains: p.monitoring_domains ?? [],
  checkin_frequency: p.checkin_frequency ?? "",
  review_frequency: p.review_frequency ?? "",
  support_level: p.support_level ?? "",
  includes: p.includes ?? [],
  milestones: Array.isArray(p.milestones) ? (p.milestones as unknown[]).map(String) : [],
});

type Choice = { service: CentreServiceRow; pkg: ServicePackageRow };

export default function AssignProgramme({ patientId, patientName }: { patientId: string; patientName?: string }) {
  const [services, setServices] = useState<CentreServiceRow[] | null>(null);
  const [sub, setSub] = useState<SubscriptionRow | null>(null);
  const [chosen, setChosen] = useState<Choice | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([
      getCentreServices().catch(() => [] as CentreServiceRow[]),
      getSubscription(patientId).catch(() => null),
    ]).then(([rows, existing]) => {
      if (!active) return;
      // Only what this patient could actually be put on: the provider's own
      // confirmed services, and packages that are live within them.
      setServices(
        rows
          .filter((s) => s.status === "published")
          .map((s) => ({ ...s, packages: s.packages.filter((p) => p.status === "active") }))
          .filter((s) => s.packages.length > 0),
      );
      setSub(existing);
    });
    return () => { active = false; };
  }, [patientId]);

  if (services === null) return <Card><Skeleton className="h-24" /></Card>;

  // Enrolled already — show what they are on, frozen as it was on the day.
  if (sub?.service_package_id) {
    const snap = sub.package_snapshot ?? {};
    return (
      <Card>
        <SectionHeader title="Continuing-care programme" sub="What this patient follows at home." />
        <div className="mt-4 rounded-2xl bg-good-100 p-5 ring-1 ring-good-500/20">
          <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-good-600">Programme assigned</p>
          <p className="mt-2 font-display text-[19px] font-semibold tracking-tight text-ink">{snap.name ?? sub.plan_name}</p>
          <p className="mt-0.5 text-[13.5px] text-sage-600">{snap.service_name}</p>
          <dl className="mt-4 grid gap-4 sm:grid-cols-3">
            <Fact label="Duration">{snap.duration_days ? `${snap.duration_days} days` : "—"}</Fact>
            <Fact label="Started">{new Date(sub.started_at).toLocaleDateString()}</Fact>
            <Fact label="Status">{sub.status === "trial" ? "In trial" : sub.status === "active" ? "Active" : "Cancelled"}</Fact>
          </dl>
        </div>
      </Card>
    );
  }

  // Nothing published yet, or the patient is on the legacy centre package —
  // either way this section has nothing to offer and stays out of the way.
  if (services.length === 0 || sub) return null;

  const pkg = chosen ? asSuggested(chosen.pkg) : null;
  const periods = chosen && pkg
    ? periodsForPackage(chosen.service.programme_config?.programme_outline ?? [], pkg, chosen.service.packages.map(asSuggested))
    : [];

  const assign = async () => {
    if (!chosen) return;
    setAssigning(true);
    setError(null);
    try {
      setSub(await assignServicePackage(patientId, chosen.pkg.id));
      setChosen(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not assign the programme.");
    } finally {
      setAssigning(false);
    }
  };

  return (
    <Card>
      <SectionHeader
        title="Assign continuing-care programme"
        sub={`What ${patientName ?? "this patient"} will follow at home. You can only assign a programme you have confirmed.`}
      />

      <div className="mt-4 space-y-6">
        {services.map((s) => (
          <div key={s.id}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-sage-400">{s.name}</p>
            <ul className="mt-3 grid gap-2.5 md:grid-cols-3">
              {s.packages.map((p) => {
                const on = chosen?.pkg.id === p.id;
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => setChosen(on ? null : { service: s, pkg: p })}
                      aria-pressed={on}
                      className={`tap h-full w-full rounded-2xl border p-4 text-left transition-all ${
                        on ? "border-sky-500 bg-sky-50 ring-1 ring-sky-500/30" : "border-line bg-white hover:bg-mist-100"
                      }`}
                    >
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="text-[15px] font-semibold text-ink">{p.name}</span>
                        <span className="shrink-0 text-[12px] font-semibold text-sage-500">{p.duration_days} days</span>
                      </span>
                      <span className="mt-1.5 block text-[14px] font-semibold text-ink">{inr(p.price, p.currency ?? "INR")}</span>
                      {p.positioning && <span className="mt-1 block text-[12.5px] leading-relaxed text-sage-500">{p.positioning}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      {chosen && pkg && (
        <section aria-label="Programme preview" className="mt-6 rounded-2xl bg-mist-100 p-5">
          <h3 className="font-display text-[17px] font-semibold tracking-tight text-ink">
            {pkg.name} · {pkg.duration_days} days
          </h3>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <Fact label="Check-ins">{pkg.checkin_frequency || "—"}</Fact>
            <Fact label="Professional review">{pkg.review_frequency || "—"}</Fact>
            <Fact label="Patient price">{inr(chosen.pkg.price, chosen.pkg.currency ?? "INR")}</Fact>
            <Fact label="Carelune platform fee">{chosen.pkg.platform_fee_pct}%</Fact>
          </dl>

          <div className="mt-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-sage-400">Areas followed at home</p>
            <div className="mt-2"><DomainChips domains={pkg.monitoring_domains} /></div>
          </div>

          {periods.length > 0 && (
            <div className="mt-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-sage-400">Programme</p>
              <ul className="mt-2 space-y-1.5">
                {periods.map((period) => (
                  <li key={period.period_label} className="flex flex-wrap items-baseline gap-x-2 text-[14px]">
                    <span className="font-semibold text-ink">{period.period_label}</span>
                    <span className="text-sage-600">{period.focus}</span>
                    {period.checkin_frequency && <span className="text-sage-400">· {period.checkin_frequency}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="mt-5 text-[12.5px] leading-relaxed text-sage-500">
            {patientName ?? "This patient"} stays on this programme as it is today, even if you revise the package later.
          </p>

          {error && <div className="mt-4"><ErrorNote>{error}</ErrorNote></div>}
          <div className="mt-5">
            <PrimaryButton onClick={assign} disabled={assigning}>
              {assigning ? "Assigning…" : "Assign programme"}
            </PrimaryButton>
          </div>
        </section>
      )}
    </Card>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-[0.13em] text-sage-400">{label}</dt>
      <dd className="mt-1 text-[14.5px] text-ink">{children}</dd>
    </div>
  );
}
