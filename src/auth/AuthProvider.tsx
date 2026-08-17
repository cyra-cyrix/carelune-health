import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { appUrl, passwordRecoveryRedirectUrl } from "../config/urls";

export type AuthResult = { error: string | null; needsEmailConfirm?: boolean };

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  /** True while the user arrived via a password-reset link and must set a new password. */
  passwordRecovery: boolean;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (email: string, password: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<AuthResult>;
  updatePassword: (newPassword: string) => Promise<AuthResult>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Owns the Supabase auth session for the whole app. Email/password only — no
 * external providers, no phone. Handles the password-recovery link flow so a
 * reset can complete end to end.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [passwordRecovery, setPasswordRecovery] = useState(false);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      setLoading(false);
      if (event === "PASSWORD_RECOVERY") setPasswordRecovery(true);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      passwordRecovery,
      async signIn(email, password) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        return { error: error?.message ?? null };
      },
      async signUp(email, password) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          // Public sign-up is the patient path; staff accounts are seeded with their role.
          options: { emailRedirectTo: appUrl("/"), data: { role: "patient" } },
        });
        if (error) return { error: error.message };
        // With "Confirm email" ON, Supabase returns a user but no session.
        return { error: null, needsEmailConfirm: !data.session };
      },
      async signOut() {
        await supabase.auth.signOut();
      },
      async sendPasswordReset(email) {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: passwordRecoveryRedirectUrl(),
        });
        return { error: error?.message ?? null };
      },
      async updatePassword(newPassword) {
        const { error } = await supabase.auth.updateUser({ password: newPassword });
        if (error) return { error: error.message };
        setPasswordRecovery(false);
        return { error: null };
      },
    }),
    [session, loading, passwordRecovery],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
