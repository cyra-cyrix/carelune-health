import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { getMyOrg, getMyProfile, type OrgRow, type MyProfile } from "../lib/db";

type BrandingValue = {
  org: OrgRow | null;
  profile: MyProfile | null;
  loading: boolean;
  /** Platform name to show in chrome — the org's chosen name, else "Carelune". */
  platformName: string;
  refresh: () => Promise<void>;
};

const BrandingContext = createContext<BrandingValue | null>(null);

/**
 * Loads the signed-in user's org (tenant) branding and their profile once, so
 * the whole app can render the org's platform name/logo and know whether the
 * user is the admin. Sits inside AuthProvider, above the role surfaces.
 */
export function BrandingProvider({ children }: { children: ReactNode }) {
  const [org, setOrg] = useState<OrgRow | null>(null);
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const [o, p] = await Promise.all([getMyOrg(), getMyProfile()]);
    setOrg(o);
    setProfile(p);
  };

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        await load();
      } catch {
        // leave nulls; chrome falls back to the default brand
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const value = useMemo<BrandingValue>(
    () => ({
      org,
      profile,
      loading,
      platformName: org?.display_name?.trim() || "Carelune",
      refresh: load,
    }),
    [org, profile, loading],
  );

  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}

export function useBranding() {
  const ctx = useContext(BrandingContext);
  if (!ctx) throw new Error("useBranding must be used within <BrandingProvider>");
  return ctx;
}
