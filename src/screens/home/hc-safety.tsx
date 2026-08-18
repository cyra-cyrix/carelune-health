import { useBranding } from "../../branding/BrandingProvider";
import { HcIcon } from "./hc-kit";

/* ============================================================================
   The ONE emergency instruction for the household surface.

   It used to be written twice — once from the institution's configured numbers
   in Help, and once as hard-coded "call 112 or 108" text beside the concern box.
   Two sources can disagree, and in an emergency the family should never have to
   choose which of two instructions to believe. Both places now render this.
   ========================================================================== */

/** Institution number when configured, otherwise the national services. */
export function useEmergencyCopy(): { number: string | null; note: string } {
  const { org } = useBranding();
  return {
    number: org?.emergency_number?.trim() || null,
    note: org?.emergency_note?.trim()
      || "Call your centre first. If unreachable, call 112 or 108, or go to the nearest hospital.",
  };
}

/** The full emergency block. Rendered once per screen — never twice. */
export function EmergencyBlock() {
  const { number, note } = useEmergencyCopy();
  return (
    <div className="hc-emerg compact">
      <div className="em-row">
        <span className="em-t"><HcIcon.Warn size={15} /> Emergency</span>
        {number && <a href={`tel:${number.replace(/\s/g, "")}`}><HcIcon.Phone size={14} /> {number}</a>}
      </div>
      <p>{note}</p>
    </div>
  );
}

/** The boundary line shown wherever a message is composed: this is a message to
 *  the care team, not an emergency channel. It points at the emergency block
 *  rather than restating a second set of numbers. */
export function NotAnEmergencyLine() {
  return (
    <p className="hc-boundary">
      Carelune is not an emergency service. Messages are read by the care team during their
      working hours. For anything urgent right now, use the emergency options below.
    </p>
  );
}
