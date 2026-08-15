import { useEffect, useState } from "react";
import {
  getStorefront, updateStorefront, getMyEnabledPacks,
  type Storefront, type EnabledPack,
} from "../../lib/db";
import {
  Card, Field, inputCls, PrimaryButton, GhostButton, Chip, PathwayStatusBadge,
  ErrorNote, Skeleton, SectionHeader,
} from "../../components/system";

import { CARE_PACKAGE, CARE_PACKAGE_INCLUDES_TEXT } from "../../domain/carePackage";

const inr = (n: number | null | undefined) => (n == null ? "—" : `₹${n.toLocaleString("en-IN")}`);

/**
 * Admin "Programme" workspace tab (journey steps E–F: HOD reviews the programme
 * and sets the patient price). The commercial package is fixed as "Continuum Care"
 * with standard inclusions — the admin's only decision is the price. Clinical
 * pathways are shown read-only (governed templates, see docs/COMMERCIAL_MODEL.md).
 */
export default function Programme({ onBack }: { onBack: () => void }) {
  const [sf, setSf] = useState<Storefront | null>(null);
  const [packs, setPacks] = useState<EnabledPack[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getStorefront().then(setSf).catch((e) => setError(e instanceof Error ? e.message : "Could not load the programme."));
    void getMyEnabledPacks().then(setPacks).catch(() => setPacks([]));
  }, []);

  return (
    <div className="min-h-full bg-mist">
      <div className="mx-auto max-w-[820px] px-5 py-6 lg:px-8">
        <GhostButton onClick={onBack} className="!px-3 !py-1.5 text-[13px]">← Back to caseload</GhostButton>
        <h1 className="mt-3 font-display text-[24px] font-semibold tracking-tight text-ink">Programme &amp; package</h1>
        <p className="mt-1 text-[14px] text-sage-500">
          One package, one price — what families see. Clinical pathways are governed templates and are not priced separately.
        </p>

        <div className="mt-5 space-y-5">
          {error && <ErrorNote>{error}</ErrorNote>}

          {sf === null ? <Skeleton className="h-64" /> : <PackageEditor sf={sf} onSaved={setSf} />}

          {/* Enabled clinical pathways — read-only */}
          <Card>
            <SectionHeader title="Clinical pathways enabled" sub="Governed templates assigned by Carelune. They require institutional clinical approval before a patient plan is generated from them." />
            <div className="mt-3 space-y-2">
              {packs === null ? (
                <Skeleton className="h-16" />
              ) : packs.length === 0 ? (
                <p className="text-[13.5px] text-sage-500">No pathways enabled yet. Ask Carelune to enable a Continuum Care programme.</p>
              ) : (
                packs.map((p) => (
                  <div key={p.pack_id} className="flex flex-wrap items-center gap-2 rounded-xl bg-mist-100 px-3.5 py-2.5 ring-1 ring-ink/[0.04]">
                    <span className="text-[14px] font-semibold text-ink">{p.pack_name}</span>
                    <Chip tone="grey">{p.specialty}</Chip>
                    <span className="ml-auto"><PathwayStatusBadge status={p.status} /></span>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function PackageEditor({ sf, onSaved }: { sf: Storefront; onSaved: (s: Storefront) => void }) {
  const [price, setPrice] = useState(sf.package_price != null ? String(sf.package_price) : "");
  const [emNote, setEmNote] = useState(sf.emergency_note ?? "");
  const [emNum, setEmNum] = useState(sf.emergency_number ?? "");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const priceNum = Number(price) || 0;
  const payout = Math.round(priceNum * (1 - sf.platform_fee_pct / 100));

  const save = async () => {
    setBusy(true); setErr(null); setSaved(false);
    try {
      // Only the price (and the institution's own emergency copy) is editable.
      // Name/inclusions are the fixed platform package; free-trial is platform-set.
      const patch = {
        package_name: CARE_PACKAGE.name,
        package_price: price ? Number(price) : null,
        package_includes: CARE_PACKAGE_INCLUDES_TEXT,
        emergency_note: emNote.trim() || null,
        emergency_number: emNum.trim() || null,
      };
      await updateStorefront(sf.centre_id, patch);
      onSaved({ ...sf, ...patch });
      setSaved(true); setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save.");
    } finally { setBusy(false); }
  };

  return (
    <Card>
      <SectionHeader title="Your care package" sub="The single package families subscribe to. You set the price; everything else is standard." />
      <div className="mt-4 space-y-5">
        {/* Fixed package identity — the family-facing offer */}
        <div className="rounded-2xl bg-sky-50 p-4 ring-1 ring-sky-200">
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-sky-700">Package families subscribe to</div>
          <div className="mt-1 flex flex-wrap items-baseline gap-2">
            <span className="font-display text-[22px] font-semibold tracking-tight text-ink">{CARE_PACKAGE.name}</span>
            <span className="text-[12.5px] font-medium text-sage-500">· {CARE_PACKAGE.durationLabel}</span>
            {priceNum > 0 && <span className="ml-auto text-[15px] font-semibold text-sky-700">{inr(priceNum)}<span className="text-[12px] font-medium text-sage-500">/month</span></span>}
          </div>
        </div>

        {/* The only real input: price. Free-trial is platform-set (read-only). */}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Price / month (₹)">
            <input value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="e.g. 5999" className={inputCls} />
          </Field>
          <Field label="Free-trial days" hint="Set by the platform.">
            <div className={`${inputCls} flex items-center bg-mist-100 text-sage-600`} aria-readonly="true">
              {sf.trial_days > 0 ? `${sf.trial_days} days` : "No free trial"}
            </div>
          </Field>
        </div>

        {/* Standard inclusions — shown, not editable */}
        <div>
          <span className="mb-1.5 block text-[12.5px] font-semibold text-sage-600">What&rsquo;s included</span>
          <ul className="space-y-2 rounded-2xl bg-mist-100 p-4 ring-1 ring-ink/[0.04]">
            {CARE_PACKAGE.includes.map((b) => (
              <li key={b} className="flex items-start gap-2.5 text-[13.5px] text-ink">
                <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-good-500 text-[10px] font-bold text-white">✓</span>
                {b}
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[11.5px] text-sage-500">Standard programme inclusions — shown to families with your package.</p>
        </div>

        {priceNum > 0 && (
          <p className="rounded-xl bg-mist-100 px-3 py-2 text-[12px] text-sage-700 ring-1 ring-ink/[0.04]">
            Platform fee {sf.platform_fee_pct}% — you receive <span className="font-semibold text-ink">{inr(payout)}</span> of {inr(priceNum)}/month. Families see {inr(priceNum)}.
          </p>
        )}

        <div className="h-px bg-line" />
        <SectionHeader title="In an emergency" sub="Shown to families. If you have no ambulance line, direct them to 112/108 or the nearest hospital." />
        <Field label="What to do in an emergency">
          <textarea value={emNote} onChange={(e) => setEmNote(e.target.value)} rows={3} placeholder="e.g. Call our centre first. If unreachable, call 112/108 or go to the nearest hospital." className={`${inputCls} resize-y`} />
        </Field>
        <Field label="Emergency / ambulance number (optional)">
          <input value={emNum} onChange={(e) => setEmNum(e.target.value)} inputMode="tel" placeholder="+91 …" className={inputCls} />
        </Field>

        {err && <p className="text-[12px] text-coral-600">{err}</p>}
        <div className="flex items-center gap-3">
          <PrimaryButton onClick={save} disabled={busy}>{busy ? "Saving…" : "Save price"}</PrimaryButton>
          {saved && <span className="text-[12.5px] font-semibold text-good-600">Saved ✓</span>}
        </div>
      </div>
    </Card>
  );
}
