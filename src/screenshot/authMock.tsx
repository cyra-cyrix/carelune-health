// Screenshot-harness auth stub — swapped in for `src/auth/AuthProvider` so the
// branded login renders without a real Supabase session. Never bundled into the app.
import type { ReactNode } from "react";

const noop = async () => ({ error: null as string | null });

export function useAuth() {
  return {
    loading: false,
    session: null,
    user: null,
    passwordRecovery: false,
    signIn: noop,
    signUp: async () => ({ error: null as string | null, needsEmailConfirm: false }),
    sendPasswordReset: noop,
    updatePassword: noop,
    signOut: async () => {},
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
