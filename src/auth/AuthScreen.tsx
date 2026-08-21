import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { LoopMark } from "../components/ui";
import { RecoveryTrajectory } from "../components/clinical";
import LegalPage, { LEGAL_PATHS, LEGAL_READY, type LegalPath } from "../screens/marketing/legal";
import { marketingBaseUrl } from "../config/urls";
import { computeAuthView } from "./authView";
import { useAuth } from "./AuthProvider";
import { PASSWORD_RULE_HINT, validateNewPassword } from "./passwordPolicy";

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
  const { loading, session, passwordRecovery, recoveryError } = useAuth();
  // Path routing (no router lib) on the APPLICATION domain. Here "/" and "/login"
  // both resolve to sign-in — the public marketing landing lives on the marketing
  // origin and is intentionally NOT bundled into this build. `?register=<token>`
  // is handled earlier in main.tsx and never reaches here.
  const [path, setPath] = useState(() => window.location.pathname);
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  // Once signed in, normalise "/login" back to "/" (keep any in-app hash route).
  useEffect(() => {
    if (session && window.location.pathname === "/login") {
      window.history.replaceState({}, "", "/" + window.location.hash);
      setPath("/");
    }
  }, [session]);
  // Until the legal layer is published, legal URLs must not expose placeholder pages —
  // send them safely back to the app root.
  useEffect(() => {
    if (!LEGAL_READY && (LEGAL_PATHS as readonly string[]).includes(window.location.pathname)) {
      window.history.replaceState({}, "", "/");
      setPath("/");
    }
  }, []);
  // Signed-out on the app domain: reflect the sign-in screen at "/login" so the URL
  // matches what is shown (Unauthenticated "/" → "/login"), without a history entry.
  useEffect(() => {
    const p = window.location.pathname;
    const onLegal = LEGAL_READY && (LEGAL_PATHS as readonly string[]).includes(p);
    if (!loading && !session && !passwordRecovery && !recoveryError && p !== "/login" && !onLegal) {
      window.history.replaceState({}, "", "/login" + window.location.hash);
      setPath("/login");
    }
  }, [loading, session, passwordRecovery, recoveryError]);

  // The routing decision is a pure helper (unit-tested in node); this component
  // just renders the chosen view + runs the URL-normalisation effects above.
  const view = computeAuthView({
    loading,
    hasSession: !!session,
    passwordRecovery,
    recoveryError: !!recoveryError,
    path,
    legalReady: LEGAL_READY,
    legalPaths: LEGAL_PATHS,
  });

  switch (view) {
    case "legal":
      return <LegalPage path={path as LegalPath} />;
    case "loading":
      return (
        <div className="grid min-h-screen place-items-center bg-midnight-900 text-brand-400">
          <div className="motion-safe:animate-breathe">
            <LoopMark size={44} />
          </div>
        </div>
      );
    case "recovery":
      return <SetNewPassword />;
    case "recovery-error":
      return <RecoveryLinkProblem message={recoveryError ?? ""} />;
    case "signin":
      // No session → sign-in. "Back to home" leaves the app for the public marketing site.
      return <AuthScreen onHome={() => { window.location.href = marketingBaseUrl(); }} />;
    case "app":
      return <>{children}</>;
  }
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

export function AuthScreen({ onHome }: { onHome?: () => void } = {}) {
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
      {onHome && (
        <button
          type="button"
          onClick={onHome}
          className="tap mb-4 -mt-1 inline-flex items-center gap-1 text-[13px] font-medium text-sage-600 hover:text-ink"
        >
          ← Back to home
        </button>
      )}
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

/**
 * The Carelune "create new password" step for someone who arrived on a recovery
 * link. AuthGate renders this INSTEAD of the application, so a recovery session
 * — which is a fully authenticated session — can never reach a role workspace
 * before the password has actually been changed.
 */
function SetNewPassword() {
  const { updatePassword, completeRecovery } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const problem = validateNewPassword(password, confirm);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const { error } = await updatePassword(password);
      if (error) setError(error);
      else setDone(true);
    } finally {
      setBusy(false);
    }
  };

  // Success. Routing stays held here until the person continues, so the change
  // is unambiguously confirmed rather than flashing past into a dashboard.
  if (done) {
    return (
      <AuthShell>
        <h2 className="font-display text-[26px] font-semibold tracking-[-0.01em] text-ink">
          Password updated
        </h2>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-sage-600">
          Your new password is saved. You can use it the next time you sign in.
        </p>
        <p
          role="status"
          className="mt-5 rounded-2xl bg-good-100 px-3.5 py-2.5 text-[13px] text-good-600 ring-1 ring-good-500/20"
        >
          Password changed successfully.
        </p>
        <button type="button" onClick={completeRecovery} className={`${SUBMIT} !mt-5`}>
          Continue to Carelune
        </button>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <h2 className="font-display text-[26px] font-semibold tracking-[-0.01em] text-ink">
        Create new password
      </h2>
      <p className="mt-1.5 text-[13.5px] leading-relaxed text-sage-600">
        Choose a new password for your Carelune account. {PASSWORD_RULE_HINT}
      </p>
      <form onSubmit={submit} className="mt-7 space-y-3" noValidate>
        <div>
          <label htmlFor="new-password" className="mb-1.5 block text-[12.5px] font-semibold text-sage-600">
            New password
          </label>
          <input
            id="new-password"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className={FIELD}
          />
        </div>
        <div>
          <label htmlFor="confirm-password" className="mb-1.5 block text-[12.5px] font-semibold text-sage-600">
            Confirm password
          </label>
          <input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="••••••••"
            className={FIELD}
          />
        </div>
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

/**
 * An expired or already-used reset link. Without this the person would be
 * dropped on the sign-in screen with no explanation of why the link did nothing.
 */
function RecoveryLinkProblem({ message }: { message: string }) {
  const { dismissRecoveryError } = useAuth();
  return (
    <AuthShell>
      <h2 className="font-display text-[26px] font-semibold tracking-[-0.01em] text-ink">
        This link has expired
      </h2>
      <p role="alert" className="mt-5 rounded-2xl bg-coral-100 px-3.5 py-2.5 text-[13px] leading-relaxed text-coral-600 ring-1 ring-coral-200">
        {message}
      </p>
      <p className="mt-4 text-[13.5px] leading-relaxed text-sage-600">
        Your password has not been changed. Request a fresh link from the sign-in
        screen and open it on this device.
      </p>
      <button type="button" onClick={dismissRecoveryError} className={`${SUBMIT} !mt-5`}>
        Back to sign in
      </button>
    </AuthShell>
  );
}
