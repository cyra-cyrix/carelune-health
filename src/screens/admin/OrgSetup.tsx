import { useEffect, useState } from "react";
import { LoopMark } from "../../components/ui";
import { useBranding } from "../../branding/BrandingProvider";
import {
  updateOrgBranding, getMyEnabledPacks, getStorefront, updateStorefront, saveDoctorKyc, updateMyName, getPackPathways,
  type EnabledPack, type Storefront, type PackPathway,
} from "../../lib/db";
import {
  Card, Field, inputCls, PrimaryButton, GhostButton, Stepper, Chip, PathwayStatusBadge,
  ErrorNote, Skeleton, SectionHeader,
} from "../../components/system";
import { CARE_PACKAGE, CARE_PACKAGE_INCLUDES_TEXT } from "../../domain/carePackage";

const STEPS = ["Identity", "Programmes", "Package", "Finish"];
const inr = (n: number | null | undefined) => (n == null ? "—" : `₹${n.toLocaleString("en-IN")}`);

/** Recovery departments an institution can declare it serves (trial shortlist). */
const DEPARTMENTS = [
  "Joint / Orthopaedics", "Spine", "Neuro / Stroke", "Cardiac rehab", "Pulmonary rehab",
  "Post-surgical / wound", "Oncology rehab", "Geriatric / falls", "Maternal / post-natal",
];

// Consent/terms version stamped on acceptance. DRAFT copy — replace the wording
// (CONSENT_COPY) with counsel-approved text before onboarding real patients.
const TERMS_VERSION = "trial-draft-2026-08";
const CONSENT_COPY =
  "I confirm the institution and clinician details above are accurate. Our institution is the " +
  "data fiduciary for patient data and Carelune processes it on our instructions; we will obtain " +
  "patient consent as required (DPDP Act 2023 · Telemedicine Practice Guidelines 2020). I accept " +
  "Carelune's Terms and Data-Processing terms.";

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
  const [myName, setMyName] = useState("");
  const [name, setName] = useState("");
  const [logo, setLogo] = useState("");
  const [phone, setPhone] = useState("");
  const [hours, setHours] = useState("");
  const [emNote, setEmNote] = useState("");
  const [emNum, setEmNum] = useState("");
  // departments + KYC + consent (0022)
  const [departments, setDepartments] = useState<string[]>([]);
  const [ceReg, setCeReg] = useState("");
  const [medReg, setMedReg] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [consent, setConsent] = useState(false);

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
    setDepartments(org.departments ?? []);
    setCeReg(org.ce_reg_no ?? "");
    setConsent(!!org.terms_accepted_at);
  }, [org]);

  useEffect(() => {
    setMyName(profile?.full_name ?? "");
    setMedReg(profile?.med_reg_no ?? "");
    setSpecialty(profile?.specialty ?? "");
  }, [profile]);

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
        departments,
        ce_reg_no: ceReg.trim() || null,
        ...(consent ? { terms_accepted_at: org.terms_accepted_at ?? new Date().toISOString(), terms_version: TERMS_VERSION } : {}),
      });
      if (myName.trim()) await updateMyName(myName.trim());
      await saveDoctorKyc(medReg.trim() || null, specialty.trim() || null);
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
                <div>
                  <span className="mb-1.5 block text-[12.5px] font-semibold text-sage-600">Recovery departments you serve</span>
                  <div className="flex flex-wrap gap-2">
                    {DEPARTMENTS.map((d) => {
                      const on = departments.includes(d);
                      return (
                        <button
                          key={d}
                          type="button"
                          aria-pressed={on}
                          onClick={() => setDepartments((xs) => (on ? xs.filter((x) => x !== d) : [...xs, d]))}
                          className={`tap rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${on ? "bg-sky-600 text-white" : "bg-mist-100 text-sage-600 hover:text-ink"}`}
                        >
                          {d}
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-1.5 text-[11.5px] text-sage-500">Determines which recovery pathways apply to your institution.</p>
                </div>

                <div className="h-px bg-line" />
                <p className="text-[12.5px] font-semibold text-sage-600">Credentialing</p>
                <Field label="Your name" hint="Shown in your greeting and headers, e.g. “Dr. Meera Nair”.">
                  <input value={myName} onChange={(e) => setMyName(e.target.value)} placeholder="Your full name" className={inputCls} />
                </Field>
                <Field label="Clinical Establishments Act reg. no. (institution)">
                  <input value={ceReg} onChange={(e) => setCeReg(e.target.value)} placeholder="e.g. KA/CEA/2024/…" className={inputCls} />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Your medical registration no.">
                    <input value={medReg} onChange={(e) => setMedReg(e.target.value)} placeholder="NMC / state council no." className={inputCls} />
                  </Field>
                  <Field label="Specialty">
                    <input value={specialty} onChange={(e) => setSpecialty(e.target.value)} placeholder="e.g. Orthopaedics" className={inputCls} />
                  </Field>
                </div>
                <p className="text-[11.5px] text-sage-500">Self-attested for the trial — not verified against the registry.</p>

                <div className="h-px bg-line" />
                <Field label="What to do in an emergency" hint="Shown to families. If no ambulance line, direct them to 112/108 or the nearest hospital.">
                  <textarea value={emNote} onChange={(e) => setEmNote(e.target.value)} rows={3} placeholder="e.g. Call our centre first. If unreachable, call 112/108 or go to the nearest hospital." className={`${inputCls} resize-y`} />
                </Field>
                <Field label="Emergency / ambulance number (optional)">
                  <input value={emNum} onChange={(e) => setEmNum(e.target.value)} inputMode="tel" placeholder="+91 …" className={inputCls} />
                </Field>
                <div className="h-px bg-line" />
                <label className="flex items-start gap-2.5 rounded-2xl bg-mist-100 p-3.5 ring-1 ring-ink/[0.04]">
                  <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-sky-600" />
                  <span className="text-[12.5px] leading-relaxed text-sage-700">
                    {CONSENT_COPY} <span className="font-semibold text-warn-600">(DRAFT — to be finalised by your counsel before onboarding real patients.)</span>
                  </span>
                </label>

                {error && <ErrorNote>{error}</ErrorNote>}
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[11.5px] text-sage-500">
                    {departments.length === 0 ? "Select at least one department." : !consent ? "Accept the terms to continue." : ""}
                  </span>
                  <PrimaryButton onClick={() => saveIdentity(true)} disabled={busy || !name.trim() || !consent || departments.length === 0}>
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
                  packs.map((p) => <PackReadCard key={p.pack_id} pack={p} />)
                )}
                <p className="text-[11.5px] leading-relaxed text-sage-500">
                  Need a pathway we don&rsquo;t offer yet? Ask your Carelune contact — uploading your own SOP and an
                  AI-built library are coming soon.
                </p>
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

/** A read-only pathway card the HOD can expand to read what the programme covers
 *  (its sub-pathways, lazy-loaded). Full SOP viewer + upload + AI library are later. */
function PackReadCard({ pack }: { pack: EnabledPack }) {
  const [open, setOpen] = useState(false);
  const [pathways, setPathways] = useState<PackPathway[] | null>(null);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && pathways === null) getPackPathways(pack.pack_id).then(setPathways).catch(() => setPathways([]));
  };

  return (
    <div className="rounded-2xl border border-line bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[15px] font-semibold text-ink">{pack.pack_name}</span>
        <Chip tone="grey">{pack.specialty}</Chip>
        <span className="ml-auto"><PathwayStatusBadge status={pack.status} /></span>
      </div>
      {pack.description && <p className="mt-1.5 text-[12.5px] leading-relaxed text-sage-600">{pack.description}</p>}

      <button type="button" onClick={toggle} className="tap mt-2 text-[12.5px] font-semibold text-sky-700 hover:text-sky-800">
        {open ? "Hide details" : "Read what’s included"}
      </button>
      {open && (
        <div className="mt-2 rounded-xl bg-mist-100 p-3 ring-1 ring-ink/[0.04]">
          {pathways === null ? (
            <p className="text-[12px] text-sage-500">Loading…</p>
          ) : pathways.length === 0 ? (
            <p className="text-[12px] text-sage-500">No sub-pathways listed.</p>
          ) : (
            <>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-sage-500">Pathways in this programme</p>
              <ul className="mt-1.5 space-y-1.5">
                {pathways.map((pw) => (
                  <li key={pw.pathway_id} className="flex items-center gap-2 text-[13px] text-ink">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-sky-400" />
                    {pw.name}
                    {pw.version_status && <span className="ml-1"><PathwayStatusBadge status={pw.version_status} /></span>}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] text-sage-500">The full clinical SOP is provided for your clinician’s review.</p>
            </>
          )}
        </div>
      )}
      <p className="mt-1.5 text-[11.5px] text-sage-500">
        This is a draft pathway. Your clinician must review and approve it before any patient plan built on it is activated.
      </p>
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
  // Only the price is editable. Name, duration, free-trial and inclusions are
  // fixed by the platform and shown read-only (see src/domain/carePackage.ts).
  const [price, setPrice] = useState(sf.package_price != null ? String(sf.package_price) : "");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const priceNum = Number(price) || 0;
  const payout = Math.round(priceNum * (1 - sf.platform_fee_pct / 100));

  const save = async () => {
    setBusy(true); onError(null); setSaved(false);
    try {
      // Persist the fixed package identity alongside the price so every consumer
      // (DB or client) reads the same offer. Free-trial is platform-set — untouched.
      const patch = {
        package_name: CARE_PACKAGE.name,
        package_price: price ? Number(price) : null,
        package_includes: CARE_PACKAGE_INCLUDES_TEXT,
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
      {/* Fixed package identity */}
      <div className="rounded-2xl bg-sky-50 p-4 ring-1 ring-sky-200">
        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-sky-700">Package families subscribe to</div>
        <div className="mt-1 flex flex-wrap items-baseline gap-2">
          <span className="font-display text-[22px] font-semibold tracking-tight text-ink">{CARE_PACKAGE.name}</span>
          <span className="text-[12.5px] font-medium text-sage-500">· {CARE_PACKAGE.durationLabel}</span>
          {priceNum > 0 && (
            <span className="ml-auto text-[15px] font-semibold text-sky-700">{inr(priceNum)}<span className="text-[12px] font-medium text-sage-500">/month</span></span>
          )}
        </div>
      </div>

      {/* The only editable field */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Price / month (₹)">
          <input value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="e.g. 5999" className={inputCls} />
        </Field>
        <ReadOnlyField label="Free-trial days" value={sf.trial_days > 0 ? `${sf.trial_days} days` : "No free trial"} hint="Set by the platform." />
      </div>

      {/* Fixed inclusions — read-only rows */}
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
      <div className="flex items-center gap-3">
        <PrimaryButton onClick={save} disabled={busy}>{busy ? "Saving…" : "Save price"}</PrimaryButton>
        {saved && <span className="text-[12.5px] font-semibold text-good-600">Saved ✓</span>}
      </div>
    </div>
  );
}

/** A locked, read-only field styled like the editable inputs but non-interactive. */
function ReadOnlyField({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Field label={label} hint={hint}>
      <div className={`${inputCls} flex items-center bg-mist-100 text-sage-600`} aria-readonly="true">{value}</div>
    </Field>
  );
}
