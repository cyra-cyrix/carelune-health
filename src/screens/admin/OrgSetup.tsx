import { useEffect, useState } from "react";
import { LoopMark } from "../../components/ui";
import { useBranding } from "../../branding/BrandingProvider";
import {
  updateOrgBranding, getMyEnabledPacks, getStorefront, updateStorefront,
  type EnabledPack, type Storefront,
} from "../../lib/db";
import {
  Card, Field, inputCls, PrimaryButton, GhostButton, Stepper, Chip, PathwayStatusBadge,
  ErrorNote, Skeleton, SectionHeader,
} from "../../components/system";

const STEPS = ["Identity", "Programmes", "Package", "Finish"];
const inr = (n: number | null | undefined) => (n == null ? "—" : `₹${n.toLocaleString("en-IN")}`);

/**
 * HOD / Admin onboarding wizard. Sets institution identity + branding, reviews
 * the Super-Admin-assigned Continuum Care programmes (read-only clinical content,
 * clearly marked as requiring institutional clinical approval), and configures the
 * ONE commercial package families subscribe to. Finishing marks setup complete.
 */
export default function OrgSetup() {
  const { org, profile, refresh } = useBranding();
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // identity
  const [name, setName] = useState("");
  const [logo, setLogo] = useState("");
  const [phone, setPhone] = useState("");
  const [hours, setHours] = useState("");
  const [emNote, setEmNote] = useState("");
  const [emNum, setEmNum] = useState("");

  // programmes / package
  const [packs, setPacks] = useState<EnabledPack[] | null>(null);
  const [sf, setSf] = useState<Storefront | null>(null);

  useEffect(() => {
    if (!org) return;
    setName(org.display_name ?? "");
    setLogo(org.logo_url ?? "");
    setPhone(org.contact_phone ?? "");
    setHours(org.service_hours ?? "");
    setEmNote(org.emergency_note ?? "");
    setEmNum(org.emergency_number ?? "");
  }, [org]);

  useEffect(() => {
    void getMyEnabledPacks().then(setPacks).catch(() => setPacks([]));
    void getStorefront().then(setSf).catch(() => setSf(null));
  }, []);

  const saveIdentity = async (advance: boolean) => {
    if (!org || !name.trim()) return;
    setBusy(true); setError(null);
    try {
      await updateOrgBranding(org.id, {
        display_name: name.trim(), logo_url: logo.trim() || null,
        contact_phone: phone.trim() || null, service_hours: hours.trim() || null,
        emergency_note: emNote.trim() || null, emergency_number: emNum.trim() || null,
      });
      await refresh();
      if (advance) setStep(1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally { setBusy(false); }
  };

  const finish = async () => {
    if (!org) return;
    setBusy(true); setError(null);
    try {
      await updateOrgBranding(org.id, { setup_complete: true });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not finish setup.");
      setBusy(false);
    }
  };

  const first = profile?.full_name?.split(" ")[0];

  return (
    <div className="min-h-screen bg-mist">
      <header className="border-b border-line bg-white/90 px-5 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-[820px] items-center gap-2 text-sky-700">
          <LoopMark size={20} />
          <span className="text-[14px] font-semibold text-ink">Carelune</span>
          <span className="ml-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-sage-500">Institution setup</span>
        </div>
      </header>

      <main className="mx-auto max-w-[820px] px-5 py-7">
        <h1 className="font-display text-[24px] font-semibold tracking-tight text-ink">
          Welcome{first ? `, ${first}` : ""}
        </h1>
        <p className="mt-1 text-[14px] text-sage-500">A few steps to get your institution ready.</p>

        <div className="mt-5"><Stepper steps={STEPS} current={step} /></div>

        <div className="mt-5">
          {step === 0 && (
            <Card>
              <SectionHeader title="Institution identity" sub="What your team and families see, plus emergency guidance." />
              <div className="mt-4 space-y-4">
                <Field label="Display name">
                  <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sunrise Spine & Rehab" className={inputCls} />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Logo URL (optional)" hint="Image upload coming soon.">
                    <input value={logo} onChange={(e) => setLogo(e.target.value)} placeholder="https://…" className={inputCls} />
                  </Field>
                  <Field label="Contact number (optional)">
                    <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="+91 80 …" className={inputCls} />
                  </Field>
                </div>
                <Field label="Monitoring / service hours (optional)">
                  <input value={hours} onChange={(e) => setHours(e.target.value)} placeholder="e.g. 8:00 AM – 8:00 PM IST, 7 days" className={inputCls} />
                </Field>
                <div className="h-px bg-line" />
                <Field label="What to do in an emergency" hint="Shown to families. If no ambulance line, direct them to 112/108 or the nearest hospital.">
                  <textarea value={emNote} onChange={(e) => setEmNote(e.target.value)} rows={3} placeholder="e.g. Call our centre first. If unreachable, call 112/108 or go to the nearest hospital." className={`${inputCls} resize-y`} />
                </Field>
                <Field label="Emergency / ambulance number (optional)">
                  <input value={emNum} onChange={(e) => setEmNum(e.target.value)} inputMode="tel" placeholder="+91 …" className={inputCls} />
                </Field>
                {error && <ErrorNote>{error}</ErrorNote>}
                <div className="flex justify-end">
                  <PrimaryButton onClick={() => saveIdentity(true)} disabled={busy || !name.trim()}>
                    {busy ? "Saving…" : "Continue"}
                  </PrimaryButton>
                </div>
              </div>
            </Card>
          )}

          {step === 1 && (
            <Card>
              <SectionHeader title="Your clinical pathways" sub="Assigned by Carelune. Governed templates — clinical content is read-only." />
              <div className="mt-4 space-y-3">
                {packs === null ? (
                  <><Skeleton className="h-20" /><Skeleton className="h-20" /></>
                ) : packs.length === 0 ? (
                  <p className="text-[13px] text-sage-500">No pathways enabled yet. Ask Carelune to enable a Continuum Care programme.</p>
                ) : (
                  packs.map((p) => (
                    <div key={p.pack_id} className="rounded-2xl border border-line bg-white p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[15px] font-semibold text-ink">{p.pack_name}</span>
                        <Chip tone="grey">{p.specialty}</Chip>
                        <span className="ml-auto"><PathwayStatusBadge status={p.status} /></span>
                      </div>
                      {p.description && <p className="mt-1.5 text-[12.5px] leading-relaxed text-sage-600">{p.description}</p>}
                      <p className="mt-1.5 text-[11.5px] text-sage-500">
                        This is a draft pathway. Your clinician must review and approve it before any patient plan built on it is activated.
                      </p>
                    </div>
                  ))
                )}
                <div className="flex justify-between pt-1">
                  <GhostButton onClick={() => setStep(0)}>Back</GhostButton>
                  <PrimaryButton onClick={() => setStep(2)}>Continue</PrimaryButton>
                </div>
              </div>
            </Card>
          )}

          {step === 2 && (
            <Card>
              <SectionHeader title="Your care package" sub="One package, one price — what families subscribe to. Pathways are not priced separately." />
              <div className="mt-4">
                {sf === null ? (
                  <Skeleton className="h-56" />
                ) : (
                  <PackageEditor sf={sf} onSaved={setSf} onError={setError} />
                )}
                {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}
                <div className="mt-4 flex justify-between">
                  <GhostButton onClick={() => setStep(1)}>Back</GhostButton>
                  <PrimaryButton onClick={() => setStep(3)}>Continue</PrimaryButton>
                </div>
              </div>
            </Card>
          )}

          {step === 3 && (
            <Card>
              <SectionHeader title="You're ready" sub="Next: add your team and share the patient registration link." />
              <ul className="mt-4 space-y-2 text-[13.5px] text-sage-700">
                <li className="flex gap-2"><span className="text-sky-600">✓</span> Institution identity & emergency guidance set</li>
                <li className="flex gap-2"><span className="text-sky-600">✓</span> {packs?.length ?? 0} clinical pathway{(packs?.length ?? 0) === 1 ? "" : "s"} reviewed · one package priced</li>
                <li className="flex gap-2"><span className="text-sage-400">•</span> Add your doctors, nurses and coordinators from the <span className="font-semibold text-ink">Team</span> tab</li>
                <li className="flex gap-2"><span className="text-sage-400">•</span> Share the permanent patient <span className="font-semibold text-ink">Registration link</span></li>
              </ul>
              {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}
              <div className="mt-5 flex justify-between">
                <GhostButton onClick={() => setStep(2)}>Back</GhostButton>
                <PrimaryButton onClick={finish} disabled={busy}>{busy ? "Finishing…" : "Enter workspace"}</PrimaryButton>
              </div>
            </Card>
          )}
        </div>

        <p className="mt-4 text-center text-[11.5px] text-sage-400">Powered by Carelune · Care continues.</p>
      </main>
    </div>
  );
}

function PackageEditor({
  sf, onSaved, onError,
}: {
  sf: Storefront;
  onSaved: (s: Storefront) => void;
  onError: (m: string | null) => void;
}) {
  const [name, setName] = useState(sf.package_name ?? "");
  const [price, setPrice] = useState(sf.package_price != null ? String(sf.package_price) : "");
  const [trial, setTrial] = useState(sf.trial_days ? String(sf.trial_days) : "");
  const [inc, setInc] = useState(sf.package_includes ?? "");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const priceNum = Number(price) || 0;
  const payout = Math.round(priceNum * (1 - sf.platform_fee_pct / 100));

  const save = async () => {
    setBusy(true); onError(null); setSaved(false);
    try {
      const patch = {
        package_name: name.trim() || null,
        package_price: price ? Number(price) : null,
        package_includes: inc.trim() || null,
        trial_days: Number(trial) || 0,
      };
      await updateStorefront(sf.centre_id, patch);
      onSaved({ ...sf, ...patch });
      setSaved(true); setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Could not save.");
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
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
      <div className="flex items-center gap-3">
        <PrimaryButton onClick={save} disabled={busy}>{busy ? "Saving…" : "Save package"}</PrimaryButton>
        {saved && <span className="text-[12.5px] font-semibold text-good-600">Saved ✓</span>}
      </div>
    </div>
  );
}
