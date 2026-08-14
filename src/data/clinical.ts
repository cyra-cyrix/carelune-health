import type { MedDose, Medication, LabResult, LabOrder, PatientHistory } from "../types";

// Anand Menon's clinical record — the diagnosis and history that started the
// rehab journey. Deliberately coherent with his meds/labs/care plan:
// HTN → amlodipine, T2DM → rising HbA1c, dyslipidemia → statin, spasticity →
// baclofen, dysphagia → thickened feeds, low mood → escitalopram.
export const patientHistory: PatientHistory = {
  primaryDx: "Acute ischemic stroke — right MCA territory, left hemiparesis",
  onset: "Onset 24 Apr 2026 · ~11 weeks ago",
  timeline: [
    { label: "Stroke onset", date: "24 Apr" },
    { label: "Acute care + inpatient rehab", date: "25 Apr – 26 Jun" },
    { label: "Discharged to home program", date: "27 Jun · Day 0" },
    { label: "Home continuity (today)", date: "Day 12" },
  ],
  comorbidities: ["Hypertension", "Type 2 diabetes", "Dyslipidemia"],
  activeProblems: ["Left spastic hemiparesis", "Dysphagia — resolving, thickened feeds", "Post-stroke low mood"],
  allergies: ["Penicillin — rash"],
  premorbid: "Independent; ran a small shop; no mobility aids; lives with spouse.",
  course:
    "R-MCA infarct on CT/MRI, thrombolysed within window. Inpatient rehab regained sitting balance and one-person transfers. Discharged with left hemiparesis, mild dysphagia on thickened feeds, and low mood — all under active home management.",
  goals: [
    "Independent standing transfers",
    "Self-feed a full meal",
    "Community ambulation with an aid",
    "Return to home role",
  ],
};



// Today's medication rounds for the caretaker — plain language, one-tap given.
// Seeded partway through the day (morning taken, later rounds due).
// Every entry carries its verified prescribing source. Medication information
// may come only from a verified discharge prescription or a documented Medical
// Clinician consultation — never from Carelune staff or the caregiver.
const DISCHARGE_RX = {
  sourceKind: "discharge_prescription" as const,
  sourceRef: "Discharge prescription · inpatient rehab centre (fictional)",
  sourceDate: "27 Jun 2026",
  lastVerified: "Day 0",
  verifiedBy: "Dr. Farhan (Medical Clinician)",
};
const CONSULT_RX = {
  sourceKind: "clinician_consultation" as const,
  sourceRef: "Video consultation note · Dr. Farhan",
  sourceDate: "Day 10",
  lastVerified: "Day 10",
  verifiedBy: "Dr. Farhan (Medical Clinician)",
};

export const medSchedule: MedDose[] = [
  { id: "m1", name: "Aspirin", dose: "75 mg", route: "By mouth", purpose: "Prevents another clot", withFood: true, slot: "Morning", time: "08:00", state: "taken", ...DISCHARGE_RX },
  { id: "m2", name: "Atorvastatin", dose: "20 mg", route: "By mouth", purpose: "Lowers cholesterol", withFood: true, slot: "Morning", time: "08:00", state: "taken", ...DISCHARGE_RX },
  { id: "m3", name: "Amlodipine", dose: "5 mg", route: "By mouth", purpose: "Controls blood pressure", slot: "Morning", time: "08:00", state: "taken", ...DISCHARGE_RX },
  { id: "m4", name: "Baclofen", dose: "10 mg", route: "By mouth", purpose: "Relaxes stiff muscles", slot: "Afternoon", time: "14:00", state: "due", changed: true, ...CONSULT_RX },
  { id: "m5", name: "Baclofen", dose: "10 mg", route: "By mouth", purpose: "Relaxes stiff muscles", slot: "Night", time: "20:00", state: "due", changed: true, ...CONSULT_RX },
  { id: "m6", name: "Escitalopram", dose: "10 mg", route: "By mouth", purpose: "Supports mood", withFood: true, slot: "Night", time: "20:00", state: "due", ...DISCHARGE_RX },
  { id: "m7", name: "Paracetamol", dose: "500 mg", route: "By mouth", purpose: "For pain — only if needed", slot: "As needed", time: "PRN", state: "prn", ...DISCHARGE_RX },
];

export const lastMedChange =
  "Dr. Farhan increased Baclofen to 10 mg after a video consultation · 2 days ago";

// An investigation advised at the last consultation — the caregiver only needs
// the reminder; the family arranges it with their own provider.
export const labDue: LabOrder = {
  name: "HbA1c + lipid profile",
  due: "due this Friday",
  collection: "Advised by Dr. Farhan at the last consultation",
};

// The full regimen — the doctor's working list on the consult screen.
export const medications: Medication[] = [
  { id: "d1", name: "Aspirin", dose: "75 mg", schedule: "1-0-0", purpose: "Antiplatelet", status: "active" },
  { id: "d2", name: "Atorvastatin", dose: "20 mg", schedule: "0-0-1", purpose: "Statin · lipid control", status: "active" },
  { id: "d3", name: "Amlodipine", dose: "5 mg", schedule: "1-0-0", purpose: "Antihypertensive", status: "active" },
  { id: "d4", name: "Baclofen", dose: "10 mg", schedule: "0-1-1", purpose: "Spasticity", status: "changed", note: "Up from 5 mg — tolerating well, no drowsiness logged" },
  { id: "d5", name: "Escitalopram", dose: "10 mg", schedule: "0-0-1", purpose: "Post-stroke mood", status: "active" },
  { id: "d6", name: "Paracetamol", dose: "500 mg", schedule: "PRN", purpose: "Analgesia", status: "active" },
];

// Recent home-collected labs — trended and flagged for the doctor.
export const labResults: LabResult[] = [
  { id: "l1", name: "HbA1c", value: "7.8", unit: "%", ref: "< 7.0", flag: "high", date: "3 days ago", trend: [7.1, 7.4, 7.8] },
  { id: "l2", name: "LDL cholesterol", value: "82", unit: "mg/dL", ref: "< 100", flag: "normal", date: "3 days ago", trend: [128, 104, 82] },
  { id: "l3", name: "Creatinine", value: "1.1", unit: "mg/dL", ref: "0.7–1.3", flag: "normal", date: "3 days ago", trend: [1.0, 1.1, 1.1] },
  { id: "l4", name: "Potassium", value: "4.2", unit: "mmol/L", ref: "3.5–5.1", flag: "normal", date: "3 days ago", trend: [4.0, 4.3, 4.2] },
];
