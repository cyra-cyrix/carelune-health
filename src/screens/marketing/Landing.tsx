import { LoopMark } from "../../components/ui";

/**
 * Public, Carelune-branded landing page for the people who BUY the platform —
 * hospitals, rehab centres and specialist practices (doctor / institution facing).
 *
 * Carelune branding lives ONLY here; the institution's white-label brand appears
 * on patient / caregiver / family surfaces, never on this page.
 *
 * Bright visual system (landing-scoped, does not touch app tokens): white +
 * ice-blue surfaces, sky-blue accents, near-black headings. No navy, no
 * gradients, restrained cards. Copy stays inside the frozen product boundaries —
 * clinician-governed, AI understated, no 24/7 / continuous-monitoring claims,
 * no fabricated stats or logos, and no emergency number on this buyer page.
 */

const SKY = "#168BFF"; // primary sky blue — accents, lines, button fill
const SKY_2 = "#4DB8FF"; // light accent blue
const SKY_TEXT = "#1170D8"; // sky for TEXT/links AND filled buttons/badges — white text passes WCAG AA (4.6:1)
const INK = "#111820"; // strong near-black headings
const ICE = "#F4F9FF"; // ice-blue surface
const HAIR = "#E4EEFB"; // hairline border

// Working inbox for pilot enquiries (carelune.in has no mailbox yet).
const CONTACT_EMAIL = "sujith@medzell.net";
const mailto = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("Carelune — request pilot access")}`;

export default function Landing({ onSignIn }: { onSignIn: () => void }) {
  return (
    <div className="min-h-screen bg-white" style={{ color: INK }}>
      <TopBar onSignIn={onSignIn} />
      <Hero onSignIn={onSignIn} />
      <HowItWorks />
      <Trust />
      <Closing onSignIn={onSignIn} />
      <Footer />
    </div>
  );
}

/* --------------------------------- top bar ------------------------------- */

function TopBar({ onSignIn }: { onSignIn: () => void }) {
  return (
    <header className="sticky top-0 z-30 bg-white/90 backdrop-blur" style={{ borderBottom: `1px solid ${HAIR}` }}>
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
        <div className="flex items-center gap-2.5">
          <span style={{ color: SKY }}><LoopMark size={26} /></span>
          <span className="font-display text-[18px] font-semibold tracking-tight" style={{ color: INK }}>Carelune</span>
        </div>
        <div className="flex items-center gap-1 sm:gap-3">
          <button type="button" onClick={onSignIn} className="tap rounded-xl px-3.5 py-2 text-[14px] font-semibold" style={{ color: SKY_TEXT }}>
            Sign in
          </button>
          <a href={mailto} className="tap hidden rounded-xl px-4 py-2 text-[14px] font-semibold text-white sm:inline-block" style={{ background: SKY_TEXT }}>
            Request pilot access
          </a>
        </div>
      </nav>
    </header>
  );
}

/* ---------------------------------- hero --------------------------------- */

function Hero({ onSignIn }: { onSignIn: () => void }) {
  return (
    <section className="mx-auto grid max-w-6xl items-center gap-14 px-5 pb-16 pt-14 sm:px-8 lg:grid-cols-[1.08fr_1fr] lg:pt-24">
      <div>
        <div className="text-[12px] font-semibold uppercase tracking-[0.16em]" style={{ color: SKY_TEXT }}>
          For hospitals, rehab centres &amp; specialists
        </div>
        <h1 className="mt-5 font-display text-[36px] font-semibold leading-[1.08] tracking-[-0.02em] sm:text-[50px]" style={{ color: INK }}>
          Your patients leave the hospital. Your care should continue.
        </h1>
        <div className="mt-6 h-1 w-16 rounded-full" style={{ background: SKY }} />
        <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-sage-700">
          Give every discharged patient a clear recovery plan, guided daily care and a
          structured connection to your clinical team.
        </p>
        <div className="mt-9 flex flex-wrap items-center gap-3">
          <a href={mailto} className="tap rounded-2xl px-6 py-3.5 text-[15.5px] font-semibold text-white shadow-sm" style={{ background: SKY_TEXT }}>
            Request pilot access
          </a>
          <button
            type="button"
            onClick={onSignIn}
            className="tap rounded-2xl px-6 py-3.5 text-[15.5px] font-semibold"
            style={{ color: SKY_TEXT, boxShadow: `inset 0 0 0 1px ${HAIR}` }}
          >
            Sign in
          </button>
        </div>
        <p className="mt-5 text-[13px] text-sage-500">Now in limited pilot with care providers in Bengaluru.</p>
      </div>

      <HeroVisual />
    </section>
  );
}

/** One restrained recovery-snapshot card — no gradient, hairline border. */
function HeroVisual() {
  return (
    <div className="rounded-3xl bg-white p-6 shadow-lift" style={{ border: `1px solid ${HAIR}` }}>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sage-500">Recovery overview</div>
          <div className="mt-0.5 font-display text-[17px] font-semibold" style={{ color: INK }}>Day 12 of 30</div>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-good-100 px-2.5 py-1 text-[12px] font-semibold text-good-600">
          <span className="h-1.5 w-1.5 rounded-full bg-good-500" /> On track
        </span>
      </div>

      <div className="mt-5 flex items-center gap-4 rounded-2xl p-4" style={{ background: ICE }}>
        <Ring value={4} total={6} />
        <div>
          <div className="text-[14px] font-semibold" style={{ color: INK }}>Today&rsquo;s care</div>
          <div className="text-[13px] text-sage-600">4 of 6 steps done · next at 07:30</div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Reading label="Blood pressure" value="132/84" chip="Normal" tone="ok" />
        <Reading label="Blood sugar" value="142" unit="mg/dL" chip="Check" tone="watch" />
      </div>

      <div className="mt-4 rounded-2xl p-4" style={{ border: `1px solid ${HAIR}` }}>
        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-sage-500">Blood pressure · improving</div>
        <Spark />
      </div>

      <p className="mt-4 text-[11px] text-sage-500">Illustrative overview. Readings are recorded by the care team.</p>
    </div>
  );
}

function Ring({ value, total }: { value: number; total: number }) {
  const r = 26;
  const circ = 2 * Math.PI * r;
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden>
      <circle cx="32" cy="32" r={r} fill="none" stroke={HAIR} strokeWidth="7" />
      <circle
        cx="32" cy="32" r={r} fill="none" stroke={SKY} strokeWidth="7" strokeLinecap="round"
        strokeDasharray={circ} strokeDashoffset={circ * (1 - value / total)} transform="rotate(-90 32 32)"
      />
      <text x="32" y="33" textAnchor="middle" dominantBaseline="middle" fontSize="17" fontWeight="600" fill={INK}>
        {value}
      </text>
    </svg>
  );
}

function Reading({ label, value, unit, chip, tone }: { label: string; value: string; unit?: string; chip: string; tone: "ok" | "watch" }) {
  return (
    <div className="rounded-2xl p-3.5" style={{ border: `1px solid ${HAIR}` }}>
      <div className="text-[12px] text-sage-600">{label}</div>
      <div className="mt-0.5 flex items-baseline gap-1">
        <span className="font-display text-[20px] font-semibold" style={{ color: INK }}>{value}</span>
        {unit && <span className="text-[11px] text-sage-500">{unit}</span>}
      </div>
      <span className={`mt-1.5 inline-block rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${tone === "ok" ? "bg-good-100 text-good-600" : "bg-warn-100 text-warn-600"}`}>
        {chip}
      </span>
    </div>
  );
}

function Spark() {
  const pts = [3, 3.4, 3.2, 3.8, 4.3, 4.1, 4.7, 5.2];
  const W = 240, H = 40, max = Math.max(...pts), min = Math.min(...pts);
  const xy = pts.map((v, i) => [(i / (pts.length - 1)) * W, H - ((v - min) / (max - min)) * (H - 6) - 3]);
  const d = xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const [lx, ly] = xy[xy.length - 1];
  return (
    <svg className="mt-2 block" width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
      <polyline points={d} fill="none" stroke={SKY} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lx} cy={ly} r="6" fill={SKY_2} opacity="0.35" />
      <circle cx={lx} cy={ly} r="3.5" fill={SKY} />
    </svg>
  );
}

/* ------------------------------ how it works ----------------------------- */

function HowItWorks() {
  const steps: [string, string][] = [
    ["Enrol the patient", "Send a secure registration link. The family sets up the patient and gives consent — no data entry for your staff."],
    ["Your clinician approves the plan", "Documents are structured into a draft; the authorised clinician reviews, edits and approves every plan."],
    ["Your team runs it at home", "The caregiver follows the daily plan; your nurse and doctor oversee progress and answer the family."],
  ];
  return (
    <section id="how" className="py-20" style={{ background: ICE }}>
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <h2 className="max-w-2xl font-display text-[30px] font-semibold tracking-[-0.01em] sm:text-[34px]" style={{ color: INK }}>
          One governed loop, from your ward to their home.
        </h2>
        <div className="mt-12 grid gap-10 sm:grid-cols-3">
          {steps.map(([h, p], i) => (
            <div key={h}>
              <div className="flex items-center gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-full text-[15px] font-semibold text-white" style={{ background: SKY_TEXT }}>
                  {i + 1}
                </span>
                <span className="h-px flex-1" style={{ background: SKY_2, opacity: 0.5 }} />
              </div>
              <h3 className="mt-5 font-display text-[18px] font-semibold" style={{ color: INK }}>{h}</h3>
              <p className="mt-2 text-[14px] leading-relaxed text-sage-600">{p}</p>
            </div>
          ))}
        </div>
        <p className="mt-10 text-[13.5px] font-semibold" style={{ color: SKY_TEXT }}>Neuro · Spine · Joint recovery pathways.</p>
      </div>
    </section>
  );
}

/* -------------------------------- trust ---------------------------------- */

function Trust() {
  const pts: [string, string][] = [
    ["Your clinician decides — always", "Only the lead doctor can activate or change a plan. Documents are structured into a draft; the authorised clinician reviews, edits and approves every plan."],
    ["See recovery clearly", "Daily completion, patient-reported readings, concerns and milestones — organised for review."],
    ["Private by design", "Every institution's data is isolated; families and caregivers see only their own patient. Care starts only after consent."],
  ];
  return (
    <section id="governance" className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
      <h2 className="max-w-2xl font-display text-[30px] font-semibold tracking-[-0.01em] sm:text-[34px]" style={{ color: INK }}>
        Built to earn a clinician&rsquo;s trust.
      </h2>
      <div className="mt-10 grid gap-x-12 gap-y-10 sm:grid-cols-3">
        {pts.map(([h, p]) => (
          <div key={h}>
            <div className="h-1 w-10 rounded-full" style={{ background: SKY }} />
            <h3 className="mt-4 font-display text-[17.5px] font-semibold" style={{ color: INK }}>{h}</h3>
            <p className="mt-2 text-[14px] leading-relaxed text-sage-600">{p}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* -------------------------------- closing -------------------------------- */

function Closing({ onSignIn }: { onSignIn: () => void }) {
  return (
    <section className="px-5 pb-20 sm:px-8">
      <div className="mx-auto max-w-6xl rounded-3xl px-8 py-16 text-center" style={{ background: ICE, border: `1px solid ${HAIR}` }}>
        <h2 className="mx-auto max-w-2xl font-display text-[30px] font-semibold leading-tight tracking-[-0.01em] sm:text-[36px]" style={{ color: INK }}>
          Bring your recovery programme home.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-[15.5px] leading-relaxed text-sage-600">
          See how your institution can keep patients on track after discharge — without adding
          to your team&rsquo;s daily load.
        </p>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <a href={mailto} className="tap rounded-2xl px-6 py-3.5 text-[15.5px] font-semibold text-white" style={{ background: SKY_TEXT }}>
            Request pilot access
          </a>
          <button
            type="button"
            onClick={onSignIn}
            className="tap rounded-2xl bg-white px-6 py-3.5 text-[15.5px] font-semibold"
            style={{ color: SKY_TEXT, boxShadow: `inset 0 0 0 1px ${HAIR}` }}
          >
            Sign in
          </button>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------- footer --------------------------------- */

function Footer() {
  return (
    <footer className="bg-white" style={{ borderTop: `1px solid ${HAIR}` }}>
      <div className="mx-auto flex max-w-6xl flex-col justify-between gap-4 px-5 py-10 sm:flex-row sm:items-center sm:px-8">
        <div className="flex items-center gap-2.5">
          <span style={{ color: SKY }}><LoopMark size={22} /></span>
          <span className="font-display text-[16px] font-semibold" style={{ color: INK }}>Carelune</span>
          <span className="text-[13px] text-sage-500">· Care continues after discharge.</span>
        </div>
        <div className="text-[13px] text-sage-600">
          <a href={mailto} className="font-medium" style={{ color: SKY_TEXT }}>{CONTACT_EMAIL}</a>
          <span className="mx-2 text-sage-400">·</span>
          <span className="text-sage-500">Limited pilot · © 2026 Carelune Health</span>
        </div>
      </div>
    </footer>
  );
}
