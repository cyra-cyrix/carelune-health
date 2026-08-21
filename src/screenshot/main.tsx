// Screenshot-harness entry. Renders one REAL production doctor screen with
// synthetic data (db aliased to dbMock) for the mandatory visual-QA pass. Which
// screen is chosen by ?screen=login|command|cockpit|studio-prepare|studio-review|builder.
// Never part of the production build.
import React from "react";
import { createRoot } from "react-dom/client";
import { BrandingProvider } from "../branding/BrandingProvider";
import { AuthScreen } from "../auth/AuthScreen";
import Landing from "../screens/marketing/Landing";
import Caseload from "../screens/pmr/Caseload";
import PatientProgress from "../screens/pmr/PatientProgress";
import PlanStudio from "../screens/intake/PlanStudio";
import NursePatient from "../screens/nurse/NursePatient";
import RegisterPatient from "../screens/register/RegisterPatient";
import CaregiverHome from "../screens/caregiver/CaregiverHome";
import FamilyOverview from "../screens/family/FamilyOverview";
import HomeCare, { type HcTab } from "../screens/home/HomeCare";
import DutyPatient from "../screens/duty/DutyPatient";
import ServiceBuilder from "../screens/platform/ServiceBuilder";
import "../index.css";

const screen = new URLSearchParams(location.search).get("screen") ?? "command";
const noop = () => {};

function Harness() {
  switch (screen) {
    case "login":
      return <AuthScreen />;
    case "landing":
      return <Landing onSignIn={noop} />;
    case "cockpit":
      return <PatientProgress patientId="p1" onBack={noop} />;
    case "nurse":
      return <NursePatient patientId="p1" onBack={noop} />;
    case "register":
      return <RegisterPatient token="demo" />;
    case "caregiver": {
      const t = new URLSearchParams(location.search).get("tab") as
        | "today" | "record" | "medicines" | "messages" | null;
      return <CaregiverHome initialTab={t ?? "today"} />;
    }
    case "family":
      return <FamilyOverview />;
    case "home": {
      const p = new URLSearchParams(location.search);
      const role = p.get("role") === "caregiver" ? "caregiver" : "family";
      const tab = (p.get("tab") as HcTab | null) ?? "today";
      return <HomeCare role={role} initialTab={tab} />;
    }
    case "builder":
      return <ServiceBuilder onExit={noop} />;
    case "duty":
      return <DutyPatient patientId="p1" onBack={noop} />;
    case "studio-prepare":
    case "studio-review":
      return <PlanStudio patientId="p1" onExit={noop} />;
    case "command":
    default:
      return <Caseload onOpen={noop} />;
  }
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {screen === "login" || screen === "register" ? (
      <Harness />
    ) : (
      <BrandingProvider>
        <Harness />
      </BrandingProvider>
    )}
  </React.StrictMode>,
);
