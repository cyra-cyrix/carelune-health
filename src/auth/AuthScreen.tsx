import { type FormEvent, type ReactNode, useState } from "react";
import { LoopMark } from "../components/ui";
import { useAuth } from "./AuthProvider";

type Mode = "signin" | "signup" | "reset";

const FIELD =
  "w-full rounded-2xl bg-white px-4 py-3 text-[15px] text-ink ring-1 ring-ink/10 " +
  "placeholder:text-sage-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400";

/**
 * The login gate. While the session is loading, shows a splash; when the user
 * arrived via a reset link, shows "set a new password"; when signed out, shows
 * the auth form; otherwise renders the app with a lightweight sign-out control.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { loading, session, passwordRecovery } = useAuth();

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-mist text-brand-600">
        <LoopMark size={40} />
      </div>
    );
  }

  if (passwordRecovery) return <SetNewPassword />;
  if (!session) return <AuthScreen />;

  return <>{children}</>;
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen place-items-center bg-mist px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2.5 text-brand-600">
          <LoopMark size={30} />
          <div>
            <div className="font-display text-xl font-semibold tracking-tight text-ink">Carelune</div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-sage-500">
              Care continues.
            </div>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

export function AuthScreen() {
  const { signIn, signUp, sendPasswordReset } = useAuth();
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
      } else if (mode === "signup") {
        const { error, needsEmailConfirm } = await signUp(addr, password);
        if (error) setError(error);
        else if (needsEmailConfirm)
          setNotice("Account created. Check your email to confirm, then sign in.");
        // If confirmation is off, the session change signs the user straight in.
      } else {
        const { error } = await sendPasswordReset(addr);
        if (error) setError(error);
        else setNotice("If that email has an account, a reset link is on its way.");
      }
    } finally {
      setBusy(false);
    }
  };

  const title =
    mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Reset password";
  const cta = mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link";

  return (
    <Shell>
      <div className="mt-8 rounded-3xl bg-white p-6 border border-line">
        <h1 className="font-display text-2xl font-semibold text-ink">{title}</h1>
        <p className="mt-1 text-[13px] text-sage-600">
          {mode === "reset"
            ? "Enter your email and we'll send a link to set a new password."
            : "Carelune rehab-discharge continuity. Staff accounts are created for you; patients sign up here."}
        </p>

        <form onSubmit={submit} className="mt-5 space-y-3">
          <div>
            <label htmlFor="email" className="sr-only">
              Email
            </label>
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
              <label htmlFor="password" className="sr-only">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                className={FIELD}
              />
            </div>
          )}

          {error && (
            <p role="alert" className="rounded-2xl bg-coral-100 px-3.5 py-2 text-[13px] text-coral-600">
              {error}
            </p>
          )}
          {notice && (
            <p className="rounded-2xl bg-good-100 px-3.5 py-2 text-[13px] text-good-600">{notice}</p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="tap w-full rounded-2xl bg-brand-600 py-3 text-[15px] font-semibold text-white shadow-lift transition-colors hover:bg-brand-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 disabled:opacity-50"
          >
            {busy ? "Working…" : cta}
          </button>
        </form>

        <div className="mt-4 space-y-1.5 text-[13px]">
          {mode === "signin" && (
            <>
              <button type="button" onClick={() => reset("reset")} className="tap block text-brand-700 hover:text-brand-600">
                Forgot your password?
              </button>
              <p className="text-sage-600">
                New patient?{" "}
                <button type="button" onClick={() => reset("signup")} className="font-semibold text-brand-700 hover:text-brand-600">
                  Create an account
                </button>
              </p>
            </>
          )}
          {mode === "signup" && (
            <p className="text-sage-600">
              Already have an account?{" "}
              <button type="button" onClick={() => reset("signin")} className="font-semibold text-brand-700 hover:text-brand-600">
                Sign in
              </button>
            </p>
          )}
          {mode === "reset" && (
            <button type="button" onClick={() => reset("signin")} className="tap block text-brand-700 hover:text-brand-600">
              ← Back to sign in
            </button>
          )}
        </div>
      </div>

      <p className="mt-5 px-1 text-[11px] leading-relaxed text-sage-600">
        Fictional demonstration data — not approved for clinical use. No real patient information.
      </p>
    </Shell>
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
      // On success the recovery flag clears and the app renders.
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell>
      <div className="mt-8 rounded-3xl bg-white p-6 border border-line">
        <h1 className="font-display text-2xl font-semibold text-ink">Set a new password</h1>
        <p className="mt-1 text-[13px] text-sage-600">Choose a new password for your account.</p>
        <form onSubmit={submit} className="mt-5 space-y-3">
          <label htmlFor="new-password" className="sr-only">
            New password
          </label>
          <input
            id="new-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="New password"
            className={FIELD}
          />
          {error && (
            <p role="alert" className="rounded-2xl bg-coral-100 px-3.5 py-2 text-[13px] text-coral-600">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="tap w-full rounded-2xl bg-brand-600 py-3 text-[15px] font-semibold text-white shadow-lift transition-colors hover:bg-brand-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save new password"}
          </button>
        </form>
      </div>
    </Shell>
  );
}
