// Typed data-access layer over Supabase. Screens call these functions instead
// of importing the static seed in src/data/*. RLS in the database decides what
// each signed-in user may read/write — these helpers never bypass it.

import { supabase } from "./supabase";
import type { PlanDraft } from "./pathwayValidation";

/* ------------------------------- Row types ------------------------------- */

export type PatientRow = {
  id: string;
  centre_id: string;
  full_name: string;
  age: number | null;
  sex: "M" | "F" | "O" | null;
  location: string | null;
  discharged_on: string | null;
  journey_start: string;
  journey_total_days: number;
  diagnosis: string[];
  status: string;
  pathway_pack_id: string | null;
  pathway_version_id: string | null;
};

export type CareTaskRow = {
  id: string;
  patient_id: string;
  time_label: string;
  sort_order: number;
  discipline: string;
  title: string;
  detail: string | null;
  active: boolean;
};

export type TaskLogRow = {
  task_id: string;
  log_date: string;
  done: boolean;
};

export type ReadingRow = {
  id: string;
  patient_id: string;
  reading_date: string;
  bp: string | null;
  grbs: string | null;
  urine_ml: string | null;
  food_intake: string | null;
  mood: string | null;
  activity: string | null;
  // Extra caregiver-recorded observations (0024, all nullable).
  pulse: string | null;
  spo2: string | null;
  temperature: string | null;
  pain: string | null;
  fluid_ml: string | null;
  bowel: string | null;
  skin: string | null;
  feeding: string | null;
  cognition: string | null;
};

export type MedicationRow = {
  id: string;
  patient_id: string;
  name: string;
  dose: string | null;
  freq: string | null;
  timing: string | null;
  note: string | null;
  active: boolean;
};

export type ApprovalRow = {
  id: string;
  patient_id: string;
  type: "nurse_query" | "duty_med" | "patient_query";
  from_name: string | null;
  message: string;
  suggestion: string | null;
  urgency: "routine" | "urgent";
  status: "pending" | "approved" | "declined" | "suggested";
  created_at: string;
  /** Read receipt (0020): when + who first read a family message. */
  read_at?: string | null;
  read_by?: string | null;
  /** SLA escalation (0021): set when a read-but-unreplied family message breached
   *  the 30-min duty-hours SLA and was routed up. */
  escalated_at?: string | null;
  escalated_to?: "duty_doctor" | "hod" | null;
};

export type UpdateRow = {
  id: string;
  patient_id: string;
  source: "caregiver" | "nurse" | "duty_doctor" | "pmr";
  author_name: string | null;
  body: string;
  flag: string | null;
  created_at: string;
};

/** The caregiver's editable daily-readings shape (camelCase for the UI). */
export type ReadingsInput = {
  bp: string;
  grbs: string;
  urineMl: string;
  foodIntake: string;
  mood: string;
  activity: string;
  // 0024 additions — all optional so callers may set only prescribed params.
  pulse: string;
  spo2: string;
  temperature: string;
  pain: string;
  fluidMl: string;
  bowel: string;
  skin: string;
  feeding: string;
  cognition: string;
};

const todayISO = () => new Date().toISOString().slice(0, 10);

/* --------------------------- Org (tenant) + profile ----------------------- */

export type OrgRow = {
  id: string;
  name: string;
  display_name: string | null;
  logo_url: string | null;
  subdomain: string | null;
  setup_complete: boolean;
  invite_token: string | null;
  institution_type: string | null;
  contact_phone: string | null;
  service_hours: string | null;
  emergency_note: string | null;
  emergency_number: string | null;
  /** 'active' | 'paused' — a paused institution is suspended by the super admin
   *  (its non-super-admin users are gated out; no data is deleted). */
  status: string;
  /** Onboarding (0022): recovery departments served + basic institution KYC +
   *  consent stamp. */
  departments?: string[];
  ce_reg_no?: string | null;
  terms_accepted_at?: string | null;
  terms_version?: string | null;
};

export type MyProfile = {
  id: string;
  role: "caregiver" | "family" | "nurse" | "duty_doctor" | "pmr";
  full_name: string | null;
  centre_id: string | null;
  is_admin: boolean;
  is_super_admin: boolean;
  must_reset_password: boolean;
  /** Doctor KYC (0022) — self-attested. */
  med_reg_no?: string | null;
  specialty?: string | null;
};

/** The signed-in user's org (RLS returns only their own centre). */
export async function getMyOrg(): Promise<OrgRow | null> {
  const { data, error } = await supabase
    .from("centres")
    .select(
      "id, name, display_name, logo_url, subdomain, setup_complete, invite_token, institution_type, contact_phone, service_hours, emergency_note, emergency_number, status, departments, ce_reg_no, terms_accepted_at, terms_version",
    )
    .limit(1);
  if (error) throw error;
  return (data?.[0] as OrgRow) ?? null;
}

/** Admin: create (or rotate) the org's registration token and return it.
 *  RLS lets only the org admin update the centre. */
export async function generateInviteToken(orgId: string): Promise<string> {
  const token = (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "").slice(0, 24);
  const { error } = await supabase.from("centres").update({ invite_token: token }).eq("id", orgId);
  if (error) throw error;
  return token;
}

/** The signed-in user's own profile row (role, admin flag, org). */
export async function getMyProfile(): Promise<MyProfile | null> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("id, role, full_name, centre_id, is_admin, is_super_admin, must_reset_password, med_reg_no, specialty")
    .eq("id", auth.user.id)
    .maybeSingle();
  if (error) throw error;
  return (data as MyProfile) ?? null;
}

/* ---------------- Public registration + household (registry fn) ------------ */

export type RegisterInput = {
  token: string;
  patient: { full_name: string; age: string; sex: "M" | "F" | "O" | ""; location: string; discharged_on: string };
  family: { full_name: string; email: string; password: string; phone: string; relation: string };
};

/** Public: register a patient + the family login via the org invite token. */
export async function registerPatient(
  input: RegisterInput,
): Promise<{ patient_name: string; family_email: string }> {
  const { data, error } = await supabase.functions.invoke("registry", {
    body: { action: "register", ...input },
  });
  if (error) throw new Error(await edgeError(error));
  if (data?.error) throw new Error(data.error);
  return data as { patient_name: string; family_email: string };
}

export type PublicOrgInfo = {
  institution_name: string | null;
  package_price: number | null;
  trial_days: number;
};

/** Public: white-label institution + price for the token-linked onboarding page. */
export async function getPublicOrgInfo(token: string): Promise<PublicOrgInfo> {
  const { data, error } = await supabase.functions.invoke("registry", {
    body: { action: "org-info", token },
  });
  if (error) throw new Error(await edgeError(error));
  if (data?.error) throw new Error(data.error);
  return {
    institution_name: data?.institution_name ?? null,
    package_price: data?.package_price ?? null,
    trial_days: data?.trial_days ?? 0,
  };
}

export type NewCaregiver = { patient_id: string; full_name: string; email: string; password: string; phone?: string };

/** Family/staff: create a caregiver account linked to this patient. */
export async function addCaregiver(input: NewCaregiver): Promise<void> {
  const { data, error } = await supabase.functions.invoke("registry", {
    body: { action: "add-caregiver", ...input },
  });
  if (error) throw new Error(await edgeError(error));
  if (data?.error) throw new Error(data.error);
}

/** Clear the forced-reset flag after the user sets their own password. */
export async function clearMustReset(): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return;
  const { error } = await supabase
    .from("profiles")
    .update({ must_reset_password: false })
    .eq("id", auth.user.id);
  if (error) throw error;
}

/** Admin: set the org's identity/branding + institution profile fields. */
export async function updateOrgBranding(
  orgId: string,
  fields: {
    display_name?: string;
    logo_url?: string | null;
    setup_complete?: boolean;
    contact_phone?: string | null;
    service_hours?: string | null;
    emergency_note?: string | null;
    emergency_number?: string | null;
    departments?: string[];
    ce_reg_no?: string | null;
    terms_accepted_at?: string | null;
    terms_version?: string | null;
  },
): Promise<void> {
  const { error } = await supabase.from("centres").update(fields).eq("id", orgId);
  if (error) throw new Error(pgErr(error, "Could not save."));
}

/** Any signed-in user: set their own display name (used in greetings + headers). */
export async function updateMyName(fullName: string): Promise<void> {
  const name = fullName.trim();
  if (!name) return;
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return;
  const { error } = await supabase.from("profiles").update({ full_name: name }).eq("id", auth.user.id);
  if (error) throw new Error(pgErr(error, "Could not save your name."));
}

/** Admin/doctor: save own basic credentialing (self-attested, 0022). */
export async function saveDoctorKyc(medRegNo: string | null, specialty: string | null): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return;
  const { error } = await supabase
    .from("profiles")
    .update({ med_reg_no: medRegNo, specialty })
    .eq("id", auth.user.id);
  if (error) throw new Error(pgErr(error, "Could not save."));
}

/* -------------------------- Pathway packs (catalogue) --------------------- */

export type PathwayPackRow = {
  id: string;
  key: "spine" | "joint" | "neuro";
  name: string;
  specialty: string;
  description: string | null;
  status: "draft" | "clinically_review_required" | "approved" | "retired";
};

/** The governed pathway catalogue (read-only to any authenticated user). */
export async function listPathwayPacks(): Promise<PathwayPackRow[]> {
  const { data, error } = await supabase
    .from("pathway_packs")
    .select("id, key, name, specialty, description, status")
    .order("key");
  if (error) throw error;
  return (data ?? []) as PathwayPackRow[];
}

/** A governed clinical pathway pack ENABLED for an institution. Pathways are
 *  clinical templates only — they carry no price (the institution has one
 *  commercial package; see docs/COMMERCIAL_MODEL.md). RLS returns only the
 *  caller's own centre's assignments. */
export type EnabledPack = {
  pack_id: string;
  pack_key: "spine" | "joint" | "neuro";
  pack_name: string;
  specialty: string;
  description: string | null;
  status: PathwayPackRow["status"];
};

/** The clinical pathway packs a Super Admin has enabled for the signed-in user's
 *  institution. Used to list programmes (read-only) and to assign a patient to a
 *  pathway — only these packs may ever be assigned. */
export async function getMyEnabledPacks(): Promise<EnabledPack[]> {
  const me = await getMyProfile();
  if (!me?.centre_id) return [];
  const { data: enabled, error: e1 } = await supabase
    .from("institution_pathways")
    .select("pack_id")
    .eq("centre_id", me.centre_id)
    .eq("enabled", true);
  if (e1) throw new Error(pgErr(e1, "Could not load programmes."));
  const packIds = (enabled ?? []).map((r) => (r as { pack_id: string }).pack_id);
  if (!packIds.length) return [];

  const { data: packs, error: e2 } = await supabase
    .from("pathway_packs")
    .select("id, key, name, specialty, description, status")
    .in("id", packIds)
    .order("key");
  if (e2) throw new Error(pgErr(e2, "Could not load programmes."));
  return (packs ?? []).map((p) => {
    const pk = p as { id: string; key: EnabledPack["pack_key"]; name: string; specialty: string; description: string | null; status: EnabledPack["status"] };
    return {
      pack_id: pk.id,
      pack_key: pk.key,
      pack_name: pk.name,
      specialty: pk.specialty,
      description: pk.description,
      status: pk.status,
    };
  });
}

/* --------------------- Storefront (packages) + subscription ---------------- */

/** The org's family-facing offer + a couple of details, set by the admin. */
export type Storefront = {
  centre_id: string;
  package_name: string | null;
  package_price: number | null;
  package_includes: string | null;
  trial_days: number;
  platform_fee_pct: number;
  emergency_note: string | null;
  emergency_number: string | null;
};

/** Read the signed-in user's org storefront (RLS returns only their centre). */
export async function getStorefront(): Promise<Storefront | null> {
  const { data, error } = await supabase
    .from("centres")
    .select(
      "id, package_name, package_price, package_includes, trial_days, platform_fee_pct, emergency_note, emergency_number",
    )
    .limit(1);
  if (error) throw new Error(pgErr(error, "Could not load the programme."));
  const r = data?.[0] as
    | (Omit<Storefront, "centre_id"> & { id: string; trial_days: number | null; platform_fee_pct: number | null })
    | undefined;
  if (!r) return null;
  return {
    centre_id: r.id,
    package_name: r.package_name,
    package_price: r.package_price,
    package_includes: r.package_includes,
    trial_days: r.trial_days ?? 0,
    platform_fee_pct: r.platform_fee_pct ?? 30,
    emergency_note: r.emergency_note,
    emergency_number: r.emergency_number,
  };
}

export type StorefrontPatch = {
  package_name?: string | null;
  package_price?: number | null;
  package_includes?: string | null;
  trial_days?: number;
  emergency_note?: string | null;
  emergency_number?: string | null;
};

/** Admin: save the org's storefront. RLS lets only the org admin update it. */
export async function updateStorefront(orgId: string, patch: StorefrontPatch): Promise<void> {
  const { error } = await supabase.from("centres").update(patch).eq("id", orgId);
  if (error) throw new Error(pgErr(error, "Could not save the programme."));
}

export type SubscriptionRow = {
  id: string;
  patient_id: string;
  status: "trial" | "active" | "cancelled";
  plan_name: string | null;
  price: number | null;
  trial_days: number;
  trial_ends: string | null;
  pay_mode: string;
  started_at: string;
};

/** The patient's subscription, if the family has accepted the package. */
export async function getSubscription(patientId: string): Promise<SubscriptionRow | null> {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("patient_id", patientId)
    .maybeSingle();
  if (error) throw error;
  return (data as SubscriptionRow) ?? null;
}

/**
 * Family accepts the package for their patient. If the org offers free-trial
 * days the record starts as 'trial' (with an end date); otherwise 'active'.
 * Billing is settled at the centre — nothing is charged here.
 */
export async function startTrial(patientId: string): Promise<SubscriptionRow> {
  const [sf, me] = await Promise.all([getStorefront(), getMyProfile()]);
  const days = sf?.trial_days ?? 0;
  const trialEnds =
    days > 0 ? new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10) : null;
  const { data, error } = await supabase
    .from("subscriptions")
    .upsert(
      {
        patient_id: patientId,
        status: days > 0 ? "trial" : "active",
        plan_name: sf?.package_name ?? null,
        price: sf?.package_price ?? null,
        trial_days: days,
        trial_ends: trialEnds,
        pay_mode: "pay_at_centre",
        recorded_by: me?.id ?? null,
      },
      { onConflict: "patient_id" },
    )
    .select("*")
    .single();
  if (error) throw new Error(pgErr(error, "Could not start the package."));
  return data as SubscriptionRow;
}

/** Staff: mark the package settled at the centre (trial → active). */
export async function markSubscriptionActive(patientId: string): Promise<void> {
  const { error } = await supabase
    .from("subscriptions")
    .update({ status: "active" })
    .eq("patient_id", patientId);
  if (error) throw new Error(pgErr(error, "Could not update the subscription."));
}

/* --------- Phase 3: patient pathway, care team & private documents --------- */

/** Assign (or clear) the patient's clinical pathway pack. Only a pack ENABLED for
 *  the institution may be assigned — the DB trigger enforces this server-side. */
export async function assignPatientPathway(patientId: string, packId: string | null): Promise<void> {
  const { error } = await supabase.from("patients").update({ pathway_pack_id: packId }).eq("id", patientId);
  if (error) throw new Error(pgErr(error, "Could not assign the pathway."));
}

export type StaffMember = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: "nurse" | "duty_doctor" | "pmr";
};

/** Staff of the signed-in user's institution, for care-team dropdowns. RLS
 *  (profiles_self_read) returns only same-centre staff to a staff caller. */
export async function getCentreStaff(): Promise<StaffMember[]> {
  const me = await getMyProfile();
  if (!me?.centre_id) return [];
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, role")
    .eq("centre_id", me.centre_id)
    .in("role", ["nurse", "duty_doctor", "pmr"])
    .order("full_name");
  if (error) throw new Error(pgErr(error, "Could not load staff."));
  return (data ?? []) as StaffMember[];
}

export type TeamRole = "lead_doctor" | "nurse" | "coordinator";

export type CareTeamMember = {
  id: string;
  team_role: TeamRole;
  staff_id: string;
  full_name: string | null;
  role: string | null;
};

/** The assigned care team for a patient. Staff-facing (households cannot read
 *  other users' profiles), so names resolve for staff callers. */
export async function getCareTeam(patientId: string): Promise<CareTeamMember[]> {
  const { data, error } = await supabase
    .from("patient_care_team")
    .select("id, team_role, staff_id")
    .eq("patient_id", patientId);
  if (error) throw new Error(pgErr(error, "Could not load the care team."));
  const rows = (data ?? []) as { id: string; team_role: TeamRole; staff_id: string }[];
  if (!rows.length) return [];
  const { data: profs } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .in("id", rows.map((r) => r.staff_id));
  const byId = new Map((profs ?? []).map((p) => [(p as { id: string }).id, p as { full_name: string | null; role: string | null }]));
  return rows.map((r) => ({
    id: r.id,
    team_role: r.team_role,
    staff_id: r.staff_id,
    full_name: byId.get(r.staff_id)?.full_name ?? null,
    role: byId.get(r.staff_id)?.role ?? null,
  }));
}

/** Assign/replace the staff member for a team role, or clear it (staffId null).
 *  The DB trigger enforces same-institution + role compatibility. */
export async function setCareTeamMember(patientId: string, teamRole: TeamRole, staffId: string | null): Promise<void> {
  if (staffId === null) {
    const { error } = await supabase
      .from("patient_care_team")
      .delete()
      .eq("patient_id", patientId)
      .eq("team_role", teamRole);
    if (error) throw new Error(pgErr(error, "Could not update the care team."));
    return;
  }
  const me = await getMyProfile();
  const { error } = await supabase
    .from("patient_care_team")
    .upsert(
      { patient_id: patientId, team_role: teamRole, staff_id: staffId, assigned_by: me?.id ?? null },
      { onConflict: "patient_id,team_role" },
    );
  if (error) throw new Error(pgErr(error, "Could not update the care team."));
}

export type HouseholdMember = {
  user_id: string;
  relation: "self" | "caregiver" | "family";
  full_name: string | null;
};

/** Household users (caregiver/family) linked to a patient — shown read-only in
 *  the care-team panel (caregivers are created via the family "Add caregiver" flow). */
export async function getHouseholdMembers(patientId: string): Promise<HouseholdMember[]> {
  const { data, error } = await supabase
    .from("patient_members")
    .select("user_id, relation")
    .eq("patient_id", patientId);
  if (error) throw new Error(pgErr(error, "Could not load household members."));
  const rows = (data ?? []) as { user_id: string; relation: HouseholdMember["relation"] }[];
  if (!rows.length) return [];
  const { data: profs } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", rows.map((r) => r.user_id));
  const byId = new Map((profs ?? []).map((p) => [(p as { id: string }).id, (p as { full_name: string | null }).full_name]));
  return rows.map((r) => ({ user_id: r.user_id, relation: r.relation, full_name: byId.get(r.user_id) ?? null }));
}

export type DocumentRow = {
  id: string;
  patient_id: string;
  file_name: string;
  mime: string | null;
  size_bytes: number | null;
  doc_type: "discharge_summary" | "imaging" | "prescription" | "lab" | "other";
  storage_path: string;
  created_at: string;
};

/** A patient's private documents (metadata). RLS returns them only to people who
 *  can see the patient. */
export async function getPatientDocuments(patientId: string): Promise<DocumentRow[]> {
  const { data, error } = await supabase
    .from("patient_documents")
    .select("id, patient_id, file_name, mime, size_bytes, doc_type, storage_path, created_at")
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(pgErr(error, "Could not load documents."));
  return (data ?? []) as DocumentRow[];
}

/** Staff: upload a private document into the tenant-isolated bucket, then record
 *  its metadata. The object path is <centre_id>/<patient_id>/<uuid>-<name>, which
 *  the storage RLS uses to enforce isolation. */
export async function uploadPatientDocument(
  patientId: string,
  file: File,
  docType: DocumentRow["doc_type"],
): Promise<DocumentRow> {
  const me = await getMyProfile();
  if (!me?.centre_id) throw new Error("No institution for this account.");
  const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(-120);
  const path = `${me.centre_id}/${patientId}/${crypto.randomUUID()}-${safe}`;
  const up = await supabase.storage
    .from("patient-docs")
    .upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
  if (up.error) throw new Error(up.error.message || "Upload failed.");
  const { data, error } = await supabase
    .from("patient_documents")
    .insert({
      patient_id: patientId,
      storage_path: path,
      file_name: file.name.slice(0, 200),
      mime: file.type || null,
      size_bytes: file.size,
      doc_type: docType,
      uploaded_by: me.id,
    })
    .select("id, patient_id, file_name, mime, size_bytes, doc_type, storage_path, created_at")
    .single();
  if (error) {
    await supabase.storage.from("patient-docs").remove([path]).catch(() => undefined);
    throw new Error(pgErr(error, "Could not save the document."));
  }
  return data as DocumentRow;
}

/** A short-lived signed URL to view/download a private document. */
export async function getDocumentUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from("patient-docs").createSignedUrl(path, 300);
  if (error || !data?.signedUrl) throw new Error(error?.message || "Could not open the document.");
  return data.signedUrl;
}

/** Staff: delete a document (metadata + the stored object). */
export async function deletePatientDocument(doc: { id: string; storage_path: string }): Promise<void> {
  const { error } = await supabase.from("patient_documents").delete().eq("id", doc.id);
  if (error) throw new Error(pgErr(error, "Could not delete the document."));
  await supabase.storage.from("patient-docs").remove([doc.storage_path]).catch(() => undefined);
}

/* ---------- Phase 5: doctor 3-questions + governed AI plan generation ------- */

export type PlanIntake = {
  milestone_goal: string;
  milestone_by: string;
  monitor_focus: string;
  non_negotiables: string;
};

/** The doctor's three answers for a patient, if saved. */
export async function getPlanIntake(patientId: string): Promise<PlanIntake | null> {
  const { data, error } = await supabase
    .from("patient_plan_intake")
    .select("milestone_goal, milestone_by, monitor_focus, non_negotiables")
    .eq("patient_id", patientId)
    .maybeSingle();
  if (error) throw new Error(pgErr(error, "Could not load the intake."));
  if (!data) return null;
  const d = data as Partial<PlanIntake>;
  return {
    milestone_goal: d.milestone_goal ?? "",
    milestone_by: d.milestone_by ?? "",
    monitor_focus: d.monitor_focus ?? "",
    non_negotiables: d.non_negotiables ?? "",
  };
}

/** Doctor: save the three intake answers (author stamped server-side). */
export async function savePlanIntake(patientId: string, intake: PlanIntake): Promise<void> {
  const { error } = await supabase
    .from("patient_plan_intake")
    .upsert({ patient_id: patientId, ...intake }, { onConflict: "patient_id" });
  if (error) throw new Error(pgErr(error, "Could not save your answers."));
}

export type PackPathway = {
  pathway_id: string;
  key: string;
  name: string;
  status: PathwayPackRow["status"];
  version_id: string | null;
  version_status: PathwayPackRow["status"] | null;
  institution_approved: boolean;
};

/** The pathways within a pack + their latest version + this institution's approval
 *  state — used to pick and clinically-approve the governing version for a patient. */
export async function getPackPathways(packId: string): Promise<PackPathway[]> {
  const me = await getMyProfile();
  const { data: pws, error } = await supabase
    .from("pathways")
    .select("id, key, name, status")
    .eq("pack_id", packId)
    .order("key");
  if (error) throw new Error(pgErr(error, "Could not load pathways."));
  const pathways = (pws ?? []) as { id: string; key: string; name: string; status: PackPathway["status"] }[];
  if (!pathways.length) return [];

  const { data: vers } = await supabase
    .from("pathway_versions")
    .select("id, pathway_id, version, status")
    .in("pathway_id", pathways.map((p) => p.id))
    .order("version", { ascending: false });
  const latestByPathway = new Map<string, { id: string; status: PackPathway["status"] }>();
  for (const v of (vers ?? []) as { id: string; pathway_id: string; status: PackPathway["status"] }[]) {
    if (!latestByPathway.has(v.pathway_id)) latestByPathway.set(v.pathway_id, { id: v.id, status: v.status });
  }

  const versionIds = [...latestByPathway.values()].map((v) => v.id);
  const approved = new Set<string>();
  if (me?.centre_id && versionIds.length) {
    const { data: ipv } = await supabase
      .from("institution_pathway_versions")
      .select("version_id")
      .eq("centre_id", me.centre_id)
      .in("version_id", versionIds);
    for (const r of (ipv ?? []) as { version_id: string }[]) approved.add(r.version_id);
  }

  return pathways.map((p) => {
    const v = latestByPathway.get(p.id) ?? null;
    return {
      pathway_id: p.id,
      key: p.key,
      name: p.name,
      status: p.status,
      version_id: v?.id ?? null,
      version_status: v?.status ?? null,
      institution_approved: v ? approved.has(v.id) : false,
    };
  });
}

/** Doctor/admin: record this institution's clinical approval of a pathway version. */
export async function approvePathwayVersion(versionId: string): Promise<void> {
  const { error } = await supabase.rpc("approve_pathway_version_for_institution", { p_version: versionId });
  if (error) throw new Error(pgErr(error, "Could not approve the pathway version."));
}

/** Staff: set the patient's governing pathway version (must be institution-approved
 *  or platform-approved — the DB trigger enforces it). */
export async function assignGoverningVersion(patientId: string, versionId: string): Promise<void> {
  const { error } = await supabase.from("patients").update({ pathway_version_id: versionId }).eq("id", patientId);
  if (error) throw new Error(pgErr(error, "Could not set the governing pathway version."));
}

export type FactItem = { text: string; provenance: string };
export type FactMedicine = { name: string; dose: string; freq: string; timing: string; note: string; provenance: string };
export type DocumentFacts = {
  diagnoses: FactItem[];
  procedure: FactItem | null;
  medicines: FactMedicine[];
  investigations: FactItem[];
  precautions: FactItem[];
  diet: FactItem[];
  baseline_function: string;
  dates: { discharged_on: string; surgery_on: string };
  missing: string[];
  conflicts: string[];
};

const emptyFacts = (): DocumentFacts => ({
  diagnoses: [], procedure: null, medicines: [], investigations: [], precautions: [], diet: [],
  baseline_function: "", dates: { discharged_on: "", surgery_on: "" }, missing: [], conflicts: [],
});

/** Stage A: extract patient facts from a selected discharge DOCUMENT (primary) or
 *  pasted text (fallback). Cached server-side with its source document id. */
export async function extractFacts(
  patientId: string,
  input: { documentId?: string; dischargeText?: string },
): Promise<DocumentFacts> {
  const { data, error } = await supabase.functions.invoke("extract-facts", {
    body: { patient_id: patientId, document_id: input.documentId, discharge_text: input.dischargeText },
  });
  if (error) throw new Error(await edgeError(error));
  if (data?.error) throw new Error(data.error);
  return { ...emptyFacts(), ...(data?.facts ?? {}) } as DocumentFacts;
}

export type StoredFacts = { facts: DocumentFacts; source_document_id: string | null } | null;

/** The cached, possibly doctor-corrected facts for a patient. */
export async function getDocumentFacts(patientId: string): Promise<StoredFacts> {
  const { data, error } = await supabase
    .from("patient_document_facts")
    .select("facts, source_document_id")
    .eq("patient_id", patientId)
    .maybeSingle();
  if (error) throw new Error(pgErr(error, "Could not load facts."));
  if (!data) return null;
  const row = data as { facts: DocumentFacts; source_document_id: string | null };
  return { facts: { ...emptyFacts(), ...row.facts }, source_document_id: row.source_document_id };
}

/** Doctor: save corrected facts (RLS: admin/doctor of the patient's institution). */
export async function saveDocumentFacts(patientId: string, facts: DocumentFacts): Promise<void> {
  const { error } = await supabase.from("patient_document_facts").update({ facts }).eq("patient_id", patientId);
  if (error) throw new Error(pgErr(error, "Could not save the facts."));
}

/** Whether Stage-A facts have been extracted for this patient. */
export async function hasDocumentFacts(patientId: string): Promise<boolean> {
  const { data } = await supabase.from("patient_document_facts").select("patient_id").eq("patient_id", patientId).maybeSingle();
  return !!data;
}

export type GeneratedPlan = {
  plan: PlanDraft;
  saved?: { id: string; version: number; status: string };
  validation: { ok: boolean; errors: string[] };
};

/** Stage B: generate + server-validate a DRAFT plan (never activates care). */
export async function generatePlan(patientId: string): Promise<GeneratedPlan> {
  const { data, error } = await supabase.functions.invoke("generate-plan", { body: { patient_id: patientId } });
  if (error) throw new Error(await edgeError(error));
  if (data?.error) throw new Error(data.validation ? `${data.error} (${(data.validation.errors ?? []).join("; ")})` : data.error);
  return data as GeneratedPlan;
}

export type PatientPlanRow = {
  id: string;
  version: number;
  status: "draft" | "approved";
  content: PlanDraft;
  pathway_version_id: string | null;
  updated_at: string;
  activated_at: string | null;
};

/** The latest generated plan draft for a patient, if any. */
export async function getPatientPlan(patientId: string): Promise<PatientPlanRow | null> {
  const { data, error } = await supabase
    .from("patient_plans")
    .select("id, version, status, content, pathway_version_id, updated_at, activated_at")
    .eq("patient_id", patientId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(pgErr(error, "Could not load the plan."));
  return (data as PatientPlanRow) ?? null;
}

/** Doctor: save the edited draft (status stays draft) or approve it (status
 *  approved; approved_by/at stamped server-side). Approval does NOT activate care. */
export async function savePlan(planId: string, content: PlanDraft, approve: boolean): Promise<void> {
  const patch: Record<string, unknown> = { content };
  if (approve) patch.status = "approved";
  const { error } = await supabase.from("patient_plans").update(patch).eq("id", planId);
  if (error) throw new Error(pgErr(error, "Could not save the plan."));
}

/** Doctor: ATOMICALLY activate an APPROVED plan into the runtime records the app
 *  reads (medications + care_tasks). Idempotent; returns counts. Never partial. */
export async function activateCarePlan(planId: string): Promise<{ medicines: number; tasks: number }> {
  const { data, error } = await supabase.rpc("activate_patient_plan", { p_plan: planId });
  if (error) throw new Error(pgErr(error, "Could not activate the care plan."));
  const d = (data ?? {}) as { medicines?: number; tasks?: number };
  return { medicines: d.medicines ?? 0, tasks: d.tasks ?? 0 };
}

/* ----------------------------- Team (admin) ------------------------------- */

export type TeamUser = {
  id: string;
  email: string;
  full_name: string | null;
  role: "caregiver" | "family" | "nurse" | "duty_doctor" | "pmr";
  is_admin: boolean;
};

export type NewTeamUser = {
  email: string;
  password: string;
  full_name: string;
  role: TeamUser["role"];
};

/** Pull the real error text out of a failed Edge Function response body. */
async function edgeError(error: unknown): Promise<string> {
  const ctx = (error as { context?: Response } | null)?.context;
  if (ctx && typeof ctx.text === "function") {
    try {
      const body = await ctx.clone().text();
      const parsed = body ? (JSON.parse(body) as { error?: string }) : null;
      if (parsed?.error) return parsed.error;
      if (body) return body;
    } catch {
      /* fall through to the generic message */
    }
  }
  return error instanceof Error ? error.message : "Edge Function error";
}

/** List the org's teammates (via the admin-users Edge Function). */
export async function listTeamUsers(): Promise<TeamUser[]> {
  const { data, error } = await supabase.functions.invoke("admin-users", { body: { action: "list" } });
  if (error) throw new Error(await edgeError(error));
  if (data?.error) throw new Error(data.error);
  return (data?.users ?? []) as TeamUser[];
}

/** Create a teammate account (admin only, via the Edge Function). */
export async function createTeamUser(input: NewTeamUser): Promise<void> {
  const { data, error } = await supabase.functions.invoke("admin-users", {
    body: { action: "create", ...input },
  });
  if (error) throw new Error(await edgeError(error));
  if (data?.error) throw new Error(data.error);
}

/** Admin: reset a teammate's password to a new temporary one (they reset on next
 *  login). Restricted to the caller's own institution server-side. */
export async function resetTeamUserPassword(userId: string, password: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke("admin-users", {
    body: { action: "reset-password", user_id: userId, password },
  });
  if (error) throw new Error(await edgeError(error));
  if (data?.error) throw new Error(data.error);
}

/** Admin: permanently remove a teammate account. Cannot remove yourself or an
 *  admin; restricted to the caller's own institution server-side. */
export async function removeTeamUser(userId: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke("admin-users", {
    body: { action: "remove", user_id: userId },
  });
  if (error) throw new Error(await edgeError(error));
  if (data?.error) throw new Error(data.error);
}

/* -------------------------- Platform (super admin) ------------------------ */

export type OrgSummary = {
  id: string;
  name: string;
  display_name: string | null;
  setup_complete: boolean;
  admin_name: string | null;
  admin_email: string | null;
  institution_type: string | null;
  pathways: string[];
  patient_count: number | null;
  status: string;
};

export type InstitutionType = "hospital" | "rehab_centre" | "doctor_practice" | "clinical_group";

export type NewOrg = {
  org_name: string;
  admin_name: string;
  admin_email: string;
  admin_password: string;
  institution_type: InstitutionType | "";
  pathway_keys: string[];
};

/** Super admin: list all organisations + their admins. */
export async function listOrgs(): Promise<OrgSummary[]> {
  const { data, error } = await supabase.functions.invoke("platform-admin", { body: { action: "list-orgs" } });
  if (error) throw new Error(await edgeError(error));
  if (data?.error) throw new Error(data.error);
  return (data?.orgs ?? []) as OrgSummary[];
}

/** Super admin: create an organisation and its admin account in one step. */
export async function createOrg(input: NewOrg): Promise<void> {
  const { data, error } = await supabase.functions.invoke("platform-admin", {
    body: { action: "create-org", ...input },
  });
  if (error) throw new Error(await edgeError(error));
  if (data?.error) throw new Error(data.error);
}

/** Super admin: pause or resume an institution (reversible; no data is deleted). */
export async function setInstitutionStatus(centreId: string, status: "active" | "paused"): Promise<void> {
  const { data, error } = await supabase.functions.invoke("platform-admin", {
    body: { action: "set-org-status", centre_id: centreId, status },
  });
  if (error) throw new Error(await edgeError(error));
  if (data?.error) throw new Error(data.error);
}

/* ------------------ Onboarding: AI structuring + write --------------------- */

export type PlanTask = { time_label: string; discipline: string; title: string; detail: string };
export type PlanMed = { name: string; dose: string; freq: string; timing: string; note: string };
export type PlanTarget = { goal: string; window: string };

/** The reviewed draft the doctor edits before it becomes a real plan. */
export type StructuredPlan = {
  summary: string;
  diagnosis: string[];
  tasks: PlanTask[];
  medications: PlanMed[];
  targets: PlanTarget[];
};

/** Send a discharge summary to OpenAI (via the structure-discharge function). */
export async function structureDischarge(input: {
  patient_name: string;
  discharge_text: string;
}): Promise<StructuredPlan> {
  const { data, error } = await supabase.functions.invoke("structure-discharge", { body: input });
  if (error) throw new Error(await edgeError(error));
  if (data?.error) throw new Error(data.error);
  return data.plan as StructuredPlan;
}

/** Format a Supabase/Postgres error object (message + code + details + hint). */
function pgErr(e: unknown, fallback: string): string {
  const o = e as { message?: string; code?: string; details?: string; hint?: string } | null;
  const parts = [o?.message, o?.code ? `[${o.code}]` : "", o?.details, o?.hint].filter(Boolean);
  return parts.length ? parts.join(" · ") : fallback;
}

export type PlanPatch = {
  age?: string;
  sex?: "M" | "F" | "O" | "";
  location?: string;
  discharged_on?: string;
};

/**
 * Attach the reviewed plan to an existing PENDING patient (registered via the
 * link) and activate it: update the patient (status → active, diagnosis, any
 * edited fields) → care tasks → medicines → targets note. Best-effort after the
 * patient update, with collected warnings.
 */
export async function activatePlan(args: {
  patientId: string;
  plan: StructuredPlan;
  patch?: PlanPatch;
}): Promise<{ warnings: string[] }> {
  const { patientId, plan, patch } = args;
  const warnings: string[] = [];
  const me = await getMyProfile();
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id ?? null;
  const feedSource = (["nurse", "duty_doctor", "pmr"].includes(me?.role ?? "")
    ? me!.role
    : "pmr") as UpdateRow["source"];

  // 1. Activate the patient (required).
  const update: Record<string, unknown> = { status: "active", diagnosis: plan.diagnosis };
  if (patch?.age !== undefined) update.age = patch.age ? Number(patch.age) : null;
  if (patch?.sex !== undefined) update.sex = patch.sex || null;
  if (patch?.location !== undefined) update.location = patch.location.trim() || null;
  if (patch?.discharged_on !== undefined) update.discharged_on = patch.discharged_on || null;
  const { error: upErr } = await supabase.from("patients").update(update).eq("id", patientId);
  if (upErr) throw new Error(pgErr(upErr, "Could not activate the patient."));

  // 2. Care tasks.
  if (plan.tasks.length) {
    const rows = plan.tasks.map((t, i) => ({
      patient_id: patientId,
      time_label: t.time_label,
      sort_order: i,
      discipline: t.discipline,
      title: t.title,
      detail: t.detail || null,
    }));
    const { error } = await supabase.from("care_tasks").insert(rows);
    if (error) warnings.push(`Care tasks were not saved: ${pgErr(error, "unknown error")}`);
  }

  // 3. Medicines (doctor only per RLS).
  if (plan.medications.length) {
    const rows = plan.medications.map((m) => ({
      patient_id: patientId,
      name: m.name,
      dose: m.dose || null,
      freq: m.freq || null,
      timing: m.timing || null,
      note: m.note || null,
      updated_by: uid,
    }));
    const { error } = await supabase.from("medications").insert(rows);
    if (error) warnings.push(`Medicines were not saved — a doctor must add them: ${pgErr(error, "unknown error")}`);
  }

  // 4. Targets → an onboarding note on the care feed.
  if (plan.targets.length) {
    const body =
      "Programme targets:\n" +
      plan.targets.map((t) => `• ${t.goal}${t.window ? ` (${t.window})` : ""}`).join("\n");
    const { error } = await supabase.from("daily_updates").insert({
      patient_id: patientId,
      source: feedSource,
      author_name: me?.full_name ?? null,
      body,
      flag: "info",
      created_by: uid,
    });
    if (error) warnings.push(`Targets note was not saved: ${pgErr(error, "unknown error")}`);
  }

  return { warnings };
}

/* ------------------------------- Patients -------------------------------- */

/** Staff caseload: patients in the signed-in staff member's own centre (explicit
 *  centre filter so the planner prunes before RLS), active/pending/in-review only,
 *  most-recent first, capped. RLS still enforces the boundary. */
export async function listPatients(): Promise<PatientRow[]> {
  const me = await getMyProfile();
  let q = supabase
    .from("patients")
    .select("*")
    .in("status", ["pending", "active", "in_review"])
    .order("created_at", { ascending: false })
    .limit(200);
  if (me?.centre_id) q = q.eq("centre_id", me.centre_id);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as PatientRow[];
}

/** Patients the signed-in household user (caregiver/family) is linked to, via the
 *  patient_members join — supports one login serving more than one patient. */
export async function listMyPatients(): Promise<PatientRow[]> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return [];
  const { data, error } = await supabase
    .from("patients")
    .select("*, patient_members!inner(user_id)")
    .eq("patient_members.user_id", auth.user.id)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as PatientRow[];
}

/** The primary patient a household user belongs to (first of possibly several). */
export async function getMyPatient(): Promise<PatientRow | null> {
  return (await listMyPatients())[0] ?? null;
}

export async function getPatient(id: string): Promise<PatientRow | null> {
  const { data, error } = await supabase.from("patients").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as PatientRow) ?? null;
}

/* ------------------------------ Care tasks ------------------------------- */

export async function getCareTasks(patientId: string): Promise<CareTaskRow[]> {
  const { data, error } = await supabase
    .from("care_tasks")
    .select("*")
    .eq("patient_id", patientId)
    .eq("active", true)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as CareTaskRow[];
}

/** Today's completed task_ids for a patient. */
export async function getTodayTaskLogs(patientId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("task_logs")
    .select("task_id, done")
    .eq("patient_id", patientId)
    .eq("log_date", todayISO());
  if (error) throw error;
  return new Set((data ?? []).filter((r) => (r as TaskLogRow).done).map((r) => (r as TaskLogRow).task_id));
}

/** Mark a task done / not-done for today. Upserts on (task_id, log_date). */
export async function setTaskDone(patientId: string, taskId: string, done: boolean): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase.from("task_logs").upsert(
    {
      patient_id: patientId,
      task_id: taskId,
      log_date: todayISO(),
      done,
      outcome: done ? "done" : null,
      done_by: auth.user?.id ?? null,
      done_at: new Date().toISOString(),
    },
    { onConflict: "task_id,log_date" },
  );
  if (error) throw error;
}

/** A task's recorded result for today. 'done' also sets the legacy `done` flag
 *  true; the others (unable/refused/na) count as attempted-not-completed. */
export type TaskOutcome = "done" | "unable" | "refused" | "na";

/** Today's outcome per task_id (only rows the caregiver has acted on). */
export async function getTodayTaskOutcomes(patientId: string): Promise<Map<string, TaskOutcome>> {
  const { data, error } = await supabase
    .from("task_logs")
    .select("task_id, done, outcome")
    .eq("patient_id", patientId)
    .eq("log_date", todayISO());
  if (error) throw error;
  const m = new Map<string, TaskOutcome>();
  for (const row of (data ?? []) as (TaskLogRow & { outcome: TaskOutcome | null })[]) {
    // Fall back to the legacy boolean for rows written before 0024.
    const o = row.outcome ?? (row.done ? "done" : null);
    if (o) m.set(row.task_id, o);
  }
  return m;
}

/** Record a task's outcome for today (Done / Unable / Patient refused / N.A.).
 *  Passing null clears it. `done` stays true only for the 'done' outcome. */
export async function setTaskOutcome(patientId: string, taskId: string, outcome: TaskOutcome | null): Promise<void> {
  if (outcome === null) {
    const { error } = await supabase
      .from("task_logs")
      .delete()
      .eq("patient_id", patientId)
      .eq("task_id", taskId)
      .eq("log_date", todayISO());
    if (error) throw new Error(pgErr(error, "Could not update the task."));
    return;
  }
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase.from("task_logs").upsert(
    {
      patient_id: patientId,
      task_id: taskId,
      log_date: todayISO(),
      done: outcome === "done",
      outcome,
      done_by: auth.user?.id ?? null,
      done_at: new Date().toISOString(),
    },
    { onConflict: "task_id,log_date" },
  );
  if (error) throw new Error(pgErr(error, "Could not update the task."));
}

/* ------------------------------- Readings -------------------------------- */

export async function getTodayReadings(patientId: string): Promise<ReadingsInput | null> {
  const { data, error } = await supabase
    .from("daily_readings")
    .select("*")
    .eq("patient_id", patientId)
    .eq("reading_date", todayISO())
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const r = data as ReadingRow;
  return readingRowToInput(r);
}

/** Map a stored reading row to the caregiver's camelCase input shape. */
export function readingRowToInput(r: ReadingRow): ReadingsInput {
  return {
    bp: r.bp ?? "",
    grbs: r.grbs ?? "",
    urineMl: r.urine_ml ?? "",
    foodIntake: r.food_intake ?? "",
    mood: r.mood ?? "",
    activity: r.activity ?? "",
    pulse: r.pulse ?? "",
    spo2: r.spo2 ?? "",
    temperature: r.temperature ?? "",
    pain: r.pain ?? "",
    fluidMl: r.fluid_ml ?? "",
    bowel: r.bowel ?? "",
    skin: r.skin ?? "",
    feeding: r.feeding ?? "",
    cognition: r.cognition ?? "",
  };
}

/** Last N days of readings, oldest-first (for the vitals trend). */
export async function getReadingHistory(patientId: string, days = 7): Promise<ReadingRow[]> {
  const { data, error } = await supabase
    .from("daily_readings")
    .select("*")
    .eq("patient_id", patientId)
    .order("reading_date", { ascending: false })
    .limit(days);
  if (error) throw error;
  return ((data ?? []) as ReadingRow[]).reverse();
}

/** Save today's readings (one row per patient per day). */
export async function saveReadings(patientId: string, r: ReadingsInput): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase.from("daily_readings").upsert(
    {
      patient_id: patientId,
      reading_date: todayISO(),
      bp: r.bp,
      grbs: r.grbs,
      urine_ml: r.urineMl,
      food_intake: r.foodIntake,
      mood: r.mood,
      activity: r.activity,
      pulse: r.pulse,
      spo2: r.spo2,
      temperature: r.temperature,
      pain: r.pain,
      fluid_ml: r.fluidMl,
      bowel: r.bowel,
      skin: r.skin,
      feeding: r.feeding,
      cognition: r.cognition,
      recorded_by: auth.user?.id ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "patient_id,reading_date" },
  );
  if (error) throw error;
}

/* --------------------- Medicine administration (0024) --------------------- */

export type MedAdminStatus = "given" | "missed" | "skipped";

/** Today's med-admin entries keyed by `${medication_id}|${slot}`. */
export async function getMedAdminToday(patientId: string): Promise<Map<string, MedAdminStatus>> {
  const { data, error } = await supabase
    .from("med_admin")
    .select("medication_id, slot, status")
    .eq("patient_id", patientId)
    .eq("log_date", todayISO());
  if (error) throw new Error(pgErr(error, "Could not load medicine records."));
  const m = new Map<string, MedAdminStatus>();
  for (const r of (data ?? []) as { medication_id: string; slot: string; status: MedAdminStatus }[]) {
    m.set(`${r.medication_id}|${r.slot}`, r.status);
  }
  return m;
}

/** Record a medicine as given/missed/skipped for a slot today (upsert). */
export async function setMedAdmin(
  patientId: string, medicationId: string, slot: string, status: MedAdminStatus,
): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase.from("med_admin").upsert(
    {
      patient_id: patientId,
      medication_id: medicationId,
      log_date: todayISO(),
      slot,
      status,
      recorded_by: auth.user?.id ?? null,
    },
    { onConflict: "medication_id,log_date,slot" },
  );
  if (error) throw new Error(pgErr(error, "Could not save the medicine record."));
}

/** Undo a medicine record for a slot today — deletes the row so the dose returns
 *  to "not recorded". Uses the existing med_admin delete grant + RLS
 *  (med_admin_write `for all` gated on can_see_patient); no schema/RLS change. */
export async function clearMedAdmin(patientId: string, medicationId: string, slot: string): Promise<void> {
  const { error } = await supabase
    .from("med_admin")
    .delete()
    .eq("patient_id", patientId)
    .eq("medication_id", medicationId)
    .eq("slot", slot)
    .eq("log_date", todayISO());
  if (error) throw new Error(pgErr(error, "Could not undo the medicine record."));
}

/* --------------------- Reading thresholds (0024, doctor) ------------------ */

export type ThresholdRow = {
  id: string;
  patient_id: string;
  param: string;
  min_val: number | null;
  max_val: number | null;
  unit: string | null;
};

/** Doctor-approved normal ranges per parameter (the ONLY basis for family status). */
export async function getThresholds(patientId: string): Promise<ThresholdRow[]> {
  const { data, error } = await supabase
    .from("reading_thresholds")
    .select("id, patient_id, param, min_val, max_val, unit")
    .eq("patient_id", patientId);
  if (error) throw new Error(pgErr(error, "Could not load thresholds."));
  return (data ?? []) as ThresholdRow[];
}

/** Doctor: set/clear a parameter's normal range (upsert on patient+param). */
export async function saveThreshold(
  patientId: string, param: string, min: number | null, max: number | null, unit: string | null,
): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase.from("reading_thresholds").upsert(
    {
      patient_id: patientId,
      param,
      min_val: min,
      max_val: max,
      unit,
      updated_by: auth.user?.id ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "patient_id,param" },
  );
  if (error) throw new Error(pgErr(error, "Could not save the threshold."));
}

/* ---------------------------- Meds / feed / approvals ---------------------- */

export async function getMedications(patientId: string): Promise<MedicationRow[]> {
  const { data, error } = await supabase
    .from("medications")
    .select("*")
    .eq("patient_id", patientId)
    .eq("active", true)
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as MedicationRow[];
}

export type NewApproval = {
  type: ApprovalRow["type"];
  message: string;
  suggestion?: string;
  urgency: ApprovalRow["urgency"];
  from_name?: string;
};

/** Raise a query / suggestion for the doctor (nurse query, duty med suggestion). */
export async function raiseApproval(patientId: string, a: NewApproval): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase.from("approvals").insert({
    patient_id: patientId,
    type: a.type,
    message: a.message,
    suggestion: a.suggestion ?? null,
    urgency: a.urgency,
    from_name: a.from_name ?? null,
    raised_by: auth.user?.id ?? null,
  });
  if (error) throw error;
}

/** The household's own concerns/questions for this patient (type patient_query),
 *  most-recent first. Excludes internal staff-to-doctor queries. */
export async function getPatientQueries(patientId: string): Promise<ApprovalRow[]> {
  const { data, error } = await supabase
    .from("approvals")
    .select("*")
    .eq("patient_id", patientId)
    .eq("type", "patient_query")
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  return (data ?? []) as ApprovalRow[];
}

/** Staff: stamp this patient's still-unread family messages as read (read receipt).
 *  Server-side: staff-only + same-institution. Best-effort; safe to call on open. */
export async function markPatientQueriesRead(patientId: string): Promise<void> {
  const { error } = await supabase.rpc("mark_patient_query_read", { p_patient: patientId });
  if (error) throw error;
}

/** Transcribe a short voice note to text (OpenAI, via the transcribe function).
 *  Returns the transcript only — the caller reviews it before sending. */
export async function transcribeAudio(audioBase64: string, mime: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke("transcribe", {
    body: { audio_base64: audioBase64, mime },
  });
  if (error) throw new Error(await edgeError(error));
  if (data?.error) throw new Error(data.error);
  return String(data?.text ?? "");
}

export async function getApprovals(patientId: string): Promise<ApprovalRow[]> {
  const { data, error } = await supabase
    .from("approvals")
    .select("*")
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ApprovalRow[];
}

export async function getDailyUpdates(patientId: string, limit = 12): Promise<UpdateRow[]> {
  const { data, error } = await supabase
    .from("daily_updates")
    .select("*")
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as UpdateRow[];
}

/** Append a note to the care feed (HOD/nurse/duty). */
export async function addUpdate(
  patientId: string,
  u: { source: UpdateRow["source"]; author_name: string; body: string; flag?: string },
): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase.from("daily_updates").insert({
    patient_id: patientId,
    source: u.source,
    author_name: u.author_name,
    body: u.body,
    flag: u.flag ?? "info",
    created_by: auth.user?.id ?? null,
  });
  if (error) throw error;
}

/* ------------------------ HOD (PMR) write actions -------------------------- */

/** Record the HOD's decision on an approval. RLS allows this for the PMR only. */
export async function decideApproval(
  id: string,
  status: "approved" | "declined" | "suggested",
): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("approvals")
    .update({ status, decided_by: auth.user?.id ?? null, decided_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export type QueryMessageRow = {
  id: string;
  query_id: string;
  patient_id: string;
  author_role: "caregiver" | "family" | "nurse" | "duty_doctor" | "pmr" | null;
  author_name: string | null;
  body: string;
  created_at: string;
};

/** All staff replies on this patient's family queries, oldest-first. Group by
 *  query_id in the UI to build each thread. */
export async function getQueryReplies(patientId: string): Promise<QueryMessageRow[]> {
  const { data, error } = await supabase
    .from("query_messages")
    .select("*")
    .eq("patient_id", patientId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as QueryMessageRow[];
}

/**
 * Staff replies to a family query — the nurse as first-level, or the doctor
 * intervening. Adds a message to the thread (which the family can read) and
 * marks the query answered. RLS lets nurse + doctor post; the family cannot.
 */
export async function postQueryReply(queryId: string, patientId: string, body: string): Promise<void> {
  const me = await getMyProfile();
  const { data: auth } = await supabase.auth.getUser();
  const { error: mErr } = await supabase.from("query_messages").insert({
    query_id: queryId,
    patient_id: patientId,
    author_id: auth.user?.id ?? null,
    author_role: me?.role ?? null,
    author_name: me?.full_name ?? null,
    body,
  });
  if (mErr) throw new Error(pgErr(mErr, "Could not send the reply."));
  // Mark the query answered (nurse + pmr allowed by RLS).
  const { error: sErr } = await supabase
    .from("approvals")
    .update({ status: "suggested", decided_by: auth.user?.id ?? null, decided_at: new Date().toISOString() })
    .eq("id", queryId);
  if (sErr) throw new Error(pgErr(sErr, "Reply saved, but the status could not be updated."));
}

export type MedicationInput = {
  name: string;
  dose: string;
  freq: string;
  timing: string;
  note?: string;
};

/** Add a medicine. RLS allows this for the PMR only. */
export async function addMedication(patientId: string, m: MedicationInput): Promise<MedicationRow> {
  const { data: auth } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("medications")
    .insert({ patient_id: patientId, ...m, updated_by: auth.user?.id ?? null })
    .select("*")
    .single();
  if (error) throw error;
  return data as MedicationRow;
}

export async function updateMedication(id: string, m: MedicationInput): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("medications")
    .update({ ...m, updated_by: auth.user?.id ?? null, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

/** Soft-remove a medicine (active = false), keeping the audit trail. */
export async function removeMedication(id: string): Promise<void> {
  const { error } = await supabase.from("medications").update({ active: false }).eq("id", id);
  if (error) throw error;
}

export type PendingCount = { pending: number; urgent: number };

/** Pending-approval counts keyed by patient_id (for the caseload badges), scoped
 *  to the given patients so it never scans approvals platform-wide. `urgent` is
 *  the subset flagged urgent, so the caseload can escalate them to the doctor. */
export async function getPendingApprovalCounts(patientIds: string[]): Promise<Record<string, PendingCount>> {
  if (!patientIds.length) return {};
  const { data, error } = await supabase
    .from("approvals")
    .select("patient_id, urgency")
    .eq("status", "pending")
    .in("patient_id", patientIds);
  if (error) throw error;
  const counts: Record<string, PendingCount> = {};
  for (const row of (data ?? []) as { patient_id: string; urgency: string }[]) {
    const c = counts[row.patient_id] ?? { pending: 0, urgent: 0 };
    c.pending += 1;
    if (row.urgency === "urgent") c.urgent += 1;
    counts[row.patient_id] = c;
  }
  return counts;
}

/** Unanswered FAMILY-query counts per patient (type patient_query only), for the
 *  nurse caseload — the nurse is the first-level responder. `urgent` is the
 *  serious subset the doctor should also see. */
export async function getFamilyQueryCounts(patientIds: string[]): Promise<Record<string, PendingCount>> {
  if (!patientIds.length) return {};
  const { data, error } = await supabase
    .from("approvals")
    .select("patient_id, urgency")
    .eq("status", "pending")
    .eq("type", "patient_query")
    .in("patient_id", patientIds);
  if (error) throw error;
  const counts: Record<string, PendingCount> = {};
  for (const row of (data ?? []) as { patient_id: string; urgency: string }[]) {
    const c = counts[row.patient_id] ?? { pending: 0, urgent: 0 };
    c.pending += 1;
    if (row.urgency === "urgent") c.urgent += 1;
    counts[row.patient_id] = c;
  }
  return counts;
}
