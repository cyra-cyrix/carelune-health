import { CARE_PACKAGE } from "./carePackage";
import type { PublicOrgInfo } from "../lib/db";

/**
 * What the patient-registration screen says, derived from whatever the
 * invitation resolved to.
 *
 * There are exactly two shapes and no specialty branches: a spine programme, a
 * mother-and-baby programme and a dermatology programme all render through the
 * same fields, because the words come from the provider's own published package
 * rather than from anything hardcoded here. The legacy recovery invitation
 * keeps its original copy verbatim.
 *
 * Nothing internal is exposed: no ids, no platform fee, no JSON, no status
 * vocabulary. Only what a family needs to recognise what they are joining.
 */
export type RegistrationFact = { label: string; value: string };

export type RegistrationCopy = {
  /** Small line under the provider's name. */
  eyebrow: string;
  /** The programme's own name. */
  programmeName: string;
  /** e.g. "60-day programme". */
  durationLabel: string;
  /** One line of the provider's own framing, when they wrote one. */
  positioning: string | null;
  /** Rhythm and support, each shown only when the package actually configures it. */
  facts: RegistrationFact[];
  /** What the programme includes, as the provider listed it. */
  includes: string[];
  intro: string;
  successNote: string;
  /**
   * The tail of the consent sentence, after "…processing the patient's".
   * The legacy wording names the discharge summary because that flow really
   * does structure one; a universal programme has no discharge summary, so
   * claiming otherwise in a consent statement would simply be untrue.
   */
  consentTail: string;
};

const clean = (v: string | null | undefined): string | null => {
  const t = (v ?? "").trim();
  return t.length > 0 ? t : null;
};

export function registrationCopy(org: PublicOrgInfo | null): RegistrationCopy {
  // A universal service package: every word below is the provider's own.
  if (org?.kind === "service") {
    const facts: RegistrationFact[] = [];
    const domains = org.monitoring_domains.filter((d) => d.trim().length > 0);
    if (domains.length > 0) facts.push({ label: "What this programme follows", value: domains.join(" · ") });

    const checkin = clean(org.checkin_frequency);
    if (checkin) facts.push({ label: "Check-ins", value: checkin });

    const review = clean(org.review_frequency);
    if (review) facts.push({ label: "Professional review", value: review });

    const support = clean(org.support_level);
    if (support) facts.push({ label: "Support", value: support });

    const days = org.duration_days;

    return {
      eyebrow: clean(org.service_name) ?? "Programme",
      programmeName: clean(org.package_name) ?? "Programme",
      durationLabel: days && days > 0 ? `${days}-day programme` : "",
      positioning: clean(org.positioning),
      facts,
      includes: org.includes.filter((i) => i.trim().length > 0),
      intro:
        "Enter the patient's details and create your own login. You'll follow their programme from here.",
      successNote: "Your care team will set up the programme.",
      consentTail: "health information to support their care on this programme.",
    };
  }

  // The legacy recovery invitation — unchanged wording.
  return {
    eyebrow: "Recovery programme",
    programmeName: CARE_PACKAGE.name,
    durationLabel: CARE_PACKAGE.durationLabel,
    positioning: null,
    facts: [],
    includes: [...CARE_PACKAGE.includes],
    intro:
      "Enter the patient's details and create your own login. You'll follow their recovery from here.",
    successNote: "Your care team will prepare the recovery plan.",
    consentTail:
      "health information \u2014 including AI-assisted structuring of the discharge summary \u2014 to support their recovery.",
  };
}
