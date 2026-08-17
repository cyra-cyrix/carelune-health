import { LoopMark } from "./mocks";
import "./redesign.css";

/* ============================================================================
   Carelune — public Privacy Policy for the marketing website (carelune.in).
   Covers only this website and its enquiry form; the authenticated Carelune
   application has its own in-product privacy handling. Factual notice — no
   invented certifications, encryption or compliance claims.
   ========================================================================== */

const UPDATED = "17 August 2026";
const CONTACT_EMAIL = "hello@carelune.in";

export default function Privacy() {
  return (
    <div className="clr">
      <header className="clr-hdr">
        <div className="clr-hdr-in">
          <a className="clr-brand" href="/" aria-label="Carelune home"><LoopMark size={22} /> Carelune</a>
          <a className="clr-textlink" href="/" style={{ marginLeft: "auto" }}>← Back to home</a>
        </div>
      </header>

      <main className="clr-sec clr-legal">
        <div className="clr-wrap">
          <p className="clr-eyebrow muted">Privacy</p>
          <h1 className="clr-legal-h1">Privacy Policy</h1>
          <p className="clr-legal-date">Last updated: {UPDATED}</p>

          <p>
            This notice explains how Carelune Health handles the information you provide through this
            website (carelune.in), in particular the enquiry form. It does not cover the authenticated
            Carelune application used by doctors, hospitals and the patients in their care, which is
            governed separately.
          </p>

          <h2>Information we collect</h2>
          <p>
            When you submit the enquiry form, we collect the details you enter: your name, work email,
            mobile number and city; whether you enquire as an individual doctor or as a clinic or
            hospital; and — depending on that — your medical registration number and speciality or
            department, or your organisation name and role. We also collect your approximate number of
            patients per month and how you intend to use Carelune.
          </p>
          <p>
            <b>We do not collect patient information through this website</b>, and you should not enter
            any patient details in the enquiry form.
          </p>

          <h2>Why we use it</h2>
          <p>
            We use these details only to respond to your enquiry, to verify professional details where
            required for individual doctors, and to discuss how Carelune can support your practice or
            institution. We rely on the consent you give when you submit the form.
          </p>

          <h2>How it is handled</h2>
          <p>
            The enquiry form is submitted through our website host’s form service (Netlify) and reaches
            our team as a notification. We do not sell your information, and we do not use it for
            purposes unrelated to your enquiry.
          </p>

          <h2>Cookies</h2>
          <p>This marketing website does not use advertising or tracking cookies.</p>

          <h2>How long we keep it</h2>
          <p>
            We keep enquiry details for as long as needed to respond and to keep a record of our
            correspondence, unless you ask us to remove them earlier.
          </p>

          <h2>Your choices</h2>
          <p>
            You can ask us to access, correct or delete the details you submitted through this website
            by contacting us at <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
          </p>

          <h2>Changes to this notice</h2>
          <p>
            We may update this notice from time to time. The “last updated” date above shows when it was
            last changed.
          </p>

          <h2>Contact</h2>
          <p>
            For any questions about this policy or your information, contact us at{" "}
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
          </p>
        </div>
      </main>

      <footer className="clr-foot">
        <div className="clr-wrap">
          <div className="clr-foot-base" style={{ marginTop: 0, borderTop: 0, paddingTop: 0 }}>
            <p>Carelune supports structured continuing care and communication after discharge. It does not replace clinical judgement or emergency services.</p>
            <p>© 2026 Carelune Health</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
