// Carelune — Phase 2 premium clinical design system.
// Calm sky-blue / white / soft-grey / near-black primitives shared by the new
// Super Admin and HOD onboarding surfaces. Restrained, accessible, responsive.

import type { ReactNode } from "react";
import type { PathwayStatus } from "../domain/pathways";

/* ------------------------------- inputs ---------------------------------- */

export const inputCls =
  "w-full rounded-xl bg-white px-3.5 py-2.5 text-[14px] text-ink ring-1 ring-line placeholder:text-sage-400 " +
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 transition-shadow";

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12.5px] font-semibold text-sage-600">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11.5px] leading-relaxed text-sage-500">{hint}</span>}
    </label>
  );
}

/* ------------------------------- surfaces -------------------------------- */

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl bg-white p-5 shadow-card ring-1 ring-ink/[0.05] ${className}`}>{children}</section>
  );
}

export function SectionHeader({ title, sub, action }: { title: string; sub?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="font-display text-[16px] font-semibold text-ink">{title}</h2>
        {sub && <p className="mt-0.5 text-[13px] leading-relaxed text-sage-500">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

export function Kpi({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-card ring-1 ring-ink/[0.05]">
      <div className="text-[11.5px] font-semibold uppercase tracking-wide text-sage-500">{label}</div>
      <div className="mt-1 text-[22px] font-semibold leading-none text-ink">{value}</div>
      {hint && <div className="mt-1 text-[12px] text-sage-500">{hint}</div>}
    </div>
  );
}

/* ------------------------------- buttons --------------------------------- */

export function PrimaryButton({
  children, onClick, disabled, type = "button", className = "",
}: { children: ReactNode; onClick?: () => void; disabled?: boolean; type?: "button" | "submit"; className?: string }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`tap inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-[14px] font-semibold text-white shadow-sm transition-colors hover:bg-sky-700 disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  );
}

export function GhostButton({
  children, onClick, disabled, className = "",
}: { children: ReactNode; onClick?: () => void; disabled?: boolean; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`tap inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-white px-4 py-2.5 text-[14px] font-semibold text-ink transition-colors hover:bg-mist-100 disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  );
}

/* ------------------------------- badges ---------------------------------- */

const STATUS_BADGE: Record<PathwayStatus, { label: string; cls: string }> = {
  draft: { label: "Draft pathway", cls: "bg-mist-200 text-sage-700" },
  clinically_review_required: { label: "Requires clinical approval", cls: "bg-warn-100 text-warn-600" },
  approved: { label: "Approved", cls: "bg-good-100 text-good-600" },
  retired: { label: "Retired", cls: "bg-mist-200 text-sage-600" },
};

/** Pathway governance badge. Never presents draft content as an approved or
 *  national standard — copy stays "Draft pathway" / "Requires clinical approval". */
export function PathwayStatusBadge({ status }: { status: PathwayStatus }) {
  const s = STATUS_BADGE[status] ?? STATUS_BADGE.draft;
  return <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${s.cls}`}>{s.label}</span>;
}

export function Chip({ children, tone = "sky" }: { children: ReactNode; tone?: "sky" | "grey" | "good" | "warn" }) {
  const map = {
    sky: "bg-sky-50 text-sky-700 ring-sky-200",
    grey: "bg-mist-100 text-sage-600 ring-ink/10",
    good: "bg-good-100 text-good-600 ring-good-500/20",
    warn: "bg-warn-100 text-warn-600 ring-warn-500/20",
  } as const;
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold ring-1 ${map[tone]}`}>{children}</span>;
}

/* ------------------------------- stepper --------------------------------- */

export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="flex items-center gap-2 overflow-x-auto pb-1" aria-label="Setup progress">
      {steps.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={s} className="flex shrink-0 items-center gap-2">
            <span
              className={`grid h-6 w-6 place-items-center rounded-full text-[11px] font-bold ${
                done ? "bg-sky-600 text-white" : active ? "bg-sky-100 text-sky-700 ring-2 ring-sky-500" : "bg-mist-200 text-sage-500"
              }`}
            >
              {done ? "✓" : i + 1}
            </span>
            <span className={`whitespace-nowrap text-[12.5px] font-semibold ${active ? "text-ink" : "text-sage-500"}`}>{s}</span>
            {i < steps.length - 1 && <span className="mx-1 h-px w-6 bg-line" />}
          </li>
        );
      })}
    </ol>
  );
}

/* ------------------------------- states ---------------------------------- */

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-white/60 p-8 text-center">
      <p className="text-[15px] font-semibold text-ink">{title}</p>
      {body && <p className="mx-auto mt-1 max-w-sm text-[13px] leading-relaxed text-sage-500">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-mist-200 ${className}`} />;
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl bg-coral-100 px-3.5 py-2 text-[13px] text-coral-600 ring-1 ring-coral-200">{children}</p>
  );
}

/* ------------------------- selectable pathway pack ------------------------ */

export function PackCard({
  name, specialty, description, selected, disabled, onToggle,
}: {
  name: string;
  specialty: string;
  description?: string | null;
  selected: boolean;
  disabled?: boolean;
  onToggle?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={selected}
      className={`tap group relative w-full rounded-2xl border p-4 text-left transition-all ${
        selected ? "border-sky-500 bg-sky-50 ring-2 ring-sky-500/30" : "border-line bg-white hover:border-sky-300 hover:bg-sky-50/40"
      } ${disabled ? "cursor-default opacity-70" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[15px] font-semibold text-ink">{name}</div>
          <div className="mt-0.5 text-[12px] font-medium text-sky-700">{specialty}</div>
        </div>
        <span
          className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[11px] ${
            selected ? "border-sky-600 bg-sky-600 text-white" : "border-line text-transparent"
          }`}
        >
          ✓
        </span>
      </div>
      {description && <p className="mt-2 text-[12.5px] leading-relaxed text-sage-600">{description}</p>}
    </button>
  );
}
