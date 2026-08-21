import { useEffect, useState } from "react";
import { Icon } from "../../components/ui";
import { useBranding } from "../../branding/BrandingProvider";
import { generateInviteToken, getCentreServices, type CentreServiceRow } from "../../lib/db";
import { registerUrl } from "../../config/urls";
import { shareOnWhatsApp } from "../../lib/share";
import { PackageInviteLink } from "../provider/PackageInviteLink";

/**
 * Where a provider gets the link they send a family.
 *
 * There are two kinds of organisation and they must not be confused:
 *
 *  • A UNIVERSAL provider has a published service with active packages. Their
 *    link has to name a package, because that is what the patient will be
 *    enrolled into. `centres.invite_token` carries no package at all, so
 *    offering it here is what made a universal invitation open the legacy
 *    "30-Day Recovery Continuum" registration. For these organisations the
 *    centre-level link is not offered: every link is minted per package by
 *    `create_service_invite`.
 *
 *  • A LEGACY recovery organisation has no published service. They keep the
 *    original reusable centre link, unchanged.
 */
export default function RegistrationLink({ onBack }: { onBack: () => void }) {
  const { org, profile, platformName, refresh } = useBranding();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Which kind of organisation is this? Decided by what is actually published.
  const [services, setServices] = useState<CentreServiceRow[] | null>(null);
  useEffect(() => {
    let live = true;
    void getCentreServices()
      .then((rows) => live && setServices(rows))
      .catch(() => live && setServices([]));
    return () => {
      live = false;
    };
  }, []);

  const invitable = (services ?? []).filter(
    (s) => s.status === "published" && s.packages.some((p) => p.status === "active"),
  );
  const isUniversal = invitable.length > 0;

  const isAdmin = profile?.is_admin ?? false;
  const token = org?.invite_token ?? null;
  const link = token ? registerUrl(token) : null;

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
        <h1 className="mt-2 font-display text-2xl font-semibold text-ink">
          {isUniversal ? "Invite a patient" : "Registration link"}
        </h1>
        <p className="mt-1 max-w-xl text-[14px] leading-relaxed text-sage-600">
          {isUniversal
            ? "Choose the programme the patient is joining. Each programme has its own link, and the family who opens it is enrolled into exactly that programme."
            : "Share this link with a patient’s family. They register the patient and give consent; the patient then appears in your caseload, ready for you to add the plan."}
        </p>

        {services === null && (
          <div className="mt-6 rounded-2xl bg-white p-5 text-[14px] text-sage-500 shadow-lift ring-1 ring-ink/[0.05]">
            Loading your programmes…
          </div>
        )}

        {/* ---- Universal: one link per package, never the centre token ---- */}
        {services !== null && isUniversal && (
          <div className="mt-6 space-y-5">
            {invitable.map((service) => (
              <section key={service.id} className="rounded-2xl bg-white p-5 shadow-lift ring-1 ring-ink/[0.05]">
                <h2 className="font-display text-[17px] font-semibold text-ink">{service.name}</h2>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  {service.packages
                    .filter((p) => p.status === "active")
                    .map((p) => (
                      <div key={p.id} className="rounded-xl bg-mist/60 p-4 ring-1 ring-ink/[0.04]">
                        <div className="font-display text-[15px] font-semibold text-ink">{p.name}</div>
                        <div className="mt-0.5 text-[12.5px] text-sage-600">
                          {p.duration_days}-day programme
                        </div>
                        <PackageInviteLink pkg={p} />
                      </div>
                    ))}
                </div>
              </section>
            ))}
          </div>
        )}

        {/* ---- Legacy recovery organisation: the original centre link ---- */}
        {services !== null && !isUniversal && (
          <>
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
                    <button type="button" onClick={share} className="tap inline-flex items-center gap-1.5 rounded-xl bg-brand-800 px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-brand-900">
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
                    className="tap mt-3 inline-flex items-center gap-2 rounded-xl bg-brand-800 px-4 py-2.5 text-[14px] font-semibold text-white hover:bg-brand-900 disabled:opacity-60"
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
          </>
        )}
      </div>
    </div>
  );
}
