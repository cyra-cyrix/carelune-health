import type { User } from "@supabase/supabase-js";

/**
 * The five login roles of Carelune (rehab-discharge continuity). The patient is
 * a clinical *record*, not a login — family and caregiver act on their behalf —
 * so there is no "patient" app role. (The DB enum keeps `patient` for forward
 * compat, but nothing here routes to it.)
 */
export type AppRole = "caregiver" | "family" | "nurse" | "duty_doctor" | "pmr";

export const APP_ROLES: AppRole[] = [
  "caregiver",
  "family",
  "nurse",
  "duty_doctor",
  "pmr",
];

type AppRoleMeta = {
  label: string;
  persona: string;
  /** phone = caregiver/family app column; desk = professional wide layout. */
  surface: "phone" | "desk";
};

export const APP_ROLE_META: Record<AppRole, AppRoleMeta> = {
  caregiver: { label: "Caregiver", persona: "Caregiver", surface: "phone" },
  family: { label: "Family", persona: "Family", surface: "phone" },
  nurse: { label: "Nurse", persona: "Nurse", surface: "desk" },
  duty_doctor: { label: "Duty Doctor", persona: "Duty Doctor", surface: "desk" },
  pmr: { label: "Doctor", persona: "Doctor", surface: "desk" },
};

/** Read the signed-in user's role from their Supabase `user_metadata`. */
export function appRoleFromUser(user: User | null): AppRole | null {
  const raw = user?.user_metadata?.role;
  return typeof raw === "string" && (APP_ROLES as string[]).includes(raw) ? (raw as AppRole) : null;
}
