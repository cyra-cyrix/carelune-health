/* ============================================================================
   Synthetic product-UI recreations for the marketing redesign concept.
   Everything here is FICTIONAL demonstration data — no real patient names,
   diagnoses, contact details or clinical records. These are hand-built DOM
   recreations of the real Carelune surfaces (crisper + responsive than raster
   screenshots), used purely as marketing visuals.
   ========================================================================== */
import type { ReactNode, SVGProps } from "react";

/* ------------------------------------------------------------- brand mark -- */
export function LoopMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M28 16a12 12 0 1 1-6-10.4" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" />
      <circle cx="27" cy="7.5" r="3.2" fill="currentColor" />
    </svg>
  );
}

/* ------------------------------------------------------------------ icons -- */
const S = (p: SVGProps<SVGSVGElement>) => ({ viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true, ...p });
export const Ico = {
  arrow: (p: SVGProps<SVGSVGElement>) => (<svg {...S(p)}><path d="M5 12h14M13 6l6 6-6 6" /></svg>),
  check: (p: SVGProps<SVGSVGElement>) => (<svg {...S(p)}><path d="M20 6 9 17l-5-5" /></svg>),
  home: (p: SVGProps<SVGSVGElement>) => (<svg {...S(p)}><path d="M3 10.5 12 4l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" /></svg>),
  pill: (p: SVGProps<SVGSVGElement>) => (<svg {...S(p)}><rect x="3" y="8" width="18" height="8" rx="4" /><path d="M12 8v8" /></svg>),
  pulse: (p: SVGProps<SVGSVGElement>) => (<svg {...S(p)}><path d="M3 12h4l2-5 4 10 2-5h6" /></svg>),
  chart: (p: SVGProps<SVGSVGElement>) => (<svg {...S(p)}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>),
  life: (p: SVGProps<SVGSVGElement>) => (<svg {...S(p)}><path d="M20.8 8.6a5 5 0 0 0-7.1 0L12 10.3l-1.7-1.7a5 5 0 1 0-7.1 7.1L12 24l8.8-8.3a5 5 0 0 0 0-7.1z" /></svg>),
};

/* --------------------------------------------------------------- sparkline */
function Spark({ points, tone = "blue" }: { points: number[]; tone?: "blue" | "good" | "amber" }) {
  const stroke = tone === "good" ? "#1f7a54" : tone === "amber" ? "#b26a00" : "#0e6fdb";
  const w = 66, h = 22, max = Math.max(...points), min = Math.min(...points), span = max - min || 1;
  const d = points.map((v, i) => `${(i / (points.length - 1)) * w},${h - ((v - min) / span) * (h - 4) - 2}`).join(" ");
  return (
    <svg className="dc-spark" viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <polyline points={d} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ------------------------------------------------------------ progress ring */
function Ring({ pct }: { pct: number }) {
  const r = 22, c = 2 * Math.PI * r;
  return (
    <svg className="fp-ring" viewBox="0 0 52 52" aria-hidden="true">
      <circle cx="26" cy="26" r={r} fill="none" stroke="rgba(255,255,255,0.32)" strokeWidth="5" />
      <circle cx="26" cy="26" r={r} fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} transform="rotate(-90 26 26)" />
    </svg>
  );
}

/* ------------------------------------------------------------- frame shell */
export function Frame({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={`clr-frame${className ? ` ${className}` : ""}`}>
      <div className="clr-frame-bar">
        <span className="tl"><i /><i /><i /></span>
        <span>{label}</span>
      </div>
      {children}
    </div>
  );
}

/* ---------------------------------------------------------- doctor console */
type Case = { initials: string; name: string; meta: string; spark: number[]; tone: "good" | "amber"; tag: string; tagKind: "review" | "track" | "new" };
const CASES: Case[] = [
  { initials: "AM", name: "A. Menon", meta: "Day 12 · Spine fusion L4–L5", spark: [3, 3.4, 3.2, 3.8, 4.1, 4.4], tone: "good", tag: "On track", tagKind: "track" },
  { initials: "RI", name: "R. Iyer", meta: "Day 6 · TKR — right knee", spark: [4, 3.6, 3.7, 3.2, 3.0, 3.3], tone: "amber", tag: "Needs review", tagKind: "review" },
  { initials: "SK", name: "S. Kulkarni", meta: "Day 20 · Neuro-rehab", spark: [2.6, 3.0, 3.1, 3.5, 3.6, 3.9], tone: "good", tag: "On track", tagKind: "track" },
];

export function DoctorConsole() {
  return (
    <Frame label="Recovery command centre">
      <div className="dc">
        <div className="dc-top">
          <div>
            <div className="k">Recovery command centre</div>
            <h4>Good morning, Dr. Rao</h4>
            <div className="sub">8 patients recovering at home</div>
          </div>
          <span className="dc-pill attn">2 need attention</span>
        </div>
        <div className="dc-stats">
          <div className="dc-stat"><div className="n">8</div><div className="l">Active</div></div>
          <div className="dc-stat"><div className="n">2</div><div className="l">Needs attention</div></div>
          <div className="dc-stat"><div className="n">2</div><div className="l">Awaiting decision</div></div>
        </div>
        <div className="dc-list">
          {CASES.map((c) => (
            <div className="dc-row" key={c.initials}>
              <span className="dc-av">{c.initials}</span>
              <span className="who"><b>{c.name}</b><span>{c.meta}</span></span>
              <Spark points={c.spark} tone={c.tone} />
              <span className={`dc-tag ${c.tagKind}`}>{c.tag}</span>
            </div>
          ))}
        </div>
      </div>
    </Frame>
  );
}

/* ---------------------------------------------------- coordinator console */
type Update = { who: string; what: string; kind: "update" | "follow" | "escalate" };
const UPDATES: Update[] = [
  { who: "A. Menon · family", what: "Logged morning medicines & blood pressure", kind: "update" },
  { who: "R. Iyer · family", what: "Reported swelling above expected range — raised a concern", kind: "escalate" },
  { who: "S. Kulkarni · nurse", what: "Follow-up call scheduled for this afternoon", kind: "follow" },
  { who: "A. Menon · family", what: "Completed physiotherapy activity for the day", kind: "update" },
];
export function CoordinatorConsole() {
  return (
    <Frame label="Coordinator — daily updates">
      <div className="dc">
        <div className="dc-top">
          <div>
            <div className="k">Care coordination</div>
            <h4>Today’s updates</h4>
            <div className="sub">Routine first · escalations surfaced</div>
          </div>
          <span className="dc-pill attn">1 to escalate</span>
        </div>
        <div className="dc-list">
          {UPDATES.map((u, i) => (
            <div className="dc-row" key={i}>
              <span className="dc-av" style={{ background: u.kind === "escalate" ? "var(--amber-wash)" : "var(--blue-wash)", color: u.kind === "escalate" ? "var(--amber)" : "var(--blue-strong)" }}>
                {u.kind === "escalate" ? "!" : u.kind === "follow" ? "↻" : "✓"}
              </span>
              <span className="who"><b>{u.who}</b><span>{u.what}</span></span>
              {u.kind === "escalate" && <span className="dc-tag review">Escalate</span>}
              {u.kind === "follow" && <span className="dc-tag new">Follow-up</span>}
            </div>
          ))}
        </div>
      </div>
    </Frame>
  );
}

/* -------------------------------------------------------------- family phone */
export function FamilyPhone({ className }: { className?: string }) {
  return (
    <Frame label="Family — today" className={className}>
      <div className="fp">
        <div className="fp-top">
          <span className="logo">S</span>
          <span className="t"><b>Sunrise Spine &amp; Neuro</b><span>Home recovery · Day 12</span></span>
        </div>
        <div className="fp-hero">
          <div className="r">
            <Ring pct={40} />
            <div>
              <div className="big">2 of 5 done</div>
              <div className="cap">Up next · 8:00 · Record blood pressure</div>
            </div>
          </div>
        </div>
        <div className="fp-periods">
          <div className="fp-per now"><div className="l">Morning</div><div className="v">2 / 3</div></div>
          <div className="fp-per"><div className="l">Afternoon</div><div className="v">0 / 1</div></div>
          <div className="fp-per"><div className="l">Evening</div><div className="v">0 / 1</div></div>
        </div>
        <div className="fp-task">
          <div className="k">Reading</div>
          <h5>Record blood pressure &amp; sugar</h5>
          <div className="vals">
            <div className="fp-chip"><div className="n">128/82</div><div className="u">mmHg</div></div>
            <div className="fp-chip"><div className="n">126</div><div className="u">mg/dL</div></div>
          </div>
        </div>
        <div className="fp-tabs">
          <span className="fp-tab on"><i><Ico.home /></i>Today</span>
          <span className="fp-tab"><i><Ico.pill /></i>Medicines</span>
          <span className="fp-tab"><i><Ico.pulse /></i>Log</span>
          <span className="fp-tab"><i><Ico.chart /></i>Progress</span>
          <span className="fp-tab"><i><Ico.life /></i>Help</span>
        </div>
      </div>
    </Frame>
  );
}
