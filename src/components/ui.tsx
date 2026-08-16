import { useRef, type ReactNode, type SVGProps } from "react";
import type { TrendPoint } from "../types";

/* ---------------- Icons (inline, currentColor, 1.6 stroke) ---------------- */
type IconProps = SVGProps<SVGSVGElement>;
const base = (p: IconProps) => ({
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  ...p,
});

export const Icon = {
  Bell: (p: IconProps) => (
    <svg {...base(p)}><path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8" /><path d="M10.3 21a2 2 0 0 0 3.4 0" /></svg>
  ),
  ChevronRight: (p: IconProps) => (
    <svg {...base(p)}><path d="m9 6 6 6-6 6" /></svg>
  ),
  Phone: (p: IconProps) => (
    <svg {...base(p)}><path d="M6.5 3h3l1.5 4-2 1.5a12 12 0 0 0 5 5l1.5-2 4 1.5v3a2 2 0 0 1-2.2 2A16 16 0 0 1 4.5 5.2 2 2 0 0 1 6.5 3Z" /></svg>
  ),
  Check: (p: IconProps) => (
    <svg {...base(p)}><path d="m5 13 4 4L19 7" /></svg>
  ),
  Trash: (p: IconProps) => (
    <svg {...base(p)}><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12M10 11v6M14 11v6" /></svg>
  ),
  Play: (p: IconProps) => (
    <svg {...base(p)}><path d="M8 5.5v13l11-6.5-11-6.5Z" /></svg>
  ),
  Video: (p: IconProps) => (
    <svg {...base(p)}><rect x="3" y="6" width="12" height="12" rx="2" /><path d="m15 10 6-3v10l-6-3" /></svg>
  ),
  Message: (p: IconProps) => (
    <svg {...base(p)}><path d="M4 5h16v11H8l-4 3V5Z" /></svg>
  ),
  Home: (p: IconProps) => (
    <svg {...base(p)}><path d="M4 11 12 4l8 7" /><path d="M6 10v9h12v-9" /></svg>
  ),
  Pulse: (p: IconProps) => (
    <svg {...base(p)}><path d="M3 12h4l2-6 4 12 2-6h6" /></svg>
  ),
  Users: (p: IconProps) => (
    <svg {...base(p)}><circle cx="9" cy="8" r="3" /><path d="M3 20a6 6 0 0 1 12 0" /><path d="M16 6a3 3 0 0 1 0 5.6M21 20a6 6 0 0 0-4-5.7" /></svg>
  ),
  Life: (p: IconProps) => (
    <svg {...base(p)}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3.5" /><path d="m5.5 5.5 3.6 3.6M14.9 14.9l3.6 3.6M18.5 5.5l-3.6 3.6M9.1 14.9l-3.6 3.6" /></svg>
  ),
  Sun: (p: IconProps) => (
    <svg {...base(p)}><circle cx="12" cy="12" r="4" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" /></svg>
  ),
  ChevronLeft: (p: IconProps) => (
    <svg {...base(p)}><path d="m15 6-6 6 6 6" /></svg>
  ),
  Warn: (p: IconProps) => (
    <svg {...base(p)}><path d="M12 4 2.5 20h19L12 4Z" /><path d="M12 10v4M12 17.5v.01" /></svg>
  ),
  Search: (p: IconProps) => (
    <svg {...base(p)}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" /></svg>
  ),
  Camera: (p: IconProps) => (
    <svg {...base(p)}><path d="M4 8h3l1.5-2h7L17 8h3v11H4V8Z" /><circle cx="12" cy="13" r="3.2" /></svg>
  ),
  Plus: (p: IconProps) => (
    <svg {...base(p)}><path d="M12 5v14M5 12h14" /></svg>
  ),
  Mic: (p: IconProps) => (
    <svg {...base(p)}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
  ),
  Drop: (p: IconProps) => (
    <svg {...base(p)}><path d="M12 3s6 6.5 6 11a6 6 0 1 1-12 0c0-4.5 6-11 6-11Z" /></svg>
  ),
  Moon: (p: IconProps) => (
    <svg {...base(p)}><path d="M20 14.5A8 8 0 1 1 9.5 4 6.5 6.5 0 0 0 20 14.5Z" /></svg>
  ),
  Pill: (p: IconProps) => (
    <svg {...base(p)}><rect x="3" y="8" width="18" height="8" rx="4" transform="rotate(-45 12 12)" /><path d="M8.5 8.5 15.5 15.5" /></svg>
  ),
};

/* ---------------- Brand identity ---------------- */
// The Carelune mark: an open ring resolving into a dot — care that continues
// after discharge and closes the loop at home.
export function LoopMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <path
        d="M28 16a12 12 0 1 1-6-10.4"
        stroke="currentColor"
        strokeWidth="3.4"
        strokeLinecap="round"
      />
      <circle cx="27" cy="7.5" r="3.2" fill="currentColor" />
    </svg>
  );
}

export function BrandLockup({ sub = true }: { sub?: boolean }) {
  return (
    <div className="flex items-center gap-2.5 text-brand-600">
      <LoopMark size={26} />
      <div className="shrink-0">
        <div className="font-display text-lg font-semibold leading-none tracking-tight text-ink">
          Carelune
        </div>
        {sub && (
          <div className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.22em] text-sage-500">
            Care continues
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- Avatar ---------------- */
export function Avatar({ initials, className = "" }: { initials: string; className?: string }) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full bg-brand-100 font-display text-brand-700 ${className}`}
      aria-hidden
    >
      {initials}
    </span>
  );
}

/* ---------------- Progress ring (the day, at a glance) ---------------- */
export function ProgressRing({
  value,
  total,
  size = 132,
  onDark = false,
}: {
  value: number;
  total: number;
  size?: number;
  onDark?: boolean; // white ring for gradient heroes
}) {
  const pct = total === 0 ? 0 : value / total;
  const stroke = 11;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const track = onDark ? "rgba(255,255,255,0.22)" : "#DCE4E7";
  const bar = onDark ? "#ffffff" : "#2A6FC7";
  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-label={`${value} of ${total} care steps done today`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={bar}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span
          className={`font-display font-semibold leading-none ${onDark ? "text-white" : "text-ink"}`}
          style={{ fontSize: Math.round(size * 0.3) }}
        >
          {value}
        </span>
        <span
          className={`mt-1 ${onDark ? "text-white/90" : "text-sage-500"}`}
          style={{ fontSize: Math.max(8, Math.round(size * 0.11)) }}
        >
          {size < 76 ? `of ${total}` : `of ${total} done`}
        </span>
      </div>
    </div>
  );
}

/* ---------------- Radio group ---------------- */

/**
 * `role="radiogroup"` promises a screen-reader user one tab stop and arrow-key
 * navigation. This supplies both, so the promise is kept.
 *
 * Children must be `<button role="radio">` elements; use `radioTabIndex` to
 * give exactly one of them `tabIndex={0}`.
 */
export function RadioGroup({
  values,
  value,
  onChange,
  labelledBy,
  label,
  className = "",
  children,
}: {
  values: readonly string[];
  value: string | undefined;
  onChange: (v: string) => void;
  labelledBy?: string;
  label?: string;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const forward = e.key === "ArrowRight" || e.key === "ArrowDown";
    const back = e.key === "ArrowLeft" || e.key === "ArrowUp";
    if (!forward && !back) return;
    e.preventDefault();
    const items = Array.from(
      ref.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]') ?? []
    );
    if (items.length === 0) return;
    const focused = items.findIndex((el) => el === document.activeElement);
    const from = focused === -1 ? Math.max(values.indexOf(value ?? ""), 0) : focused;
    const next = (from + (forward ? 1 : -1) + items.length) % items.length;
    items[next].focus();
    onChange(values[next]);
  };

  return (
    <div
      ref={ref}
      role="radiogroup"
      aria-labelledby={labelledBy}
      aria-label={label}
      className={className}
      onKeyDown={onKeyDown}
    >
      {children}
    </div>
  );
}

/** Exactly one radio is tabbable: the checked one, or the first if none is. */
export const radioTabIndex = (checked: boolean, index: number, hasSelection: boolean) =>
  (hasSelection ? checked : index === 0) ? 0 : -1;

/* ---------------- Recovery trend (weeks) ---------------- */
export function TrendBars({ points, label }: { points: TrendPoint[]; label: string }) {
  const max = 100;
  // The bars themselves are decorative, but the series is the whole point of
  // the card — so the group carries the numbers as its accessible name.
  const description = `${label}: ${points.map((p) => `${p.label} ${p.score}`).join(", ")}.`;
  return (
    <div className="flex items-end gap-3" role="img" aria-label={description}>
      {points.map((p, i) => {
        const last = i === points.length - 1;
        return (
          <div key={p.label} className="flex flex-1 flex-col items-center gap-1.5">
            <span className={`text-xs font-semibold ${last ? "text-brand-700" : "text-sage-500"}`}>{p.score}</span>
            <div
              className={`w-full max-w-[36px] rounded-t-md ${last ? "bg-brand-600" : "bg-brand-200"}`}
              style={{ height: Math.round((p.score / max) * 96) }}
            />
            <span className="text-[11px] text-sage-500">{p.label}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- Card wrapper ---------------- */
export function Card({
  children,
  className = "",
  labelledBy,
}: {
  children: ReactNode;
  className?: string;
  labelledBy?: string;
}) {
  return (
    <section aria-labelledby={labelledBy} className={`card p-5 sm:p-6 ${className}`}>
      {children}
    </section>
  );
}
