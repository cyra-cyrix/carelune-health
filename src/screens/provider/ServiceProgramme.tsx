/*
 * The provider's own service — and the D-003 Level-2 confirmation.
 *
 * This is the other half of the Super Admin service builder: the Carelune
 * operator configures a service, and the clinician NAMED ON IT confirms it
 * before any patient can be enrolled. Authority comes from being the designated
 * approver, not from administering the organisation, and the check that matters
 * lives in `confirm_centre_service()` — this screen only reflects it.
 *
 * Like the builder, nothing here knows a specialty: every word on screen comes
 * from the stored configuration.
 */
import { useCallback, useEffect, useState } from "react";
import {
  confirmCentreService,
  getCentreServices,
  getCentreStaff,
  setServicePackagePrice,
  type CentreServiceRow,
  type ServicePackageRow,
  type StaffMember,
} from "../../lib/db";
import { periodsForPackage, type SuggestedPackage } from "../../domain/serviceDraft";
import { Card, ErrorNote, GhostButton, PrimaryButton, Skeleton } from "../../components/system";
import { AiDraftMark, Detail, DomainChips, PackageCard, ProgrammeTimeline } from "../platform/programme-kit";
import { useBranding } from "../../branding/BrandingProvider";

/** A stored package row rendered through the same card the builder uses. */
function asSuggested(p: ServicePackageRow): SuggestedPackage {
  return {
    name: p.name,
    positioning: p.positioning ?? "",
    duration_days: p.duration_days,
    monitoring_domains: p.monitoring_domains ?? [],
    checkin_frequency: p.checkin_frequency ?? "",
    review_frequency: p.review_frequency ?? "",
    support_level: p.support_level ?? "",
    includes: p.includes ?? [],
    milestones: Array.isArray(p.milestones) ? (p.milestones as unknown[]).map(String) : [],
  };
}

/** Shared loader so the caseload banner and this screen agree on state. */
export function useCentreServices() {
  const [services, setServices] = useState<CentreServiceRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    try {
      setServices(await getCentreServices());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load your services.");
      setServices([]);
    }
  }, []);
  useEffect(() => { void reload(); }, [reload]);
  return { services, error, reload };
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  draft: { label: "Being configured", cls: "bg-mist-100 text-sage-600" },
  pending_provider_confirmation: { label: "Waiting for your confirmation", cls: "bg-warn-100 text-warn-600" },
  published: { label: "Confirmed and available", cls: "bg-good-100 text-good-600" },
};


/** What families pay. Rendered only for the clinician who owns the service. */
export function PriceControl({
  pkg, editable, onSaved,
}: { pkg: ServicePackageRow; editable: boolean; onSaved: () => void | Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shown = pkg.price == null
    ? null
    : pkg.currency === "INR" || !pkg.currency
      ? `₹${pkg.price.toLocaleString("en-IN")}`
      : `${pkg.currency} ${pkg.price.toLocaleString()}`;

  const save = async () => {
    const n = Number(value.replace(/[,\s]/g, ""));
    if (!Number.isFinite(n) || n < 0) { setError("Enter a whole amount."); return; }
    setBusy(true);
    setError(null);
    try {
      await setServicePackagePrice(pkg.id, Math.round(n), pkg.currency || "INR");
      await onSaved();
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the price.");
    } finally {
      setBusy(false);
    }
  };

  if (editing) {
    return (
      <div>
        <label className="block">
          <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.13em] text-sage-400">
            What families pay
          </span>
          <div className="flex items-center gap-1.5">
            <span className="text-[15px] font-semibold text-sage-500">₹</span>
            <input
              autoFocus
              inputMode="numeric"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void save(); if (e.key === "Escape") setEditing(false); }}
              placeholder="18000"
              className="w-full min-h-[40px] rounded-lg bg-white px-3 py-2 text-[15px] text-ink ring-1 ring-line focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
            />
          </div>
        </label>
        {error && <p className="mt-2 text-[12.5px] text-coral-600">{error}</p>}
        <div className="mt-2.5 flex items-center gap-2">
          <button type="button" onClick={() => void save()} disabled={busy}
            className="tap rounded-lg bg-ink px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-midnight-800 disabled:opacity-60">
            {busy ? "Saving…" : "Save price"}
          </button>
          <button type="button" onClick={() => { setEditing(false); setError(null); }}
            className="tap rounded-lg px-2.5 py-1.5 text-[13px] font-semibold text-sage-600 hover:text-ink">
            Cancel
          </button>
        </div>
        <p className="mt-2 text-[11.5px] leading-relaxed text-sage-500">
          Carelune&apos;s platform fee is 20%. Patients already enrolled keep the price they joined at.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-sage-400">What families pay</p>
        <p className={`mt-1 text-[17px] font-semibold ${shown ? "text-ink" : "text-sage-400"}`}>
          {shown ?? "Price not set"}
        </p>
      </div>
      {editable && (
        <button
          type="button"
          onClick={() => { setValue(pkg.price == null ? "" : String(pkg.price)); setEditing(true); }}
          className="tap rounded-lg px-2.5 py-1.5 text-[13px] font-semibold text-sky-700 hover:text-sky-800"
        >
          {shown ? "Edit price" : "Set price"}
        </button>
      )}
    </div>
  );
}

export default function ServiceProgramme({ onBack }: { onBack: () => void }) {
  const { profile } = useBranding();
  const { services, error, reload } = useCentreServices();
  const [selected, setSelected] = useState(0);
  const [preview, setPreview] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [staff, setStaff] = useState<StaffMember[]>([]);

  useEffect(() => { void getCentreStaff().then(setStaff).catch(() => setStaff([])); }, []);

  if (services === null) {
    return (
      <div className="mx-auto max-w-[1100px] space-y-3 px-5 py-7 lg:px-8">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-44" />
      </div>
    );
  }

  if (error) {
    return <div className="mx-auto max-w-[1100px] px-5 py-7 lg:px-8"><ErrorNote>{error}</ErrorNote></div>;
  }

  const service = services[selected];
  if (!service) return null;

  const cfg = service.programme_config ?? {};
  const outline = cfg.programme_outline ?? [];
  const packages = service.packages.map(asSuggested);
  const iAmApprover = !!profile?.id && service.provider_approver_profile_id === profile.id;
  const awaiting = service.status === "pending_provider_confirmation";
  const approver = staff.find((s) => s.id === service.provider_approver_profile_id);
  const status = STATUS_META[service.status] ?? { label: service.status, cls: "bg-mist-100 text-sage-600" };

  const confirm = async () => {
    setConfirming(true);
    setConfirmError(null);
    try {
      await confirmCentreService(service.id, note);
      await reload();
      setNote("");
    } catch (e) {
      setConfirmError(e instanceof Error ? e.message : "Could not confirm this service.");
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div className="min-h-full bg-mist">
      <div className="mx-auto max-w-[1100px] px-5 py-6 lg:px-8">
        <GhostButton onClick={onBack} className="!px-3 !py-1.5 text-[13px]">← Back to caseload</GhostButton>

        {services.length > 1 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {services.map((s, i) => (
              <button
                key={s.id}
                type="button"
                onClick={() => { setSelected(i); setPreview(null); }}
                aria-pressed={i === selected}
                className={`tap rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
                  i === selected ? "bg-ink text-white" : "bg-white text-sage-600 ring-1 ring-line hover:text-ink"
                }`}
              >
                {s.name}
              </button>
            ))}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-[46rem]">
            <h1 className="font-display text-[26px] font-semibold tracking-tight text-ink">{service.name}</h1>
            {service.summary && <p className="mt-1.5 text-[15px] leading-relaxed text-sage-600">{service.summary}</p>}
          </div>
          <div className="flex items-center gap-2">
            {service.source_provenance === "ai_drafted" && service.status !== "published" && <AiDraftMark />}
            <span className={`rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${status.cls}`}>{status.label}</span>
          </div>
        </div>

        {/* ---- Level 2 ---- */}
        {awaiting && (
          <section className="mt-5 rounded-3xl bg-white p-6 shadow-card ring-1 ring-warn-500/25 sm:p-7">
            {iAmApprover ? (
              <>
                <h2 className="font-display text-[19px] font-semibold tracking-tight text-ink">
                  This programme is waiting for you
                </h2>
                <p className="mt-2 max-w-[46rem] text-[14.5px] leading-relaxed text-sage-600">
                  You are named as the clinician accountable for this service. Read the monitoring areas, the questions
                  patients answer at home, the milestones and the programme below. Confirming records that you are
                  satisfied with what will run — after that, patients can be enrolled into it.
                </p>
                <label className="mt-5 block">
                  <span className="mb-1.5 block text-[12.5px] font-semibold text-sage-600">Anything to note? (optional)</span>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Recorded with your confirmation."
                    className="w-full min-h-[76px] rounded-xl bg-white px-3.5 py-2.5 text-[14px] leading-relaxed text-ink ring-1 ring-line placeholder:text-sage-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                  />
                </label>
                {confirmError && <div className="mt-4"><ErrorNote>{confirmError}</ErrorNote></div>}
                <div className="mt-5">
                  <PrimaryButton onClick={confirm} disabled={confirming}>
                    {confirming ? "Confirming…" : "Confirm this programme"}
                  </PrimaryButton>
                </div>
              </>
            ) : (
              <>
                <h2 className="font-display text-[19px] font-semibold tracking-tight text-ink">
                  Waiting for {approver?.full_name ?? "the designated clinician"}
                </h2>
                <p className="mt-2 max-w-[46rem] text-[14.5px] leading-relaxed text-sage-600">
                  This service is ready, but only the clinician named on it can confirm it. Until then no patient can be
                  enrolled. You can read everything below.
                </p>
              </>
            )}
          </section>
        )}

        {service.status === "published" && (
          <section className="mt-5 rounded-2xl bg-good-100 px-5 py-4 ring-1 ring-good-500/20">
            <p className="text-[14px] font-semibold text-ink">
              Confirmed{service.confirmed_by_provider_at ? ` on ${new Date(service.confirmed_by_provider_at).toLocaleDateString()}` : ""}
              {approver?.full_name ? ` by ${approver.full_name}` : ""}.
            </p>
            <p className="mt-0.5 text-[13px] text-sage-600">Patients can be enrolled into this service.</p>
          </section>
        )}

        {/* ---- the service itself ---- */}
        <div className="mt-5 grid gap-5 lg:grid-cols-[1.3fr_1fr] lg:items-start">
          <Card>
            <dl className="grid gap-6 sm:grid-cols-2">
              <Detail label="Designed for">{service.patient_type ?? "—"}</Detail>
              <Detail label="How a patient joins">{service.entry_point ?? "—"}</Detail>
              <Detail label="Primary objective">{service.objective ?? "—"}</Detail>
              <Detail label="Complete when">{service.end_condition ?? "—"}</Detail>
              <Detail label="Suggested duration">
                {service.typical_duration_days ? `${service.typical_duration_days} days` : "Open-ended"}
              </Detail>
              <Detail label="Care model">{(cfg.care_team ?? []).join(" · ") || "—"}</Detail>
            </dl>
            <div className="mt-7 border-t border-line/70 pt-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-sage-400">Areas followed at home</p>
              <div className="mt-3"><DomainChips domains={cfg.monitoring_domains ?? []} /></div>
            </div>
          </Card>

          <Card>
            <h2 className="font-display text-[18px] font-semibold tracking-tight text-ink">What patients are asked at home</h2>
            <ul className="mt-4 space-y-4">
              {(cfg.patient_inputs ?? []).map((q) => (
                <li key={q.label} className="border-l-2 border-sky-200 pl-4">
                  <p className="text-[15px] leading-snug text-ink">{q.label}</p>
                  {q.reason && <p className="mt-1 text-[13px] leading-relaxed text-sage-500">{q.reason}</p>}
                </li>
              ))}
              {(cfg.patient_inputs ?? []).length === 0 && (
                <li className="text-[14px] text-sage-400">No questions configured.</li>
              )}
            </ul>
          </Card>
        </div>

        <h2 className="mt-9 font-display text-[20px] font-semibold tracking-tight text-ink">Patient programmes</h2>
        <p className="mt-1.5 text-[14px] text-sage-600">
          What a patient can be enrolled into. You set the price families pay — Carelune&apos;s platform fee is{" "}
          {service.packages[0]?.platform_fee_pct ?? 20}%. Repricing never moves a patient already enrolled.
        </p>
        <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {packages.map((p, i) => (
            <PackageCard
              key={p.name}
              pkg={p}
              onPreview={() => setPreview(i)}
              onEdit={() => setPreview(i)}
              pricing={
                <PriceControl
                  pkg={service.packages[i]}
                  editable={iAmApprover && service.status === "published"}
                  onSaved={reload}
                />
              }
            />
          ))}
        </div>
        {packages.length === 0 && (
          <p className="mt-4 text-[14px] text-sage-500">No programmes configured for this service yet.</p>
        )}
      </div>

      {preview != null && packages[preview] && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <button type="button" aria-label="Close preview" onClick={() => setPreview(null)} className="absolute inset-0 bg-midnight-950/25 backdrop-blur-[2px]" />
          <aside role="dialog" aria-modal="true" aria-label={`${packages[preview].name} programme`} className="relative flex h-full w-full max-w-[36rem] flex-col overflow-y-auto bg-white shadow-panel">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-line bg-white/95 px-6 py-5 backdrop-blur">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-sage-400">{service.name}</p>
                <h2 className="mt-1 font-display text-[22px] font-semibold tracking-tight text-ink">{packages[preview].name}</h2>
              </div>
              <button type="button" onClick={() => setPreview(null)} aria-label="Close" className="tap rounded-lg px-2.5 py-1.5 text-[16px] text-sage-500 hover:text-ink">×</button>
            </div>
            <div className="px-6 py-7">
              <ProgrammeTimeline periods={periodsForPackage(outline, packages[preview], packages)} />
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
