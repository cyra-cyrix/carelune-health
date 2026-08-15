/**
 * The single, white-label care package families subscribe to.
 *
 * The institution/doctor sets ONLY the price. Everything else — name, duration,
 * free-trial policy and the list of inclusions — is fixed by the platform and
 * shown read-only everywhere it appears: the HOD setup wizard (Package step),
 * the admin Programme tab, and the public patient-onboarding screen. This is the
 * one source of truth so those surfaces never drift apart.
 *
 * White-label: never render a platform brand name alongside this package. The
 * offer is presented under the institution's own name.
 */
export const CARE_PACKAGE = {
  name: "30-Day Recovery Continuum",
  durationDays: 30,
  durationLabel: "30-day programme",
  includes: [
    "Doctor-approved recovery plan",
    "Daily caregiver care schedule",
    "Medicine and adherence tracking",
    "Pain, vitals and symptom monitoring",
    "Physiotherapy and mobility tracking",
    "Diet and recovery instructions",
    "Family recovery view",
    "Nursing coordinator support",
    "Duty-doctor review, if available",
    "Escalation to the treating doctor",
    "Secure care-team communication",
  ],
} as const;

/** Newline-joined inclusions, for persisting to storefront.package_includes so
 *  any consumer reading the DB column sees the same list. */
export const CARE_PACKAGE_INCLUDES_TEXT = CARE_PACKAGE.includes.join("\n");
