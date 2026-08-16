import { useEffect, useRef } from "react";
import { LoopMark } from "../../components/ui";
import "./continuity.css";

/**
 * Landing redesign — Checkpoint 1: header + hero + the Continuity Line.
 *
 * The signature device: one sky-blue line carries information caregiver → nursing
 * coordinator → doctor. The coordinator VISIBLY reviews, routine stays and is marked
 * "acknowledged", and the coordinator deliberately routes one clinical query to the
 * doctor (arriving as amber "review required"). Nothing implies autonomous triage.
 *
 * Plays once (~4.5s) on scroll-into-view, then rests in the completed state.
 * Replay re-triggers it. prefers-reduced-motion → completed state, no motion.
 *
 * Copy, CTA destinations (Calendly / Sign in) and auth behaviour are unchanged —
 * this component is presentational only.
 */

const CALENDLY = "https://calendly.com/sujith-medzell/meeting";

// Auto-play runs at most ONCE per page load — this flag survives component
// remounts/rerenders, so scroll, tab focus and re-renders never restart it.
// The Replay button bypasses it deliberately (explicit user action).
let hasAutoPlayed = false;

function BookBtn({ nav = false }: { nav?: boolean }) {
  return (
    <a href={CALENDLY} target="_blank" rel="noopener noreferrer" className={`cl-btn pri${nav ? " sm cl-nav-book" : ""}`}>
      {nav ? "Book a walkthrough" : "Book a 20-minute walkthrough"}
      {!nav && <span className="arw" aria-hidden="true">→</span>}
    </a>
  );
}

export default function LandingHero({ onSignIn }: { onSignIn: () => void }) {
  const sceneRef = useRef<HTMLDivElement>(null);
  const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const play = () => {
    const el = sceneRef.current;
    if (!el || reduce) return;
    el.classList.remove("cl-playing");
    void el.offsetWidth; // force reflow so the animation restarts
    el.classList.add("cl-playing");
  };

  useEffect(() => {
    const el = sceneRef.current;
    if (!el) return;
    if (reduce) return; // CSS holds the completed state
    if (hasAutoPlayed) return; // already played once this page load — don't rebind
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting && !hasAutoPlayed) {
            hasAutoPlayed = true;
            play();
          }
        });
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduce]);

  return (
    <>
      <header className="cl-nav">
        <div className="in">
          <div className="cl-brand">
            <span className="lm"><LoopMark size={26} /></span> Carelune
          </div>
          <div className="cl-nav-r">
            <button type="button" className="cl-link" onClick={onSignIn}>Sign in</button>
            <BookBtn nav />
          </div>
        </div>
      </header>

      <section className="cl-hero">
        <div>
          <div className="cl-eyebrow">For hospitals, rehabilitation centres &amp; specialists</div>
          <h1 className="cl-h1">Your patients leave the hospital. Your care should continue.</h1>
          <div className="cl-hrule">
            <svg width="128" height="12" viewBox="0 0 128 12" aria-hidden="true">
              <path d="M2 6h124" stroke="#128CFF" strokeWidth="2.4" strokeLinecap="round" className="cl-draw" style={{ ["--len" as string]: "126" }} />
              <circle cx="126" cy="6" r="3.2" fill="#128CFF" className="cl-rv r1" />
            </svg>
          </div>
          <p className="cl-sub">
            Turn clinician-approved plans into daily caregiver actions, organised updates, and a clear
            attention queue for your clinical team.
          </p>
          <div className="cl-cta">
            <BookBtn />
            <button type="button" className="cl-btn ghost" onClick={onSignIn}>Sign in</button>
          </div>
          <p className="cl-offer">
            <b>Free for verified individual doctors.</b> One doctor, one nursing coordinator, unlimited
            eligible patients — verified before access.
          </p>
          {!reduce && (
            <button type="button" className="cl-replay" onClick={play}>↻ Replay the story</button>
          )}
        </div>

        <div
          className={`cl-scene${reduce ? " cl-static" : ""}`}
          ref={sceneRef}
          role="img"
          aria-label="How information reaches the clinical team: a caregiver logs today's care; the nursing coordinator reviews it, keeps routine communication and acknowledges it, and routes one clinical query to the doctor, which appears as review required."
        >
          <div className="cl-cap" aria-hidden="true">
            From home → coordinator → your desk &nbsp;·&nbsp; <span className="as">as in the app</span>
          </div>
          <svg className="cl-spine" width="10" height="252" viewBox="0 0 10 252" aria-hidden="true">
            <path d="M5 2 V125" fill="none" stroke="#128CFF" strokeWidth="2.2" strokeLinecap="round" className="cl-draw" style={{ ["--len" as string]: "125" }} />
            <path d="M5 127 V250" fill="none" stroke="#128CFF" strokeWidth="2.2" strokeLinecap="round" className="cl-draw d2" style={{ ["--len" as string]: "125" }} />
          </svg>
          <div className="cl-p1" aria-hidden="true"></div>
          <div className="cl-p2" aria-hidden="true"></div>

          <div className="cl-node cl-n1 cl-rv r1" aria-hidden="true">
            <div className="cl-bead"><i></i></div>
            <div>
              <div className="cl-who">Caregiver</div>
              <div className="cl-det">Logs today's care, medicines and readings.</div>
              <div className="cl-chips"><span className="cl-chip sky cl-c1 cl-late cl-num">4 of 6 done today</span></div>
            </div>
          </div>

          <div className="cl-node cl-n2 cl-rv r2" aria-hidden="true">
            <div className="cl-bead"><i></i></div>
            <div>
              <div className="cl-who">Nursing coordinator</div>
              <div className="cl-det">Reviews updates; keeps routine here, routes clinical matters.</div>
              <div className="cl-chips">
                <span className="cl-chip rev cl-revchip"><span className="pulse"></span> Reviewing</span>
                <span className="cl-resolved"><span className="cl-chip ok">Routine · acknowledged</span> <span className="cl-chip sky">1 routed to doctor</span></span>
              </div>
            </div>
          </div>

          <div className="cl-routelab" aria-hidden="true">↳ Routed by the coordinator</div>

          <div className="cl-node cl-n3 cl-rv r3" aria-hidden="true">
            <div className="cl-bead"><i></i></div>
            <div>
              <div className="cl-who">Doctor</div>
              <div className="cl-det">Sees only what the coordinator routes for a decision.</div>
              <div className="cl-queue">
                <div className="cl-qi cl-qchip cl-late">
                  <span className="qdot"></span> Medication query <span className="cl-chip attn qc">Review required</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
