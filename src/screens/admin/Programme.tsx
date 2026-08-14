import { useEffect, useState } from "react";
import { useBranding } from "../../branding/BrandingProvider";
import {
  getMyInstitutionPathways, updatePathwayConfig, updateOrgBranding, type InstitutionPathway,
} from "../../lib/db";
import {
  Card, Field, inputCls, PrimaryButton, GhostButton, Chip, ErrorNote, Skeleton, SectionHeader,
} from "../../components/system";

const inr = (n: number | null | undefined) => (n == null ? "—" : `₹${n.toLocaleString("en-IN")}`);

/**
 * Admin "Programme" workspace tab. Edits the per-pathway commercial package
 * (the single source of truth — mirrored down to the family storefront by the DB)
 * and the institution's emergency guidance. Clinical pathway content is governed
 * separately and is not editable here.
 */
export default function Programme({ onBack }: { onBack: () => void }) {
  const { org, profile, refresh } = useBranding();
  const isAdmin = profile?.is_admin ?? false;
  const [packs, setPacks] = useState<InstitutionPathway[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [emNote, setEmNote] = useState("");
  const [emNum, setEmNum] = useState("");
  const [emBusy, setEmBusy] = useState(false);
  const [emSaved, setEmSaved] = useState(false);

  useEffect(() => {
    void getMyInstitutionPathways().then(setPacks).catch((e) => {
      setError(e instanceof Error ? e.message : "Could not load programmes.");
      setPacks([]);
    });
  }, []);
  useEffect(() => {
    if (!org) return;
    setEmNote(org.emergency_note ?? "");
    setEmNum(org.emergency_number ?? "");
  }, [org]);

  const saveEmergency = async () => {
    if (!org) return;
    setEmBusy(true); setError(null); setEmSaved(false);
    try {
      await updateOrgBranding(org.id, { emergency_note: emNote.trim() || null, emergency_number: emNum.trim() || null });
      await refresh();
      setEmSaved(true); setTimeout(() => setEmSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally { setEmBusy(false); }
  };

  return (
    <div className="min-h-full bg-mist">
      <div className="mx-auto max-w-[820px] px-5 py-6 lg:px-8">
        <GhostButton onClick={onBack} className="!px-3 !py-1.5 text-[13px]">← Back to caseload</GhostButton>
        <h1 className="mt-3 font-display text-[24px] font-semibold tracking-tight text-ink">Programme &amp; package</h1>
        <p className="mt-1 text-[14px] text-sage-500">What families see — your care packages and what to do in an emergency.</p>

        {!isAdmin ? (
          <Card className="mt-5"><p className="text-[14px] text-sage-600">Only the org admin can edit the programme.</p></Card>
        ) : (
          <div className="mt-5 space-y-5">
            {error && <ErrorNote>{error}</ErrorNote>}

            {packs === null ? (
              <Skeleton className="h-40" />
            ) : packs.length === 0 ? (
              <Card><p className="text-[13.5px] text-sage-500">No programmes assigned yet. Ask Carelune to enable a Continuum Care pack.</p></Card>
            ) : (
              packs.map((p) => (
                <Card key={p.pack_id}><PackEditor pack={p} /></Card>
              ))
            )}

            <Card>
              <SectionHeader title="In an emergency" sub="Shown to families. If you have no ambulance line, direct them to 112/108 or the nearest hospital." />
              <div className="mt-4 space-y-3">
                <Field label="What to do in an emergency">
                  <textarea value={emNote} onChange={(e) => setEmNote(e.target.value)} rows={3} placeholder="e.g. Call our centre first. If unreachable, call 112/108 or go to the nearest hospital." className={`${inputCls} resize-y`} />
                </Field>
                <Field label="Emergency / ambulance number (optional)">
                  <input value={emNum} onChange={(e) => setEmNum(e.target.value)} inputMode="tel" placeholder="+91 …" className={inputCls} />
                </Field>
                <div className="flex items-center gap-3">
                  <PrimaryButton onClick={saveEmergency} disabled={emBusy}>{emBusy ? "Saving…" : "Save emergency info"}</PrimaryButton>
                  {emSaved && <span className="text-[12.5px] font-semibold text-good-600">Saved ✓</span>}
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

function PackEditor({ pack }: { pack: InstitutionPathway }) {
  const [price, setPrice] = useState(pack.price != null ? String(pack.price) : "");
  const [trial, setTrial] = useState(pack.trial_days ? String(pack.trial_days) : "");
  const [dur, setDur] = useState(pack.duration_days != null ? String(pack.duration_days) : "");
  const [inc, setInc] = useState(pack.included ?? "");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const priceNum = Number(price) || 0;
  const payout = Math.round(priceNum * (1 - pack.platform_fee_pct / 100));

  const save = async () => {
    setBusy(true); setErr(null); setSaved(false);
    try {
      await updatePathwayConfig(pack.pack_id, {
        price: price ? Number(price) : null,
        trial_days: Number(trial) || 0,
        duration_days: dur ? Number(dur) : null,
        included: inc.trim() || null,
      });
      setSaved(true); setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save.");
    } finally { setBusy(false); }
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <span className="text-[15px] font-semibold text-ink">{pack.pack_name}</span>
        <Chip tone="grey">{pack.specialty}</Chip>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <Field label="Price / month (₹)">
          <input value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="e.g. 5999" className={inputCls} />
        </Field>
        <Field label="Free-trial days">
          <input value={trial} onChange={(e) => setTrial(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="0" className={inputCls} />
        </Field>
        <Field label="Duration (days)">
          <input value={dur} onChange={(e) => setDur(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="e.g. 30" className={inputCls} />
        </Field>
      </div>
      <div className="mt-3">
        <Field label="What's included" hint="One item per line.">
          <textarea value={inc} onChange={(e) => setInc(e.target.value)} rows={3} placeholder={"Daily caregiver visit\nWeekly doctor review\nNurse on call 8am–8pm"} className={`${inputCls} resize-y`} />
        </Field>
      </div>
      {priceNum > 0 && (
        <p className="mt-2 rounded-xl bg-mist-100 px-3 py-2 text-[12px] text-sage-700 ring-1 ring-ink/[0.04]">
          Carelune platform fee {pack.platform_fee_pct}% — you receive <span className="font-semibold text-ink">{inr(payout)}</span> of {inr(priceNum)}/month. Families see {inr(priceNum)}.
        </p>
      )}
      {err && <p className="mt-2 text-[12px] text-coral-600">{err}</p>}
      <div className="mt-2 flex items-center gap-3">
        <PrimaryButton onClick={save} disabled={busy}>{busy ? "Saving…" : "Save programme"}</PrimaryButton>
        {saved && <span className="text-[12.5px] font-semibold text-good-600">Saved ✓</span>}
      </div>
    </>
  );
}
