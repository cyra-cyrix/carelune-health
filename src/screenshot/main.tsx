// Screenshot-harness entry. Renders one REAL production doctor screen with
// synthetic data (db aliased to dbMock) for the mandatory visual-QA pass. Which
// screen is chosen by ?screen=login|command|cockpit|studio-prepare|studio-review.
// Never part of the production build.
import React from "react";
import { createRoot } from "react-dom/client";
import { BrandingProvider } from "../branding/BrandingProvider";
import { AuthScreen } from "../auth/AuthScreen";
import Caseload from "../screens/pmr/Caseload";
import PatientProgress from "../screens/pmr/PatientProgress";
import PlanStudio from "../screens/intake/PlanStudio";
import "../index.css";

const screen = new URLSearchParams(location.search).get("screen") ?? "command";
const noop = () => {};

function Harness() {
  switch (screen) {
    case "login":
      return <AuthScreen />;
    case "cockpit":
      return <PatientProgress patientId="p1" onBack={noop} />;
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
    {screen === "login" ? (
      <Harness />
    ) : (
      <BrandingProvider>
        <Harness />
      </BrandingProvider>
    )}
  </React.StrictMode>,
);
