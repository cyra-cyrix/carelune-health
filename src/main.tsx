import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AuthProvider } from "./auth/AuthProvider";
import { AuthGate } from "./auth/AuthScreen";
import RegisterPatient from "./screens/register/RegisterPatient";
import { registerServiceWorker } from "./pwa/register";
import "./index.css";

// Public patient-registration link (?register=<token>) renders BEFORE the auth
// gate — the family has no account yet; the token authorises them.
const registerToken = new URLSearchParams(window.location.search).get("register");

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {registerToken ? (
      <RegisterPatient token={registerToken} />
    ) : (
      <AuthProvider>
        <AuthGate>
          <App />
        </AuthGate>
      </AuthProvider>
    )}
  </React.StrictMode>
);

// PWA: register the service worker in production builds of the APP only. The
// marketing build has a different entry (src/marketing.tsx) and never runs this.
if (import.meta.env.PROD) registerServiceWorker();
