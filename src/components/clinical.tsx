// Carelune — Doctor Experience design language: "Clinical intelligence with human calm."
//
// Premium, restrained primitives for the four signature doctor surfaces (branded
// login, Recovery Command Centre, Patient Recovery Cockpit, AI Plan Studio).
// Authority = midnight/navy · intelligence & actions = clinical blue (sky) ·
// recovery & improvement = teal/aqua (brand) · attention = amber (warn) ·
// serious escalation = coral. Hierarchy comes from whitespace, type and signal
// colour — never from a grid of equal cards. Motion is purposeful only.

import { useId, useState } from "react";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

/* ------------------------------ signal tones ------------------------------ */

export type Tone = "recovery" | "attention" | "escalation" | "calm" | "neutral";

/** Foreground / dot / soft-fill classes per clinical signal tone. */
export const toneClasses: Record<Tone, { text: string; dot: string; soft: string; ring: string }> = {
  recovery: { text: "text-brand-800", dot: "bg-brand-500", soft: "bg-brand-50", ring: "ring-brand-500/25" },
  attention: { text: "text-warn-600", dot: "bg-warn-500", soft: "bg-warn-100/70", ring: "ring-warn-500/25" },
  escalation: { text: "text-coral-600", dot: "bg-coral-500", soft: "bg-coral-100/70", ring: "ring-coral-500/25" },
  calm: { text: "text-sky-700", dot: "bg-sky-500", soft: "bg-sky-50", ring: "ring-sky-500/25" },
  neutral: { text: "text-sage-600", dot: "bg-sage-400", soft: "bg-mist-100", ring: "ring-ink/10" },
};

/** A small status dot — quiet, positioned before a label. */
export function SignalDot({ tone, pulse = false }: { tone: Tone; pulse?: boolean }) {
  const t = toneClasses[tone];
  return (
    <span className="relative inline-flex h-2 w-2 shrink-0">
      {pulse && <span className={`absolute inline-flex h-full w-full rounded-full opacity-50 motion-safe:animate-ping ${t.dot}`} />}
      <span className={`relative inline-flex h-2 w-2 rounded-full ${t.dot}`} />
    </span>
  );
}

/** A soft status tag using the clinical-signal vocabulary. */
export function StatusTag({ tone, children }: { tone: Tone; children: ReactNode }) {
  const t = toneClasses[tone];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold ring-1 ${t.soft} ${t.text} ${t.ring}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${t.dot}`} />
      {children}
    </span>
  );
}

/* ------------------------------ editorial bits ---------------------------- */

/** Small uppercase editorial label above a section. */
export function SectionLabel({ children, onDark = false }: { children: ReactNode; onDark?: boolean }) {
  return (
    <div className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${onDark ? "text-haze-400" : "text-sage-500"}`}>
      {children}
    </div>
  );
}

/** Initials avatar with a calm tint. */
export function Avatar({ name, size = 44, tone = "calm" }: { name: string; size?: number; tone?: Tone }) {
  const initials = name.split(" ").filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const t = toneClasses[tone];
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-full font-semibold ${t.soft} ${t.text} ring-1 ${t.ring}`}
      style={{ width: size, height: size, fontSize: size * 0.34 }}
      aria-hidden
    >
      {initials}
    </span>
  );
}

/* --------------------------- recovery trajectory -------------------------- */

/**
 * A composed recovery-trajectory line — soft gradient area + drawn line with a
 * leading node. Tone carries meaning (recovery/attention). `animate` draws the
 * line once on mount (respects reduced-motion via the CSS animation utility).
 */
export function RecoveryTrajectory({
  values, tone = "recovery", height = 40, className = "", animate = true, onDark = false,
}: {
  values: number[]; tone?: Tone; height?: number; className?: string; animate?: boolean; onDark?: boolean;
}) {
  const gid = useId().replace(/[:]/g, "");
  const stroke = tone === "attention" ? "#A66E08" : tone === "escalation" ? "#C4392C" : onDark ? "#5E9DE6" : "#2A6FC7";
  const W = 240;
  const H = height;
  if (values.length < 2) {
    return <div className={`text-[12px] ${onDark ? "text-haze-400" : "text-sage-500"} ${className}`}>Trend appears as readings arrive.</div>;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = (max - min) * 0.45 || 1;
  const lo = min - pad;
  const range = max + pad - lo;
  const n = values.length;
  const px = (i: number) => (i / (n - 1)) * (W - 6) + 3;
  const py = (v: number) => H - 3 - ((v - lo) / range) * (H - 6);
  const pts = values.map((v, i) => `${px(i).toFixed(1)},${py(v).toFixed(1)}`);
  const line = pts.join(" ");
  const lastX = px(n - 1);
  const lastY = py(values[n - 1]);
  const dash = W * 1.4;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" className={className} aria-hidden>
      <defs>
        <linearGradient id={`grad-${gid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity={onDark ? 0.32 : 0.20} />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline points={`3,${H - 3} ${line} ${lastX.toFixed(1)},${H - 3}`} fill={`url(#grad-${gid})`} stroke="none" />
      <polyline
        points={line}
        fill="none"
        stroke={stroke}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        style={animate ? { strokeDasharray: dash, ["--dash" as string]: String(dash) } : undefined}
        className={animate ? "motion-safe:animate-draw" : undefined}
      />
      <circle cx={lastX} cy={lastY} r={3} fill={stroke} />
      <circle cx={lastX} cy={lastY} r={6} fill={stroke} opacity="0.18" />
    </svg>
  );
}

/* ------------------------------ signal readout ---------------------------- */

/** A single clinical signal: label, current value, and a quiet trend note. */
export function SignalStat({
  label, value, note, tone = "neutral", onDark = false,
}: {
  label: string; value: ReactNode; note?: ReactNode; tone?: Tone; onDark?: boolean;
}) {
  return (
    <div>
      <div className={`text-[11px] font-semibold uppercase tracking-[0.1em] ${onDark ? "text-haze-400" : "text-sage-500"}`}>{label}</div>
      <div className={`mt-1 text-[20px] font-semibold leading-none tabular-nums ${onDark ? "text-haze-100" : "text-ink"}`}>{value}</div>
      {note && <div className={`mt-1 text-[12px] ${toneClasses[tone].text}`}>{note}</div>}
    </div>
  );
}

/* --------------------------- segmented filter ----------------------------- */

export function SegmentedFilter<T extends string>({
  options, value, onChange,
}: {
  options: { key: T; label: string; count?: number; tone?: Tone }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-full bg-mist-100 p-1 ring-1 ring-ink/[0.05]">
      {options.map((o) => {
        const active = o.key === value;
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key)}
            aria-pressed={active}
            className={`tap inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
              active ? "bg-white text-ink shadow-sm ring-1 ring-ink/[0.06]" : "text-sage-600 hover:text-ink"
            }`}
          >
            {o.label}
            {o.count != null && o.count > 0 && (
              <span
                className={`grid h-4 min-w-4 place-items-center rounded-full px-1 text-[10.5px] font-bold ${
                  o.tone ? `${toneClasses[o.tone].soft} ${toneClasses[o.tone].text}` : "bg-mist-200 text-sage-600"
                }`}
              >
                {o.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ----------------------------- reveal wrapper ----------------------------- */

/** Progressive-disclosure reveal with a small stagger by index. */
export function Reveal({ children, index = 0, className = "" }: { children: ReactNode; index?: number; className?: string }) {
  return (
    <div className={`motion-safe:animate-reveal ${className}`} style={{ animationDelay: `${Math.min(index, 8) * 55}ms` }}>
      {children}
    </div>
  );
}

/* ------------------------------- composed panel --------------------------- */

/**
 * A composed working surface. Heading is editorial; body is calm. Used instead
 * of stacking many equal white cards — reserve for genuinely distinct sections.
 */
export function Panel({
  title, label, aside, children, className = "", tone,
}: {
  title?: ReactNode; label?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string; tone?: Tone;
}) {
  const ring = tone ? toneClasses[tone].ring : "ring-ink/[0.05]";
  const bg = tone ? toneClasses[tone].soft : "bg-white";
  return (
    <section className={`rounded-3xl ${bg} p-5 shadow-panel ring-1 ${ring} sm:p-6 ${className}`}>
      {(title || label || aside) && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {label && <div className="mb-1"><SectionLabel>{label}</SectionLabel></div>}
            {title && <h2 className="font-display text-[17px] font-semibold tracking-[-0.01em] text-ink">{title}</h2>}
          </div>
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

/* --------------------------- AI journey stepper --------------------------- */

export type JourneyState = "idle" | "active" | "done";

/**
 * The AI Plan Studio guided journey — a vertical rail of stages that light up as
 * the model reads the document, structures facts, applies the pathway and checks
 * for gaps. Quiet, confident, never a spinner-with-percentages gimmick.
 */
export function JourneySteps({
  steps, onDark = false,
}: {
  steps: { label: string; caption?: string; state: JourneyState }[];
  onDark?: boolean;
}) {
  return (
    <ol className="space-y-0">
      {steps.map((s, i) => {
        const last = i === steps.length - 1;
        return (
          <li key={s.label} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className={`grid h-6 w-6 place-items-center rounded-full text-[11px] font-bold transition-colors ${
                  s.state === "done"
                    ? "bg-brand-500 text-white"
                    : s.state === "active"
                      ? "bg-sky-600 text-white ring-4 ring-sky-500/20"
                      : onDark ? "bg-midnight-600 text-haze-400" : "bg-mist-200 text-sage-500"
                }`}
              >
                {s.state === "done" ? "✓" : i + 1}
              </span>
              {!last && (
                <span className={`my-1 w-px flex-1 ${s.state === "done" ? "bg-brand-300" : onDark ? "bg-midnight-600" : "bg-line"}`} style={{ minHeight: 18 }} />
              )}
            </div>
            <div className={`pb-4 ${s.state === "idle" ? "opacity-55" : ""}`}>
              <div className={`text-[13.5px] font-semibold ${s.state === "active" ? "text-sky-700" : onDark ? "text-haze-100" : "text-ink"} ${s.state === "active" ? "motion-safe:animate-breathe" : ""}`}>
                {s.label}
              </div>
              {s.caption && <div className={`mt-0.5 text-[12px] ${onDark ? "text-haze-400" : "text-sage-500"}`}>{s.caption}</div>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/* --------------------------- quiet provenance tag ------------------------- */

/** Provenance shown quietly — the doctor should trust the source at a glance
 *  without the label shouting. Document / doctor / pathway are visually distinct. */
export function ProvenanceTag({ p }: { p: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    document: { label: "Discharge summary", cls: "text-sky-700 bg-sky-50 ring-sky-200" },
    doctor: { label: "Your instruction", cls: "text-brand-700 bg-brand-50 ring-brand-200" },
    pathway: { label: "Approved pathway", cls: "text-sage-600 bg-mist-100 ring-ink/10" },
    ai_structured: { label: "AI structured", cls: "text-warn-600 bg-warn-100/70 ring-warn-500/20" },
    missing: { label: "Missing", cls: "text-warn-600 bg-warn-100/70 ring-warn-500/20" },
  };
  const m = map[p] ?? { label: p, cls: "text-sage-600 bg-mist-100 ring-ink/10" };
  return <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10.5px] font-medium ring-1 ${m.cls}`}>{m.label}</span>;
}

/* ========================================================================== */
/*  Interaction layer — the one shared set of buttons, inputs and cards used   */
/*  across every role screen. Teal (brand) is the primary action; sky is       */
/*  secondary/clinical; coral is destructive. Radii, spacing and focus rings   */
/*  are fixed here so no screen hand-rolls its own again.                       */
/* ========================================================================== */

/* -------------------------------- spinner --------------------------------- */
export function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/* --------------------------------- button --------------------------------- */

export type ButtonVariant = "primary" | "secondary" | "soft" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const BTN_VARIANT: Record<ButtonVariant, string> = {
  // teal = the product's primary action. brand-800 so white labels clear WCAG AA
  // (4.5:1); vibrant brand-600 stays for graphics/heroes/rings, not filled buttons.
  primary: "bg-brand-800 text-white hover:bg-brand-900 focus-visible:ring-brand-800 disabled:bg-brand-800/60",
  // sky = secondary / clinical action
  secondary: "bg-sky-600 text-white hover:bg-sky-500 focus-visible:ring-sky-600 disabled:bg-sky-600/60",
  // quiet neutral fill
  soft: "bg-mist-100 text-ink ring-1 ring-ink/[0.06] hover:bg-mist-200 focus-visible:ring-sky-500",
  // borderless
  ghost: "text-sage-600 hover:bg-mist-100 hover:text-ink focus-visible:ring-sky-500",
  // destructive
  danger: "bg-coral-600 text-white hover:bg-coral-500 focus-visible:ring-coral-600 disabled:bg-coral-600/60",
};

const BTN_SIZE: Record<ButtonSize, string> = {
  sm: "gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px]",
  md: "gap-2 rounded-xl px-4 py-2.5 text-[14px]",
  lg: "gap-2 rounded-xl px-5 py-3 text-[15px]",
};

/** The one button. `busy` shows a spinner and disables; `full` stretches. */
export function Button({
  variant = "primary",
  size = "md",
  busy = false,
  full = false,
  icon,
  className = "",
  children,
  disabled,
  ...props
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  busy?: boolean;
  full?: boolean;
  icon?: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      disabled={disabled || busy}
      className={`tap inline-flex items-center justify-center font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed ${BTN_SIZE[size]} ${BTN_VARIANT[variant]} ${full ? "w-full" : ""} ${className}`}
    >
      {busy ? <Spinner /> : icon}
      {children}
    </button>
  );
}

/* --------------------------------- inputs --------------------------------- */

/** Shared field surface — reuse on any bespoke control so borders/focus match. */
export const inputClass =
  "w-full rounded-xl bg-white px-3.5 py-2.5 text-[14px] text-ink ring-1 ring-line placeholder:text-sage-400 transition-shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:bg-mist-100 disabled:text-sage-500";

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputClass} ${props.className ?? ""}`} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${inputClass} resize-none leading-relaxed ${props.className ?? ""}`} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${inputClass} appearance-none bg-[right_0.75rem_center] bg-no-repeat pr-9 ${props.className ?? ""}`} style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%236B7A80' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")", ...props.style }} />;
}

/** Label + optional hint wrapper for a form control. */
export function Field({
  label, hint, htmlFor, children, className = "",
}: {
  label: ReactNode; hint?: ReactNode; htmlFor?: string; children: ReactNode; className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1 block text-[12.5px] font-semibold text-ink">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[11.5px] leading-relaxed text-sage-500">{hint}</p>}
    </div>
  );
}

/* ------------------------------ progressive disclosure -------------------- */

/** Summary row that expands to reveal detail — the core "details on demand"
 *  pattern for reducing scroll. Keeps its own open state unless controlled. */
export function Disclosure({
  summary, children, defaultOpen = false, className = "",
}: {
  summary: ReactNode; children: ReactNode; defaultOpen?: boolean; className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId().replace(/[:]/g, "");
  return (
    <div className={className}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="tap flex w-full items-center justify-between gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 rounded-lg"
      >
        <span className="min-w-0 flex-1">{summary}</span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 text-sage-400 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && (
        <div id={id} className="motion-safe:animate-fade-up pt-3">
          {children}
        </div>
      )}
    </div>
  );
}

/* ------------------------------- metric card ------------------------------ */

/** A single patient-plan-specific reading: value now, optional previous value,
 *  a mini trend, and a status chip ONLY when a doctor threshold decided it. */
export function MetricCard({
  label, value, unit, previous, updated, status = "unknown", values, tone = "calm", emphasis = "number",
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  previous?: ReactNode;
  updated?: string;
  status?: "normal" | "attention" | "unknown";
  values?: number[];
  tone?: Tone;
  /** "number" = large tabular value (vitals); "text" = smaller wrapping value
   *  for categorical readings (feeding, mobility, mood …). */
  emphasis?: "number" | "text";
}) {
  const showBadge = status !== "unknown";
  return (
    <div className="min-w-0 overflow-hidden rounded-2xl bg-white p-4 shadow-card ring-1 ring-ink/[0.05]">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 truncate text-[12px] font-semibold text-sage-600">{label}</div>
        {showBadge && (
          <StatusTag tone={status === "attention" ? "attention" : "recovery"}>
            {status === "attention" ? "Check" : "Normal"}
          </StatusTag>
        )}
      </div>
      {emphasis === "number" ? (
        <div className="mt-1.5 flex items-baseline gap-1">
          <span className="truncate font-display text-[22px] font-semibold leading-none tabular-nums text-ink">{value}</span>
          {unit && <span className="shrink-0 text-[12px] text-sage-500">{unit}</span>}
        </div>
      ) : (
        <div className="mt-1.5 text-[14.5px] font-semibold leading-snug text-ink [overflow-wrap:anywhere]">{value}</div>
      )}
      {values && values.length >= 2 && (
        <div className="mt-2"><MiniTrend values={values} tone={tone} /></div>
      )}
      {(previous != null || updated) && (
        <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-sage-500">
          {previous != null ? <span className="min-w-0 truncate">Was {previous}</span> : <span />}
          {updated && <span className="shrink-0">{updated}</span>}
        </div>
      )}
    </div>
  );
}

/* -------------------------------- mini trend ------------------------------ */

/** A compact inline sparkline for repeated readings (family trends). */
export function MiniTrend({ values, tone = "calm", height = 28 }: { values: number[]; tone?: Tone; height?: number }) {
  const stroke = tone === "attention" ? "#A66E08" : tone === "escalation" ? "#C4392C" : tone === "recovery" ? "#2A6FC7" : "#2A6FC7";
  const W = 120;
  const H = height;
  if (values.length < 2) return <div className="text-[11px] text-sage-400">Trend appears as readings arrive.</div>;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = (max - min) * 0.4 || 1;
  const lo = min - pad;
  const range = max + pad - lo;
  const n = values.length;
  const px = (i: number) => (i / (n - 1)) * (W - 4) + 2;
  const py = (v: number) => H - 2 - ((v - lo) / range) * (H - 4);
  const pts = values.map((v, i) => `${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(" ");
  const lastX = px(n - 1);
  const lastY = py(values[n - 1]);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" aria-hidden>
      <polyline points={pts} fill="none" stroke={stroke} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={lastX} cy={lastY} r={2.4} fill={stroke} />
    </svg>
  );
}

/* ---------------------------- milestone timeline -------------------------- */

/** A calm recovery-milestone rail — reached vs upcoming, in plain language. */
export function MilestoneTimeline({ items }: { items: { name: string; caption?: string; done?: boolean }[] }) {
  return (
    <ol className="space-y-0">
      {items.map((m, i) => {
        const last = i === items.length - 1;
        return (
          <li key={i} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-bold ${m.done ? "bg-brand-500 text-white" : "bg-mist-200 text-sage-500 ring-1 ring-line"}`}>
                {m.done ? "✓" : i + 1}
              </span>
              {!last && <span className={`my-1 w-px flex-1 ${m.done ? "bg-brand-300" : "bg-line"}`} style={{ minHeight: 14 }} />}
            </div>
            <div className={`pb-3 ${m.done ? "" : "opacity-80"}`}>
              <div className="text-[13.5px] font-semibold text-ink">{m.name}</div>
              {m.caption && <div className="mt-0.5 text-[12px] text-sage-500">{m.caption}</div>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/* ------------------------------- empty state ------------------------------ */

/** A calm empty/placeholder state — icon, line, and optional helper copy. */
export function EmptyState({ icon, title, children, className = "" }: { icon?: ReactNode; title: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-dashed border-line bg-white/60 p-8 text-center ${className}`}>
      {icon && <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-full bg-sky-50 text-sky-600 ring-1 ring-sky-200">{icon}</div>}
      <p className="text-[14px] font-semibold text-ink">{title}</p>
      {children && <p className="mx-auto mt-1 max-w-sm text-[13px] leading-relaxed text-sage-500">{children}</p>}
    </div>
  );
}
