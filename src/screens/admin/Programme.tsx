import { useEffect, useState } from "react";
import { useBranding } from "../../branding/BrandingProvider";
import { getStorefront, updateStorefront } from "../../lib/db";

const FIELD =
  "w-full rounded-xl bg-white px-3.5 py-2.5 text-[14px] text-ink ring-1 ring-ink/10 placeholder:text-sage-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400";
const LABEL = "mb-1 block text-[12px] font-semibold text-sage-600";

/**
 * Admin (HOD) "Programme" page — the minimalist storefront the family sees after
 * login. One care package (name, monthly ₹, what's included, free-trial days) and
 * a couple of org details (what to do in an emergency + a number). The Carelune
 * platform fee is shown here for the admin only; families never see it.
 */
export default function Programme({ onBack }: { onBack: () => void }) {
  const { org, profile } = useBranding();
  const isAdmin = profile?.is_admin ?? false;

  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [includes, setIncludes] = useState("");
  const [trialDays, setTrialDays] = useState("");
  const [emergencyNote, setEmergencyNote] = useState("");
  const [emergencyNumber, setEmergencyNumber] = useState("");
  const [feePct, setFeePct] = useState(30);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const sf = await getStorefront();
        if (!active || !sf) return;
        setName(sf.package_name ?? "");
        setPrice(sf.package_price != null ? String(sf.package_price) : "");
        setIncludes(sf.package_includes ?? "");
        setTrialDays(sf.trial_days ? String(sf.trial_days) : "");
        setEmergencyNote(sf.emergency_note ?? "");
        setEmergencyNumber(sf.emergency_number ?? "");
        setFeePct(sf.platform_fee_pct ?? 30);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Could not load the programme.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const priceNum = Number(price) || 0;
  const payout = Math.round(priceNum * (1 - feePct / 100));

  const save = async () => {
    if (!org) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await updateStorefront(org.id, {
        package_name: name.trim() || null,
        package_price: price ? Number(price) : null,
        package_includes: includes.trim() || null,
        trial_days: Number(trialDays) || 0,
        emergency_note: emergencyNote.trim() || null,
        emergency_number: emergencyNumber.trim() || null,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2200);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-full bg-mist">
      <div className="mx-auto max-w-[760px] px-5 py-6 lg:px-8">
        <button
          type="button"
          onClick={onBack}
          className="tap text-[13px] font-semibold text-brand-700 hover:text-brand-600"
        >
          ← Back to caseload
        </button>
        <h1 className="mt-2 font-display text-2xl font-semibold text-ink">Programme &amp; package</h1>
        <p className="mt-1 max-w-xl text-[14px] leading-relaxed text-sage-600">
          What the family sees after they sign in — your care package and what to do in an emergency.
          Keep it simple: one package.
        </p>

        {loading ? (
          <div className="mt-6 h-56 animate-pulse rounded-2xl bg-mist-200" />
        ) : !isAdmin ? (
          <div className="mt-6 rounded-2xl bg-white p-5 shadow-lift ring-1 ring-ink/[0.05]">
            <p className="text-[14px] text-sage-600">Only the org admin can edit the programme.</p>
          </div>
        ) : (
          <>
            {/* Package */}
            <section className="mt-6 rounded-2xl bg-white p-5 shadow-lift ring-1 ring-ink/[0.05]">
              <h2 className="font-display text-[16px] font-semibold text-ink">Care package</h2>
              <div className="mt-3 space-y-3">
                <label className="block">
                  <span className={LABEL}>Package name</span>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Neuro Recovery Continuum"
                    className={FIELD}
                  />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className={LABEL}>Price / month (₹)</span>
                    <input
                      value={price}
                      onChange={(e) => setPrice(e.target.value.replace(/\D/g, ""))}
                      inputMode="numeric"
                      placeholder="e.g. 5999"
                      className={FIELD}
                    />
                  </label>
                  <label className="block">
                    <span className={LABEL}>Free-trial days</span>
                    <input
                      value={trialDays}
                      onChange={(e) => setTrialDays(e.target.value.replace(/\D/g, ""))}
                      inputMode="numeric"
                      placeholder="0 = no trial"
                      className={FIELD}
                    />
                  </label>
                </div>
                <label className="block">
                  <span className={LABEL}>What&rsquo;s included</span>
                  <textarea
                    value={includes}
                    onChange={(e) => setIncludes(e.target.value)}
                    rows={4}
                    placeholder={"One item per line, e.g.\nDaily caregiver visit\nWeekly doctor review\nNurse on call 8am–8pm"}
                    className={`${FIELD} resize-y`}
                  />
                  <span className="mt-1 block text-[11px] text-sage-500">One item per line.</span>
                </label>
              </div>

              {priceNum > 0 && (
                <div className="mt-4 rounded-xl bg-mist-100 p-3 text-[12.5px] leading-relaxed text-sage-700 ring-1 ring-ink/[0.04]">
                  <span className="font-semibold text-ink">Carelune platform fee {feePct}%.</span> On ₹
                  {priceNum.toLocaleString("en-IN")}/month you receive{" "}
                  <span className="font-semibold text-ink">₹{payout.toLocaleString("en-IN")}</span>. The family
                  never sees this — they see ₹{priceNum.toLocaleString("en-IN")}/month.
                </div>
              )}
            </section>

            {/* Emergency */}
            <section className="mt-4 rounded-2xl bg-white p-5 shadow-lift ring-1 ring-ink/[0.05]">
              <h2 className="font-display text-[16px] font-semibold text-ink">In an emergency</h2>
              <p className="mt-1 text-[13px] text-sage-600">
                Shown to the family. If you have no ambulance line, tell them to call 112/108 or go to the
                nearest hospital.
              </p>
              <div className="mt-3 space-y-3">
                <label className="block">
                  <span className={LABEL}>What to do in an emergency</span>
                  <textarea
                    value={emergencyNote}
                    onChange={(e) => setEmergencyNote(e.target.value)}
                    rows={3}
                    placeholder="e.g. Call our centre first. If unreachable, call 112/108 or go to the nearest hospital."
                    className={`${FIELD} resize-y`}
                  />
                </label>
                <label className="block">
                  <span className={LABEL}>Emergency / ambulance number (optional)</span>
                  <input
                    value={emergencyNumber}
                    onChange={(e) => setEmergencyNumber(e.target.value)}
                    inputMode="tel"
                    placeholder="e.g. +91 80 1234 5678"
                    className={FIELD}
                  />
                </label>
              </div>
            </section>

            {error && <p className="mt-4 text-[13px] text-coral-600">{error}</p>}

            <div className="mt-5 flex items-center gap-3">
              <button
                type="button"
                onClick={save}
                disabled={busy}
                className="tap rounded-xl bg-brand-600 px-5 py-2.5 text-[14px] font-semibold text-white hover:bg-brand-500 disabled:opacity-60"
              >
                {busy ? "Saving…" : "Save programme"}
              </button>
              {saved && <span className="text-[13px] font-semibold text-good-600">Saved ✓</span>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
