import { useState } from "react";
import { LEGAL_READY } from "../legal";
import { CoordinatorConsole, DoctorConsole, FamilyPhone, Ico, LoopMark } from "./mocks";
import "./redesign.css";

/* ============================================================================
   Carelune — public marketing site (launch-ready).
   Continuum-care positioning · editorial white canvas · monumental Manrope
   display · one blue accent · product UI as the hero. All product visuals are
   synthetic recreations (mocks.tsx). Swapped in via src/marketing.tsx; the
   previous Landing.tsx is preserved on disk so this remains reversible.
   ========================================================================== */

const CALENDLY = "https://calendly.com/sujith-medzell/meeting";
// No enquiry backend exists in this frontend-only marketing build. The enquiry
// form hands the details to the visitor's own email client (mailto) — it does
// not silently POST anywhere. Point this at a monitored inbox before launch.
const CONTACT_EMAIL = "hello@carelune.in";

const scrollTo = (id: string) => (e: React.MouseEvent) => {
  e.preventDefault();
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
};

const NAV = [
  { id: "how", label: "How it works" },
  { id: "teams", label: "For care teams" },
  { id: "why", label: "Why Carelune" },
  { id: "organisations", label: "For organisations" },
];

export type Route = "doctor" | "org";

export default function LandingRedesign({ onSignIn }: { onSignIn: () => void }) {
  const [route, setRoute] = useState<Route>("doctor");
  // Send a visitor to the enquiry form with their adoption route pre-selected.
  const goEnquiry = (r: Route) => {
    setRoute(r);
    document.getElementById("get-started")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  return (
    <div className="clr">
      <Header onSignIn={onSignIn} onStart={() => goEnquiry("doctor")} />
      <main>
        <Hero onStart={() => goEnquiry("doctor")} />
        <CareGap />
        <HowItWorks />
        <ProductExperience />
        <CareModel />
        <Visibility />
        <Trust />
        <FreePlan onStart={() => goEnquiry("doctor")} onOrg={() => goEnquiry("org")} />
        <OrgCta route={route} setRoute={setRoute} />
      </main>
      <Footer onSignIn={onSignIn} />
    </div>
  );
}

/* -------------------------------------------------------------------- header */
function Header({ onSignIn, onStart }: { onSignIn: () => void; onStart: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <header className="clr-hdr">
      <div className="clr-hdr-in">
        <a className="clr-brand" href="#top" onClick={scrollTo("top")} aria-label="Carelune home"><LoopMark size={22} /> Carelune</a>
        <nav className="clr-nav" aria-label="Primary">
          {NAV.map((n) => <a key={n.id} href={`#${n.id}`} onClick={scrollTo(n.id)}>{n.label}</a>)}
        </nav>
        <div className="clr-hdr-actions">
          <button type="button" className="clr-hdr-signin" onClick={onSignIn}>Sign in</button>
          <button type="button" className="clr-btn pri sm" onClick={onStart}>Start free</button>
          <button
            type="button"
            className="clr-menu-btn"
            aria-label="Menu"
            aria-expanded={open}
            aria-controls="clr-mobile-menu"
            onClick={() => setOpen((v) => !v)}
          >
            <span className={`clr-burger${open ? " x" : ""}`} aria-hidden="true"><i /><i /><i /></span>
          </button>
        </div>
      </div>
      {open && (
        <nav id="clr-mobile-menu" className="clr-menu" aria-label="Primary (mobile)">
          {NAV.map((n) => (
            <a key={n.id} href={`#${n.id}`} onClick={(e) => { scrollTo(n.id)(e); setOpen(false); }}>{n.label}</a>
          ))}
          <button type="button" onClick={() => { setOpen(false); onSignIn(); }}>Sign in</button>
        </nav>
      )}
    </header>
  );
}

/* ---------------------------------------------------------------------- hero */
function Hero({ onStart }: { onStart: () => void }) {
  return (
    <section className="clr-hero" id="top">
      <div className="clr-wrap">
        <div className="clr-hero-grid">
          <div className="clr-hero-copy">
            <p className="clr-eyebrow">Doctor-led care, beyond discharge</p>
            <h1>Care<br />doesn’t end<br />at discharge.</h1>
            <p className="clr-lead">
              Carelune helps care teams guide recovery at home, recognise concerns earlier, and keep
              every patient connected to a structured plan.
            </p>
            <div className="clr-hero-cta">
              <button type="button" className="clr-btn pri" onClick={onStart}>
                Start free <Ico.arrow className="arw" width={17} height={17} />
              </button>
              <a className="clr-textlink" href="#how" onClick={scrollTo("how")}>
                See how it works <Ico.arrow className="arw" width={16} height={16} />
              </a>
            </div>
            <p className="clr-hero-note"><span className="dot" /> Institution-led · Clinician-governed · Family-connected</p>
          </div>
          <div className="clr-hero-compose">
            <DoctorConsole />
            <div className="phone"><FamilyPhone /></div>
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
  ["Families are unsure what needs attention", "Without guidance, ordinary recovery can feel alarming — and a genuine concern can be hard to recognise."],
  ["Communication is disconnected", "Care teams depend on scattered calls and messages, with no shared, structured view of how recovery is going."],
  ["Daily recovery becomes less visible", "Between appointments, the day-to-day picture fades — leaving decisions to be made from a short conversation and memory."],
];
function CareGap() {
  return (
    <section className="clr-sec tint clr-gap" id="why" aria-labelledby="gap-h">
      <div className="clr-wrap">
        <div className="clr-gap-head">
          <p className="clr-eyebrow muted">Why Carelune</p>
          <h2 id="gap-h" style={{ marginTop: 16 }}>Between discharge and follow-up, care can become fragmented.</h2>
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
  ["The care team creates and approves the plan", "The treating clinician personalises discharge guidance into a structured care plan — activities, observations, medicines and milestones — and approves it before it reaches the patient."],
  ["The patient and family follow daily guidance", "At home, the family sees exactly what to do today, in plain language: activities, medicines, readings and precautions — one clear step at a time."],
  ["Progress and concerns are captured", "Daily completion, reported updates, milestones and raised concerns are organised into one continuous picture, instead of scattered messages."],
  ["The care team stays connected", "Doctors and coordinators see progress and what needs review, and respond according to the institution’s own workflow."],
];
function HowItWorks() {
  return (
    <section className="clr-sec" id="how" aria-labelledby="how-h">
      <div className="clr-wrap">
        <p className="clr-eyebrow">How Carelune works</p>
        <h2 id="how-h" className="clr-h2" style={{ marginTop: 16, maxWidth: "18ch" }}>One plan. One connected care journey.</h2>
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
        <h2 id="exp-h" className="clr-h2" style={{ marginTop: 16, maxWidth: "22ch" }}>One experience, designed for every person involved.</h2>
        <div className="clr-exp">
          <ExpRow
            eyebrow="For the care team"
            title="A clear view of every patient at home."
            body="See the whole caseload at a glance — progress, unresolved concerns and the patients who need review today — so clinical time goes where it matters."
            points={["Caseload with daily care signals", "Unresolved concerns surfaced first", "A structured view before every decision"]}
            media={<DoctorConsole />}
          />
          <ExpRow
            flip
            eyebrow="For the care coordinator"
            title="Routine handled. Escalations surfaced."
            body="A structured view of daily updates, follow-ups and communication, with the concerns that need a clinician clearly separated from everyday care."
            points={["Daily updates in one place", "Follow-ups you can plan around", "Clear escalation to the care team"]}
            media={<CoordinatorConsole />}
          />
          <ExpRow
            eyebrow="For the patient and family"
            title="A calm, daily care experience."
            body="What to do today — activities, medicines, guidance and progress — in plain language, with a simple way to raise a concern to the care team."
            points={["Today’s plan, one step at a time", "Activities, medicines and readings", "Raise a concern to the care team"]}
            media={<div className="clr-media-phone"><FamilyPhone /></div>}
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

/* ---------------------------------------------------------------- care model */
const CAPS = [
  ["Institution-specific configuration", "Define your own care pathway, daily activities, observations and milestones."],
  ["Clinician-approved care plans", "Every plan is reviewed, personalised and approved by the treating care team."],
  ["Daily guidance at home", "Clear, plain-language steps for patients and families, every day."],
  ["Progress and milestone tracking", "A structured record of completion, readings and milestones over time."],
  ["Structured concerns and communication", "Concerns follow a defined path to the right person, with a shared thread."],
  ["Flexible care-team roles", "Configure doctors, coordinators and nursing roles around how your team works."],
];
function CareModel() {
  return (
    <section className="clr-sec" id="organisations" aria-labelledby="cm-h">
      <div className="clr-wrap">
        <p className="clr-eyebrow">For organisations</p>
        <h2 id="cm-h" className="clr-h2" style={{ marginTop: 16, maxWidth: "20ch" }}>Built around your care pathway.</h2>
        <p className="clr-lead" style={{ marginTop: 18, maxWidth: "62ch" }}>
          Carelune is a configurable foundation for structured continuing care. Your organisation defines
          its care pathway, daily activities, observations, milestones, communication and escalation — and
          the treating care team reviews, personalises and approves the plan for each patient.
        </p>
        <div className="clr-caps">
          {CAPS.map(([h, p]) => (
            <div className="clr-cap" key={h}>
              <span className="tick"><Ico.check width={18} height={18} /></span>
              <div><h3>{h}</h3><p>{p}</p></div>
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
        <p className="clr-eyebrow muted">Visibility between appointments</p>
        <h2 id="vis-h" className="clr-h2" style={{ marginTop: 16, maxWidth: "24ch" }}>See the care journey — not only the next appointment.</h2>
        <p className="clr-lead" style={{ marginTop: 18, maxWidth: "58ch" }}>
          Daily completion, patient and family-reported updates, concerns, milestones and care-team
          communication build a more continuous picture between visits.
        </p>
        <div className="clr-tl-track" role="img" aria-label="Illustrative care timeline with synthetic data">
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
          <span className="clr-tl-mark"><i style={{ background: "var(--amber)" }} /> Update reported</span>
          <span className="clr-tl-mark"><i style={{ background: "#d3dbe4" }} /> Planned</span>
        </div>
        <p className="clr-synthetic">Illustrative timeline · synthetic data · not a clinical outcome measure</p>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------------- trust */
const TRUST = [
  "Care plans are reviewed and approved by the care team before they reach a patient",
  "Role-based access controls what each person can see and do",
  "The patient-facing experience carries the institution’s identity",
  "Communication and concerns follow a structured escalation path",
  "Care plans are personalised around the individual patient",
];
function Trust() {
  return (
    <section className="clr-sec" id="trust" aria-labelledby="trust-h">
      <div className="clr-wrap">
        <div className="clr-trust-grid">
          <div>
            <p className="clr-eyebrow">Institution-led, clinician-governed</p>
            <h2 id="trust-h" className="clr-h2" style={{ marginTop: 16 }}>Clinical control stays with the care team.</h2>
            <p className="clr-trust-note">
              Carelune supports care delivery. It does not replace clinical judgment, and it is not an
              emergency-response service.
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

/* --------------------------------------------------------------- free plan */
const DOCTOR_INCLUDES = [
  "One doctor account",
  "One nursing coordinator",
  "Unlimited eligible patients",
  "Professional verification required",
];
const ORG_INCLUDES = [
  "Configured around your care model",
  "Institution-branded patient experience",
  "Flexible care-team roles",
];
function FreePlan({ onStart, onOrg }: { onStart: () => void; onOrg: () => void }) {
  return (
    <section className="clr-sec clr-free" id="free" aria-labelledby="free-h">
      <div className="clr-wrap">
        <div className="clr-free-head">
          <p className="clr-eyebrow">For individual doctors</p>
          <h2 id="free-h" className="clr-h2" style={{ marginTop: 16, maxWidth: "20ch" }}>Start free. Continue care beyond discharge.</h2>
          <p className="clr-lead" style={{ marginTop: 18 }}>
            Verified individual doctors can use Carelune with one doctor account, one nursing
            coordinator and unlimited eligible patients.
          </p>
          <p className="clr-free-verify">Professional verification is required before activation.</p>
          <div className="clr-free-cta">
            <button type="button" className="clr-btn pri" onClick={onStart}>Start free <Ico.arrow className="arw" width={17} height={17} /></button>
            <a className="clr-textlink" href="#whats-included" onClick={scrollTo("whats-included")}>See what’s included <Ico.arrow className="arw" width={16} height={16} /></a>
          </div>
        </div>

        <div className="clr-routes" id="whats-included">
          <div className="clr-route feat">
            <div className="clr-route-head"><span className="clr-route-tag">Free</span><h3>Individual doctors</h3></div>
            <p>For a verified doctor guiding recovery at home.</p>
            <ul>{DOCTOR_INCLUDES.map((x) => <li key={x}><span className="tick"><Ico.check width={16} height={16} /></span>{x}</li>)}</ul>
            <button type="button" className="clr-btn pri" style={{ width: "100%" }} onClick={onStart}>Start free</button>
          </div>
          <div className="clr-route">
            <div className="clr-route-head"><h3>Care organisations</h3></div>
            <p>Configured around your organisation’s care model — pathways, roles, communication and escalation.</p>
            <ul>{ORG_INCLUDES.map((x) => <li key={x}><span className="tick"><Ico.check width={16} height={16} /></span>{x}</li>)}</ul>
            <button type="button" className="clr-btn ghost" style={{ width: "100%" }} onClick={onOrg}>Talk to our team</button>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------- org cta */
function OrgCta({ route, setRoute }: { route: Route; setRoute: (r: Route) => void }) {
  return (
    <section className="clr-sec tint" id="get-started" aria-labelledby="cta-h">
      <div className="clr-wrap">
        <div className="clr-cta-grid">
          <div className="clr-cta-copy">
            <p className="clr-eyebrow">Get started</p>
            <h2 id="cta-h" className="clr-h2" style={{ marginTop: 16, maxWidth: "16ch" }}>Bring continuity to every care journey.</h2>
            <p className="clr-lead" style={{ marginTop: 18 }}>
              Tell us a little about your practice or organisation. Individual doctors can start free;
              organisations are configured around their own care model.
            </p>
            <a className="clr-btn ghost" style={{ marginTop: 26 }} href={CALENDLY} target="_blank" rel="noopener noreferrer">Book a walkthrough</a>
          </div>
          <EnquiryForm route={route} setRoute={setRoute} />
        </div>
      </div>
    </section>
  );
}

function EnquiryForm({ route, setRoute }: { route: Route; setRoute: (r: Route) => void }) {
  const [sent, setSent] = useState(false);
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const g = (k: string) => String(f.get(k) ?? "").trim();
    const kind = route === "doctor" ? "Individual doctor" : "Care organisation";
    const body = [
      `Enquiry type: ${kind}`,
      `Name: ${g("name")}`,
      `Clinic / organisation: ${g("org")}`,
      `Role: ${g("role")}`,
      `Work email: ${g("email")}`,
      `Phone: ${g("phone")}`,
      `Continuing-care programme: ${g("programme")}`,
      `Approx. monthly patient volume: ${g("volume")}`,
    ].join("\n");
    // Hand the details to the visitor's own email client — no silent backend POST,
    // and no false "submitted" claim (the visitor must still press send).
    window.location.href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(`Carelune enquiry (${kind}) — ${g("org") || g("name")}`)}&body=${encodeURIComponent(body)}`;
    setSent(true);
  };

  if (sent) {
    return (
      <div className="clr-form clr-form-done" role="status">
        <span className="clr-form-tick"><Ico.check width={26} height={26} /></span>
        <p><b>Your email app should now be open</b>, with your details ready to send. Please review and send that email to complete your enquiry — nothing is submitted until you send it.</p>
        <button type="button" className="clr-textlink" style={{ marginTop: 14 }} onClick={() => setSent(false)}>Back to the form</button>
      </div>
    );
  }

  return (
    <form className="clr-form" onSubmit={submit} aria-labelledby="cta-h" noValidate>
      <fieldset className="clr-routeselect">
        <legend>I am a…</legend>
        <label className={`clr-routeopt${route === "doctor" ? " on" : ""}`}>
          <input type="radio" name="route" checked={route === "doctor"} onChange={() => setRoute("doctor")} /> Individual doctor
        </label>
        <label className={`clr-routeopt${route === "org" ? " on" : ""}`}>
          <input type="radio" name="route" checked={route === "org"} onChange={() => setRoute("org")} /> Care organisation
        </label>
      </fieldset>
      <div className="clr-field-row">
        <Field name="name" label="Name" required />
        <Field name="org" label="Clinic / organisation" />
      </div>
      <div className="clr-field-row">
        <Field name="role" label="Role" />
        <Field name="email" label="Work email" type="email" required />
      </div>
      <div className="clr-field-row">
        <Field name="phone" label="Phone" type="tel" />
        <Field name="volume" label="Approx. monthly patients" />
      </div>
      <Field name="programme" label="Your continuing-care programme" />
      <button type="submit" className="clr-btn pri" style={{ width: "100%", marginTop: 6 }}>
        {route === "doctor" ? "Start free" : "Talk to our team"} <Ico.arrow className="arw" width={17} height={17} />
      </button>
      <p className="clr-form-note">Opening your email app pre-fills these details — you send the email to complete your enquiry. Professional verification is required before activation.</p>
    </form>
  );
}
function Field({ name, label, type = "text", required }: { name: string; label: string; type?: string; required?: boolean }) {
  return (
    <label className="clr-field">
      <span>{label}{required && <em aria-hidden="true"> *</em>}</span>
      <input name={name} type={type} required={required} autoComplete="off" />
    </label>
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
              <li><a href="#organisations" onClick={scrollTo("organisations")}>For organisations</a></li>
            </ul>
          </div>
          <div className="clr-foot-col">
            <h4>Company</h4>
            <ul>
              {LEGAL_READY && <li><a href="/privacy">Privacy</a></li>}
              {LEGAL_READY && <li><a href="/terms">Terms</a></li>}
              <li><a href="#get-started" onClick={scrollTo("get-started")}>Contact</a></li>
              <li><button type="button" onClick={onSignIn}>Authorised user sign-in</button></li>
            </ul>
          </div>
        </div>
        <div className="clr-foot-base">
          <p>Carelune supports care-team communication and structured continuing care. It does not replace clinical judgment or emergency services.</p>
          <p>© 2026 Carelune Health</p>
        </div>
      </div>
    </footer>
  );
}
