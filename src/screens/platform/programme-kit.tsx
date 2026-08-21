/*
 * The presentational vocabulary of the service builder.
 *
 * Everything here renders from the structured service draft and nothing else.
 * There is no specialty in this file — no branch on provider type, no spine
 * wording, no postpartum wording — because the same components render a spine
 * surgeon's recovery programme and a lactation consultant's mother-and-baby
 * programme. If a change here needs to know which one it is drawing, the
 * architecture has gone wrong.
 */
import type { ReactNode } from "react";
import type { ProgrammePeriod, SuggestedPackage } from "../../domain/serviceDraft";

/** A quiet label above a value — the builder's primary reading unit. */
export function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-[0.13em] text-sage-400">{label}</dt>
      <dd className="mt-1.5 text-[15px] leading-relaxed text-ink">{children}</dd>
    </div>
  );
}

/** Monitoring areas. Calm, uniform, never colour-coded by meaning. */
export function DomainChips({ domains, tone = "sky" }: { domains: string[]; tone?: "sky" | "quiet" }) {
  if (domains.length === 0) return <span className="text-[14px] text-sage-400">Not set yet</span>;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {domains.map((d) => (
        <li
          key={d}
          className={
            tone === "sky"
              ? "rounded-full bg-sky-50 px-2.5 py-1 text-[12.5px] font-medium text-sky-800"
              : "rounded-full bg-mist-100 px-2.5 py-1 text-[12.5px] font-medium text-sage-600"
          }
        >
          {d}
        </li>
      ))}
    </ul>
  );
}

/** The "this is not live yet" mark. Used wherever model-drafted text appears. */
export function AiDraftMark({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full bg-warn-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-warn-600 ${className}`}
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-warn-500" />
      AI draft
    </span>
  );
}

export function PackageCard({
  pkg,
  selected = false,
  onPreview,
  onEdit,
  pricing,
}: {
  pkg: SuggestedPackage;
  selected?: boolean;
  onPreview: () => void;
  onEdit: () => void;
  /** What families pay, where the viewer is allowed to set it. */
  pricing?: ReactNode;
}) {
  const weeks = pkg.duration_days % 7 === 0 ? `${pkg.duration_days / 7} weeks` : `${pkg.duration_days} days`;
  // An id may not contain whitespace, and aria-labelledby is a space-separated
  // list of ids — a raw package name would silently leave the card unnamed.
  const titleId = `pkg-${pkg.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <article
      aria-labelledby={titleId}
      className={`flex h-full flex-col rounded-3xl bg-white p-6 shadow-card ring-1 transition-shadow hover:shadow-lift ${
        selected ? "ring-sky-500/40" : "ring-ink/[0.06]"
      }`}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3 id={titleId} className="font-display text-[19px] font-semibold tracking-tight text-ink">
          {pkg.name}
        </h3>
        <span className="shrink-0 rounded-full bg-mist-100 px-2.5 py-1 text-[12px] font-semibold text-sage-600">{weeks}</span>
      </div>
      {pkg.positioning && <p className="mt-2 text-[14px] leading-relaxed text-sage-600">{pkg.positioning}</p>}

      <dl className="mt-5 flex-1 space-y-4 border-t border-line/70 pt-5">
        <Detail label="Check-ins">{pkg.checkin_frequency}</Detail>
        <Detail label="Professional review">{pkg.review_frequency}</Detail>
        {pkg.support_level && <Detail label="Support">{pkg.support_level}</Detail>}
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-[0.13em] text-sage-400">Areas followed</dt>
          <dd className="mt-2">
            <DomainChips domains={pkg.monitoring_domains} />
          </dd>
        </div>
        {pkg.milestones.length > 0 && (
          <Detail label="Milestones">
            <ul className="space-y-1.5">
              {pkg.milestones.map((m) => (
                <li key={m} className="flex gap-2 text-[14.5px] text-ink">
                  <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-sky-400" />
                  {m}
                </li>
              ))}
            </ul>
          </Detail>
        )}
        {pkg.includes.length > 0 && (
          <Detail label="Includes">
            <ul className="space-y-1.5">
              {pkg.includes.map((m) => (
                <li key={m} className="flex gap-2 text-[14.5px] text-sage-600">
                  <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-mist-200" />
                  {m}
                </li>
              ))}
            </ul>
          </Detail>
        )}
      </dl>

      {pricing && <div className="mt-5 border-t border-line/70 pt-4">{pricing}</div>}

      <div className="mt-6 flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={onPreview}
          className="tap flex-1 rounded-xl bg-mist-100 px-3 py-2.5 text-[13.5px] font-semibold text-ink transition-colors hover:bg-mist-200"
        >
          Preview programme
        </button>
        <button
          type="button"
          onClick={onEdit}
          className="tap rounded-xl px-3 py-2.5 text-[13.5px] font-semibold text-sage-600 transition-colors hover:text-ink"
        >
          Edit
        </button>
      </div>
    </article>
  );
}

/**
 * The programme, period by period. Driven entirely by `periods` — the same
 * renderer draws "Week 1 · Early recovery · Daily check-in" and "Week 1 ·
 * Establishing feeding · Daily check-in".
 */
export function ProgrammeTimeline({ periods }: { periods: ProgrammePeriod[] }) {
  if (periods.length === 0) {
    return <p className="text-[14px] text-sage-500">This programme has no periods described yet.</p>;
  }
  return (
    <ol className="relative space-y-8">
      {/* the rail */}
      <span aria-hidden className="absolute left-[7px] top-2 bottom-2 w-px bg-line" />
      {periods.map((p) => (
        <li key={p.period_label} className="relative pl-8">
          <span aria-hidden className="absolute left-0 top-[6px] h-[15px] w-[15px] rounded-full border-[3px] border-white bg-sky-500 shadow-[0_0_0_1px_rgba(42,111,199,0.25)]" />
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h4 className="font-display text-[17px] font-semibold tracking-tight text-ink">{p.period_label}</h4>
            {p.checkin_frequency && (
              <span className="rounded-full bg-sky-50 px-2.5 py-0.5 text-[12px] font-semibold text-sky-800">{p.checkin_frequency}</span>
            )}
          </div>
          {p.focus && <p className="mt-1 text-[15px] text-sage-600">{p.focus}</p>}

          {p.monitoring_domains.length > 0 && (
            <div className="mt-3.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-sage-400">Monitoring</p>
              <div className="mt-2">
                <DomainChips domains={p.monitoring_domains} tone="quiet" />
              </div>
            </div>
          )}
          {p.milestones.length > 0 && (
            <div className="mt-3.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-sage-400">Milestones</p>
              <ul className="mt-2 space-y-1.5">
                {p.milestones.map((m) => (
                  <li key={m} className="flex gap-2 text-[14.5px] text-ink">
                    <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-good-300" />
                    {m}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}
