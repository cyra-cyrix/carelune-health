import { useEffect, useState } from "react";
import {
  getStorefront, updateStorefront, getMyEnabledPacks,
  type Storefront, type EnabledPack,
} from "../../lib/db";
import {
  Card, Field, inputCls, PrimaryButton, GhostButton, Chip, PathwayStatusBadge,
  ErrorNote, Skeleton, SectionHeader,
} from "../../components/system";

const inr = (n: number | null | undefined) => (n == null ? "—" : `₹${n.toLocaleString("en-IN")}`);

/**
 * Admin "Programme" workspace tab. Edits the institution's ONE commercial package
 * (name, price, trial, inclusions — the single commercial source of truth) and the
 * emergency guidance families see. Clinical pathways are shown read-only: they are
 * governed templates, not separately-priced products (see docs/COMMERCIAL_MODEL.md).
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
  const [name, setName] = useState(sf.package_name ?? "");
  const [price, setPrice] = useState(sf.package_price != null ? String(sf.package_price) : "");
  const [trial, setTrial] = useState(sf.trial_days ? String(sf.trial_days) : "");
  const [inc, setInc] = useState(sf.package_includes ?? "");
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
      const patch = {
        package_name: name.trim() || null,
        package_price: price ? Number(price) : null,
        package_includes: inc.trim() || null,
        trial_days: Number(trial) || 0,
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
      <SectionHeader title="Your care package" sub="The single package families subscribe to. Billing is settled at your centre." />
      <div className="mt-4 space-y-4">
        <Field label="Package name">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Neuro Recovery Continuum" className={inputCls} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Price / month (₹)">
            <input value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="e.g. 5999" className={inputCls} />
          </Field>
          <Field label="Free-trial days" hint="0 = no free trial.">
            <input value={trial} onChange={(e) => setTrial(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="0" className={inputCls} />
          </Field>
        </div>
        <Field label="What's included" hint="One item per line.">
          <textarea value={inc} onChange={(e) => setInc(e.target.value)} rows={4} placeholder={"Daily caregiver visit\nWeekly doctor review\nNurse on call 8am–8pm"} className={`${inputCls} resize-y`} />
        </Field>

        {priceNum > 0 && (
          <p className="rounded-xl bg-mist-100 px-3 py-2 text-[12px] text-sage-700 ring-1 ring-ink/[0.04]">
            Carelune platform fee {sf.platform_fee_pct}% — you receive <span className="font-semibold text-ink">{inr(payout)}</span> of {inr(priceNum)}/month. Families see {inr(priceNum)}.
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
          <PrimaryButton onClick={save} disabled={busy}>{busy ? "Saving…" : "Save package"}</PrimaryButton>
          {saved && <span className="text-[12.5px] font-semibold text-good-600">Saved ✓</span>}
        </div>
      </div>
    </Card>
  );
}
