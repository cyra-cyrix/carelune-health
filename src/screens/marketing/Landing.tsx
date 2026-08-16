import { LoopMark } from "../../components/ui";
import { LEGAL_READY } from "./legal";

/**
 * Public, Carelune-branded conversion page for the people who buy the platform —
 * hospitals, rehabilitation centres and specialist practices. Carelune branding
 * lives ONLY here; the institution's white-label brand appears on patient /
 * caregiver / family surfaces, never on this page.
 *
 * Bright visual system (landing-scoped, app tokens untouched): white + ice-blue
 * surfaces, sky-blue accents (#168BFF) and AA-safe filled buttons (#1170D8, white
 * text 4.6:1), near-black headings. No navy, no gradients, restrained cards.
 *
 * Copy is institution-facing and stays inside the frozen boundaries: clinician-
 * controlled care, AI understated, no fabricated certifications / statistics /
 * customers / testimonials, no blanket regulatory-compliance claims.
 */

const SKY = "#168BFF"; // primary accent — rules, dots, connectors, brand mark
const SKY_2 = "#4DB8FF"; // light accent
const SKY_TEXT = "#1170D8"; // sky for text/links AND filled buttons/badges — white text passes WCAG AA (4.6:1)
const SKY_WASH = "#E8F2FF"; // faint sky chip / icon background
const INK = "#111820"; // strong near-black headings
const ICE = "#F4F9FF"; // ice-blue surface
const HAIR = "#E4EEFB"; // hairline border

const CALENDLY = "https://calendly.com/sujith-medzell/meeting";

export default function Landing({ onSignIn }: { onSignIn: () => void }) {
  return (
    <div className="min-h-screen bg-white" style={{ color: INK }}>
      <TopBar onSignIn={onSignIn} />
      <Hero onSignIn={onSignIn} />
      <Pain />
      <HowItWorks />
      <Institutional />
      <Quality />
      <Trust />
      <Commercial />
      <Closing onSignIn={onSignIn} />
      <Footer />
    </div>
  );
}

/* ------------------------------ shared bits ------------------------------ */

function BookCTA({ nav = false }: { nav?: boolean }) {
  return (
    <a
      href={CALENDLY}
      target="_blank"
      rel="noopener noreferrer"
      className={`tap inline-flex items-center justify-center rounded-2xl font-semibold text-white shadow-sm ${nav ? "px-4 py-2 text-[14px]" : "px-6 py-3.5 text-[15.5px]"}`}
      style={{ background: SKY_TEXT }}
    >
      {nav ? "Book a walkthrough" : "Book a 20-minute walkthrough"}
    </a>
  );
}

function SignInCTA({ onSignIn }: { onSignIn: () => void }) {
  return (
    <button
      type="button"
      onClick={onSignIn}
      className="tap inline-flex items-center justify-center rounded-2xl bg-white px-6 py-3.5 text-[15.5px] font-semibold"
      style={{ color: SKY_TEXT, boxShadow: `inset 0 0 0 1px ${HAIR}` }}
    >
      Sign in
    </button>
  );
}

function RulePoint({ title, children }: { title: string; children: string }) {
  return (
    <div>
      <div className="h-1 w-10 rounded-full" style={{ background: SKY }} />
      <h3 className="mt-4 font-display text-[16.5px] font-semibold" style={{ color: INK }}>{title}</h3>
      <p className="mt-2 text-[14px] leading-relaxed text-sage-600">{children}</p>
    </div>
  );
}

function CheckItem({ children }: { children: string }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full" style={{ background: SKY_WASH }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M20 6 9 17l-5-5" stroke={SKY_TEXT} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="text-[14.5px] leading-relaxed text-sage-700">{children}</span>
    </li>
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
          <span className="hidden sm:inline-block"><BookCTA nav /></span>
        </div>
      </nav>
    </header>
  );
}

/* ---------------------------------- hero --------------------------------- */

function Hero({ onSignIn }: { onSignIn: () => void }) {
  return (
    <section className="mx-auto grid max-w-6xl items-center gap-14 px-5 pb-16 pt-14 sm:px-8 lg:grid-cols-[1.05fr_1fr] lg:pt-24">
      <div>
        <div className="text-[12px] font-semibold uppercase tracking-[0.16em]" style={{ color: SKY_TEXT }}>
          For hospitals, rehabilitation centres &amp; specialists
        </div>
        <h1 className="mt-5 font-display text-[36px] font-semibold leading-[1.08] tracking-[-0.02em] sm:text-[48px]" style={{ color: INK }}>
          Your patients leave the hospital. Your care should continue.
        </h1>
        <div className="mt-6 h-1 w-16 rounded-full" style={{ background: SKY }} />
        <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-sage-700">
          Carelune gives your team a structured way to guide recovery at home—turning
          clinician-approved plans into daily caregiver actions, organised patient updates
          and a clear attention queue for your clinical team.
        </p>
        <div className="mt-9 flex flex-wrap items-center gap-3">
          <BookCTA />
          <SignInCTA onSignIn={onSignIn} />
        </div>
        <div className="mt-6 rounded-2xl px-4 py-3.5" style={{ background: SKY_WASH, border: `1px solid ${HAIR}` }}>
          <div className="text-[13.5px] font-semibold" style={{ color: SKY_TEXT }}>Free for verified individual doctors</div>
          <p className="mt-0.5 text-[13px] leading-relaxed text-sage-700">
            One doctor, one nursing coordinator and unlimited eligible patients. Upgrade when your
            team or institutional requirements grow.
          </p>
        </div>
        <p className="mt-6 text-[14px] font-semibold" style={{ color: INK }}>
          Your practice or institution. Your team. Your clinical identity.
        </p>
        <p className="mt-1.5 text-[13px] text-sage-500">Now onboarding select care providers.</p>
      </div>

      <FlowVisual />
    </section>
  );
}

/** The signature story: information moving calmly caregiver → coordinator → doctor. */
function FlowVisual() {
  return (
    <div className="rounded-3xl bg-white p-6 shadow-lift" style={{ border: `1px solid ${HAIR}` }}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sage-500">From home to your desk</div>
      <div className="mt-5">
        <Stage label="Caregiver" detail="Logs today’s care, medicines and readings." chip="4 of 6 done today" />
        <Connector />
        <Stage label="Nursing coordinator" detail="Answers routine questions, routes clinical matters." chip="2 routed to the doctor" />
        <Connector />
        <Stage label="Doctor" detail="Sees only what needs a decision." highlight items={["Standing BP trend — review", "Medication query — review"]} />
      </div>
    </div>
  );
}

function Connector() {
  return <div className="ml-[15px] h-5 w-px" style={{ background: SKY_2, opacity: 0.7 }} />;
}

function Stage({ label, detail, chip, highlight, items }: { label: string; detail: string; chip?: string; highlight?: boolean; items?: string[] }) {
  return (
    <div className="flex gap-3 rounded-2xl" style={highlight ? { background: ICE, border: `1px solid ${HAIR}`, padding: "12px 14px" } : { padding: "2px 0" }}>
      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full" style={{ background: highlight ? SKY_TEXT : SKY }}>
        <span className="h-2 w-2 rounded-full bg-white" />
      </span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-display text-[14.5px] font-semibold" style={{ color: INK }}>{label}</span>
          {chip && <span className="rounded-full px-2 py-0.5 text-[10.5px] font-semibold" style={{ background: SKY_WASH, color: SKY_TEXT }}>{chip}</span>}
        </div>
        <div className="mt-0.5 text-[12.5px] text-sage-600">{detail}</div>
        {items && (
          <ul className="mt-2 space-y-1">
            {items.map((it) => (
              <li key={it} className="flex items-center gap-2 text-[12.5px]" style={{ color: INK }}>
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: SKY }} /> {it}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** A restrained operations snapshot for the rehabilitation-centre / HOD narrative. */
function CommandCentre() {
  const stats: [string, string, "sky" | "amber" | "ink"][] = [
    ["Active patients", "8", "ink"],
    ["Needs attention", "2", "amber"],
    ["Today’s completion", "82%", "sky"],
    ["Family concerns", "1 open", "ink"],
    ["Doctor decisions", "2 pending", "sky"],
    ["Coordinator workload", "Routine", "ink"],
  ];
  return (
    <div className="rounded-3xl bg-white p-6 shadow-lift" style={{ border: `1px solid ${HAIR}` }}>
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sage-500">
          Your operations view · this morning
        </div>
        <span className="text-[11px] text-sage-400">Illustrative</span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {stats.map(([label, value, tone]) => (
          <div key={label} className="rounded-2xl p-4" style={{ background: ICE }}>
            <div className="text-[12px] text-sage-600">{label}</div>
            <div
              className="mt-1 font-display text-[22px] font-semibold"
              style={{ color: tone === "amber" ? "#A66E08" : tone === "sky" ? SKY_TEXT : INK }}
            >
              {value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* --------------------------------- pain ---------------------------------- */

function Pain() {
  return (
    <section className="py-20" style={{ background: ICE }}>
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className="max-w-2xl">
          <h2 className="font-display text-[30px] font-semibold tracking-[-0.01em] sm:text-[34px]" style={{ color: INK }}>
            Stop managing recovery through scattered calls and messages.
          </h2>
          <p className="mt-4 text-[15.5px] leading-relaxed text-sage-700">
            After discharge, routine questions, medicine updates, readings and family concerns
            often reach the doctor without structure or context. Carelune places a nursing
            coordinator between everyday communication and clinical decision-making—so the
            doctor is brought in when medical judgement is genuinely required.
          </p>
          <p className="mt-4 text-[14.5px] font-medium" style={{ color: INK }}>
            Use your existing nurse or clinical assistant as the first point of coordination—Carelune
            organises routine updates and brings clinical decisions to you.
          </p>
        </div>
        <div className="mt-12 grid gap-x-12 gap-y-9 sm:grid-cols-3">
          <RulePoint title="One recovery view">See the plan, daily completion, readings, concerns and milestones together.</RulePoint>
          <RulePoint title="Coordinator-led communication">Routine family communication is handled through the designated nursing coordinator.</RulePoint>
          <RulePoint title="Doctor attention where it matters">Clinical questions and important exceptions are organised for doctor review.</RulePoint>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------ how it works ----------------------------- */

function HowItWorks() {
  const steps: [string, string][] = [
    ["Patient joins", "The family registers through the institution’s secure link and records consent."],
    ["Doctor approves the plan", "Available documents are structured into a draft. The authorised clinician reviews, edits and approves the final care plan."],
    ["Caregiver follows today’s care", "Medicines, activities, monitoring, diet, precautions and patient-specific instructions become clear daily actions."],
    ["Nursing coordinator stays connected", "The coordinator reviews routine updates, responds to families and routes clinical matters appropriately."],
    ["Doctor sees what needs a decision", "The doctor receives a concise view of progress, concerns and items requiring clinical judgement."],
  ];
  const last = steps.length - 1;
  return (
    <section id="how" className="py-20">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <h2 className="max-w-2xl font-display text-[30px] font-semibold tracking-[-0.01em] sm:text-[34px]" style={{ color: INK }}>
          One governed care loop, from your ward to their home.
        </h2>
        <ol className="mt-12 max-w-3xl">
          {steps.map(([h, p], i) => (
            <li key={h} className="flex gap-5">
              <div className="flex flex-col items-center">
                <span
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[15px] font-semibold text-white"
                  style={{ background: i === last ? SKY_TEXT : SKY }}
                >
                  {i + 1}
                </span>
                {i !== last && <span className="my-1 w-px flex-1" style={{ background: SKY_2, opacity: 0.6, minHeight: 22 }} />}
              </div>
              <div className={i === last ? "rounded-2xl px-4 pb-5 pt-1" : "pb-8 pt-1"} style={i === last ? { background: ICE, border: `1px solid ${HAIR}` } : undefined}>
                <h3 className="font-display text-[17.5px] font-semibold" style={{ color: INK }}>{h}</h3>
                <p className="mt-1.5 max-w-xl text-[14px] leading-relaxed text-sage-600">{p}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* --------------------------- institutional value ------------------------- */

function Institutional() {
  return (
    <section className="py-20" style={{ background: ICE }}>
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className="max-w-2xl">
          <h2 className="font-display text-[30px] font-semibold tracking-[-0.01em] sm:text-[34px]" style={{ color: INK }}>
            Extend your institution&rsquo;s relationship beyond discharge.
          </h2>
          <p className="mt-4 text-[15.5px] leading-relaxed text-sage-700">
            Recovery at home is part of the patient&rsquo;s experience of your care. Carelune helps
            your institution remain meaningfully connected throughout that journey—under your name,
            through your team and according to your clinical approach.
          </p>
        </div>
        <div className="mt-12 grid gap-x-12 gap-y-9 sm:grid-cols-2">
          <RulePoint title="Greater patient confidence">Patients and families know what to do today and how to reach the defined care workflow.</RulePoint>
          <RulePoint title="Stronger continuity and retention">Keep patients connected to the treating institution throughout recovery instead of losing the relationship after discharge.</RulePoint>
          <RulePoint title="A structured post-discharge service">Convert informal follow-up into a clearly defined programme that the institution can offer under its own brand.</RulePoint>
          <RulePoint title="Better quality visibility">Review plan completion, patient-reported readings, milestones, concerns and communication in one place.</RulePoint>
        </div>
        <div className="mt-12 max-w-3xl"><CommandCentre /></div>
      </div>
    </section>
  );
}

/* ------------------------------- quality --------------------------------- */

function Quality() {
  const areas = [
    "Continuity of care after discharge",
    "Clinician-approved care and medication instructions",
    "Patient and caregiver education",
    "Defined responsibilities and escalation",
    "Structured recovery documentation",
  ];
  return (
    <section className="py-20">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className="max-w-2xl">
          <h2 className="font-display text-[30px] font-semibold tracking-[-0.01em] sm:text-[34px]" style={{ color: INK }}>
            Support continuity and quality documentation beyond discharge.
          </h2>
          <p className="mt-4 text-[15.5px] leading-relaxed text-sage-700">
            Carelune helps teams organise workflows relevant to continuity of care, medication
            instructions, patient and caregiver education, defined escalation and information
            management after discharge.
          </p>
        </div>
        <ul className="mt-10 grid max-w-3xl gap-x-10 gap-y-4 sm:grid-cols-2">
          {areas.map((a) => <CheckItem key={a}>{a}</CheckItem>)}
        </ul>
        <p className="mt-8 text-[13.5px] text-sage-500">
          Designed to complement institutional quality and NABH-related continuity workflows.
        </p>
      </div>
    </section>
  );
}

/* ---------------------------- clinical / data ---------------------------- */

function Trust() {
  const controls = [
    "Every institution operates within a separate data environment",
    "Role-based access limits what each user can see and do",
    "Patient/family consent is recorded during onboarding",
    "Only authorised clinicians activate or change clinical plans",
    "Patient documents remain within the institution’s controlled workflow",
    "AI-assisted content remains a draft until clinician approval",
    "Patient information is not sold",
  ];
  return (
    <section className="py-20" style={{ background: ICE }}>
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <h2 className="max-w-2xl font-display text-[30px] font-semibold tracking-[-0.01em] sm:text-[34px]" style={{ color: INK }}>
          Clinical control and patient privacy are built into the workflow.
        </h2>
        <ul className="mt-10 grid gap-x-10 gap-y-4 sm:grid-cols-2">
          {controls.map((c) => <CheckItem key={c}>{c}</CheckItem>)}
        </ul>
        <p className="mt-9 max-w-3xl text-[15px] leading-relaxed text-sage-700">
          Carelune is built around consent, purpose-limited access, clinical accountability and
          institution-controlled care delivery.
        </p>
      </div>
    </section>
  );
}

/* ------------------------------ commercial ------------------------------- */

function Commercial() {
  const items = [
    "Institution-branded patient experience",
    "Configurable care offering and pricing",
    "Nursing coordinator and doctor workflow",
    "Permanent patient-registration link",
    "Structured visibility across active patients",
  ];
  return (
    <section className="py-20">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className="max-w-2xl">
          <h2 className="font-display text-[30px] font-semibold tracking-[-0.01em] sm:text-[34px]" style={{ color: INK }}>
            Turn follow-up from an informal obligation into a structured care programme.
          </h2>
          <p className="mt-4 text-[15.5px] leading-relaxed text-sage-700">
            Define your team, configure your service, invite eligible patients and deliver
            continuity under your institution&rsquo;s identity. Carelune provides the operating
            layer; your institution retains the clinical relationship.
          </p>
          <p className="mt-4 text-[14.5px] leading-relaxed text-sage-600">
            Configure your existing HOD, doctors, nursing coordinators, duty doctors, caregivers and
            families within one governed workflow—no hospital-system integration required.
          </p>
        </div>
        <div className="mt-10 grid max-w-3xl gap-x-10 gap-y-3 sm:grid-cols-2">
          {items.map((it) => (
            <div key={it} className="flex items-center gap-3 py-1">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: SKY }} />
              <span className="text-[14.5px] font-medium" style={{ color: INK }}>{it}</span>
            </div>
          ))}
        </div>
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
          Give your patients continuity—and give your doctors control.
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-[15.5px] leading-relaxed text-sage-600">
          Show us how your institution manages patients after discharge. In 20 minutes, we&rsquo;ll
          demonstrate how Carelune can turn that process into a structured, institution-owned care
          workflow.
        </p>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <BookCTA />
          <SignInCTA onSignIn={onSignIn} />
        </div>
        <p className="mt-6 text-[13px] text-sage-500">Now onboarding select care providers.</p>
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
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-sage-600">
          {LEGAL_READY && (
            <>
              <a href="/privacy" className="hover:text-ink" style={{ color: SKY_TEXT }}>Privacy</a>
              <a href="/security" className="hover:text-ink" style={{ color: SKY_TEXT }}>Security</a>
              <a href="/clinical-governance" className="hover:text-ink" style={{ color: SKY_TEXT }}>Clinical governance</a>
              <a href="/terms" className="hover:text-ink" style={{ color: SKY_TEXT }}>Terms</a>
              <a href="/contact" className="hover:text-ink" style={{ color: SKY_TEXT }}>Contact</a>
              <span className="text-sage-400">·</span>
            </>
          )}
          <a href={CALENDLY} target="_blank" rel="noopener noreferrer" className="font-medium" style={{ color: SKY_TEXT }}>
            Book a 20-minute walkthrough
          </a>
          <span className="text-sage-400">·</span>
          <span className="text-sage-500">© 2026 Carelune Health</span>
        </div>
      </div>
    </footer>
  );
}
