/*
 * THE ONE DECISION POINT between the legacy recovery experience and the
 * universal programme experience.
 *
 * A patient enrolled into a service package (0028 wrote service_package_id onto
 * their subscription) gets the programme surface, rendered from their own
 * frozen snapshot. Everyone else — every existing recovery patient — gets
 * exactly the app they had yesterday, unchanged.
 *
 * This check lives here and nowhere else. No component below this line asks
 * which kind of patient it is drawing, and none of them branches on specialty.
 */
import { useEffect, useState } from "react";
import { getMyPatient, getSubscription, type PatientRow, type SubscriptionRow } from "../../lib/db";
import type { HcRole } from "../home/hc-kit";
import HomeCare from "../home/HomeCare";
import ProgrammeHome from "./ProgrammeHome";
import { LoopMark } from "../../components/ui";

type Resolved = { patient: PatientRow | null; subscription: SubscriptionRow | null };

export default function PatientSurface({ role }: { role: HcRole }) {
  const [resolved, setResolved] = useState<Resolved | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      const patient = await getMyPatient().catch(() => null);
      const subscription = patient ? await getSubscription(patient.id).catch(() => null) : null;
      if (active) setResolved({ patient, subscription });
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

  const { patient, subscription } = resolved;
  if (patient && subscription?.service_package_id) {
    return <ProgrammeHome role={role} patient={patient} subscription={subscription} />;
  }

  // Legacy recovery — untouched. HomeCare resolves the patient itself, exactly
  // as it always has, so nothing about its behaviour depends on this wrapper.
  return <HomeCare role={role} />;
}
