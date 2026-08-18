import { useEffect, useState } from "react";

/*
 * Install affordances for the APPLICATION only (never the marketing site).
 *
 * Android/Chromium fires `beforeinstallprompt` when the app is genuinely
 * installable, so those users get the real OS prompt. iOS Safari has no such
 * event — the only route is Share → Add to Home Screen — so those users get the
 * three steps written out instead of a button that would do nothing.
 *
 * Both are dismissible and the choice is remembered. "Install Carelune" stays
 * reachable from More afterwards. Nothing here claims offline capability.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "carelune.pwa.install.dismissed";

export type InstallPlatform = "android" | "ios" | "other";

function detectPlatform(): InstallPlatform {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  // iPadOS 13+ reports as Macintosh; the touch-point check separates it.
  const isIos = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (isIos) return "ios";
  if (/Android/.test(ua)) return "android";
  return "other";
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return iosStandalone || window.matchMedia?.("(display-mode: standalone)").matches === true;
}

/** The one source of install state. Safe to call from more than one component. */
export function usePwaInstall() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const platform = detectPlatform();

  useEffect(() => {
    if (typeof window === "undefined") return;
    setInstalled(isStandalone());
    try {
      if (localStorage.getItem(DISMISS_KEY) === "1") setDismissed(true);
    } catch {
      /* private mode — just proceed */
    }
    const onPrompt = (e: Event) => {
      e.preventDefault(); // suppress the mini-infobar; we present our own
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => { setDeferred(null); setInstalled(true); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* ignore */ }
    setDismissed(true);
  };

  const promptInstall = async () => {
    if (!deferred) return;
    try {
      await deferred.prompt();
      await deferred.userChoice;
    } finally {
      setDeferred(null);
    }
  };

  return {
    /** The native Android/Chromium prompt is available right now. */
    canPrompt: deferred !== null,
    /** iOS Safari: show the Share → Add to Home Screen steps instead. */
    needsManualSteps: platform === "ios" && !installed,
    platform,
    installed,
    dismissed,
    dismiss,
    promptInstall,
  };
}

export const IOS_INSTALL_STEPS = [
  "Tap the Share button in Safari",
  "Choose “Add to Home Screen”",
  "Tap “Add”",
];

/** The restrained, dismissible banner shown once to a signed-in user. */
export function InstallPrompt() {
  const { canPrompt, needsManualSteps, installed, dismissed, dismiss, promptInstall } = usePwaInstall();
  const [showSteps, setShowSteps] = useState(false);

  if (installed || dismissed) return null;
  if (!canPrompt && !needsManualSteps) return null;

  return (
    <div role="dialog" aria-label="Install the Carelune app" className="cl-install">
      {showSteps ? (
        <div className="cl-install-steps">
          <b>Add Carelune to your Home Screen</b>
          <ol>{IOS_INSTALL_STEPS.map((s) => <li key={s}>{s}</li>)}</ol>
        </div>
      ) : (
        <span className="cl-install-copy">Add Carelune to your home screen for full-screen access.</span>
      )}
      {canPrompt ? (
        <button type="button" className="cl-install-go" onClick={promptInstall}>Install</button>
      ) : !showSteps ? (
        <button type="button" className="cl-install-go" onClick={() => setShowSteps(true)}>How</button>
      ) : null}
      <button type="button" className="cl-install-x" aria-label="Dismiss" onClick={dismiss}>✕</button>
    </div>
  );
}
