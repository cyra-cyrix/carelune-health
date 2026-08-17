import { useEffect, useState } from "react";

/*
 * A restrained, dismissible "install app" affordance for the APPLICATION only.
 * It never appears on first load unprompted: the browser fires
 * `beforeinstallprompt` solely when the app is genuinely installable, and once
 * dismissed we remember that choice. There is no equivalent on the marketing
 * site (this component is only mounted by the app).
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "carelune.pwa.install.dismissed";

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (localStorage.getItem(DISMISS_KEY) === "1") return;
    } catch {
      /* private mode — just proceed */
    }
    const onPrompt = (e: Event) => {
      e.preventDefault(); // suppress the default mini-infobar; we present our own
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setDeferred(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!deferred) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
    setDeferred(null);
  };

  const install = async () => {
    try {
      await deferred.prompt();
      await deferred.userChoice;
    } finally {
      setDeferred(null);
    }
  };

  return (
    <div
      role="dialog"
      aria-label="Install the Carelune app"
      style={{
        position: "fixed",
        left: "50%",
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)",
        transform: "translateX(-50%)",
        zIndex: 60,
        display: "flex",
        alignItems: "center",
        gap: 10,
        maxWidth: "min(92vw, 420px)",
        padding: "10px 12px 10px 14px",
        borderRadius: 14,
        background: "#0E6FDB",
        color: "#fff",
        boxShadow: "0 10px 30px rgba(14,111,219,0.35)",
        font: "500 13.5px/1.35 'Manrope', system-ui, sans-serif",
      }}
    >
      <span style={{ flex: 1 }}>Install Carelune for quick, full-screen access.</span>
      <button
        type="button"
        onClick={install}
        style={{ minHeight: 36, padding: "0 12px", borderRadius: 9, border: 0, background: "#fff", color: "#0E6FDB", fontWeight: 700, cursor: "pointer" }}
      >
        Install
      </button>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        style={{ minWidth: 36, minHeight: 36, borderRadius: 9, border: "1px solid rgba(255,255,255,0.5)", background: "transparent", color: "#fff", cursor: "pointer" }}
      >
        ✕
      </button>
    </div>
  );
}
