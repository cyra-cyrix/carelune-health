import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { getMyOrg, getMyProfile, type OrgRow, type MyProfile } from "../lib/db";

type BrandingValue = {
  org: OrgRow | null;
  profile: MyProfile | null;
  loading: boolean;
  /** Set when the organisation/branding query fails (e.g. the DB is missing newer
   *  centre columns). The profile can still be present — chrome falls back to the
   *  default brand, and admin rights are driven by the profile, not the org. */
  orgError: string | null;
  /** Platform name to show in chrome — the org's chosen name, else "Carelune". */
  platformName: string;
  refresh: () => Promise<void>;
};

const BrandingContext = createContext<BrandingValue | null>(null);

/**
 * Loads the signed-in user's org (tenant) branding and their profile once, so
 * the whole app can render the org's platform name/logo and know whether the
 * user is the admin. Sits inside AuthProvider, above the role surfaces.
 *
 * Resilience: org and profile are loaded INDEPENDENTLY. A failing organisation
 * query must never discard a profile that loaded fine — otherwise a valid admin
 * (role=pmr, is_admin=true) would lose their admin navigation just because the
 * remote DB is missing newer centre columns.
 */
export function BrandingProvider({ children }: { children: ReactNode }) {
  const [org, setOrg] = useState<OrgRow | null>(null);
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [orgError, setOrgError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    // allSettled: one query's failure never rejects the other's result.
    const [orgRes, profileRes] = await Promise.allSettled([getMyOrg(), getMyProfile()]);

    if (profileRes.status === "fulfilled") {
      setProfile(profileRes.value);
    } else {
      setProfile(null);
      if (import.meta.env.DEV) console.error("Carelune: failed to load profile —", profileRes.reason);
    }

    if (orgRes.status === "fulfilled") {
      setOrg(orgRes.value);
      setOrgError(null);
    } else {
      // Keep any profile we loaded; only the branding is unavailable.
      setOrg(null);
      const msg = orgRes.reason instanceof Error ? orgRes.reason.message : String(orgRes.reason);
      setOrgError(msg);
      // Surface clearly in development instead of silently swallowing it.
      if (import.meta.env.DEV) console.error("Carelune: failed to load organisation branding —", msg);
    }
  };

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        await load();
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
      orgError,
      platformName: org?.display_name?.trim() || "Carelune",
      refresh: load,
    }),
    [org, profile, orgError, loading],
  );

  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}

export function useBranding() {
  const ctx = useContext(BrandingContext);
  if (!ctx) throw new Error("useBranding must be used within <BrandingProvider>");
  return ctx;
}
