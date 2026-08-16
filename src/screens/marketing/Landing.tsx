import { LoopMark } from "../../components/ui";
import { LEGAL_READY } from "./legal";
import LandingHero from "./continuity";
import "./continuity.css";

/**
 * Public, Carelune-branded conversion page (hospitals, rehabilitation centres,
 * specialists). Checkpoint 2: the whole page is rebuilt in the redesigned system
 * — Manrope throughout, refined bright/ice/sky/near-black tokens, the Continuity
 * Line in exactly four moments (hero · care flow · recovery trajectory · closing),
 * alternating dense/quiet sections, no repeated card grids.
 *
 * All copy and CTA destinations are the approved content, only reorganised
 * visually. No new claims, no backend/auth/routing/clinical changes.
 */

const CALENDLY = "https://calendly.com/sujith-medzell/meeting";

const Check = () => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 6 9 17l-5-5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

export default function Landing({ onSignIn }: { onSignIn: () => void }) {
  return (
    <div className="cl" style={{ minHeight: "100vh" }}>
      <LandingHero onSignIn={onSignIn} />
      <Pain />
      <CareFlow />
      <Institution />
      <Operations />
      <Quality />
      <Trust />
      <Commercial />
      <Closing onSignIn={onSignIn} />
      <Footer />
    </div>
  );
}

/* ------------------------------- shared bits ----------------------------- */

function Point({ title, children }: { title: string; children: string }) {
  return (
    <div className="cl-pt">
      <div className="r" />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}

function BookBtn() {
  return (
    <a href={CALENDLY} target="_blank" rel="noopener noreferrer" className="cl-btn pri">
      Book a 20-minute walkthrough <span className="arw" aria-hidden="true">→</span>
    </a>
  );
}

/* ------------------------- 2 · doctor's perspective ---------------------- */

function Pain() {
  return (
    <section className="cl-sec alt">
      <div className="cl-in">
        <div className="cl-narrow">
          <div className="cl-persp">For the treating doctor</div>
          <h2 className="cl-h2">Stop managing recovery through scattered calls and messages.</h2>
          <p className="cl-lead">
            After discharge, routine questions, medicine updates, readings and family concerns often
            reach the doctor without structure or context. Carelune places a nursing coordinator
            between everyday communication and clinical decision-making—so the doctor is brought in
            when medical judgement is genuinely required.
          </p>
          <p className="cl-emph">
            Use your existing nurse or clinical assistant as the first point of coordination—Carelune
            organises routine updates and brings clinical decisions to you.
          </p>
        </div>
        <div className="cl-points c3">
          <Point title="One recovery view">See the plan, daily completion, readings, concerns and milestones together.</Point>
          <Point title="Coordinator-led communication">Routine family communication is handled through the designated nursing coordinator.</Point>
          <Point title="Doctor attention where it matters">Clinical questions and important exceptions are organised for doctor review.</Point>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------- 3 · care flow ------------------------------ */

function CareFlow() {
  const steps: [string, string][] = [
    ["Patient joins", "The family registers through the institution’s secure link and records consent."],
    ["Doctor approves the plan", "Available documents are structured into a draft. The authorised clinician reviews, edits and approves the final care plan."],
    ["Caregiver follows today’s care", "Medicines, activities, monitoring, diet, precautions and patient-specific instructions become clear daily actions."],
    ["Nursing coordinator stays connected", "The coordinator reviews routine updates, responds to families and routes clinical matters appropriately."],
    ["Doctor sees what needs a decision", "The doctor receives a concise view of progress, concerns and items requiring clinical judgement."],
  ];
  const last = steps.length - 1;
  return (
    <section id="how" className="cl-sec">
      <div className="cl-in">
        <div className="cl-flowgrid">
          <div>
            <div className="cl-kicker">The care loop</div>
            <h2 className="cl-h2" style={{ marginTop: 16 }}>One governed care loop, from your ward to their home.</h2>
            <div className="cl-srule" />
          </div>
          <ol className="cl-steps">
            <div className="cl-flowline" aria-hidden="true" />
            {steps.map(([h, p], i) => (
              <li key={h} className={`cl-step${i === last ? " last" : ""}`}>
                <span className="num">{i + 1}</span>
                <div className="cnt">
                  <h3>{h}</h3>
                  <p>{p}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

/* ----------------------- 4 · institution perspective --------------------- */

function Institution() {
  return (
    <section className="cl-sec alt">
      <div className="cl-in">
        <div className="cl-narrow">
          <div className="cl-persp">For the institution</div>
          <h2 className="cl-h2">Extend your institution&rsquo;s relationship beyond discharge.</h2>
          <p className="cl-lead">
            Recovery at home is part of the patient&rsquo;s experience of your care. Carelune helps
            your institution remain meaningfully connected throughout that journey—under your name,
            through your team and according to your clinical approach.
          </p>
        </div>
        <div className="cl-points c2">
          <Point title="Greater patient confidence">Patients and families know what to do today and how to reach the defined care workflow.</Point>
          <Point title="Stronger continuity and retention">Keep patients connected to the treating institution throughout recovery instead of losing the relationship after discharge.</Point>
          <Point title="A structured post-discharge service">Convert informal follow-up into a clearly defined programme that the institution can offer under its own brand.</Point>
          <Point title="Better quality visibility">Review plan completion, patient-reported readings, milestones, concerns and communication in one place.</Point>
        </div>
      </div>
    </section>
  );
}

/* ------------------------- 5 · operations command centre ----------------- */

function Ring({ pct }: { pct: number }) {
  const r = 56, c = 2 * Math.PI * r;
  return (
    <div className="cl-ring">
      <svg width="132" height="132" viewBox="0 0 132 132" aria-hidden="true">
        <circle cx="66" cy="66" r={r} fill="none" stroke="#E2ECF8" strokeWidth="10" />
        <circle cx="66" cy="66" r={r} fill="none" stroke="#128CFF" strokeWidth="10" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} transform="rotate(-90 66 66)" />
      </svg>
      <div className="v"><b className="cl-num">{pct}%</b><span>completed</span></div>
    </div>
  );
}

function Operations() {
  return (
    <section className="cl-sec">
      <div className="cl-in">
        <div className="cl-kicker">Operations command centre</div>
        <h2 className="cl-h2" style={{ marginTop: 16 }}>What your team sees each morning.</h2>
        <div className="cl-ops">
          <div className="top">
            <span className="t">Your operations view · this morning</span>
            <span className="il">Illustrative</span>
          </div>
          <div className="cl-opsgrid">
            <Ring pct={82} />
            <div className="cl-metrics">
              <div className="cl-mrow"><span className="k">Active patients</span><span className="val cl-num">8</span></div>
              <div className="cl-mrow"><span className="k">Needs attention</span><span className="cl-chip attn cl-num">2 · review required</span></div>
              <div className="cl-mrow"><span className="k">Doctor decisions</span><span className="val cl-num">2 pending</span></div>
              <div className="cl-mrow"><span className="k">Family concerns</span><span className="val cl-num">1 open</span></div>
              <div className="cl-mrow"><span className="k">Coordinator workload</span><span className="val">Routine</span></div>
            </div>
          </div>
          <div className="cl-traj">
            <div className="lab">Recovery trajectory</div>
            <svg viewBox="0 0 480 44" preserveAspectRatio="none" aria-hidden="true">
              <polyline points="4,34 74,30 144,32 214,24 284,18 354,20 424,10" fill="none" stroke="#128CFF" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="424" cy="10" r="4" fill="#128CFF" />
            </svg>
          </div>
        </div>
      </div>
    </section>
  );
}

/* --------------------------- 6 · quality / NABH -------------------------- */

function Quality() {
  const areas = [
    "Continuity of care after discharge",
    "Clinician-approved care and medication instructions",
    "Patient and caregiver education",
    "Defined responsibilities and escalation",
    "Structured recovery documentation",
  ];
  return (
    <section className="cl-sec alt">
      <div className="cl-in">
        <div className="cl-narrow">
          <div className="cl-kicker">Quality &amp; documentation</div>
          <h2 className="cl-h2" style={{ marginTop: 16 }}>Support continuity and quality documentation beyond discharge.</h2>
          <p className="cl-lead">
            Carelune helps teams organise workflows relevant to continuity of care, medication
            instructions, patient and caregiver education, defined escalation and information
            management after discharge.
          </p>
        </div>
        <ul className="cl-checks">
          {areas.map((a) => (
            <li key={a} className="cl-ci"><span className="tk"><Check /></span>{a}</li>
          ))}
        </ul>
        <div className="cl-nabh"><span className="dot" /> Designed to complement institutional quality and NABH-related continuity workflows.</div>
      </div>
    </section>
  );
}

/* ---------------------- 7 · trust architecture --------------------------- */

function Trust() {
  return (
    <section className="cl-sec">
      <div className="cl-in">
        <div className="cl-kicker">Clinical control &amp; privacy</div>
        <h2 className="cl-h2" style={{ marginTop: 16, maxWidth: "24ch" }}>Clinical control and patient privacy are built into the workflow.</h2>

        <div className="cl-bound">
          <span className="bl">Every institution operates within a separate data environment</span>
          <div className="cl-pipe">
            <div className="cl-stg">
              <div className="sn">Step 1</div>
              <h4>Consent</h4>
              <p>Patient/family consent is recorded during onboarding.</p>
              <div className="cl-gaterow"><span className="cl-gpill ok">then ▸</span></div>
            </div>
            <div className="cl-stg">
              <div className="sn">Step 2</div>
              <h4>AI draft</h4>
              <p>AI-assisted content remains a draft until clinician approval.</p>
              <div className="cl-gaterow"><span className="cl-gpill amber">doctor review ▸</span></div>
            </div>
            <div className="cl-stg">
              <div className="sn">Step 3</div>
              <h4>Clinician approval</h4>
              <p>Only authorised clinicians activate or change clinical plans.</p>
              <div className="cl-gaterow"><span className="cl-gpill ok">approved</span></div>
            </div>
          </div>
        </div>

        <div className="cl-lanes">
          <div className="cl-lane"><h4>Role-based access</h4><p>Role-based access limits what each user can see and do.</p></div>
          <div className="cl-lane"><h4>Institution-controlled documents</h4><p>Patient documents remain within the institution&rsquo;s controlled workflow.</p></div>
          <div className="cl-lane"><h4>Never sold</h4><p>Patient information is not sold.</p></div>
        </div>

        <p className="cl-archnote">
          Carelune is built around consent, purpose-limited access, clinical accountability and
          institution-controlled care delivery.
        </p>
      </div>
    </section>
  );
}

/* ------------------------------ 8 · commercial --------------------------- */

function Commercial() {
  const items = [
    "Institution-branded patient experience",
    "Configurable care offering and pricing",
    "Nursing coordinator and doctor workflow",
    "Permanent patient-registration link",
    "Structured visibility across active patients",
  ];
  return (
    <section className="cl-sec alt">
      <div className="cl-in">
        <div className="cl-narrow">
          <div className="cl-kicker">The programme</div>
          <h2 className="cl-h2" style={{ marginTop: 16 }}>Turn follow-up from an informal obligation into a structured care programme.</h2>
          <p className="cl-lead">
            Define your team, configure your service, invite eligible patients and deliver continuity
            under your institution&rsquo;s identity. Carelune provides the operating layer; your
            institution retains the clinical relationship.
          </p>
          <p className="cl-emph" style={{ fontWeight: 500, color: "var(--slate)" }}>
            Configure your existing HOD, doctors, nursing coordinators, duty doctors, caregivers and
            families within one governed workflow—no hospital-system integration required.
          </p>
        </div>
        <div className="cl-ledger">
          {items.map((it) => (
            <div key={it} className="cl-li"><span className="d" /><span className="t">{it}</span></div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* --------------------------- 9 · closing (moment #4) --------------------- */

function Closing({ onSignIn }: { onSignIn: () => void }) {
  return (
    <section className="cl-close">
      <div className="cl-closecard">
        <div className="resolve" aria-hidden="true">
          <svg width="220" height="40" viewBox="0 0 220 40" style={{ overflow: "visible" }}>
            <path d="M6 26 C 70 26, 96 14, 150 14" fill="none" stroke="#128CFF" strokeWidth="2.4" strokeLinecap="round" />
            <circle cx="6" cy="26" r="4" fill="#128CFF" />
            <path d="M186 20a12 12 0 1 1-6-10.4" fill="none" stroke="#0E6FDB" strokeWidth="3" strokeLinecap="round" />
            <circle cx="185" cy="11" r="3.1" fill="#0E6FDB" />
          </svg>
        </div>
        <h2>Give your patients continuity—and give your doctors control.</h2>
        <p>
          Show us how your institution manages patients after discharge. In 20 minutes, we&rsquo;ll
          demonstrate how Carelune can turn that process into a structured, institution-owned care
          workflow.
        </p>
        <div className="cta">
          <BookBtn />
          <button type="button" className="cl-btn ghost" onClick={onSignIn}>Sign in</button>
        </div>
        <p className="ob">Now onboarding select care providers.</p>
      </div>
    </section>
  );
}

/* -------------------------------- footer --------------------------------- */

function Footer() {
  return (
    <footer className="cl-foot">
      <div className="in">
        <div className="b">
          <span className="lm"><LoopMark size={22} /></span> Carelune
          <span className="tag">· Care continues after discharge.</span>
        </div>
        <div className="links">
          {LEGAL_READY && (
            <>
              <a href="/privacy">Privacy</a>
              <a href="/security">Security</a>
              <a href="/clinical-governance">Clinical governance</a>
              <a href="/terms">Terms</a>
              <a href="/contact">Contact</a>
              <span className="sep">·</span>
            </>
          )}
          <a href={CALENDLY} target="_blank" rel="noopener noreferrer">Book a 20-minute walkthrough</a>
          <span className="sep">·</span>
          <span>© 2026 Carelune Health</span>
        </div>
      </div>
    </footer>
  );
}
