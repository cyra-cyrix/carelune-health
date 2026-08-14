import type { AuditEvent, Provenance } from "../domain/types";
import { ROLE_META } from "../domain/roles";

/* ---- Evidence-provenance chip (04_MEASUREMENT: label every data point) ---- */
const PROV_LABEL: Record<Provenance, string> = {
  clinician_assessed: "Clinician-assessed",
  caregiver_reported: "Caregiver-reported",
  patient_reported: "Patient-reported",
  family_reported: "Family-reported",
  device_measured: "Device-measured",
  system_metric: "Operational metric",
  ai_drafted: "AI-drafted · awaiting review",
  clinician_confirmed: "Clinician-confirmed",
};

export function ProvChip({ p, className = "" }: { p: Provenance; className?: string }) {
  const tone =
    p === "ai_drafted"
      ? "bg-warn-100 text-warn-600"
      : p === "clinician_assessed" || p === "clinician_confirmed"
        ? "bg-brand-50 text-brand-700 ring-1 ring-brand-100"
        : "bg-mist-200 text-sage-600";
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${tone} ${className}`}>
      {PROV_LABEL[p]}
    </span>
  );
}

/* ---- Unified audit / action timeline ---- */
export function Timeline({ events, limit }: { events: AuditEvent[]; limit?: number }) {
  const shown = [...events].reverse().slice(0, limit ?? events.length);
  return (
    <ol className="space-y-0">
      {shown.map((e, i) => (
        <li key={e.id} className="grid grid-cols-[5.5rem_1rem_1fr] gap-x-3">
          <span className="pt-0.5 text-right text-[12px] tabular-nums text-sage-500">{e.at}</span>
          <div className="relative flex justify-center">
            {i < shown.length - 1 && (
              <span className="absolute top-3 h-full w-px bg-ink/10" aria-hidden />
            )}
            <span
              className="relative z-10 mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-brand-400"
              aria-hidden
            />
          </div>
          <div className="pb-4">
            <p className="text-[14px] leading-snug text-ink">{e.summary}</p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <span className="text-[12px] font-medium text-sage-600">
                {e.actor} · {ROLE_META[e.roleId].label}
              </span>
              <ProvChip p={e.provenance} />
            </div>
            {e.before && e.after && (
              <p className="mt-1 text-[12px] text-sage-500">
                Status: <span className="font-medium">{e.before}</span> →{" "}
                <span className="font-medium text-ink">{e.after}</span>
                {e.source && <span> · via {e.source}</span>}
              </p>
            )}
            {e.detail && <p className="mt-1 text-[12px] leading-snug text-sage-500">{e.detail}</p>}
            {e.reason && <p className="mt-0.5 text-[12px] italic leading-snug text-sage-500">{e.reason}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}
