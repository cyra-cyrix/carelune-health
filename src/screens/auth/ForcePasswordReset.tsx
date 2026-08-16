import { type FormEvent, useState } from "react";
import { LoopMark } from "../../components/ui";
import { useAuth } from "../../auth/AuthProvider";
import { useBranding } from "../../branding/BrandingProvider";
import { clearMustReset } from "../../lib/db";

/**
 * Shown right after first sign-in for any account created with a temporary
 * password. Blocks the app until the person sets their own password; then the
 * must_reset_password flag is cleared and branding reloads into the workspace.
 */
export default function ForcePasswordReset() {
  const { updatePassword, signOut } = useAuth();
  const { platformName, refresh } = useBranding();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 6) return setError("Use at least 6 characters.");
    if (password !== confirm) return setError("The two passwords don't match.");
    setBusy(true);
    try {
      const { error } = await updatePassword(password);
      if (error) {
        setError(error);
        return;
      }
      await clearMustReset();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update your password.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center bg-mist px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2.5 text-brand-600">
          <LoopMark size={28} />
          <div>
            <div className="font-display text-lg font-semibold tracking-tight text-ink">{platformName}</div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-sage-500">Care continues</div>
          </div>
        </div>

        <div className="mt-7 rounded-3xl border border-line bg-white p-6">
          <h1 className="font-display text-2xl font-semibold text-ink">Set your password</h1>
          <p className="mt-1 text-[13px] leading-relaxed text-sage-600">
            You signed in with a temporary password. Choose your own to continue.
          </p>

          <form onSubmit={submit} className="mt-5 space-y-3">
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="New password"
              className="w-full rounded-2xl bg-white px-4 py-3 text-[15px] text-ink ring-1 ring-line placeholder:text-sage-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
            />
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={6}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Confirm new password"
              className="w-full rounded-2xl bg-white px-4 py-3 text-[15px] text-ink ring-1 ring-line placeholder:text-sage-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
            />
            {error && (
              <p role="alert" className="rounded-2xl bg-coral-100 px-3.5 py-2 text-[13px] text-coral-600">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={busy}
              className="tap w-full rounded-2xl bg-brand-800 py-3 text-[15px] font-semibold text-white shadow-lift hover:bg-brand-900 disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save and continue"}
            </button>
          </form>
        </div>

        <button
          type="button"
          onClick={() => void signOut()}
          className="tap mt-4 block w-full text-center text-[13px] text-sage-600 hover:text-ink"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
