// Carelune — Doctor Experience design language: "Clinical intelligence with human calm."
//
// Premium, restrained primitives for the four signature doctor surfaces (branded
// login, Recovery Command Centre, Patient Recovery Cockpit, AI Plan Studio).
// Authority = midnight/navy · intelligence & actions = clinical blue (sky) ·
// recovery & improvement = teal/aqua (brand) · attention = amber (warn) ·
// serious escalation = coral. Hierarchy comes from whitespace, type and signal
// colour — never from a grid of equal cards. Motion is purposeful only.

import { useId } from "react";
import type { ReactNode } from "react";

/* ------------------------------ signal tones ------------------------------ */

export type Tone = "recovery" | "attention" | "escalation" | "calm" | "neutral";

/** Foreground / dot / soft-fill classes per clinical signal tone. */
export const toneClasses: Record<Tone, { text: string; dot: string; soft: string; ring: string }> = {
  recovery: { text: "text-brand-700", dot: "bg-brand-500", soft: "bg-brand-50", ring: "ring-brand-500/25" },
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
  const stroke = tone === "attention" ? "#A66E08" : tone === "escalation" ? "#C4392C" : onDark ? "#3BBBAC" : "#17B3A1";
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
