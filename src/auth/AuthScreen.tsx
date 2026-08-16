import { type FormEvent, type ReactNode, useState } from "react";
import { LoopMark } from "../components/ui";
import { RecoveryTrajectory } from "../components/clinical";
import { useAuth } from "./AuthProvider";

type Mode = "signin" | "reset";

const FIELD =
  "w-full rounded-2xl bg-white px-4 py-3 text-[15px] text-ink ring-1 ring-line " +
  "placeholder:text-sage-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 transition-shadow";

const SUBMIT =
  "tap w-full rounded-2xl bg-brand-800 py-3 text-[15px] font-semibold text-white shadow-sm transition-colors " +
  "hover:bg-brand-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 disabled:opacity-50";

/**
 * The login gate. While the session is loading, shows a splash; when the user
 * arrived via a reset link, shows "set a new password"; when signed out, shows
 * the branded auth screen; otherwise renders the app.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { loading, session, passwordRecovery } = useAuth();

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-midnight-900 text-brand-400">
        <div className="motion-safe:animate-breathe">
          <LoopMark size={44} />
        </div>
      </div>
    );
  }

  if (passwordRecovery) return <SetNewPassword />;
  if (!session) return <AuthScreen />;

  return <>{children}</>;
}

/* ------------------------------ branded shell ----------------------------- */

/**
 * A calm, institution-branded entry. Desktop is a two-column composition: a deep
 * midnight brand panel (authority + a subtle recovery trajectory) beside a very
 * simple sign-in form. Mobile keeps a compact brand header above the form.
 */
function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen bg-mist lg:grid-cols-[1.05fr_1fr]">
      {/* Brand panel — authority + the promise. */}
      <aside className="relative hidden overflow-hidden bg-midnight-900 lg:flex lg:flex-col lg:justify-between lg:p-14">
        {/* soft luminous field, not a random gradient */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(120% 80% at 15% 0%, rgba(42,111,199,0.28), transparent 55%), radial-gradient(90% 70% at 90% 100%, rgba(23,179,161,0.20), transparent 55%)",
          }}
        />
        <div className="relative flex items-center gap-2.5 text-haze-100">
          <LoopMark size={26} />
          <span className="font-display text-[17px] font-semibold tracking-tight">Carelune</span>
        </div>

        <div className="relative">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-haze-400">
            Recovery intelligence
          </div>
          <h1 className="mt-4 max-w-md font-display text-[40px] font-semibold leading-[1.08] tracking-[-0.02em] text-haze-100">
            Care continues after discharge.
          </h1>
          <p className="mt-4 max-w-sm text-[14.5px] leading-relaxed text-haze-300">
            The recovery team stays with every patient at home — visible, governed by
            the treating clinician, and answerable to the family.
          </p>
          <div className="mt-9 max-w-sm rounded-2xl bg-white/[0.05] p-4 ring-1 ring-white/10 backdrop-blur-sm">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-haze-400">
              Enabled recovery service
            </div>
            <div className="mt-1 text-[14px] font-semibold text-haze-100">
              Neuro &amp; spine recovery continuity
            </div>
            <div className="mt-3 opacity-90">
              <RecoveryTrajectory values={[3, 3.4, 3.2, 3.8, 4.3, 4.1, 4.7, 5.2]} tone="recovery" height={34} animate onDark />
            </div>
          </div>
        </div>

        <div className="relative text-[11.5px] leading-relaxed text-haze-400">
          Physician-governed · caregiver-operated · family-visible.<br />
          Fictional demonstration data — not for clinical use.
        </div>
      </aside>

      {/* Form column. */}
      <main className="flex flex-col justify-center px-6 py-10 sm:px-10">
        {/* compact brand header on mobile only */}
        <div className="mb-8 flex items-center gap-2.5 text-ink lg:hidden">
          <span className="text-brand-600"><LoopMark size={26} /></span>
          <div>
            <div className="font-display text-[17px] font-semibold tracking-tight">Carelune</div>
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-sage-500">
              Care continues after discharge.
            </div>
          </div>
        </div>
        <div className="mx-auto w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}

export function AuthScreen() {
  const { signIn, sendPasswordReset } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const reset = (m: Mode) => {
    setMode(m);
    setError(null);
    setNotice(null);
    setPassword("");
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const addr = email.trim();
      if (mode === "signin") {
        const { error } = await signIn(addr, password);
        if (error) setError(error);
      } else {
        const { error } = await sendPasswordReset(addr);
        if (error) setError(error);
        else setNotice("If that email has an account, a reset link is on its way.");
      }
    } finally {
      setBusy(false);
    }
  };

  const title = mode === "signin" ? "Sign in" : "Reset password";
  const cta = mode === "signin" ? "Sign in" : "Send reset link";

  return (
    <AuthShell>
      <h2 className="font-display text-[26px] font-semibold tracking-[-0.01em] text-ink">{title}</h2>
      <p className="mt-1.5 text-[13.5px] leading-relaxed text-sage-600">
        {mode === "reset"
          ? "Enter your email and we'll send a link to set a new password."
          : "Clinicians and care teams sign in here. New patients are added by their care team through a registration link."}
      </p>

      <form onSubmit={submit} className="mt-7 space-y-3">
        <div>
          <label htmlFor="email" className="mb-1.5 block text-[12.5px] font-semibold text-sage-600">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@clinic.in"
            className={FIELD}
          />
        </div>

        {mode !== "reset" && (
          <div>
            <label htmlFor="password" className="mb-1.5 block text-[12.5px] font-semibold text-sage-600">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className={FIELD}
            />
          </div>
        )}

        {error && (
          <p role="alert" className="rounded-2xl bg-coral-100 px-3.5 py-2 text-[13px] text-coral-600 ring-1 ring-coral-200">
            {error}
          </p>
        )}
        {notice && (
          <p className="rounded-2xl bg-good-100 px-3.5 py-2 text-[13px] text-good-600 ring-1 ring-good-500/20">{notice}</p>
        )}

        <button type="submit" disabled={busy} className={`${SUBMIT} !mt-5`}>
          {busy ? "Working…" : cta}
        </button>
      </form>

      <div className="mt-5 space-y-1.5 text-[13px]">
        {mode === "signin" ? (
          <button type="button" onClick={() => reset("reset")} className="tap block font-medium text-sky-700 hover:text-sky-800">
            Forgot your password?
          </button>
        ) : (
          <button type="button" onClick={() => reset("signin")} className="tap block font-medium text-sky-700 hover:text-sky-800">
            ← Back to sign in
          </button>
        )}
      </div>

      <p className="mt-10 text-[11px] leading-relaxed text-sage-500 lg:hidden">
        Fictional demonstration data — not approved for clinical use. No real patient information.
      </p>
    </AuthShell>
  );
}

function SetNewPassword() {
  const { updatePassword } = useAuth();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { error } = await updatePassword(password);
      if (error) setError(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell>
      <h2 className="font-display text-[26px] font-semibold tracking-[-0.01em] text-ink">Set a new password</h2>
      <p className="mt-1.5 text-[13.5px] text-sage-600">Choose a new password for your account.</p>
      <form onSubmit={submit} className="mt-7 space-y-3">
        <label htmlFor="new-password" className="mb-1.5 block text-[12.5px] font-semibold text-sage-600">New password</label>
        <input
          id="new-password"
          type="password"
          autoComplete="new-password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          className={FIELD}
        />
        {error && (
          <p role="alert" className="rounded-2xl bg-coral-100 px-3.5 py-2 text-[13px] text-coral-600 ring-1 ring-coral-200">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy} className={`${SUBMIT} !mt-5`}>
          {busy ? "Saving…" : "Save new password"}
        </button>
      </form>
    </AuthShell>
  );
}
