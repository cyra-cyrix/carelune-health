/*
 * THE ONE DECISION POINT between the three patient experiences.
 *
 *   1. An APPROVED care programme (0033) -> the care shell: Today, Journey,
 *      Tell Us, Connect, Plan, drawn from the activities a clinician approved.
 *   2. A service-package enrolment with no approved programme yet -> the
 *      programme surface, unchanged.
 *   3. Anyone else — every existing recovery patient -> exactly the app they
 *      had yesterday, unchanged.
 *
 * The order matters and is the safety property: a compiled DRAFT is not care,
 * so a patient whose programme has not been approved falls through to (2) and
 * sees nothing a clinician has not agreed to. RLS enforces the same thing
 * independently — a household account cannot read a draft at all.
 *
 * This check lives here and nowhere else. No component below this line asks
 * which kind of patient it is drawing, and none of them branches on specialty.
 */
import { useEffect, useState } from "react";
import {
  getApprovedProgramme, getMyPatient, getSubscription,
  type PatientProgrammeRow, type PatientRow, type SubscriptionRow,
} from "../../lib/db";
import type { HcRole } from "../home/hc-kit";
import HomeCare from "../home/HomeCare";
import ProgrammeHome from "./ProgrammeHome";
import CareShell from "./care/CareShell";
import { LoopMark } from "../../components/ui";

type Resolved = {
  patient: PatientRow | null;
  subscription: SubscriptionRow | null;
  programme: PatientProgrammeRow | null;
};

export default function PatientSurface({ role }: { role: HcRole }) {
  const [resolved, setResolved] = useState<Resolved | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      const patient = await getMyPatient().catch(() => null);
      const subscription = patient ? await getSubscription(patient.id).catch(() => null) : null;
      // Only an APPROVED programme is ever returned here; a draft is not care.
      const programme = patient ? await getApprovedProgramme(patient.id).catch(() => null) : null;
      if (active) setResolved({ patient, subscription, programme });
    })();
    return () => { active = false; };
  }, []);

  if (!resolved) {
    return (
      <div className="grid min-h-screen place-items-center bg-mist">
        <div className="animate-pulse text-brand-600"><LoopMark size={26} /></div>
      </div>
    );
  }

  const { patient, subscription, programme } = resolved;
  if (patient && subscription && programme) {
    return <CareShell role={role} patient={patient} subscription={subscription} programme={programme} />;
  }
  if (patient && subscription?.service_package_id) {
    return <ProgrammeHome role={role} patient={patient} subscription={subscription} />;
  }

  // Legacy recovery — untouched. HomeCare resolves the patient itself, exactly
  // as it always has, so nothing about its behaviour depends on this wrapper.
  return <HomeCare role={role} />;
}
