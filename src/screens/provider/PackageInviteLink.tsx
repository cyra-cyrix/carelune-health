import { useState } from "react";
import { createServiceInvite, type ServicePackageRow } from "../../lib/db";
import { registerUrl } from "../../config/urls";
import { shareOnWhatsApp } from "../../lib/share";
import { GhostButton } from "../../components/system";

/**
 * The registration link for ONE service package.
 *
 * This is the whole point of the universal invitation: the link is minted
 * against a specific package, so the family who opens it sees that programme
 * and is enrolled into exactly it. The token is opaque and server-minted — the
 * browser never holds a package id, and never sends one back at registration.
 *
 * Deliberately NOT the centre-level `centres.invite_token`: that token carries
 * no package, which is exactly why a universal link used to open the legacy
 * recovery registration.
 */
export function PackageInviteLink({ pkg }: { pkg: ServicePackageRow }) {
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      setLink(registerUrl(await createServiceInvite(pkg.id)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the link.");
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

  return (
    <div className="mt-3 border-t border-line pt-3">
      {link ? (
        <>
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-sage-500">
            Patient registration link
          </span>
          <input
            readOnly
            value={link}
            onFocus={(e) => e.currentTarget.select()}
            aria-label={`Registration link for ${pkg.name}`}
            className="w-full rounded-xl bg-mist px-3 py-2 text-[12px] text-ink ring-1 ring-ink/10"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <GhostButton onClick={copy}>{copied ? "Copied" : "Copy"}</GhostButton>
            <GhostButton
              onClick={() =>
                shareOnWhatsApp(`Please register the patient for ${pkg.name}. Open this link:\n${link}`)
              }
            >
              WhatsApp
            </GhostButton>
          </div>
        </>
      ) : (
        <GhostButton onClick={generate} disabled={busy}>
          {busy ? "Creating…" : "Generate patient link"}
        </GhostButton>
      )}
      {error && <p className="mt-2 text-[12px] text-coral-600">{error}</p>}
    </div>
  );
}
