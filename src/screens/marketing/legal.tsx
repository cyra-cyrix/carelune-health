import { LoopMark } from "../../components/ui";

/**
 * Public trust/legal pages linked from the landing-page footer. SCAFFOLDING ONLY:
 * the copy below is honest placeholder text ("being finalised") — it does NOT
 * assert any policy, certification or company identity. Replace each entry with
 * counsel-reviewed content + real company details, then flip LEGAL_READY (in
 * Landing.tsx) to true so the footer links appear.
 *
 * Rendered by AuthGate when window.location.pathname matches one of LEGAL_PATHS
 * (served via the SPA fallback). No auth, no data, presentational only.
 */

const SKY = "#168BFF";
const SKY_TEXT = "#1170D8";
const INK = "#111820";
const HAIR = "#E4EEFB";

const CALENDLY = "https://calendly.com/sujith-medzell/meeting";

// Master switch for the trust/legal layer. While false, the footer links are hidden
// AND the routes below do not render (AuthGate redirects them to the landing page),
// so no placeholder page is ever exposed. Flip to true only once every page holds
// real, counsel-reviewed content + company identity.
export const LEGAL_READY = false;

export const LEGAL_PATHS = ["/privacy", "/security", "/clinical-governance", "/terms", "/contact"] as const;
export type LegalPath = (typeof LEGAL_PATHS)[number];

type Page = { title: string; body: string };

// TODO(founder): replace with counsel-reviewed content + company legal name, registered
// address and responsible contact. These are placeholders, not statements of policy.
const PAGES: Record<LegalPath, Page> = {
  "/privacy": {
    title: "Privacy",
    body:
      "This notice is being finalised. It will set out what patient and institutional information Carelune processes, the lawful basis and consent relied on, how information is stored and protected, how long it is retained, and the rights available to patients and institutions. For any questions in the meantime, please contact us.",
  },
  "/security": {
    title: "Security",
    body:
      "This overview is being finalised. It will summarise the technical and organisational controls Carelune uses, including per-institution data separation, role-based access, protected storage of patient documents, and how access is governed. For any questions in the meantime, please contact us.",
  },
  "/clinical-governance": {
    title: "Clinical governance",
    body:
      "This summary is being finalised. It will describe how clinical control is retained by your authorised clinicians, the boundaries of AI-assisted content, escalation responsibilities, and the separation of validated instruments from operational tracking. For any questions in the meantime, please contact us.",
  },
  "/terms": {
    title: "Terms",
    body:
      "These terms are being finalised. They will set out the basis on which institutions and their teams use Carelune. For any questions in the meantime, please contact us.",
  },
  "/contact": {
    title: "Contact",
    body:
      "We would be glad to hear from you. Company details will be published here shortly. You can also book a 20-minute walkthrough with our team.",
  },
};

export default function LegalPage({ path }: { path: LegalPath }) {
  const page = PAGES[path];
  return (
    <div className="min-h-screen bg-white" style={{ color: INK }}>
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur" style={{ borderBottom: `1px solid ${HAIR}` }}>
        <nav className="mx-auto flex h-16 max-w-3xl items-center justify-between px-5 sm:px-8">
          <a href="/" className="tap flex items-center gap-2.5">
            <span style={{ color: SKY }}><LoopMark size={26} /></span>
            <span className="font-display text-[18px] font-semibold tracking-tight" style={{ color: INK }}>Carelune</span>
          </a>
          <a href="/" className="tap text-[14px] font-semibold" style={{ color: SKY_TEXT }}>← Back to home</a>
        </nav>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-16 sm:px-8">
        <h1 className="font-display text-[34px] font-semibold tracking-[-0.01em]" style={{ color: INK }}>{page.title}</h1>
        <div className="mt-5 h-1 w-14 rounded-full" style={{ background: SKY }} />
        <p className="mt-7 text-[16px] leading-relaxed text-sage-700">{page.body}</p>
        <div className="mt-9 flex flex-wrap gap-3">
          <a
            href={CALENDLY}
            target="_blank"
            rel="noopener noreferrer"
            className="tap inline-flex items-center justify-center rounded-2xl px-5 py-3 text-[15px] font-semibold text-white"
            style={{ background: SKY_TEXT }}
          >
            Book a 20-minute walkthrough
          </a>
          <a
            href="/"
            className="tap inline-flex items-center justify-center rounded-2xl bg-white px-5 py-3 text-[15px] font-semibold"
            style={{ color: SKY_TEXT, boxShadow: `inset 0 0 0 1px ${HAIR}` }}
          >
            Back to home
          </a>
        </div>
      </main>

      <footer className="mx-auto max-w-3xl px-5 pb-12 sm:px-8">
        <p className="text-[12px] text-sage-500">© 2026 Carelune Health</p>
      </footer>
    </div>
  );
}
