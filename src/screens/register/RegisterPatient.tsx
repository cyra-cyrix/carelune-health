import { useEffect, useState } from "react";
import { registerPatient, getPublicOrgInfo, type PublicOrgInfo } from "../../lib/db";
import { loginUrl } from "../../config/urls";
import { CARE_PACKAGE } from "../../domain/carePackage";

const inr = (n: number | null | undefined) => (n == null ? null : `₹${n.toLocaleString("en-IN")}`);

const FIELD =
  "w-full rounded-xl bg-white px-3.5 py-2.5 text-[15px] text-ink ring-1 ring-ink/10 placeholder:text-sage-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500";

const LABEL = "mb-1 block text-[12px] font-semibold text-sage-600";

/**
 * Public patient self-registration (no login). A family opens the org's
 * registration link (?register=<token>), enters the patient + their own login +
 * consent, and submits. The registry Edge Function (authorised by the token)
 * creates the family account + a PENDING patient. The doctor adds the plan next.
 */
export default function RegisterPatient({ token }: { token: string }) {
  const [pName, setPName] = useState("");
  const [age, setAge] = useState("");
  const [sex, setSex] = useState<"M" | "F" | "O" | "">("");
  const [location, setLocation] = useState("");
  const [discharged, setDischarged] = useState("");

  const [fName, setFName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [relation, setRelation] = useState("");

  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  // White-label institution + price for the token-linked link (public lookup).
  const [org, setOrg] = useState<PublicOrgInfo | null>(null);
  useEffect(() => {
    void getPublicOrgInfo(token).then(setOrg).catch(() => setOrg(null));
  }, [token]);

  const institution = org?.institution_name?.trim() || "Your care team";
  const priceLabel = inr(org?.package_price);
  const trialLabel = org && org.trial_days > 0 ? `${org.trial_days}-day free trial` : null;

  const canSubmit =
    pName.trim().length > 1 &&
    fName.trim().length > 1 &&
    email.trim().length > 3 &&
    password.length >= 6 &&
    consent &&
    !busy;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await registerPatient({
        token,
        patient: { full_name: pName, age, sex, location, discharged_on: discharged },
        family: { full_name: fName, email, password, phone, relation },
      });
      setDone(res.family_email);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not register. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const goToSignIn = () => {
    window.location.href = loginUrl();
  };

  return (
    <div className="min-h-screen bg-mist px-4 py-8">
      <div className="mx-auto w-full max-w-md">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-600 text-[15px] font-bold text-white">
            {(institution?.trim()?.[0] ?? "•").toUpperCase()}
          </span>
          <div>
            <div className="font-display text-lg font-semibold tracking-tight text-ink">{institution}</div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-sage-500">Recovery programme</div>
          </div>
        </div>

        {done ? (
          <div className="mt-6 rounded-3xl bg-white p-6 shadow-lift ring-1 ring-ink/[0.05]">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-good-500 text-white">✓</div>
            <h1 className="mt-4 text-center font-display text-xl font-semibold text-ink">You&rsquo;re registered</h1>
            <p className="mt-2 text-center text-[14px] leading-relaxed text-sage-600">
              Sign in with <span className="font-semibold text-ink">{done}</span> and the password you chose. Your
              care team will prepare the recovery plan.
            </p>
            <button
              type="button"
              onClick={goToSignIn}
              className="tap mt-5 w-full rounded-xl bg-brand-800 py-3 text-[15px] font-semibold text-white hover:bg-brand-900"
            >
              Go to sign in
            </button>
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            <div>
              <h1 className="font-display text-2xl font-semibold text-ink">Register the patient</h1>
              <p className="mt-1 text-[14px] leading-relaxed text-sage-600">
                Enter the patient&rsquo;s details and create your own login. You&rsquo;ll follow their recovery from
                here.
              </p>
            </div>

            {/* Package summary — institution's name, programme, duration, price */}
            <section className="rounded-2xl bg-white p-4 shadow-lift ring-1 ring-ink/[0.05]">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-sage-500">{institution}</div>
              <div className="mt-1 font-display text-[19px] font-semibold tracking-tight text-ink">
                {CARE_PACKAGE.name}
              </div>
              <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="text-[12.5px] font-medium text-sage-500">{CARE_PACKAGE.durationLabel}</span>
                {priceLabel && (
                  <span className="text-[16px] font-semibold text-brand-700">
                    {priceLabel}<span className="text-[12px] font-medium text-sage-500">/month</span>
                  </span>
                )}
                {trialLabel && (
                  <span className="rounded-full bg-good-100 px-2.5 py-0.5 text-[11.5px] font-semibold text-good-600">
                    {trialLabel}
                  </span>
                )}
              </div>
              <ul className="mt-3 grid gap-1.5">
                {CARE_PACKAGE.includes.map((b) => (
                  <li key={b} className="flex items-start gap-2 text-[13px] text-sage-700">
                    <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-good-500 text-[9px] font-bold text-white">✓</span>
                    {b}
                  </li>
                ))}
              </ul>
              <p className="mt-2.5 text-[11.5px] text-sage-500">
                Billing is handled directly by {institution}. Nothing is charged here.
              </p>
            </section>

            {/* Patient */}
            <section className="rounded-2xl bg-white p-4 shadow-lift ring-1 ring-ink/[0.05]">
              <h2 className="font-display text-[15px] font-semibold text-ink">Patient</h2>
              <div className="mt-3 space-y-3">
                <label className="block">
                  <span className={LABEL}>Full name</span>
                  <input value={pName} onChange={(e) => setPName(e.target.value)} placeholder="Patient's name" className={FIELD} />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className={LABEL}>Age</span>
                    <input value={age} onChange={(e) => setAge(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="e.g. 64" className={FIELD} />
                  </label>
                  <label className="block">
                    <span className={LABEL}>Sex</span>
                    <select value={sex} onChange={(e) => setSex(e.target.value as typeof sex)} className={FIELD}>
                      <option value="">—</option>
                      <option value="M">Male</option>
                      <option value="F">Female</option>
                      <option value="O">Other</option>
                    </select>
                  </label>
                </div>
                <label className="block">
                  <span className={LABEL}>Location</span>
                  <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Area, city" className={FIELD} />
                </label>
                <label className="block">
                  <span className={LABEL}>Discharged on</span>
                  <input type="date" value={discharged} onChange={(e) => setDischarged(e.target.value)} className={FIELD} />
                </label>
              </div>
            </section>

            {/* You */}
            <section className="rounded-2xl bg-white p-4 shadow-lift ring-1 ring-ink/[0.05]">
              <h2 className="font-display text-[15px] font-semibold text-ink">Your login</h2>
              <div className="mt-3 space-y-3">
                <label className="block">
                  <span className={LABEL}>Your name</span>
                  <input value={fName} onChange={(e) => setFName(e.target.value)} placeholder="Your full name" className={FIELD} />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className={LABEL}>Relation to patient</span>
                    <input value={relation} onChange={(e) => setRelation(e.target.value)} placeholder="e.g. son, wife" className={FIELD} />
                  </label>
                  <label className="block">
                    <span className={LABEL}>Phone</span>
                    <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="Mobile" className={FIELD} />
                  </label>
                </div>
                <label className="block">
                  <span className={LABEL}>Email (this is your login)</span>
                  <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="you@email.com" className={FIELD} />
                </label>
                <label className="block">
                  <span className={LABEL}>Choose a password</span>
                  <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="At least 6 characters" className={FIELD} />
                </label>
              </div>
            </section>

            {/* Consent */}
            <label className="flex items-start gap-3 rounded-2xl bg-white p-4 shadow-lift ring-1 ring-ink/[0.05]">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-brand-600" />
              <span className="text-[13px] leading-relaxed text-sage-700">
                I consent, on behalf of the patient, to {institution} and its care team processing the patient&rsquo;s
                health information — including AI-assisted structuring of the discharge summary — to support their
                recovery.
              </span>
            </label>

            {error && <p className="rounded-xl bg-coral-100 px-3.5 py-2 text-[13px] text-coral-600">{error}</p>}

            <button
              type="button"
              onClick={submit}
              disabled={!canSubmit}
              className="tap w-full rounded-xl bg-brand-800 py-3 text-[15px] font-semibold text-white shadow-lift hover:bg-brand-900 disabled:opacity-50"
            >
              {busy ? "Registering…" : "Register"}
            </button>

            <p className="px-1 pb-4 text-center text-[12px] text-sage-500">
              Already registered?{" "}
              <button type="button" onClick={goToSignIn} className="font-semibold text-brand-700 hover:text-brand-600">
                Sign in
              </button>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
