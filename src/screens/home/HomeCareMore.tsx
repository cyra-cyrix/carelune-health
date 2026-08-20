import { useState } from "react";
import { usePwaInstall, IOS_INSTALL_STEPS } from "../../pwa/InstallPrompt";
import { useHc, BottomSheet, HcIcon } from "./hc-kit";
import { TabHead } from "./HomeCareMedicines";

/* ============================================================================
   More — everything that is not the daily loop.

   The bottom bar carries only the four things a family opens every day (Today,
   Progress, Messages, More). Medicines and the daily log stay one tap away here,
   together with help, coverage and installing the app. Nothing new is loaded:
   each row switches to a tab the shell already renders.
   ========================================================================== */

export function HomeCareMore() {
  const { patient, day, goTab } = useHc();
  const first = patient.full_name.split(" ")[0] || patient.full_name;

  return (
    <div style={{ paddingTop: 8 }}>
      <TabHead title="More" sub={`${first}’s care · Day ${day}`} />

      <button type="button" className="hc-row-btn" onClick={() => goTab("medicines")}>
        <span className="rb-ic"><HcIcon.Pill size={20} /></span>
        <span className="rb-body"><b>Medicines</b><span>Today’s doses and what has been taken</span></span>
        <HcIcon.Right size={18} />
      </button>

      <button type="button" className="hc-row-btn" onClick={() => goTab("help")}>
        <span className="rb-ic"><HcIcon.Life size={20} /></span>
        <span className="rb-body"><b>Help &amp; emergency</b><span>Who is covering, review dates, emergency numbers</span></span>
        <HcIcon.Right size={18} />
      </button>

      <InstallRow />

      <p className="hc-muted" style={{ marginTop: 16 }}>
        Everything recorded here is what happened at home. The care plan itself is set by the care team.
      </p>
    </div>
  );
}

/* ------------------------------ install row ------------------------------- */

/** "Install Carelune" stays available here even after the banner is dismissed. */
function InstallRow() {
  const { canPrompt, installed, platform, promptInstall } = usePwaInstall();
  const [steps, setSteps] = useState(false);

  if (installed) {
    return (
      <div className="hc-row-btn" style={{ cursor: "default" }}>
        <span className="rb-ic"><HcIcon.Check size={20} /></span>
        <span className="rb-body"><b>Carelune is installed</b><span>You are using the home-screen app</span></span>
      </div>
    );
  }

  return (
    <>
      <button type="button" className="hc-row-btn" onClick={() => (canPrompt ? void promptInstall() : setSteps(true))}>
        <span className="rb-ic"><HcIcon.Home size={20} /></span>
        <span className="rb-body">
          <b>Install Carelune</b>
          <span>{canPrompt ? "Add it to your home screen" : "Add it to your home screen in a few taps"}</span>
        </span>
        <HcIcon.Right size={18} />
      </button>
      {steps && (
        <BottomSheet title="Add Carelune to your home screen" onClose={() => setSteps(false)}>
          {platform === "ios" ? (
            <ol className="hc-steps">{IOS_INSTALL_STEPS.map((s) => <li key={s}>{s}</li>)}</ol>
          ) : (
            <ol className="hc-steps">
              <li>Open your browser menu</li>
              <li>Choose “Add to Home screen” or “Install app”</li>
              <li>Confirm to add it</li>
            </ol>
          )}
          <p className="hc-muted" style={{ padding: "10px 0 0" }}>
            The home-screen app opens full screen. It still needs an internet connection.
          </p>
        </BottomSheet>
      )}
    </>
  );
}
