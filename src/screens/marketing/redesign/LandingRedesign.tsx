import { LEGAL_READY } from "../legal";
import { CoordinatorConsole, DoctorConsole, FamilyPhone, Ico, LoopMark } from "./mocks";
import "./redesign.css";

/* ============================================================================
   Carelune — marketing landing REDESIGN CONCEPT (public site only).
   Editorial white canvas · monumental Manrope display · one blue accent ·
   product UI as the hero. All product visuals are synthetic recreations
   (mocks.tsx). This component is swapped in via src/marketing.tsx; the previous
   Landing.tsx is preserved on disk so the concept is fully reversible.
   ========================================================================== */

const CALENDLY = "https://calendly.com/sujith-medzell/meeting";
const scrollTo = (id: string) => (e: React.MouseEvent) => {
  e.preventDefault();
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
};

export default function LandingRedesign({ onSignIn }: { onSignIn: () => void }) {
  return (
    <div className="clr">
      <Header onSignIn={onSignIn} />
      <main>
        <Hero />
        <CareGap />
        <HowItWorks />
        <ProductExperience />
        <Pathways />
        <Visibility />
        <Trust />
        <Pilot />
      </main>
      <Footer onSignIn={onSignIn} />
    </div>
  );
}

/* -------------------------------------------------------------------- header */
function Header({ onSignIn }: { onSignIn: () => void }) {
  return (
    <header className="clr-hdr">
      <div className="clr-hdr-in">
        <a className="clr-brand" href="#top" aria-label="Carelune home"><LoopMark size={22} /> Carelune</a>
        <nav className="clr-nav" aria-label="Primary">
          <a href="#how" onClick={scrollTo("how")}>How it works</a>
          <a href="#teams" onClick={scrollTo("teams")}>For care teams</a>
          <a href="#pathways" onClick={scrollTo("pathways")}>Recovery pathways</a>
          <a href="#pilot" onClick={scrollTo("pilot")}>Pilot programme</a>
        </nav>
        <div className="clr-hdr-actions">
          <button type="button" className="clr-hdr-signin" onClick={onSignIn}>Sign in</button>
          <a className="clr-btn pri sm" href={CALENDLY} target="_blank" rel="noopener noreferrer">Start a pilot</a>
        </div>
      </div>
    </header>
  );
}

/* ---------------------------------------------------------------------- hero */
function Hero() {
  return (
    <section className="clr-hero" id="top">
      <div className="clr-wrap">
        <div className="clr-hero-grid">
          <div>
            <p className="clr-eyebrow">Doctor-led recovery, beyond discharge</p>
            <h1>Care doesn’t end at&nbsp;discharge.</h1>
            <p className="clr-lead">
              Carelune helps care teams guide recovery at home, recognise concerns earlier, and keep
              every patient connected to a structured plan.
            </p>
            <div className="clr-hero-cta">
              <a className="clr-btn pri" href={CALENDLY} target="_blank" rel="noopener noreferrer">
                Start a pilot <Ico.arrow className="arw" width={17} height={17} />
              </a>
              <a className="clr-textlink" href="#how" onClick={scrollTo("how")}>
                See how it works <Ico.arrow className="arw" width={16} height={16} />
              </a>
            </div>
            <p className="clr-hero-note"><span className="dot" /> Institution-branded · clinician-governed · family-visible</p>
          </div>
          <div className="clr-hero-compose">
            <DoctorConsole />
            <FamilyPhone className="phone" />
            <p className="clr-synthetic">Illustrative interface · synthetic data</p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ care gap */
const GAP = [
  ["Instructions are hard to follow at home", "Discharge advice is detailed and easily lost. Families are left interpreting medicines, activity and precautions on their own."],
  ["Communication is fragmented", "Care teams depend on scattered calls and messages, with no shared, structured view of how recovery is actually going."],
  ["Warning signs appear between appointments", "A change in symptoms can emerge days before the next visit — often without a clear, agreed way to raise it."],
  ["Families are unsure what is normal", "Without guidance, ordinary recovery can feel alarming, and genuine concerns can be missed."],
  ["Doctors lack a daily view of recovery", "By the next appointment, the day-to-day picture is gone — leaving decisions to be made from memory and a short conversation."],
];
function CareGap() {
  return (
    <section className="clr-sec tint clr-gap" id="gap" aria-labelledby="gap-h">
      <div className="clr-wrap">
        <div className="clr-gap-head">
          <p className="clr-eyebrow muted">The care gap</p>
          <h2 id="gap-h" style={{ marginTop: 16 }}>Between discharge and follow-up, recovery becomes invisible.</h2>
        </div>
        <div className="clr-gap-list">
          {GAP.map(([h, p], i) => (
            <div className="clr-gap-item" key={h}>
              <span className="idx">{String(i + 1).padStart(2, "0")}</span>
              <h3>{h}</h3>
              <p>{p}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------- how it works */
const STEPS = [
  ["Care team creates and approves the plan", "The treating clinician turns discharge instructions into a structured recovery plan — medicines, activities, monitoring and guidance — and approves it before anything reaches the patient."],
  ["Family follows the daily plan at home", "The caregiver sees exactly what to do today, in plain language: medicines, exercises, meals, readings and precautions — one clear step at a time."],
  ["Carelune structures progress and concerns", "Daily completion, reported readings and raised concerns are organised into one continuous picture, instead of scattered messages."],
  ["Care team reviews and intervenes when needed", "Doctors and coordinators see progress and what needs attention, and step in with a clinical decision when the situation calls for it."],
];
function HowItWorks() {
  return (
    <section className="clr-sec" id="how" aria-labelledby="how-h">
      <div className="clr-wrap">
        <p className="clr-eyebrow">How Carelune works</p>
        <h2 id="how-h" style={{ marginTop: 16, fontSize: "clamp(2.1rem, 5vw, 3.6rem)", letterSpacing: "-0.04em", maxWidth: "20ch" }}>
          One recovery plan. One connected care journey.
        </h2>
        <div className="clr-steps">
          {STEPS.map(([h, p], i) => (
            <div className="clr-step" key={h}>
              <span className="num">{String(i + 1).padStart(2, "0")}</span>
              <h3>{h}</h3>
              <p>{p}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------- product experience */
function ProductExperience() {
  return (
    <section className="clr-sec tint" id="teams" aria-labelledby="exp-h">
      <div className="clr-wrap">
        <p className="clr-eyebrow muted">The product</p>
        <h2 id="exp-h" style={{ marginTop: 16, fontSize: "clamp(2.1rem, 5vw, 3.6rem)", letterSpacing: "-0.04em", maxWidth: "22ch" }}>
          Designed around the people responsible for recovery.
        </h2>
        <div className="clr-exp">
          <ExpRow
            eyebrow="For the doctor"
            title="A command centre for recovery at home."
            body="See your whole caseload at a glance — progress, unresolved concerns and the patients who need attention today — so your time goes where it matters."
            points={["Caseload with daily recovery signals", "Unresolved concerns surfaced first", "A structured view before every decision"]}
            media={<DoctorConsole />}
          />
          <ExpRow
            flip
            eyebrow="For the care coordinator"
            title="Routine handled. Escalations surfaced."
            body="A structured view of daily updates and follow-ups, with the concerns that need a clinician clearly separated from everyday recovery."
            points={["Daily updates in one place", "Follow-ups you can plan around", "Clear escalation to the care team"]}
            media={<CoordinatorConsole />}
          />
          <ExpRow
            eyebrow="For the family"
            title="A calm, daily recovery experience."
            body="What to do today — medicines, exercises, meals, readings and progress — in plain language, with a simple way to raise a concern to the care team."
            points={["Today’s plan, one step at a time", "Medicines, activities and readings", "Raise a concern to the care team"]}
            media={<div style={{ maxWidth: 300, margin: "0 auto" }}><FamilyPhone /></div>}
          />
        </div>
      </div>
    </section>
  );
}
function ExpRow({ eyebrow, title, body, points, media, flip }: { eyebrow: string; title: string; body: string; points: string[]; media: React.ReactNode; flip?: boolean }) {
  return (
    <div className={`clr-exp-row${flip ? " flip" : ""}`}>
      <div className="clr-exp-copy">
        <p className="clr-eyebrow">{eyebrow}</p>
        <h3>{title}</h3>
        <p>{body}</p>
        <ul className="clr-exp-points">
          {points.map((pt) => (
            <li key={pt}><span className="tick"><Ico.check width={17} height={17} /></span>{pt}</li>
          ))}
        </ul>
      </div>
      <div className="clr-exp-media">{media}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ pathways */
const PATHS = [
  ["Spine Recovery", "Structured support for spinal surgery recovery — mobility milestones, precautions, pain and wound monitoring.", "Post-operative spine"],
  ["Joint Replacement Recovery", "Guided recovery for knee and hip replacement — activity progression, swelling and range-of-motion tracking.", "Ortho / arthroplasty"],
  ["Neuro-rehabilitation", "Continuity for neuro recovery at home — daily activities, function tracking and structured caregiver guidance.", "Neuro-rehab"],
];
function Pathways() {
  return (
    <section className="clr-sec" id="pathways" aria-labelledby="path-h">
      <div className="clr-wrap">
        <p className="clr-eyebrow">Recovery pathways</p>
        <h2 id="path-h" style={{ marginTop: 16, fontSize: "clamp(2.1rem, 5vw, 3.6rem)", letterSpacing: "-0.04em", maxWidth: "22ch" }}>
          Structured for focused recovery pathways.
        </h2>
        <p className="clr-lead" style={{ marginTop: 18, maxWidth: "60ch" }}>
          Each pathway is a configurable foundation. The treating care team reviews, personalises and
          approves it for the individual patient — Carelune never replaces clinical judgment.
        </p>
        <div className="clr-paths">
          {PATHS.map(([h, p, meta]) => (
            <div className="clr-path" key={h}>
              <h3>{h}</h3>
              <p>{p}</p>
              <span className="meta">{meta}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- visibility */
const DAYS = [
  { d: "M", h: 82, s: "done" }, { d: "T", h: 74, s: "done" }, { d: "W", h: 90, s: "done" },
  { d: "T", h: 48, s: "part" }, { d: "F", h: 86, s: "done" }, { d: "S", h: 70, s: "done" },
  { d: "S", h: 94, s: "done" }, { d: "M", h: 40, s: "plan" },
] as const;
function Visibility() {
  return (
    <section className="clr-sec tint clr-tl" id="visibility" aria-labelledby="vis-h">
      <div className="clr-wrap">
        <p className="clr-eyebrow muted">Earlier visibility</p>
        <h2 id="vis-h" style={{ marginTop: 16, fontSize: "clamp(2rem, 4.6vw, 3.4rem)", letterSpacing: "-0.04em", maxWidth: "24ch" }}>
          See the recovery journey — not just the next appointment.
        </h2>
        <p className="clr-lead" style={{ marginTop: 18, maxWidth: "58ch" }}>
          Daily completion, reported symptoms, milestones, concerns and care-team communication build a
          more continuous picture between visits.
        </p>
        <div className="clr-tl-track" role="img" aria-label="Illustrative recovery timeline with synthetic data">
          <div className="clr-tl-days">
            {DAYS.map((day, i) => (
              <div className="clr-tl-day" key={i}>
                <div className="clr-tl-bar"><i style={{ height: `${day.h}%`, background: day.s === "plan" ? "#eef2f7" : "var(--blue-wash)" }} /></div>
                <div className="clr-tl-line" />
                <div className={`clr-tl-dot ${day.s}`} />
                <div className="d" style={{ marginTop: 6 }}>{day.d}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="clr-tl-marks">
          <span className="clr-tl-mark"><i style={{ background: "var(--blue-wash)", border: "1px solid #bcdcff" }} /> Daily completion</span>
          <span className="clr-tl-mark"><i style={{ background: "var(--good)" }} /> Milestone reached</span>
          <span className="clr-tl-mark"><i style={{ background: "var(--amber)" }} /> Symptom reported</span>
          <span className="clr-tl-mark"><i style={{ background: "#d3dbe4" }} /> Planned</span>
        </div>
        <p className="clr-synthetic">Illustrative timeline · synthetic data · not a clinical outcome measure</p>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------------- trust */
const TRUST = [
  "Care plans require care-team approval before they reach a patient",
  "Role-based access controls what each person can see and do",
  "The patient-facing experience carries the institution’s identity",
  "Concerns follow a structured path to the right person",
  "Patient information stays within the institution’s workflow",
];
function Trust() {
  return (
    <section className="clr-sec" id="trust" aria-labelledby="trust-h">
      <div className="clr-wrap">
        <div className="clr-trust-grid">
          <div>
            <p className="clr-eyebrow">Trust &amp; control</p>
            <h2 id="trust-h" style={{ marginTop: 16, fontSize: "clamp(2rem, 4.4vw, 3.2rem)", letterSpacing: "-0.04em" }}>
              Clinical control stays with the care team.
            </h2>
            <p className="clr-trust-note">
              Carelune supports care delivery. It does not diagnose, does not replace clinical judgment,
              and is not a substitute for emergency services.
            </p>
          </div>
          <ul className="clr-trust-list">
            {TRUST.map((t) => (
              <li key={t}><span className="tick"><Ico.check width={18} height={18} /></span>{t}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------------- pilot */
function Pilot() {
  return (
    <section className="clr-sec tint clr-pilot" id="pilot" aria-labelledby="pilot-h">
      <div className="clr-wrap">
        <p className="clr-eyebrow">Pilot programme</p>
        <h2 id="pilot-h">Bring structured recovery support to your patients.</h2>
        <p className="clr-lead">Start with one pathway, one care team and a focused group of patients.</p>
        <div className="clr-pilot-cta">
          <a className="clr-btn pri" href={CALENDLY} target="_blank" rel="noopener noreferrer">
            Start a pilot <Ico.arrow className="arw" width={17} height={17} />
          </a>
          <a className="clr-btn ghost" href={CALENDLY} target="_blank" rel="noopener noreferrer">Request a walkthrough</a>
        </div>
        <p className="clr-pilot-aud">For rehabilitation centres, spine practices, joint-replacement programmes and neuro-rehabilitation teams.</p>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------- footer */
function Footer({ onSignIn }: { onSignIn: () => void }) {
  return (
    <footer className="clr-foot">
      <div className="clr-wrap">
        <div className="clr-foot-grid">
          <div className="clr-foot-brand">
            <span className="clr-brand"><LoopMark size={20} /> Carelune</span>
            <p className="tag">Care continues.</p>
          </div>
          <div className="clr-foot-col">
            <h4>Product</h4>
            <ul>
              <li><a href="#how" onClick={scrollTo("how")}>How it works</a></li>
              <li><a href="#teams" onClick={scrollTo("teams")}>For care teams</a></li>
              <li><a href="#pilot" onClick={scrollTo("pilot")}>Pilot programme</a></li>
            </ul>
          </div>
          <div className="clr-foot-col">
            <h4>Pathways</h4>
            <ul>
              <li><a href="#pathways" onClick={scrollTo("pathways")}>Spine recovery</a></li>
              <li><a href="#pathways" onClick={scrollTo("pathways")}>Joint replacement</a></li>
              <li><a href="#pathways" onClick={scrollTo("pathways")}>Neuro-rehabilitation</a></li>
            </ul>
          </div>
          <div className="clr-foot-col">
            <h4>Company</h4>
            <ul>
              {LEGAL_READY && <li><a href="/privacy">Privacy</a></li>}
              {LEGAL_READY && <li><a href="/terms">Terms</a></li>}
              <li><a href={CALENDLY} target="_blank" rel="noopener noreferrer">Contact</a></li>
              <li><button type="button" onClick={onSignIn} style={{ background: "none", border: 0, padding: 0, cursor: "pointer", color: "inherit", font: "inherit" }}>Authorised user sign-in</button></li>
            </ul>
          </div>
        </div>
        <div className="clr-foot-base">
          <p>Carelune supports continuity of care after discharge. It does not provide diagnosis, does not replace clinical judgment, and is not a substitute for emergency medical services. In an emergency, contact local emergency services.</p>
          <p>© 2026 Carelune Health</p>
        </div>
      </div>
    </footer>
  );
}
