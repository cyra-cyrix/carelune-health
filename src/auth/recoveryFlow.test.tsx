// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AuthProvider } from "./AuthProvider";
import { AuthGate } from "./AuthScreen";
import { captureRecoveryLink, clearCapturedRecoveryLink } from "./recoveryLink";

/*
 * The hosted-staging blocker, pinned end to end.
 *
 * A Supabase recovery link authenticates the person for real — the session it
 * creates is indistinguishable from a normal one. The regression was that the
 * app saw that session and routed a Super Admin straight to the console, with
 * no chance to set a password. `supa.emit` is deliberately NOT called in that
 * test: it reproduces the actual race, where auth-js consumed the URL and fired
 * PASSWORD_RECOVERY before React ever subscribed.
 */
const supa = vi.hoisted(() => {
  let listener: ((event: string, session: unknown) => void) | null = null;
  const state = { session: null as unknown };
  return {
    setSession(s: unknown) {
      state.session = s;
    },
    emit(event: string, session: unknown) {
      listener?.(event, session);
    },
    auth: {
      getSession: vi.fn(async () => ({ data: { session: state.session } })),
      onAuthStateChange: vi.fn((fn: (event: string, session: unknown) => void) => {
        listener = fn;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
      signInWithPassword: vi.fn(async () => ({ error: null })),
      // Typed so a test can also make the server reject the new password.
      updateUser: vi.fn(async (): Promise<{ error: { message: string } | null }> => ({ error: null })),
      signOut: vi.fn(async () => ({ error: null })),
      resetPasswordForEmail: vi.fn(async () => ({ error: null })),
    },
  };
});

vi.mock("../lib/supabase", () => ({ supabase: { auth: supa.auth } }));

/** Stands in for <App/> — if this appears, the gate let the application through. */
const APP = "super-admin-console";
function FakeApp() {
  return <div data-testid={APP}>Super Admin console</div>;
}

const superAdminSession = { user: { id: "u-super", email: "admin@carelune.in" } };

function renderApp() {
  return render(
    <AuthProvider>
      <AuthGate>
        <FakeApp />
      </AuthGate>
    </AuthProvider>,
  );
}

const resetHeading = () => screen.queryByRole("heading", { name: /create new password/i });

beforeEach(() => {
  vi.clearAllMocks();
  clearCapturedRecoveryLink();
  supa.setSession(null);
  supa.auth.updateUser.mockResolvedValue({ error: null });
  window.history.replaceState({}, "", "/");
});

afterEach(cleanup);

describe("password recovery", () => {
  it("1. leaves normal email/password login routing untouched", async () => {
    renderApp();
    // Signed out → the sign-in screen, not the app.
    await waitFor(() => expect(screen.getByRole("heading", { name: /^sign in$/i })).toBeTruthy());
    expect(screen.queryByTestId(APP)).toBeNull();

    // A normal sign-in emits SIGNED_IN and lands in the application.
    await act(async () => supa.emit("SIGNED_IN", superAdminSession));
    await waitFor(() => expect(screen.getByTestId(APP)).toBeTruthy());
    expect(resetHeading()).toBeNull();
  });

  it("2. opens the reset screen when the PASSWORD_RECOVERY event arrives", async () => {
    renderApp();
    await waitFor(() => expect(screen.getByRole("heading", { name: /^sign in$/i })).toBeTruthy());

    await act(async () => supa.emit("PASSWORD_RECOVERY", superAdminSession));

    await waitFor(() => expect(resetHeading()).toBeTruthy());
    expect(screen.getByLabelText(/new password/i)).toBeTruthy();
    expect(screen.getByLabelText(/confirm password/i)).toBeTruthy();
  });

  it("3. holds a recovery Super Admin on the reset screen — even when the event was missed", async () => {
    // The real hosted failure: auth-js already consumed the hash and emitted the
    // event before React mounted, so only the captured URL reveals the recovery.
    captureRecoveryLink({ hash: "#access_token=abc&type=recovery", search: "" });
    supa.setSession(superAdminSession);

    renderApp();

    await waitFor(() => expect(resetHeading()).toBeTruthy());
    // The whole point: an authenticated Super Admin must NOT reach the console.
    expect(screen.queryByTestId(APP)).toBeNull();
  });

  it("4. rejects mismatched passwords without calling Supabase", async () => {
    captureRecoveryLink({ hash: "#access_token=abc&type=recovery", search: "" });
    supa.setSession(superAdminSession);
    renderApp();
    await waitFor(() => expect(resetHeading()).toBeTruthy());

    fireEvent.change(screen.getByLabelText(/new password/i), { target: { value: "correct-horse" } });
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: "correct-hoarse" } });
    fireEvent.click(screen.getByRole("button", { name: /save new password/i }));

    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/don't match/i));
    expect(supa.auth.updateUser).not.toHaveBeenCalled();
    // Still held on the reset screen.
    expect(screen.queryByTestId(APP)).toBeNull();
  });

  it("4b. rejects a password under the minimum length", async () => {
    captureRecoveryLink({ hash: "#access_token=abc&type=recovery", search: "" });
    supa.setSession(superAdminSession);
    renderApp();
    await waitFor(() => expect(resetHeading()).toBeTruthy());

    fireEvent.change(screen.getByLabelText(/new password/i), { target: { value: "short" } });
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: "short" } });
    fireEvent.click(screen.getByRole("button", { name: /save new password/i }));

    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/8 characters/i));
    expect(supa.auth.updateUser).not.toHaveBeenCalled();
  });

  it("5. completes the reset through supabase.auth.updateUser and confirms it", async () => {
    captureRecoveryLink({ hash: "#access_token=abc&type=recovery", search: "" });
    supa.setSession(superAdminSession);
    renderApp();
    await waitFor(() => expect(resetHeading()).toBeTruthy());

    fireEvent.change(screen.getByLabelText(/new password/i), { target: { value: "correct-horse" } });
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: "correct-horse" } });
    fireEvent.click(screen.getByRole("button", { name: /save new password/i }));

    await waitFor(() => expect(supa.auth.updateUser).toHaveBeenCalledWith({ password: "correct-horse" }));
    // A clear success state, not a silent jump into the app.
    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/changed successfully/i));
    expect(screen.queryByTestId(APP)).toBeNull();
  });

  it("5b. surfaces a server-side rejection and stays on the reset screen", async () => {
    captureRecoveryLink({ hash: "#access_token=abc&type=recovery", search: "" });
    supa.setSession(superAdminSession);
    supa.auth.updateUser.mockResolvedValue({ error: { message: "New password should be different." } });
    renderApp();
    await waitFor(() => expect(resetHeading()).toBeTruthy());

    fireEvent.change(screen.getByLabelText(/new password/i), { target: { value: "correct-horse" } });
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: "correct-horse" } });
    fireEvent.click(screen.getByRole("button", { name: /save new password/i }));

    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/should be different/i));
    expect(screen.queryByTestId(APP)).toBeNull();
  });

  it("6. resumes normal role routing once the reset is confirmed", async () => {
    captureRecoveryLink({ hash: "#access_token=abc&type=recovery", search: "" });
    supa.setSession(superAdminSession);
    renderApp();
    await waitFor(() => expect(resetHeading()).toBeTruthy());

    fireEvent.change(screen.getByLabelText(/new password/i), { target: { value: "correct-horse" } });
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: "correct-horse" } });
    fireEvent.click(screen.getByRole("button", { name: /save new password/i }));
    await waitFor(() => expect(screen.getByRole("status")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /continue to carelune/i }));

    // Only now does the Super Admin reach the console.
    await waitFor(() => expect(screen.getByTestId(APP)).toBeTruthy());
  });

  it("7. explains an expired link instead of showing the app or a bare sign-in", async () => {
    captureRecoveryLink({
      hash: "#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired",
      search: "",
    });
    supa.setSession(null);

    renderApp();

    await waitFor(() => expect(screen.getByRole("heading", { name: /this link has expired/i })).toBeTruthy());
    expect(screen.getByRole("alert").textContent).toMatch(/expired/i);
    expect(screen.queryByTestId(APP)).toBeNull();
    expect(resetHeading()).toBeNull();

    // And it offers a way forward rather than a dead end.
    fireEvent.click(screen.getByRole("button", { name: /back to sign in/i }));
    await waitFor(() => expect(screen.getByRole("heading", { name: /^sign in$/i })).toBeTruthy());
  });
});
