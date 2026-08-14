import { useState } from "react";
import { Icon } from "../../components/ui";
import { useBranding } from "../../branding/BrandingProvider";
import { generateInviteToken } from "../../lib/db";
import { shareOnWhatsApp } from "../../lib/share";

/**
 * The org's patient-registration link. The admin generates (or rotates) a
 * reusable link; any staff can copy it or share it on WhatsApp. A family opens
 * it, registers the patient + their own login + consent, and the patient then
 * appears in the caseload as "Needs plan".
 */
export default function RegistrationLink({ onBack }: { onBack: () => void }) {
  const { org, profile, platformName, refresh } = useBranding();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const isAdmin = profile?.is_admin ?? false;
  const token = org?.invite_token ?? null;
  const link = token ? `${window.location.origin}${window.location.pathname}?register=${token}` : null;

  const generate = async () => {
    if (!org) return;
    setBusy(true);
    setError(null);
    try {
      await generateInviteToken(org.id);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not generate the link.");
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard?.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard may be unavailable; the link is visible to copy manually */
    }
  };

  const share = () => {
    if (!link) return;
    shareOnWhatsApp(
      `Please register the patient with ${platformName} (Care continues). Open this link and fill in the details:\n${link}`,
    );
  };

  return (
    <div className="min-h-full bg-mist">
      <div className="mx-auto max-w-[760px] px-5 py-6 lg:px-8">
        <button type="button" onClick={onBack} className="tap text-[13px] font-semibold text-brand-700 hover:text-brand-600">
          ← Back to caseload
        </button>
        <h1 className="mt-2 font-display text-2xl font-semibold text-ink">Registration link</h1>
        <p className="mt-1 max-w-xl text-[14px] leading-relaxed text-sage-600">
          Share this link with a patient&rsquo;s family. They register the patient and give consent; the patient
          then appears in your caseload, ready for you to add the plan.
        </p>

        <div className="mt-6 rounded-2xl bg-white p-5 shadow-lift ring-1 ring-ink/[0.05]">
          {link ? (
            <>
              <span className="mb-1 block text-[12px] font-semibold text-sage-600">Your org&rsquo;s link</span>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  readOnly
                  value={link}
                  onFocus={(e) => e.currentTarget.select()}
                  className="min-w-[220px] flex-1 rounded-xl bg-mist px-3 py-2 text-[13px] text-ink ring-1 ring-ink/10"
                />
                <button type="button" onClick={copy} className="tap rounded-xl border border-line px-3 py-2 text-[13px] font-semibold text-ink hover:bg-mist-100">
                  {copied ? "Copied" : "Copy"}
                </button>
                <button type="button" onClick={share} className="tap inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-brand-500">
                  <Icon.Phone width={14} height={14} /> WhatsApp
                </button>
              </div>
              {isAdmin && (
                <button
                  type="button"
                  onClick={generate}
                  disabled={busy}
                  className="tap mt-3 text-[12px] font-semibold text-sage-600 hover:text-coral-600 disabled:opacity-60"
                >
                  {busy ? "Working…" : "Regenerate link (invalidates the old one)"}
                </button>
              )}
            </>
          ) : isAdmin ? (
            <>
              <p className="text-[14px] text-sage-600">No registration link yet.</p>
              <button
                type="button"
                onClick={generate}
                disabled={busy}
                className="tap mt-3 inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-[14px] font-semibold text-white hover:bg-brand-500 disabled:opacity-60"
              >
                {busy ? "Generating…" : "Generate registration link"}
              </button>
            </>
          ) : (
            <p className="text-[14px] text-sage-600">
              No registration link yet. Ask your admin to generate one under this tab.
            </p>
          )}

          {error && <p className="mt-3 text-[13px] text-coral-600">{error}</p>}
        </div>

        <p className="mt-4 px-1 text-[12px] leading-relaxed text-sage-500">
          Anyone with the link can register a patient into your organisation. Regenerate it if it is ever shared
          too widely.
        </p>
      </div>
    </div>
  );
}
