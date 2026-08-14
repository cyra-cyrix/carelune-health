// Typed data-access layer over Supabase. Screens call these functions instead
// of importing the static seed in src/data/*. RLS in the database decides what
// each signed-in user may read/write — these helpers never bypass it.

import { supabase } from "./supabase";

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
};

export type MyProfile = {
  id: string;
  role: "caregiver" | "family" | "nurse" | "duty_doctor" | "pmr";
  full_name: string | null;
  centre_id: string | null;
  is_admin: boolean;
  is_super_admin: boolean;
  must_reset_password: boolean;
};

/** The signed-in user's org (RLS returns only their own centre). */
export async function getMyOrg(): Promise<OrgRow | null> {
  const { data, error } = await supabase
    .from("centres")
    .select("id, name, display_name, logo_url, subdomain, setup_complete, invite_token")
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
    .select("id, role, full_name, centre_id, is_admin, is_super_admin, must_reset_password")
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

/** Admin: set the org's platform name / logo and mark setup complete. */
export async function updateOrgBranding(
  orgId: string,
  fields: { display_name?: string; logo_url?: string | null; setup_complete?: boolean },
): Promise<void> {
  const { error } = await supabase.from("centres").update(fields).eq("id", orgId);
  if (error) throw error;
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

/* -------------------------- Platform (super admin) ------------------------ */

export type OrgSummary = {
  id: string;
  name: string;
  display_name: string | null;
  setup_complete: boolean;
  admin_name: string | null;
  admin_email: string | null;
};

export type NewOrg = {
  org_name: string;
  admin_name: string;
  admin_email: string;
  admin_password: string;
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
      done_by: auth.user?.id ?? null,
      done_at: new Date().toISOString(),
    },
    { onConflict: "task_id,log_date" },
  );
  if (error) throw error;
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
  return {
    bp: r.bp ?? "",
    grbs: r.grbs ?? "",
    urineMl: r.urine_ml ?? "",
    foodIntake: r.food_intake ?? "",
    mood: r.mood ?? "",
    activity: r.activity ?? "",
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
      recorded_by: auth.user?.id ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "patient_id,reading_date" },
  );
  if (error) throw error;
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
