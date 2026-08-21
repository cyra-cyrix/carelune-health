import type { CentreServiceRow } from "../../lib/db";

/**
 * A quiet prompt on the caseload when a service is waiting on THIS clinician.
 * Presentational: the caller has already loaded the services, so the caseload
 * does not fetch them twice. A colleague who is not the approver sees nothing.
 */
export function ServiceAwaitingBanner({
  services, myId, onOpen,
}: { services: CentreServiceRow[]; myId: string | null | undefined; onOpen: () => void }) {
  const mine = services.filter(
    (s) => s.status === "pending_provider_confirmation" && s.provider_approver_profile_id === myId,
  );
  if (mine.length === 0) return null;

  return (
    <div className="mx-auto max-w-[1100px] px-4 pt-5 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-warn-100 px-5 py-4 ring-1 ring-warn-500/20">
        <div className="min-w-0">
          <p className="text-[14.5px] font-semibold text-ink">
            {mine.length === 1 ? `${mine[0].name} is ready for your confirmation` : `${mine.length} services are ready for your confirmation`}
          </p>
          <p className="mt-0.5 text-[13px] text-sage-600">
            No patient can be enrolled until you have read it through and confirmed it.
          </p>
        </div>
        <button
          type="button"
          onClick={onOpen}
          className="tap shrink-0 rounded-xl bg-ink px-4 py-2 text-[13.5px] font-semibold text-white hover:bg-midnight-800"
        >
          Review it
        </button>
      </div>
    </div>
  );
}
