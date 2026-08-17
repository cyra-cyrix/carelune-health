import { useState } from "react";
import { LEGAL_READY } from "../legal";
import { CoordinatorConsole, FamilyMini, FamilyPhone, Ico, LoopMark, RecoveryDashboard } from "./mocks";
import "./redesign.css";

/* ============================================================================
   Carelune — public marketing site (launch-ready).
   B2B continuum-care platform for doctors, clinics, hospitals and rehabilitation
   centres. Not patient-directed. Indian English throughout. Editorial white
   canvas · monumental Manrope display · one blue accent · product UI as the hero.
   All product visuals are synthetic (mocks.tsx). Swapped in via src/marketing.tsx;
   the previous Landing.tsx stays on disk so this remains reversible.
   ========================================================================== */

// No enquiry backend exists in this frontend-only marketing build. The form opens
// the visitor's own email client (mailto) addressed to a monitored Carelune inbox
// — it does not silently POST, and shows no false "submitted" message.
const CONTACT_EMAIL = "hello@carelune.in";

const scrollTo = (id: string) => (e: React.MouseEvent) => {
  e.preventDefault();
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
};

const NAV = [
  { id: "how", label: "How it works" },
  { id: "free", label: "For doctors" },
  { id: "pro", label: "For hospitals" },
  { id: "why", label: "Why Carelune" },
];

export type Route = "doctor" | "org";

export default function LandingRedesign({ onSignIn }: { onSignIn: () => void }) {
  const [route, setRoute] = useState<Route>("doctor");
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
        <ExperienceByRole />
        <CareModel />
        <FreePlan onStart={() => goEnquiry("doctor")} />
        <Pro onOrg={() => goEnquiry("org")} />
        <Trust />
        <OrgCta route={route} setRoute={setRoute} onStart={() => goEnquiry("doctor")} onOrg={() => goEnquiry("org")} />
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
          <button type="button" className="clr-menu-btn" aria-label="Menu" aria-expanded={open} aria-controls="clr-mobile-menu" onClick={() => setOpen((v) => !v)}>
            <span className={`clr-burger${open ? " x" : ""}`} aria-hidden="true"><i /><i /><i /></span>
          </button>
        </div>
      </div>
      {open && (
        <nav id="clr-mobile-menu" className="clr-menu" aria-label="Primary (mobile)">
          {NAV.map((n) => <a key={n.id} href={`#${n.id}`} onClick={(e) => { scrollTo(n.id)(e); setOpen(false); }}>{n.label}</a>)}
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
            <p className="clr-eyebrow">Doctor-led recovery, beyond discharge</p>
            <h1>Care<br />doesn’t end<br />at discharge.</h1>
            <p className="clr-lead">
              Carelune helps doctors and hospitals guide recovery at home, recognise concerns earlier,
              and keep every patient connected to a structured plan.
            </p>
            <div className="clr-hero-cta">
              <button type="button" className="clr-btn pri" onClick={onStart}>
                Start free <Ico.arrow className="arw" width={17} height={17} />
              </button>
              <a className="clr-textlink" href="#how" onClick={scrollTo("how")}>
                See how it works <Ico.arrow className="arw" width={16} height={16} />
              </a>
            </div>
            <p className="clr-hero-note"><span className="dot" /> Institution-led · Doctor-approved · Family-connected</p>
          </div>
          <div className="clr-hero-compose">
            <div className="clr-hero-dash"><RecoveryDashboard /></div>
            <div className="clr-hero-fam"><FamilyMini /></div>
            <p className="clr-synthetic">Illustrative interface · synthetic data</p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ care gap */
const GAP = [
  ["Discharge instructions are hard to follow at home", "Detailed instructions are easily lost, and families are left interpreting medicines, activities and precautions on their own."],
  ["Families are unsure what needs attention", "Without guidance, families may be uncertain about medicines, activities and precautions — and a genuine concern can be hard to recognise."],
  ["Communication depends on calls and messages", "Doctors and nursing coordinators rely on repeated calls and messages, with no shared, structured view of how recovery is going."],
  ["Daily recovery becomes less visible", "Between discharge and the next follow-up visit, the day-to-day picture fades from view."],
  ["Concerns may not reach the doctor in time", "Important concerns may not reach the treating doctor in a structured way, when they matter most."],
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
  ["The treating doctor creates and approves the plan", "The doctor turns discharge instructions into a structured care plan — activities, observations, medicines and milestones — and reviews and approves it before it reaches the patient."],
  ["The patient and family follow daily guidance", "At home, the family sees exactly what to do today, in plain language — activities, medicines, readings and precautions, one clear step at a time."],
  ["Progress and concerns are recorded", "Daily completion, reported updates, milestones and raised concerns are recorded in a structured way, instead of scattered messages."],
  ["The doctor and nursing team stay connected", "Between discharge and follow-up, the doctor and nursing team see progress and what needs review, and respond through the hospital’s own workflow."],
];
function HowItWorks() {
  return (
    <section className="clr-sec" id="how" aria-labelledby="how-h">
      <div className="clr-wrap">
        <p className="clr-eyebrow">How Carelune works</p>
        <h2 id="how-h" className="clr-h2" style={{ marginTop: 16, maxWidth: "18ch" }}>One plan. One connected recovery journey.</h2>
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

/* ---------------------------------------------------------- experience/role */
function ExperienceByRole() {
  return (
    <section className="clr-sec tint" id="experience" aria-labelledby="exp-h">
      <div className="clr-wrap">
        <p className="clr-eyebrow muted">Experience by role</p>
        <h2 id="exp-h" className="clr-h2" style={{ marginTop: 16, maxWidth: "22ch" }}>Built for the people who deliver the care.</h2>
        <div className="clr-exp">
          <ExpRow
            eyebrow="For the doctor"
            title="Stay connected to every patient at home."
            body="See who is recovering at home and who may need a follow-up, review reported concerns, and remain in clinical control throughout."
            points={["View patients recovering at home", "Review progress and reported concerns", "See who may require follow-up", "Remain in clinical control"]}
            media={<RecoveryDashboard />}
          />
          <ExpRow
            flip
            eyebrow="For the nursing coordinator"
            title="Handle the routine. Raise what matters."
            body="Review daily patient updates, follow up on incomplete activities, and escalate concerns to the doctor according to your hospital’s workflow."
            points={["Review daily patient updates", "Follow up on incomplete activities", "Coordinate communication", "Escalate concerns to the doctor"]}
            media={<CoordinatorConsole />}
          />
          <ExpRow
            eyebrow="For the hospital or clinic"
            title="A consistent experience for every patient."
            body="Deliver a consistent post-discharge experience under your institution’s identity, with clear roles and institution-approved workflows. Patients and families follow the plan your doctors set."
            points={["Use institution-approved workflows", "Maintain clear roles for doctors and nurses", "Support multiple doctors and departments through Pro", "Provide a consistent post-discharge experience"]}
            media={<div className="clr-media-phone"><FamilyPhone /></div>}
            caption="What your patients and families receive"
          />
        </div>
      </div>
    </section>
  );
}
function ExpRow({ eyebrow, title, body, points, media, flip, caption }: { eyebrow: string; title: string; body: string; points: string[]; media: React.ReactNode; flip?: boolean; caption?: string }) {
  return (
    <div className={`clr-exp-row${flip ? " flip" : ""}`}>
      <div className="clr-exp-copy">
        <p className="clr-eyebrow">{eyebrow}</p>
        <h3>{title}</h3>
        <p>{body}</p>
        <ul className="clr-exp-points">
          {points.map((pt) => <li key={pt}><span className="tick"><Ico.check width={17} height={17} /></span>{pt}</li>)}
        </ul>
      </div>
      <div className="clr-exp-media">
        {media}
        {caption && <p className="clr-synthetic" style={{ textAlign: "center" }}>{caption}</p>}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- care model */
const CAPS = [
  ["Define your own care pathway", "Set daily activities, observations, milestones and precautions for your care model."],
  ["Doctor-approved care plans", "Every plan is reviewed, personalised and approved by the treating doctor."],
  ["Daily guidance at home", "Clear, plain-language steps for patients and families, every day."],
  ["Progress and milestone tracking", "A structured record of completion, readings and milestones over time."],
  ["Structured communication and concerns", "Concerns follow a defined path to the right person, with a shared thread."],
  ["Roles that fit your team", "Configure doctors, nurses and coordinators around how your team already works."],
];
function CareModel() {
  return (
    <section className="clr-sec" id="care-model" aria-labelledby="cm-h">
      <div className="clr-wrap">
        <p className="clr-eyebrow">Configurable care model</p>
        <h2 id="cm-h" className="clr-h2" style={{ marginTop: 16, maxWidth: "20ch" }}>Built around your care pathway.</h2>
        <p className="clr-lead" style={{ marginTop: 18, maxWidth: "64ch" }}>
          Carelune provides a structured foundation for continuing care after discharge. Doctors and
          hospitals can define daily activities, observations, milestones, communication and escalation
          according to their care model — and the treating doctor reviews, personalises and approves the
          plan for each patient.
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

/* --------------------------------------------------------------- free plan */
const FREE_INCLUDES = [
  "One verified doctor account",
  "One care coordinator",
  "Unlimited enrolled patients",
  "Standard Carelune workflows",
  "No subscription",
  "No customisation",
  "Professional verification required",
];
function FreePlan({ onStart }: { onStart: () => void }) {
  return (
    <section className="clr-sec clr-free" id="free" aria-labelledby="free-h">
      <div className="clr-wrap">
        <div className="clr-free-grid">
          <div className="clr-free-copy">
            <p className="clr-eyebrow">For individual doctors</p>
            <h2 id="free-h" className="clr-h2" style={{ marginTop: 16, maxWidth: "18ch" }}>Start free. No trial. No subscription.</h2>
            <p className="clr-lead" style={{ marginTop: 18 }}>
              Verified individual doctors can use Carelune with one doctor account, one care coordinator
              and unlimited enrolled patients, using Carelune’s standard workflows.
            </p>
            <p className="clr-free-explain">
              If you provide the continuing-care programme to patients free of charge, Carelune remains
              completely free. A platform fee applies only when you collect payment for a care programme
              through Carelune.
            </p>
            <p className="clr-free-verify">Professional verification is required before activation.</p>
            <div className="clr-free-cta">
              <button type="button" className="clr-btn pri" onClick={onStart}>Start free <Ico.arrow className="arw" width={17} height={17} /></button>
            </div>
            <p className="clr-note">
              Patients do not pay merely to access the Carelune app. If a doctor or hospital offers a paid
              continuing-care programme, the programme price is shown clearly before enrolment.
            </p>
          </div>
          <div className="clr-free-card">
            <div className="clr-free-card-top"><span className="clr-route-tag">Carelune Free</span></div>
            <ul>{FREE_INCLUDES.map((x) => <li key={x}><span className="tick"><Ico.check width={16} height={16} /></span>{x}</li>)}</ul>
            <button type="button" className="clr-btn pri" style={{ width: "100%" }} onClick={onStart}>Start free</button>
          </div>
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------------- pro */
const PRO_CAPS = [
  "Multiple doctors", "Junior doctors", "Additional nurses and care coordinators",
  "Multiple departments", "Customised care pathways", "Institution branding",
  "Custom domain", "Advanced roles and permissions", "Organisation administration",
  "Reports and analytics", "Priority implementation and support", "Optional integrations",
];
function Pro({ onOrg }: { onOrg: () => void }) {
  return (
    <section className="clr-sec" id="pro" aria-labelledby="pro-h">
      <div className="clr-wrap">
        <p className="clr-eyebrow">For clinics and hospitals</p>
        <h2 id="pro-h" className="clr-h2" style={{ marginTop: 16, maxWidth: "20ch" }}>Configure Carelune around your organisation.</h2>
        <p className="clr-lead" style={{ marginTop: 18, maxWidth: "64ch" }}>
          Carelune Pro supports growing practices and institutions that need additional doctors, nurses,
          coordinators, departments, customised care pathways and organisation-level control.
        </p>
        <div className="clr-procaps">
          {PRO_CAPS.map((c) => <div className="clr-procap" key={c}><span className="tick"><Ico.check width={16} height={16} /></span>{c}</div>)}
        </div>
        <div className="clr-pro-cta">
          <button type="button" className="clr-btn pri" onClick={onOrg}>Talk to our team <Ico.arrow className="arw" width={17} height={17} /></button>
          <span className="clr-pro-note">Carelune Pro is a configured institutional solution.</span>
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------------- trust */
const TRUST = [
  "Care plans are reviewed and approved by the treating doctor",
  "Clear roles for doctors, nurses and coordinators",
  "The patient-facing experience carries the institution’s identity",
  "Communication and concerns follow a structured escalation path",
  "Care plans are personalised around the individual patient",
];
function Trust() {
  return (
    <section className="clr-sec tint" id="trust" aria-labelledby="trust-h">
      <div className="clr-wrap">
        <div className="clr-trust-grid">
          <div>
            <p className="clr-eyebrow">Clinical control</p>
            <h2 id="trust-h" className="clr-h2" style={{ marginTop: 16 }}>The treating doctor remains in control.</h2>
            <p className="clr-trust-note">
              Carelune supports continuing care and communication. It does not replace clinical
              judgement, and it is not an emergency-response service.
            </p>
          </div>
          <ul className="clr-trust-list">
            {TRUST.map((t) => <li key={t}><span className="tick"><Ico.check width={18} height={18} /></span>{t}</li>)}
          </ul>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------- org cta */
function OrgCta({ route, setRoute, onStart, onOrg }: { route: Route; setRoute: (r: Route) => void; onStart: () => void; onOrg: () => void }) {
  return (
    <section className="clr-sec clr-final" id="get-started" aria-labelledby="cta-h">
      <div className="clr-wrap">
        <div className="clr-cta-grid">
          <div className="clr-cta-copy">
            <p className="clr-eyebrow">Get started</p>
            <h2 id="cta-h" className="clr-h2" style={{ marginTop: 16, maxWidth: "16ch" }}>Continue care beyond discharge.</h2>
            <p className="clr-lead" style={{ marginTop: 18 }}>
              Give your doctors and nursing coordinators a structured way to guide patients at home,
              involve families and remain connected until the next follow-up.
            </p>
            <div className="clr-hero-cta" style={{ marginTop: 26 }}>
              <button type="button" className="clr-btn pri" onClick={onStart}>Start free <Ico.arrow className="arw" width={17} height={17} /></button>
              <button type="button" className="clr-textlink" onClick={onOrg}>Talk to our team <Ico.arrow className="arw" width={16} height={16} /></button>
            </div>
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
    const kind = route === "doctor" ? "Individual doctor" : "Clinic or hospital";
    const body = [
      `Enquiry type: ${kind}`,
      `Full name: ${g("name")}`,
      `Medical registration number: ${g("mrn")}`,
      `Hospital / clinic: ${g("org")}`,
      `Role: ${g("role")}`,
      `Work email: ${g("email")}`,
      `Mobile number: ${g("mobile")}`,
      `City: ${g("city")}`,
      `Approx. patients per month: ${g("volume")}`,
      `What would you like to use Carelune for?: ${g("purpose")}`,
    ].join("\n");
    window.location.href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(`Carelune enquiry (${kind}) — ${g("org") || g("name")}`)}&body=${encodeURIComponent(body)}`;
    setSent(true);
  };

  if (sent) {
    return (
      <div className="clr-form clr-form-done" role="status">
        <span className="clr-form-tick"><Ico.check width={26} height={26} /></span>
        <p><b>Your email app should now be open</b>, with your details ready to send to <b>{CONTACT_EMAIL}</b> — a monitored Carelune inbox. Please review and send that email to complete your enquiry. Nothing is submitted until you send it.</p>
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
          <input type="radio" name="route" checked={route === "org"} onChange={() => setRoute("org")} /> Clinic or hospital
        </label>
      </fieldset>
      <div className="clr-field-row">
        <Field name="name" label="Full name" required />
        <Field name="org" label="Hospital / clinic name" />
      </div>
      <div className="clr-field-row">
        <Field name="role" label="Role" />
        <Field name="mrn" label="Medical registration no." />
      </div>
      <div className="clr-field-row">
        <Field name="email" label="Work email" type="email" required />
        <Field name="mobile" label="Mobile number" type="tel" />
      </div>
      <div className="clr-field-row">
        <Field name="city" label="City" />
        <Field name="volume" label="Approx. patients / month" />
      </div>
      <Field name="purpose" label="What would you like to use Carelune for?" />
      <button type="submit" className="clr-btn pri" style={{ width: "100%", marginTop: 6 }}>
        {route === "doctor" ? "Start free" : "Talk to our team"} <Ico.arrow className="arw" width={17} height={17} />
      </button>
      <p className="clr-form-note">Opening your email app pre-fills these details for {CONTACT_EMAIL} — you send the email to complete your enquiry. Professional verification is required before activation.</p>
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
              <li><a href="#free" onClick={scrollTo("free")}>For doctors</a></li>
              <li><a href="#pro" onClick={scrollTo("pro")}>For hospitals</a></li>
              <li><a href="#why" onClick={scrollTo("why")}>Why Carelune</a></li>
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
          <p>Carelune supports structured continuing care and communication after discharge. It does not replace clinical judgement or emergency services.</p>
          <p>© 2026 Carelune Health</p>
        </div>
      </div>
    </footer>
  );
}
