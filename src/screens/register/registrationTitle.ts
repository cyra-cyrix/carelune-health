import type { PublicOrgInfo } from "../../lib/db";

/**
 * The browser tab title for the public registration/invite page.
 *
 * This page is white-label: the family is joining their own institution's
 * programme, and the platform name has no place on it — including in the tab.
 * The neutral title is used whenever we cannot yet name the organisation, so
 * the platform brand is never shown as a placeholder.
 *
 * Kept pure so the wording is testable without a browser.
 */
export const NEUTRAL_TITLE = "Patient Registration";

/** The title every other (staff-facing) surface keeps. */
export const APP_TITLE = "Carelune";

const clean = (v: string | null | undefined): string | null => {
  const t = (v ?? "").trim();
  return t.length > 0 ? t : null;
};

export function registrationTitle(org: PublicOrgInfo | null, loading: boolean): string {
  // Still looking, or the lookup failed: say nothing we cannot stand behind.
  if (loading || !org) return NEUTRAL_TITLE;

  const institution = clean(org.institution_name);
  if (!institution) return NEUTRAL_TITLE;

  // A universal invitation can name the programme the family is joining.
  if (org.kind === "service") {
    const programme = clean(org.service_name) ?? clean(org.package_name);
    if (programme) return `${institution} — ${programme}`;
  }

  return `${institution} — ${NEUTRAL_TITLE}`;
}
