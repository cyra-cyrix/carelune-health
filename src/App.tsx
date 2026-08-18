import { lazy, Suspense, useState } from "react";
import type { ReactNode } from "react";
import { CareluneProvider } from "./store/carelune";
import { useAuth } from "./auth/AuthProvider";
import { BrandingProvider, useBranding } from "./branding/BrandingProvider";
import { APP_ROLE_META, appRoleFromUser, type AppRole } from "./domain/appRoles";
import { LoopMark } from "./components/ui";
import { InstallPrompt } from "./pwa/InstallPrompt";

// Route-level code-splitting: each role workspace + admin/setup screen loads on
// demand so the initial bundle stays small. The heaviest deps (pdfjs in Onboard,
// the plan studio) ship in their own chunks, fetched only when that screen opens.
const OrgSetup = lazy(() => import("./screens/admin/OrgSetup"));
const Team = lazy(() => import("./screens/admin/Team"));
const RegistrationLink = lazy(() => import("./screens/admin/RegistrationLink"));
const Programme = lazy(() => import("./screens/admin/Programme"));
const SuperAdmin = lazy(() => import("./screens/platform/SuperAdmin"));
const ForcePasswordReset = lazy(() => import("./screens/auth/ForcePasswordReset"));
// Family + Caregiver share one mobile Home Care surface (role decides record
// permissions + household-only actions). The legacy CaregiverHome/FamilyOverview
// screens are retired from routing but kept on disk until this redesign is approved.
const HomeCare = lazy(() => import("./screens/home/HomeCare"));
const NursePatient = lazy(() => import("./screens/nurse/NursePatient"));
const DutyPatient = lazy(() => import("./screens/duty/DutyPatient"));
const Caseload = lazy(() => import("./screens/pmr/Caseload"));
const PatientProgress = lazy(() => import("./screens/pmr/PatientProgress"));
const Onboard = lazy(() => import("./screens/intake/Onboard"));
const PatientSetup = lazy(() => import("./screens/intake/PatientSetup"));
const PlanStudio = lazy(() => import("./screens/intake/PlanStudio"));

/** Full-screen loader for a whole-page lazy route. */
function PageLoader() {
  return (
    <div className="grid min-h-screen place-items-center bg-mist">
      <div className="animate-pulse text-brand-600"><LoopMark size={28} /></div>
    </div>
  );
}
/** In-content loader that keeps the surrounding chrome (top bar / subnav). */
function PanelLoader() {
  return (
    <div className="grid min-h-[45vh] place-items-center">
      <div className="animate-pulse text-brand-600"><LoopMark size={24} /></div>
    </div>
  );
}

/**
 * v2 role router. The signed-in account's role (from Supabase user_metadata)
 * decides the whole experience — no role switcher, no guided-demo chrome. Data
 * still comes from the in-memory CareluneProvider until the pipeline/DB phase.
 */
export default function App() {
  return (
    <BrandingProvider>
      <CareluneProvider>
        <Shell />
      </CareluneProvider>
    </BrandingProvider>
  );
}

function Shell() {
  const { user } = useAuth();
  const { org, profile, loading } = useBranding();

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-mist">
        <div className="animate-pulse text-brand-600">
          <LoopMark size={28} />
        </div>
      </div>
    );
  }

  // 1. Temporary password → must set your own before anything else.
  if (profile?.must_reset_password) return <Suspense fallback={<PageLoader />}><ForcePasswordReset /></Suspense>;

  // 2. Carelune platform super admin → the org console.
  if (profile?.is_super_admin) return <Suspense fallback={<PageLoader />}><SuperAdmin /></Suspense>;

  // 3. Institution paused by the super admin → suspend access (no data is lost).
  if (org?.status === "paused") return <InstitutionPaused />;

  // 3. Org admin first-run → name the platform.
  if (profile?.is_admin && org && !org.setup_complete) return <Suspense fallback={<PageLoader />}><OrgSetup /></Suspense>;

  // 4. Everyone else → their role workspace.
  const role = appRoleFromUser(user);
  if (!role) return <NoRole />;

  return (
    <div className="cl-app min-h-screen bg-mist">
      <TopBar role={role} />
      <RoleSurface role={role} />
      {/* Restrained install affordance — only ever mounted for a signed-in user. */}
      <InstallPrompt />
    </div>
  );
}

function RoleSurface({ role }: { role: AppRole }) {
  switch (role) {
    case "caregiver":
      return (
        <Suspense fallback={<PanelLoader />}>
          <HomeCare role="caregiver" />
        </Suspense>
      );
    case "family":
      return (
        <Suspense fallback={<PanelLoader />}>
          <HomeCare role="family" />
        </Suspense>
      );
    case "nurse":
      return <NurseWorkspace />;
    case "duty_doctor":
      return <DutyWorkspace />;
    case "pmr":
      return <PmrWorkspace />;
  }
}

/* ---------------- PMR workspace (caseload → patient → weekly review · governance) ---------------- */

type PmrScreen = "caseload" | "patient" | "setup" | "planstudio" | "onboard" | "team" | "reglink" | "programme";

function PmrWorkspace() {
  const [screen, setScreen] = useState<PmrScreen>("caseload");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { profile } = useBranding();
  const isAdmin = profile?.is_admin ?? false;
  const inCaseload = screen === "caseload" || screen === "patient" || screen === "setup" || screen === "planstudio" || screen === "onboard";

  const open = (id: string, status?: string) => {
    setSelectedId(id);
    setScreen(status === "pending" ? "setup" : "patient");
  };

  return (
    <>
      <div className="border-b border-line bg-white px-4 sm:px-6">
        <div className="mx-auto flex max-w-[1100px] items-center gap-5 overflow-x-auto">
          <SubnavBtn active={inCaseload} onClick={() => setScreen("caseload")}>
            Caseload
          </SubnavBtn>
          {isAdmin && (
            <SubnavBtn active={screen === "team"} onClick={() => setScreen("team")}>
              Team
            </SubnavBtn>
          )}
          {isAdmin && (
            <SubnavBtn active={screen === "programme"} onClick={() => setScreen("programme")}>
              Programme
            </SubnavBtn>
          )}
          <RegLinkBtn active={screen === "reglink"} onClick={() => setScreen("reglink")} />
        </div>
      </div>

      <Suspense fallback={<PanelLoader />}>
        {screen === "caseload" && <Caseload onOpen={open} />}
        {screen === "patient" && selectedId && (
          <PatientProgress patientId={selectedId} onBack={() => setScreen("caseload")} />
        )}
        {screen === "setup" && selectedId && (
          <PatientSetup
            patientId={selectedId}
            onExit={() => setScreen("caseload")}
            onContinue={() => setScreen("planstudio")}
          />
        )}
        {screen === "planstudio" && selectedId && (
          <PlanStudio patientId={selectedId} onExit={() => setScreen("caseload")} />
        )}
        {screen === "onboard" && selectedId && (
          <Onboard patientId={selectedId} onExit={() => setScreen("caseload")} />
        )}
        {screen === "team" && <Team />}
        {screen === "programme" && <Programme onBack={() => setScreen("caseload")} />}
        {screen === "reglink" && <RegistrationLink onBack={() => setScreen("caseload")} />}
      </Suspense>
    </>
  );
}

/* ---------------- Duty Doctor workspace ---------------- */

type DutyScreen = "patients" | "patient" | "onboard" | "reglink";

function DutyWorkspace() {
  const [screen, setScreen] = useState<DutyScreen>("patients");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Nurse/Duty never author a plan — a pending patient opens read-only; only the
  // doctor (PMR) activates. Enforced server-side by RLS + the activation trigger.
  const open = (id: string) => {
    setSelectedId(id);
    setScreen("patient");
  };
  return (
    <>
      <div className="border-b border-line bg-white px-4 sm:px-6">
        <div className="mx-auto flex max-w-[1100px] items-center gap-5 overflow-x-auto">
          <SubnavBtn active={screen === "patients" || screen === "patient" || screen === "onboard"} onClick={() => setScreen("patients")}>
            Patients
          </SubnavBtn>
          <RegLinkBtn active={screen === "reglink"} onClick={() => setScreen("reglink")} />
        </div>
      </div>
      <Suspense fallback={<PanelLoader />}>
        {screen === "patients" && (
          <Caseload
            onOpen={open}
            heading="Patients"
            subtitle="Confirm summaries, monitor vitals, and suggest changes to the doctor."
            showPending={false}
          />
        )}
        {screen === "patient" && selectedId && <DutyPatient patientId={selectedId} onBack={() => setScreen("patients")} />}
        {screen === "onboard" && selectedId && <Onboard patientId={selectedId} onExit={() => setScreen("patients")} />}
        {screen === "reglink" && <RegistrationLink onBack={() => setScreen("patients")} />}
      </Suspense>
    </>
  );
}

/* ---------------- Nurse workspace ---------------- */

function NurseWorkspace() {
  const [screen, setScreen] = useState<DutyScreen>("patients");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Nurse/Duty never author a plan — a pending patient opens read-only; only the
  // doctor (PMR) activates. Enforced server-side by RLS + the activation trigger.
  const open = (id: string) => {
    setSelectedId(id);
    setScreen("patient");
  };
  return (
    <>
      <div className="border-b border-line bg-white px-4 sm:px-6">
        <div className="mx-auto flex max-w-[1100px] items-center gap-5 overflow-x-auto">
          <SubnavBtn active={screen === "patients" || screen === "patient" || screen === "onboard"} onClick={() => setScreen("patients")}>
            Patients
          </SubnavBtn>
          <RegLinkBtn active={screen === "reglink"} onClick={() => setScreen("reglink")} />
        </div>
      </div>
      <Suspense fallback={<PanelLoader />}>
        {screen === "patients" && (
          <Caseload
            onOpen={open}
            heading="Patients"
            subtitle="First point of contact — answer families, monitor the day, and raise queries to the doctors."
            countType="family"
          />
        )}
        {screen === "patient" && selectedId && <NursePatient patientId={selectedId} onBack={() => setScreen("patients")} />}
        {screen === "onboard" && selectedId && <Onboard patientId={selectedId} onExit={() => setScreen("patients")} />}
        {screen === "reglink" && <RegistrationLink onBack={() => setScreen("patients")} />}
      </Suspense>
    </>
  );
}

function RegLinkBtn({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`tap ml-auto shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-[13px] font-medium ${
        active ? "bg-brand-900 text-white" : "bg-brand-800 text-white hover:bg-brand-900"
      }`}
    >
      Registration link
    </button>
  );
}

function SubnavBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-1 py-3 text-[13px] font-medium transition-colors ${
        active ? "border-brand-600 text-ink" : "border-transparent text-sage-600 hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

/* ---------------- Shared chrome ---------------- */

function TopBar({ role }: { role: AppRole }) {
  const meta = APP_ROLE_META[role];
  const { signOut } = useAuth();
  const { org, profile, platformName } = useBranding();
  // Never a raw email — a real name, else the role. (No email-as-identity.)
  const who = profile?.full_name?.trim() || meta.label;
  const roleLabel = profile?.is_admin ? "Admin" : meta.label;
  const monogram = (platformName?.trim()?.[0] ?? "•").toUpperCase();

  return (
    <header className="sticky top-0 z-50 flex min-h-[3rem] items-center justify-between gap-3 border-b border-line bg-white px-4 py-2 sm:px-6">
      {/* Institution branding only — dynamic logo or monogram, never a Carelune mark. */}
      <div className="flex min-w-0 items-center gap-2.5">
        {org?.logo_url ? (
          <img src={org.logo_url} alt="" className="h-7 w-7 shrink-0 rounded-md object-cover ring-1 ring-ink/10" />
        ) : (
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-brand-600 text-[13px] font-bold text-white">
            {monogram}
          </span>
        )}
        <span className="truncate text-[14px] font-semibold tracking-tight text-ink">{platformName}</span>
      </div>
      <div className="flex min-w-0 items-center gap-3">
        <span className="truncate text-[12px] text-sage-600">
          {who} · <span className="font-medium text-ink">{roleLabel}</span>
        </span>
        <button
          type="button"
          onClick={() => void signOut()}
          className="tap shrink-0 rounded-md border border-line px-2.5 py-1 text-[12px] font-medium text-sage-600 hover:bg-mist-100 hover:text-ink"
        >
          Sign out
        </button>
      </div>
    </header>
  );
}

function NoRole() {
  const { user, signOut } = useAuth();
  return (
    <div className="grid min-h-screen place-items-center bg-mist px-6 text-center">
      <div className="max-w-sm">
        <h1 className="font-display text-xl font-semibold text-ink">No role assigned</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-sage-600">
          {user?.email ?? "This account"} does not have a Carelune role yet. Ask your centre admin to
          assign one.
        </p>
        <button
          type="button"
          onClick={() => void signOut()}
          className="tap mt-4 rounded-full bg-brand-800 px-5 py-2 text-[14px] font-semibold text-white"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

/** Shown when the super admin has paused this institution. Access is suspended
 *  (not deleted) — resuming restores everything exactly as it was. */
function InstitutionPaused() {
  const { signOut } = useAuth();
  const { platformName } = useBranding();
  return (
    <div className="grid min-h-screen place-items-center bg-mist px-6 text-center">
      <div className="max-w-sm">
        <span className="inline-flex rounded-full bg-warn-100 px-3 py-1 text-[12px] font-semibold text-warn-600">Access paused</span>
        <h1 className="mt-3 font-display text-xl font-semibold text-ink">{platformName} is paused</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-sage-600">
          Your institution's access has been temporarily suspended by Carelune. No data has been lost —
          everything is restored when access resumes. Please contact your Carelune administrator.
        </p>
        <button
          type="button"
          onClick={() => void signOut()}
          className="tap mt-4 rounded-full bg-brand-800 px-5 py-2 text-[14px] font-semibold text-white"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
