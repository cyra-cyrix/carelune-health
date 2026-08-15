// Screenshot-harness data layer. Swapped in for `src/lib/db` by
// vite.screenshot.config.ts so the REAL production screen components render with
// synthetic data — no Supabase, no auth, no network. This exists only for the
// mandatory visual-QA pass; it is never bundled into the real app.
//
// All types are re-exported (type-only, erased at runtime) from the real db so
// the synthetic data is checked against the production shapes.

export type {
  PatientRow, PendingCount, ReadingRow, MedicationRow, MedicationInput, ApprovalRow, UpdateRow,
  CareTeamMember, CareTaskRow, PatientPlanRow, QueryMessageRow, OrgRow, MyProfile, PackPathway,
  PlanIntake, DocumentFacts, DocumentRow, FactItem, FactMedicine, StoredFacts, TaskLogRow, NewApproval,
  PublicOrgInfo,
} from "../lib/db";

import type {
  PatientRow, PendingCount, ReadingRow, MedicationRow, MedicationInput, ApprovalRow, UpdateRow,
  CareTeamMember, CareTaskRow, PatientPlanRow, QueryMessageRow, OrgRow, MyProfile, PackPathway,
  PlanIntake, DocumentFacts, DocumentRow, StoredFacts,
} from "../lib/db";
import type { PlanDraft } from "../lib/pathwayValidation";

const params = new URLSearchParams(location.search);
const SCREEN = params.get("screen") ?? "command";

const now = Date.now();
const iso = (msAgo: number) => new Date(now - msAgo).toISOString();
const dayStart = (day: number) => new Date(now - (day - 1) * 86_400_000).toISOString();
const ymd = (daysAgo: number) => new Date(now - daysAgo * 86_400_000).toISOString().slice(0, 10);

/* -------------------------------- profile --------------------------------- */

export async function getMyProfile(): Promise<MyProfile> {
  return { id: "u-doc", role: "pmr", full_name: "Vivek Rao", centre_id: "c1", is_admin: true, is_super_admin: false, must_reset_password: false };
}
export async function getMyOrg(): Promise<OrgRow> {
  return {
    id: "c1", name: "Sunrise Spine & Neuro Institute", display_name: "Sunrise Spine & Neuro Institute",
    logo_url: null, subdomain: "sunrise", setup_complete: true, invite_token: null,
    institution_type: "hospital", contact_phone: null, service_hours: "8:00 AM–8:00 PM IST",
    emergency_note: null, emergency_number: "112", status: "active",
  };
}

export async function getPublicOrgInfo(): Promise<import("../lib/db").PublicOrgInfo> {
  return { institution_name: "Sunrise Spine & Neuro Institute", package_price: 5999, trial_days: 7 };
}
export async function registerPatient(): Promise<{ patient_name: string; family_email: string }> {
  return { patient_name: "Demo", family_email: "demo@example.com" };
}

/* -------------------------------- patients -------------------------------- */

const PATIENTS: PatientRow[] = [
  { id: "p2", centre_id: "c1", full_name: "Fatima Rahman", age: 58, sex: "F", location: "Indiranagar", discharged_on: ymd(6), journey_start: dayStart(6), journey_total_days: 30, diagnosis: ["Lumbar fusion L4–L5"], status: "active", pathway_pack_id: "spine", pathway_version_id: "v1" },
  { id: "p1", centre_id: "c1", full_name: "Anand Menon", age: 62, sex: "M", location: "Jayanagar", discharged_on: ymd(12), journey_start: dayStart(12), journey_total_days: 30, diagnosis: ["Ischaemic stroke (L MCA)", "Type 2 diabetes"], status: "active", pathway_pack_id: "neuro", pathway_version_id: "v2" },
  { id: "p3", centre_id: "c1", full_name: "Devi Krishnan", age: 70, sex: "F", location: "Malleshwaram", discharged_on: ymd(20), journey_start: dayStart(20), journey_total_days: 30, diagnosis: ["Haemorrhagic stroke"], status: "active", pathway_pack_id: "neuro", pathway_version_id: "v2" },
  { id: "p5", centre_id: "c1", full_name: "Joseph Thomas", age: 65, sex: "M", location: "Koramangala", discharged_on: ymd(15), journey_start: dayStart(15), journey_total_days: 30, diagnosis: ["Cervical myelopathy"], status: "active", pathway_pack_id: "spine", pathway_version_id: "v1" },
  { id: "p4", centre_id: "c1", full_name: "Rahul Nair", age: 49, sex: "M", location: "HSR Layout", discharged_on: ymd(1), journey_start: dayStart(1), journey_total_days: 30, diagnosis: [], status: "pending", pathway_pack_id: "spine", pathway_version_id: null },
];

export async function listPatients(): Promise<PatientRow[]> { return PATIENTS; }

export async function getPatient(id: string): Promise<PatientRow | null> {
  return PATIENTS.find((p) => p.id === id) ?? PATIENTS[1];
}

export async function getPendingApprovalCounts(): Promise<Record<string, PendingCount>> {
  return { p2: { pending: 2, urgent: 1 }, p3: { pending: 1, urgent: 0 } };
}
export async function getFamilyQueryCounts(): Promise<Record<string, PendingCount>> {
  return { p2: { pending: 1, urgent: 0 } };
}

/* -------------------------------- readings -------------------------------- */

function mkReadings(id: string, bp: number[], grbs: number[], urine: number[]): ReadingRow[] {
  return bp.map((_, i) => ({
    id: `${id}-r${i}`, patient_id: id, reading_date: ymd(bp.length - 1 - i),
    bp: `${bp[i]}/${Math.round(bp[i] * 0.63)}`, grbs: String(grbs[i]), urine_ml: String(urine[i]),
    food_intake: "Adequate", mood: "Settled", activity: "Assisted walking",
  }));
}
const READINGS: Record<string, ReadingRow[]> = {
  p1: mkReadings("p1", [150, 148, 144, 142, 138, 135, 132], [186, 178, 172, 165, 158, 150, 142], [900, 950, 1000, 1050, 1100, 1150, 1200]),
  p2: mkReadings("p2", [128, 130, 134, 138, 140, 143, 146], [110, 112, 115, 118, 120, 124, 128], [1300, 1250, 1200, 1180, 1150, 1120, 1100]),
  p3: mkReadings("p3", [138, 138, 137, 138, 139, 138, 138], [132, 130, 131, 130, 132, 131, 130], [1200, 1210, 1200, 1205, 1200, 1210, 1200]),
  p5: mkReadings("p5", [142, 140, 139, 137, 136, 134, 133], [200, 190, 182, 174, 166, 158, 150], [1000, 1040, 1080, 1120, 1160, 1200, 1240]),
};
export async function getReadingHistory(patientId: string): Promise<ReadingRow[]> {
  return READINGS[patientId] ?? [];
}

/* ------------------------------- medicines -------------------------------- */

const MEDS: MedicationRow[] = [
  { id: "m1", patient_id: "p1", name: "Aspirin", dose: "75 mg", freq: "0-0-1", timing: "After food", note: null, active: true },
  { id: "m2", patient_id: "p1", name: "Atorvastatin", dose: "40 mg", freq: "0-0-1", timing: "At night", note: null, active: true },
  { id: "m3", patient_id: "p1", name: "Metformin", dose: "500 mg", freq: "1-0-1", timing: "After food", note: "Hold if not eating", active: true },
  { id: "m4", patient_id: "p1", name: "Clopidogrel", dose: "75 mg", freq: "1-0-0", timing: "Morning", note: null, active: true },
];
export async function getMedications(patientId: string): Promise<MedicationRow[]> {
  return patientId === "p1" ? MEDS : [];
}
export async function addMedication(patientId: string, m: MedicationInput): Promise<MedicationRow> {
  return { id: `new-${now}`, patient_id: patientId, name: m.name, dose: m.dose, freq: m.freq, timing: m.timing, note: m.note ?? null, active: true };
}
export async function updateMedication(): Promise<void> {}
export async function removeMedication(): Promise<void> {}

/* ------------------------------- approvals -------------------------------- */

const APPROVALS: ApprovalRow[] = [
  { id: "a1", patient_id: "p1", type: "duty_med", from_name: "Dr. Farhan (duty)", message: "BP running higher in the evenings — consider adding amlodipine 5 mg?", suggestion: "Amlodipine 5 mg 0-0-1", urgency: "routine", status: "pending", created_at: iso(2 * 3600_000) },
  { id: "a2", patient_id: "p1", type: "nurse_query", from_name: "Nisha (nurse)", message: "Family asking whether the physiotherapy frequency can be increased this week.", suggestion: null, urgency: "routine", status: "pending", created_at: iso(5 * 3600_000) },
  { id: "a3", patient_id: "p1", type: "patient_query", from_name: "Lakshmi (caregiver)", message: "He felt slightly dizzy after the morning walk today.", suggestion: null, urgency: "urgent", status: "pending", created_at: iso(1 * 3600_000) },
];
export async function getApprovals(patientId: string): Promise<ApprovalRow[]> {
  return patientId === "p1" ? APPROVALS : [];
}
export async function decideApproval(): Promise<void> {}

/* --------------------------------- updates -------------------------------- */

const UPDATES: UpdateRow[] = [
  { id: "u1", patient_id: "p1", source: "caregiver", author_name: "Lakshmi", body: "Morning readings logged. BP 132/84, GRBS 142. Ate breakfast well.", flag: null, created_at: iso(3 * 3600_000) },
  { id: "u2", patient_id: "p1", source: "nurse", author_name: "Nisha", body: "Reviewed the wound photo — healing well, no discharge. Reassured the family.", flag: null, created_at: iso(4 * 3600_000) },
  { id: "u3", patient_id: "p1", source: "caregiver", author_name: "Lakshmi", body: "Slight dizziness after the walk; rested and settled after 10 minutes.", flag: "watch", created_at: iso(1 * 3600_000) },
  { id: "u4", patient_id: "p1", source: "pmr", author_name: "Dr. Vivek", body: "Continue current plan. Keep monitoring standing BP before walks.", flag: null, created_at: iso(30 * 60_000) },
];
export async function getDailyUpdates(patientId: string): Promise<UpdateRow[]> {
  return patientId === "p1" ? UPDATES : [];
}
export async function addUpdate(): Promise<void> {}

/* ------------------------------- care team -------------------------------- */

const TEAM: CareTeamMember[] = [
  { id: "t1", team_role: "lead_doctor", staff_id: "s1", full_name: "Dr. Vivek Rao", role: "pmr" },
  { id: "t2", team_role: "nurse", staff_id: "s2", full_name: "Nisha Kurian", role: "nurse" },
  { id: "t3", team_role: "coordinator", staff_id: "s3", full_name: "Divya Menon", role: "duty_doctor" },
];
export async function getCareTeam(patientId: string): Promise<CareTeamMember[]> {
  return patientId === "p1" ? TEAM : [];
}

/* ------------------------------- care tasks ------------------------------- */

const TASKS: CareTaskRow[] = [
  { id: "ct1", patient_id: "p1", time_label: "07:30", sort_order: 1, discipline: "Nursing", title: "Morning medicines & wound check", detail: null, active: true },
  { id: "ct2", patient_id: "p1", time_label: "08:00", sort_order: 2, discipline: "Monitoring", title: "Record BP, blood sugar", detail: null, active: true },
  { id: "ct3", patient_id: "p1", time_label: "10:00", sort_order: 3, discipline: "Physiotherapy", title: "Assisted indoor walking × 10 min", detail: null, active: true },
  { id: "ct4", patient_id: "p1", time_label: "11:00", sort_order: 4, discipline: "Physiotherapy", title: "Seated ankle & knee mobility", detail: null, active: true },
  { id: "ct5", patient_id: "p1", time_label: "13:00", sort_order: 5, discipline: "Diet", title: "Diabetic lunch — protein portion", detail: null, active: true },
  { id: "ct6", patient_id: "p1", time_label: "18:00", sort_order: 6, discipline: "Monitoring", title: "Evening BP & symptom check", detail: null, active: true },
];
export async function getCareTasks(patientId: string): Promise<CareTaskRow[]> {
  return patientId === "p1" ? TASKS : [];
}
export async function getTodayTaskLogs(patientId: string): Promise<Set<string>> {
  return patientId === "p1" ? new Set(["ct1", "ct2", "ct3", "ct5"]) : new Set();
}

/* ------------------------------ family concerns --------------------------- */

export async function getPatientQueries(patientId: string): Promise<ApprovalRow[]> {
  return patientId === "p1"
    ? [{ id: "q1", patient_id: "p1", type: "patient_query", from_name: "Suresh (family)", message: "Is the dizziness this morning something we should worry about?", suggestion: null, urgency: "urgent", status: "pending", created_at: iso(1 * 3600_000) }]
    : [];
}
export async function getQueryReplies(patientId: string): Promise<QueryMessageRow[]> {
  return patientId === "p1"
    ? [{ id: "qm1", query_id: "q1", patient_id: "p1", author_role: "nurse", author_name: "Nisha", body: "Thanks for flagging — brief dizziness after activity can be normal. We're watching his standing BP; call us if it recurs.", created_at: iso(40 * 60_000) }]
    : [];
}
export async function postQueryReply(): Promise<void> {}
export async function raiseApproval(): Promise<void> {}
export async function markPatientQueriesRead(): Promise<void> {}

/* --------------------------------- plans ---------------------------------- */

const basePlan: PlanDraft = {
  clinical_summary: "62-year-old man recovering from a left-MCA ischaemic stroke with mild right-sided weakness. Medically stable, at home on day 12, mobilising with assistance.",
  diagnosis: [{ text: "Ischaemic stroke (left MCA)", provenance: "document" }, { text: "Type 2 diabetes mellitus", provenance: "document" }],
  procedure: null,
  medicines: [
    { name: "Aspirin", dose: "75 mg", freq: "0-0-1", timing: "After food", note: "", provenance: "document" },
    { name: "Atorvastatin", dose: "40 mg", freq: "0-0-1", timing: "At night", note: "", provenance: "document" },
    { name: "Metformin", dose: "500 mg", freq: "1-0-1", timing: "After food", note: "Hold if not eating", provenance: "document" },
    { name: "Clopidogrel", dose: "75 mg", freq: "1-0-0", timing: "Morning", note: "", provenance: "document" },
  ],
  investigations: [],
  daily_tasks: [
    { time_label: "07:30", discipline: "Nursing", title: "Morning medicines & wound check", detail: "", provenance: "document" },
    { time_label: "08:00", discipline: "Monitoring", title: "Record BP and blood sugar", detail: "", provenance: "pathway" },
  ],
  therapy_tasks: [
    { time_label: "10:00", discipline: "Physiotherapy", title: "Assisted indoor walking × 10 min", detail: "Progress distance as tolerated", provenance: "pathway" },
    { time_label: "11:00", discipline: "Physiotherapy", title: "Seated ankle & knee mobility", detail: "", provenance: "pathway" },
  ],
  diet: [{ text: "Diabetic diet — controlled carbohydrate, high protein", provenance: "document" }, { text: "2 litres fluid daily unless restricted", provenance: "pathway" }],
  observations: [
    { module: "blood_pressure", frequency: "twice daily", recorded_by: "caregiver" },
    { module: "blood_sugar", frequency: "daily", recorded_by: "caregiver" },
    { module: "pain", frequency: "daily", recorded_by: "caregiver" },
  ],
  milestones: [
    { key: "sit", name: "Sit unsupported for 30 min", by_day: 7 },
    { key: "walk", name: "Walk indoors with a stick", by_day: 14 },
    { key: "stairs", name: "Manage stairs with support", by_day: 25 },
  ],
  precautions: [{ text: "Supervise all walking — fall risk", provenance: "doctor" }, { text: "Report any new weakness or slurred speech immediately", provenance: "pathway" }],
  warning_signs: [
    { text: "New or worsening weakness, facial droop or slurred speech", severity: "urgent" },
    { text: "Blood sugar below 70 or above 300 mg/dL", severity: "urgent" },
    { text: "Persistent giddiness or a fall", severity: "routine" },
  ],
  escalation: { routine: "Rehab nurse", urgent: "Lead clinician", emergency: "112 / 108" },
  education: [],
  review_dates: [],
  missing: [],
  conflicts: [],
};

const draftPlan: PlanDraft = {
  ...basePlan,
  missing: ["Blood pressure target range not stated in the discharge summary", "Next outpatient review date not specified"],
  conflicts: ["Discharge summary lists Metformin 1-0-1 but the prescription page shows 1-1-1 — confirm before activating"],
};

export async function getPatientPlan(patientId: string): Promise<PatientPlanRow | null> {
  void patientId;
  if (SCREEN === "studio-prepare") return null;
  if (SCREEN === "studio-review") return { id: "pl1", version: 1, status: "draft", content: draftPlan, pathway_version_id: "v2", updated_at: iso(0), activated_at: null };
  // cockpit / other → an active plan
  return { id: "pl1", version: 1, status: "approved", content: basePlan, pathway_version_id: "v2", updated_at: iso(0), activated_at: iso(2 * 86_400_000) };
}
export async function savePlan(): Promise<void> {}
export async function activateCarePlan(): Promise<{ medicines: number; tasks: number }> { return { medicines: 4, tasks: 6 }; }

/* ------------------------------ plan studio prep -------------------------- */

export async function getPackPathways(): Promise<PackPathway[]> {
  return [
    { pathway_id: "pw1", key: "mca_stroke", name: "Ischaemic stroke — home recovery", status: "approved", version_id: "v2", version_status: "approved", institution_approved: true },
    { pathway_id: "pw2", key: "haemorrhagic", name: "Haemorrhagic stroke — home recovery", status: "clinically_review_required", version_id: "v3", version_status: "clinically_review_required", institution_approved: false },
  ];
}
export async function approvePathwayVersion(): Promise<void> {}
export async function assignGoverningVersion(): Promise<void> {}

const FACTS: DocumentFacts = {
  diagnoses: [{ text: "Ischaemic stroke (left MCA)", provenance: "document" }, { text: "Type 2 diabetes mellitus", provenance: "document" }],
  procedure: null,
  medicines: [
    { name: "Aspirin", dose: "75 mg", freq: "0-0-1", timing: "After food", note: "", provenance: "document" },
    { name: "Atorvastatin", dose: "40 mg", freq: "0-0-1", timing: "At night", note: "", provenance: "document" },
    { name: "Metformin", dose: "500 mg", freq: "1-0-1", timing: "After food", note: "", provenance: "document" },
  ],
  investigations: [{ text: "CT head: established left MCA infarct", provenance: "document" }],
  precautions: [{ text: "Supervise walking — fall risk", provenance: "document" }],
  diet: [{ text: "Diabetic diet", provenance: "document" }],
  baseline_function: "Mobilising with one-person assistance",
  dates: { discharged_on: ymd(12), surgery_on: "" },
  missing: ["Blood pressure target not stated"],
  conflicts: [],
};
export async function extractFacts(): Promise<DocumentFacts> { return FACTS; }
export async function getDocumentFacts(): Promise<StoredFacts> {
  return SCREEN === "studio-prepare" ? { facts: FACTS, source_document_id: "d1" } : null;
}
export async function saveDocumentFacts(): Promise<void> {}

const DOCS: DocumentRow[] = [
  { id: "d1", patient_id: "p1", file_name: "Discharge summary — Anand Menon.pdf", mime: "application/pdf", size_bytes: 184_320, doc_type: "discharge_summary", storage_path: "c1/p1/discharge.pdf", created_at: iso(86_400_000) },
  { id: "d2", patient_id: "p1", file_name: "Brain CT report.pdf", mime: "application/pdf", size_bytes: 96_000, doc_type: "imaging", storage_path: "c1/p1/ct.pdf", created_at: iso(86_400_000) },
];
export async function getPatientDocuments(): Promise<DocumentRow[]> { return DOCS; }

export async function getPlanIntake(): Promise<PlanIntake | null> {
  return SCREEN === "studio-prepare"
    ? { milestone_goal: "Independent indoor walking with a stick", milestone_by: "By week 3", monitor_focus: "Standing blood pressure before walks; blood sugar (diabetic)", non_negotiables: "Never leave unsupervised while walking; report any new weakness immediately" }
    : null;
}
export async function savePlanIntake(): Promise<void> {}
export async function generatePlan(): Promise<{ plan: PlanDraft; validation: { ok: boolean; errors: string[] } }> {
  return { plan: draftPlan, validation: { ok: true, errors: [] } };
}
