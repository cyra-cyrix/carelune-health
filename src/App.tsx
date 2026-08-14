import { useState } from "react";
import type { ReactNode } from "react";
import { CareluneProvider } from "./store/carelune";
import { useAuth } from "./auth/AuthProvider";
import { BrandingProvider, useBranding } from "./branding/BrandingProvider";
import { APP_ROLE_META, appRoleFromUser, type AppRole } from "./domain/appRoles";
import { LoopMark } from "./components/ui";
import OrgSetup from "./screens/admin/OrgSetup";
import Team from "./screens/admin/Team";
import RegistrationLink from "./screens/admin/RegistrationLink";
import Programme from "./screens/admin/Programme";
import SuperAdmin from "./screens/platform/SuperAdmin";
import ForcePasswordReset from "./screens/auth/ForcePasswordReset";

import CaregiverHome from "./screens/caregiver/CaregiverHome";
import FamilyOverview from "./screens/family/FamilyOverview";
import NursePatient from "./screens/nurse/NursePatient";
import DutyPatient from "./screens/duty/DutyPatient";
import Caseload from "./screens/pmr/Caseload";
import PatientProgress from "./screens/pmr/PatientProgress";
import Onboard from "./screens/intake/Onboard";
import PatientSetup from "./screens/intake/PatientSetup";

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
  if (profile?.must_reset_password) return <ForcePasswordReset />;

  // 2. Carelune platform super admin → the org console.
  if (profile?.is_super_admin) return <SuperAdmin />;

  // 3. Org admin first-run → name the platform.
  if (profile?.is_admin && org && !org.setup_complete) return <OrgSetup />;

  // 4. Everyone else → their role workspace.
  const role = appRoleFromUser(user);
  if (!role) return <NoRole />;

  return (
    <div className="min-h-screen bg-mist">
      <TopBar role={role} />
      <RoleSurface role={role} />
    </div>
  );
}

function RoleSurface({ role }: { role: AppRole }) {
  switch (role) {
    case "caregiver":
      return (
        <PhoneColumn>
          <CaregiverHome />
        </PhoneColumn>
      );
    case "family":
      return (
        <PhoneColumn>
          <FamilyOverview />
        </PhoneColumn>
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

type PmrScreen = "caseload" | "patient" | "setup" | "onboard" | "team" | "reglink" | "programme";

function PmrWorkspace() {
  const [screen, setScreen] = useState<PmrScreen>("caseload");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { profile } = useBranding();
  const isAdmin = profile?.is_admin ?? false;
  const inCaseload = screen === "caseload" || screen === "patient" || screen === "setup" || screen === "onboard";

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

      {screen === "caseload" && <Caseload onOpen={open} />}
      {screen === "patient" && selectedId && (
        <PatientProgress patientId={selectedId} onBack={() => setScreen("caseload")} />
      )}
      {screen === "setup" && selectedId && (
        <PatientSetup
          patientId={selectedId}
          onExit={() => setScreen("caseload")}
          onContinue={() => setScreen("onboard")}
        />
      )}
      {screen === "onboard" && selectedId && (
        <Onboard patientId={selectedId} onExit={() => setScreen("caseload")} />
      )}
      {screen === "team" && <Team />}
      {screen === "programme" && <Programme onBack={() => setScreen("caseload")} />}
      {screen === "reglink" && <RegistrationLink onBack={() => setScreen("caseload")} />}
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
    </>
  );
}

function RegLinkBtn({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`tap ml-auto shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-[13px] font-medium ${
        active ? "bg-brand-700 text-white" : "bg-brand-600 text-white hover:bg-brand-500"
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
  const { user, signOut } = useAuth();
  const { org, profile, platformName } = useBranding();
  const who = profile?.full_name?.trim() || user?.email || meta.label;
  const roleLabel = profile?.is_admin ? "Admin" : meta.label;

  return (
    <header className="sticky top-0 z-50 flex min-h-[3rem] items-center justify-between gap-3 border-b border-line bg-white px-4 py-2 sm:px-6">
      <div className="flex min-w-0 items-center gap-2 text-brand-600">
        {org?.logo_url ? (
          <img src={org.logo_url} alt="" className="h-[22px] w-[22px] shrink-0 rounded object-cover" />
        ) : (
          <LoopMark size={20} />
        )}
        <span className="flex min-w-0 flex-col justify-center leading-none">
          <span className="truncate text-[14px] font-semibold tracking-tight text-ink">{platformName}</span>
          <span className="mt-[3px] truncate text-[9.5px] font-medium uppercase tracking-[0.12em] text-sage-500">
            Care continues
          </span>
        </span>
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

function PhoneColumn({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-[640px]">{children}</div>;
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
          className="tap mt-4 rounded-full bg-brand-600 px-5 py-2 text-[14px] font-semibold text-white"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
