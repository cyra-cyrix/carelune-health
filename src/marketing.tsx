import React from "react";
import { createRoot } from "react-dom/client";
import LandingRedesign from "./screens/marketing/redesign/LandingRedesign";
import LegalPage, { LEGAL_PATHS, LEGAL_READY, type LegalPath } from "./screens/marketing/legal";
import { legacyForwardTarget, loginUrl } from "./config/urls";
import "./index.css";

/*
 * The PUBLIC marketing site entry (carelune.in).
 *
 * It renders ONLY the landing page and — once published — the legal/trust pages.
 * There is no auth, no Supabase client, no application code in this module graph,
 * so the marketing build does not bundle the clinical app. The authenticated
 * experience lives in the separate application build served from app.carelune.in.
 */

// Legacy-link compatibility. The primary mechanism is the Netlify `_redirects`
// rule emitted for this site; this is a belt-and-braces client fallback so an
// already-shared registration link (or /login) that still hits the marketing
// origin is forwarded to the app before React mounts — swapping only the origin
// and preserving the ENTIRE query string (register token + any extra params) and
// hash.
(function forwardLegacyAppLinks() {
  const target = legacyForwardTarget(window.location);
  if (target) window.location.replace(target);
})();

const path = window.location.pathname;

function Marketing() {
  if (LEGAL_READY && (LEGAL_PATHS as readonly string[]).includes(path)) {
    return <LegalPage path={path as LegalPath} />;
  }
  // Sign-in leaves the marketing origin for the application sign-in page.
  return <LandingRedesign onSignIn={() => { window.location.href = loginUrl(); }} />;
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Marketing />
  </React.StrictMode>,
);
