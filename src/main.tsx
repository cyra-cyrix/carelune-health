import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AuthProvider } from "./auth/AuthProvider";
import { AuthGate } from "./auth/AuthScreen";
import RegisterPatient from "./screens/register/RegisterPatient";
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
