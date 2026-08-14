import { useState } from "react";
import { LoopMark } from "../../components/ui";
import { useBranding } from "../../branding/BrandingProvider";
import { updateOrgBranding } from "../../lib/db";

/**
 * Admin first-run. The org owner names their platform (what everyone in the org
 * will see instead of "Carelune"). Logo upload + subdomain come next; for now
 * an optional logo URL. On save the app rebrands and moves into the workspace.
 */
export default function OrgSetup() {
  const { org, profile, refresh } = useBranding();
  const [name, setName] = useState(org?.display_name ?? "");
  const [logoUrl, setLogoUrl] = useState(org?.logo_url ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!name.trim() || !org) return;
    setBusy(true);
    setError(null);
    try {
      await updateOrgBranding(org.id, {
        display_name: name.trim(),
        logo_url: logoUrl.trim() || null,
        setup_complete: true,
      });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save. Please try again.");
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center bg-mist px-5 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-2 text-brand-600">
          <LoopMark size={22} />
          <span className="text-[15px] font-semibold text-ink">Carelune</span>
        </div>

        <h1 className="font-display text-2xl font-semibold text-ink">Set up your platform</h1>
        <p className="mt-1.5 text-[14px] leading-relaxed text-sage-600">
          Welcome{profile?.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}. Name the platform your
          team and families will see. You can change it later.
        </p>

        <div className="mt-6 rounded-2xl bg-white p-5 shadow-lift ring-1 ring-ink/[0.05]">
          <label className="block">
            <span className="mb-1 block text-[12px] font-semibold text-sage-600">Platform name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Dr. Vivek — Care Continues"
              className="w-full rounded-xl bg-white px-3 py-2.5 text-[15px] text-ink ring-1 ring-line focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
            />
          </label>

          <label className="mt-4 block">
            <span className="mb-1 block text-[12px] font-semibold text-sage-600">Logo URL (optional)</span>
            <input
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://…  (image upload coming soon)"
              className="w-full rounded-xl bg-white px-3 py-2.5 text-[14px] text-ink ring-1 ring-line focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
            />
          </label>

          {name.trim() && (
            <div className="mt-4 flex items-center gap-2 rounded-xl bg-mist px-3 py-2.5 ring-1 ring-ink/[0.05]">
              {logoUrl.trim() ? (
                <img src={logoUrl} alt="" className="h-5 w-5 rounded object-cover" />
              ) : (
                <LoopMark size={18} />
              )}
              <span className="text-[13px] text-sage-600">
                Preview: <span className="font-semibold text-ink">{name.trim()}</span>
              </span>
            </div>
          )}

          {error && <p className="mt-3 text-[13px] text-coral-600">{error}</p>}

          <button
            type="button"
            onClick={save}
            disabled={!name.trim() || busy}
            className="tap mt-5 w-full rounded-xl bg-brand-600 py-2.5 text-[15px] font-semibold text-white hover:bg-brand-500 disabled:opacity-60"
          >
            {busy ? "Saving…" : "Continue"}
          </button>
        </div>

        <p className="mt-4 text-center text-[12px] text-sage-500">
          Next you&rsquo;ll add your team and onboard your first patient.
        </p>
      </div>
    </div>
  );
}
