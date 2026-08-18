import { useEffect, useState } from "react";
import {
  addCaregiver, getStorefront, getSubscription, startTrial,
  type Storefront, type SubscriptionRow,
} from "../../lib/db";
import { credentialsText, shareOnWhatsApp, generatePassword } from "../../lib/share";
import { loginUrl as appLoginUrl } from "../../config/urls";
import { useBranding } from "../../branding/BrandingProvider";
import { useHc, BottomSheet, HcIcon } from "./hc-kit";
import { EmergencyBlock } from "./hc-safety";
import { TabHead } from "./HomeCareMedicines";

/* ============================================================================
   Help — coverage, the next review, the one emergency block, and family-only
   actions (care package + Add Caregiver). Raising a concern now lives in its own
   Messages section, so the emergency instruction is written in exactly one place
   on this surface. All backend behaviour is unchanged.

   Nothing promises 24/7. Care-team member NAMES aren't resolvable to the
   household under RLS, so coverage is described by role + hours. A private
   patient-scoped photo/video upload is NOT offered: household storage inserts
   are staff-only (is_staff() in the storage.objects policy) — see the gap report.
   ========================================================================== */

export function HomeCareHelp() {
  const { patient, plan, role, goTab } = useHc();
  const { org } = useBranding();
  const hours = org?.service_hours?.trim();

  const nextReview = (plan?.content?.review_dates ?? [])
    .map((r) => ({ ...r, t: new Date(r.date).getTime() }))
    .filter((r) => !Number.isNaN(r.t) && r.t >= Date.now() - 86_400_000)
    .sort((a, b) => a.t - b.t)[0];

  return (
    <div style={{ paddingTop: 8 }}>
      <TabHead title="Help" sub="You’re not deciding alone." />

      {/* Coverage + next review (compact) */}
      <div className="hc-card" style={{ marginTop: 12 }}>
        <div className="hc-help-line">
          <span className="hl-ic"><HcIcon.Clock size={16} /></span>
          <span>{hours ? <>A nurse and coordinator answer during <b>{hours}</b>.</> : <>Your messages reach the care team; replies appear in your conversation above.</>}</span>
        </div>
        {nextReview && (
          <div className="hc-help-line" style={{ marginTop: 8 }}>
            <span className="hl-ic"><HcIcon.Calendar size={16} /></span>
            <span>Next review · <b>{new Date(nextReview.date).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}</b>{nextReview.purpose ? ` · ${nextReview.purpose}` : ""}</span>
          </div>
        )}
      </div>

      {/* The single emergency instruction for this surface. */}
      <EmergencyBlock />

      <button type="button" className="hc-row-btn" onClick={() => goTab("messages")}>
        <span className="rb-ic"><HcIcon.Chat size={20} /></span>
        <span className="rb-body"><b>Raise a concern</b><span>Send it to the care team and follow the reply</span></span>
        <HcIcon.Right size={18} />
      </button>

      {/* Family-only actions */}
      {role === "family" && (
        <>
          <PackageRow patientId={patient.id} />
          <AddCaregiver patientId={patient.id} />
        </>
      )}
    </div>
  );
}

/* ------------------------------ care package ----------------------------- */

function PackageRow({ patientId }: { patientId: string }) {
  const [sf, setSf] = useState<Storefront | null>(null);
  const [sub, setSub] = useState<SubscriptionRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([getStorefront().catch(() => null), getSubscription(patientId).catch(() => null)])
      .then(([s, u]) => { if (active) { setSf(s); setSub(u); } });
    return () => { active = false; };
  }, [patientId]);

  if (!sf?.package_name && !sub) return null;
  const price = sub?.price ?? sf?.package_price ?? null;
  const name = sub?.plan_name ?? sf?.package_name ?? "Care package";
  const includes = (sf?.package_includes ?? "").split("\n").map((s) => s.trim()).filter(Boolean);
  const trialDays = sf?.trial_days ?? 0;

  const start = async () => { setBusy(true); try { setSub(await startTrial(patientId)); } catch { /* surfaced on retry */ } finally { setBusy(false); } };

  return (
    <>
      <button type="button" className="hc-row-btn" onClick={() => setOpen(true)}>
        <span className="rb-ic"><HcIcon.Heart size={20} /></span>
        <span className="rb-body">
          <b>{name}</b>
          <span>{sub ? (sub.status === "trial" ? "Free trial active" : "Active") : price ? `₹${price.toLocaleString("en-IN")}/month · settled at your centre` : "View details"}</span>
        </span>
        <HcIcon.Right size={18} />
      </button>
      {open && (
        <BottomSheet title={name} onClose={() => setOpen(false)}>
          {price != null && <p className="hc-muted" style={{ padding: 0 }}><b style={{ color: "var(--ink)", fontSize: 18 }}>₹{price.toLocaleString("en-IN")}</b> / month — settled at your centre.</p>}
          {includes.length > 0 && (
            <ul style={{ listStyle: "none", padding: 0, margin: "12px 0 0" }}>
              {includes.map((it, i) => (
                <li key={i} style={{ display: "flex", gap: 8, padding: "6px 0", fontSize: 13.5, color: "var(--slate)" }}>
                  <span style={{ color: "var(--ok)", flex: "none" }}><HcIcon.Check size={16} /></span>{it}
                </li>
              ))}
            </ul>
          )}
          {!sub && (
            <button type="button" className="hc-save" onClick={start} disabled={busy}>
              {busy ? "Starting…" : trialDays > 0 ? `Start ${trialDays}-day free trial` : "Join the programme"}
            </button>
          )}
          <p className="hc-muted" style={{ padding: 0, marginTop: 10, textAlign: "center" }}>
            {sub ? "Fees are settled at your centre." : trialDays > 0 ? "No payment now. Fees are settled at your centre after the trial." : "Fees are settled at your centre — nothing is charged here."}
          </p>
        </BottomSheet>
      )}
    </>
  );
}

/* ------------------------------ add caregiver ---------------------------- */

function AddCaregiver({ patientId }: { patientId: string }) {
  const { platformName } = useBranding();
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState(generatePassword);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);

  const submit = async () => {
    setBusy(true); setError(null);
    try {
      await addCaregiver({ patient_id: patientId, full_name: fullName, email, password });
      setCreated({ email, password });
      setFullName(""); setEmail(""); setPassword(generatePassword());
    } catch (e) { setError(e instanceof Error ? e.message : "Could not add the caregiver."); }
    finally { setBusy(false); }
  };

  return (
    <>
      <button type="button" className="hc-row-btn" onClick={() => setOpen(true)}>
        <span className="rb-ic"><HcIcon.Users size={20} /></span>
        <span className="rb-body"><b>Add a caregiver</b><span>The person who does the daily care at home</span></span>
        <HcIcon.Right size={18} />
      </button>
      {open && (
        <BottomSheet title="Add a caregiver" onClose={() => { setOpen(false); setCreated(null); }}>
          {created ? (
            <div>
              <p className="hc-muted" style={{ padding: 0 }}>Caregiver added — <b style={{ color: "var(--ink)" }}>{created.email}</b>. Temporary password <b style={{ color: "var(--ink)" }}>{created.password}</b>; they reset it on first sign-in.</p>
              <button type="button" className="hc-save" onClick={() => shareOnWhatsApp(credentialsText({ platformName, loginUrl: appLoginUrl(), email: created.email, password: created.password, roleLabel: "Caregiver" }))}>
                <HcIcon.Phone size={16} /> Share on WhatsApp
              </button>
              <button type="button" className="hc-help-link" onClick={() => { setCreated(null); setOpen(false); }}>Done</button>
            </div>
          ) : (
            <div>
              <label className="hc-field" style={{ display: "block" }}>
                <div className="hc-lab"><b>Caregiver’s name</b></div>
                <input className="hc-num-in" style={{ fontSize: 16, fontWeight: 600, textAlign: "left" }} value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Full name" />
              </label>
              <label className="hc-field" style={{ display: "block" }}>
                <div className="hc-lab"><b>Caregiver’s email</b><span>becomes their login</span></div>
                <input className="hc-num-in" style={{ fontSize: 16, fontWeight: 600, textAlign: "left" }} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
              </label>
              <label className="hc-field" style={{ display: "block" }}>
                <div className="hc-lab"><b>Temporary password</b><span>they reset it on first sign-in</span></div>
                <div className="hc-step-row">
                  <input className="hc-num-in" style={{ fontSize: 16, fontFamily: "monospace", textAlign: "left" }} value={password} readOnly />
                  <button type="button" className="hc-stepbtn" aria-label="Regenerate password" onClick={() => setPassword(generatePassword())}>↻</button>
                </div>
              </label>
              {error && <p className="hc-muted" style={{ padding: 0, color: "var(--danger)", marginTop: 8 }}>{error}</p>}
              <button type="button" className="hc-save" onClick={submit} disabled={busy || !email || password.length < 6}>
                {busy ? "Adding…" : "Add caregiver"}
              </button>
            </div>
          )}
        </BottomSheet>
      )}
    </>
  );
}
