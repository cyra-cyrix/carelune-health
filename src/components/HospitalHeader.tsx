import { BrandLockup, Avatar } from "./ui";
import { ROLE_META, type Persona } from "../domain/roles";

/**
 * Shared professional-workspace header.
 *
 * Every major page announces two things at ALL widths: which page you are on,
 * and whose workspace it is. Presenters switch roles constantly during the
 * demo, so "am I the physiotherapist or the coordinator right now?" must never
 * require guessing — previously the crumb and persona were hidden below 640px.
 */
export default function HospitalHeader({
  crumb,
  persona = ROLE_META.lead_physio.persona as Persona,
}: {
  crumb: string;
  persona?: Persona;
}) {
  return (
    <header className="sticky top-11 z-20 border-b border-brand-600/10 bg-mist/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1200px] items-center gap-2 px-4 py-2 sm:gap-3 sm:px-5 sm:py-2.5 lg:px-8">
        <BrandLockup sub={false} />
        <span className="shrink-0 text-sage-600" aria-hidden>
          /
        </span>
        <h2 className="min-w-0 flex-[1.2] truncate font-display text-[14px] font-semibold text-ink sm:text-[15px]">
          {crumb}
        </h2>
        {/* Must shrink, not push: "Medical Clinician & Clinical Operations Lead"
            is long enough to overflow a 360px viewport if this is shrink-0. */}
        <div className="flex min-w-0 flex-1 items-center justify-end gap-2 rounded-full bg-white/70 py-1 pl-1 pr-2.5 ring-1 ring-ink/5 sm:pr-3">
          <Avatar initials={persona.initials} className="h-8 w-8 shrink-0 text-[13px]" />
          <div className="min-w-0 leading-tight">
            <div className="truncate text-[12px] font-semibold text-ink sm:text-[13px]">
              {persona.name}
            </div>
            {/* The role label is the point — keep it at every width. */}
            <div className="truncate text-[10.5px] text-sage-600 sm:text-[11px]">
              {persona.roleLabel}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

// status → tailwind color families, shared across professional screens
export const riskStyles = {
  good: { pill: "bg-good-100 text-good-600", bar: "bg-good-500", label: "On track" },
  warn: { pill: "bg-warn-100 text-warn-600", bar: "bg-warn-500", label: "Needs attention" },
  alert: { pill: "bg-coral-100 text-coral-600", bar: "bg-coral-500", label: "At risk" },
} as const;
