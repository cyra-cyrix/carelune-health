/*
 * The patient's programme, as they see it.
 *
 * Every word on these screens comes from the enrolment frozen onto this
 * patient's own subscription — never from the live service or package. Nothing
 * here knows what specialty it is drawing, which is why the same four tabs
 * carry a spine recovery programme and a mother-and-baby one.
 *
 * Check-in ANSWERS are not saved yet (that is the next phase). The check-in is
 * shown as a read-only preview of what will be asked, and says so, rather than
 * pretending to record anything.
 */
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { buildProgrammeExperience, type ProgrammeExperience } from "../../domain/programmeExperience";
import type { PatientRow, SubscriptionRow } from "../../lib/db";
import { useBranding } from "../../branding/BrandingProvider";
import { HcIcon, HcProvider, type HcData, type HcRole } from "../home/hc-kit";
import { HomeCareMessages } from "../home/HomeCareMessages";
import "../home/homecare.css";

type Tab = "today" | "progress" | "care" | "support";

const firstName = (full?: string | null) => (full ?? "").trim().split(/\s+/)[0] ?? "";

function greeting(now = new Date()) {
  const h = now.getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default function ProgrammeHome({
  role, patient, subscription,
}: { role: HcRole; patient: PatientRow; subscription: SubscriptionRow }) {
  const [tab, setTab] = useState<Tab>("today");
  const { org, profile } = useBranding();
  const result = useMemo(() => buildProgrammeExperience(subscription), [subscription]);
  const providerName = org?.display_name || org?.name || "Your care team";

  return (
    <div className="hc min-h-screen bg-mist">
      {/* Provider-first: the app shell above already carries the Carelune mark,
          so this says only whose care this is. */}
      <div className="mx-auto max-w-[430px] px-5 pt-4">
        <p className="truncate text-[12px] font-semibold uppercase tracking-[0.13em] text-sage-400">{providerName}</p>
      </div>

      <main className="mx-auto max-w-[430px] px-5 pb-28 pt-3">
        {!result.ok ? (
          <ProgrammeUnavailable reason={result.reason} onAsk={() => setTab("support")} />
        ) : tab === "today" ? (
          <TodayTab exp={result.experience} patient={patient} viewerName={firstName(profile?.full_name)} onAsk={() => setTab("support")} />
        ) : tab === "progress" ? (
          <ProgressTab exp={result.experience} />
        ) : tab === "care" ? (
          <CareTab exp={result.experience} providerName={providerName} />
        ) : null}

        {/* Messaging is the existing patient/care-team capability, unchanged:
            the same component, the same patient_query rows the nurse and doctor
            already read. It consumes only the patient and the role. */}
        {tab === "support" && (
          <HcProvider value={{ patient, role } as unknown as HcData}>
            <HomeCareMessages />
          </HcProvider>
        )}
      </main>

      <BottomNav tab={tab} setTab={setTab} />
    </div>
  );
}

/* --------------------------------- Today ---------------------------------- */

function TodayTab({
  exp, patient, viewerName, onAsk,
}: { exp: ProgrammeExperience; patient: PatientRow; viewerName: string; onAsk: () => void }) {
  const [preview, setPreview] = useState(false);
  const patientFirst = firstName(patient.full_name) || "your patient";

  return (
    <>
      <h1 className="font-display text-[26px] font-semibold leading-tight tracking-tight text-ink">
        {greeting()}{viewerName ? `, ${viewerName}` : ""}
      </h1>
      <p className="mt-1.5 text-[16px] leading-relaxed text-sage-600">
        Day <span className="font-semibold text-ink">{exp.currentDay}</span> of {patientFirst}&apos;s{" "}
        <span className="font-semibold text-ink">{exp.packageName}</span>
      </p>

      <ProgrammeBar exp={exp} />

      {exp.currentPeriod && (
        <section className="mt-5 rounded-3xl bg-white p-6 shadow-card ring-1 ring-ink/[0.05]">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-sage-400">
            {exp.currentPeriod.label}
          </p>
          <h2 className="mt-1.5 font-display text-[20px] font-semibold tracking-tight text-ink">
            {exp.currentPeriod.focus || exp.programmeName}
          </h2>
          {exp.currentPeriod.monitoringAreas.length > 0 && (
            <ul className="mt-4 space-y-2">
              {exp.currentPeriod.monitoringAreas.map((a) => (
                <li key={a} className="flex items-baseline gap-2.5 text-[15.5px] text-ink">
                  <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-sky-400" />
                  {a}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <h2 className="mt-8 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-sage-400">Today&apos;s focus</h2>
      <ul className="mt-3 flex flex-wrap gap-2">
        {exp.monitoringAreas.map((a) => (
          <li key={a} className="rounded-full bg-white px-3.5 py-2 text-[14px] font-medium text-ink shadow-[0_1px_2px_rgba(23,33,38,0.04)]">
            {a}
          </li>
        ))}
        {exp.monitoringAreas.length === 0 && <li className="text-[14px] text-sage-500">Your care team will confirm what to follow.</li>}
      </ul>

      <section className="mt-8 rounded-3xl bg-white p-6 shadow-card ring-1 ring-ink/[0.05]">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-display text-[19px] font-semibold tracking-tight text-ink">Your check-in</h2>
          <span className="shrink-0 text-[12.5px] text-sage-500">About a minute</span>
        </div>
        {exp.checkinFrequency && <p className="mt-1 text-[14px] text-sage-600">{exp.checkinFrequency}</p>}

        <ul className="mt-4 space-y-2.5">
          {exp.patientQuestions.slice(0, 4).map((q) => (
            <li key={q.label} className="text-[15.5px] leading-snug text-ink">{q.label}</li>
          ))}
          {exp.patientQuestions.length > 4 && (
            <li className="text-[14px] text-sage-500">and {exp.patientQuestions.length - 4} more</li>
          )}
          {exp.patientQuestions.length === 0 && <li className="text-[14px] text-sage-500">No questions set yet.</li>}
        </ul>

        <button
          type="button"
          onClick={() => setPreview(true)}
          disabled={exp.patientQuestions.length === 0}
          className="tap mt-5 w-full rounded-2xl bg-brand-800 px-4 py-3.5 text-[15px] font-semibold text-white transition-colors hover:bg-brand-900 disabled:opacity-50"
        >
          See today&apos;s check-in
        </button>
        <p className="mt-2.5 text-center text-[12px] text-sage-500">
          Answering here is coming shortly. Until then, tell your care team anything that matters in Support.
        </p>
      </section>

      <button
        type="button"
        onClick={onAsk}
        className="tap mt-6 flex w-full items-center justify-between rounded-2xl bg-white px-5 py-4 text-left shadow-card ring-1 ring-ink/[0.05]"
      >
        <span>
          <span className="block text-[15.5px] font-semibold text-ink">Ask your care team</span>
          <span className="mt-0.5 block text-[13px] text-sage-500">They read everything you send.</span>
        </span>
        <HcIcon.Chat size={20} />
      </button>

      {preview && <CheckinPreview exp={exp} onClose={() => setPreview(false)} />}
    </>
  );
}

/** Read-only. Nothing typed here is stored — the answers arrive next phase. */
function CheckinPreview({ exp, onClose }: { exp: ProgrammeExperience; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-midnight-950/30 backdrop-blur-[2px]">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0" />
      <div role="dialog" aria-modal="true" aria-label="Your check-in" className="relative max-h-[86vh] w-full max-w-[430px] overflow-y-auto rounded-t-3xl bg-white px-6 pb-8 pt-6">
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-mist-200" />
        <h2 className="font-display text-[21px] font-semibold tracking-tight text-ink">Your check-in</h2>
        <p className="mt-1.5 text-[14px] leading-relaxed text-sage-600">
          What your care team will ask you, in {exp.packageName}.
        </p>
        <ol className="mt-6 space-y-5">
          {exp.patientQuestions.map((q, i) => (
            <li key={q.label}>
              <p className="text-[16px] leading-snug text-ink">
                <span className="mr-2 text-[13px] font-semibold text-sage-400">{i + 1}</span>
                {q.label}
              </p>
              {q.reason && <p className="mt-1 pl-6 text-[13px] leading-relaxed text-sage-500">{q.reason}</p>}
            </li>
          ))}
        </ol>
        <p className="mt-7 rounded-2xl bg-mist-100 px-4 py-3 text-[13px] leading-relaxed text-sage-600">
          This is a preview. Recording your answers here is coming shortly — nothing you see is saved yet.
        </p>
        <button type="button" onClick={onClose} className="tap mt-5 w-full rounded-2xl bg-mist-100 px-4 py-3.5 text-[15px] font-semibold text-ink">
          Close
        </button>
      </div>
    </div>
  );
}

/* -------------------------------- Progress -------------------------------- */

function ProgressTab({ exp }: { exp: ProgrammeExperience }) {
  return (
    <>
      <h1 className="font-display text-[26px] font-semibold leading-tight tracking-tight text-ink">Your progress</h1>
      <p className="mt-1.5 text-[15px] leading-relaxed text-sage-600">Where you are in the programme.</p>

      <section className="mt-6 rounded-3xl bg-white p-6 text-center shadow-card ring-1 ring-ink/[0.05]">
        <p className="font-display text-[40px] font-semibold leading-none tracking-tight text-ink">
          {exp.currentDay}
          <span className="text-[20px] font-medium text-sage-400"> of {exp.durationDays}</span>
        </p>
        <p className="mt-1.5 text-[13.5px] text-sage-500">days</p>
        <div className="mt-5"><ProgrammeBar exp={exp} bare /></div>
        {exp.periods.length > 0 && (
          <p className="mt-4 text-[14.5px] text-sage-600">
            {exp.completedPeriods} of {exp.periods.length} stages behind you
          </p>
        )}
        {exp.nextPeriod && exp.daysUntilNextPeriod != null && (
          <p className="mt-1 text-[14px] text-sage-500">
            {exp.nextPeriod.label} begins in {exp.daysUntilNextPeriod} day{exp.daysUntilNextPeriod === 1 ? "" : "s"}
          </p>
        )}
      </section>

      {exp.periods.length > 0 && (
        <ol className="mt-6 space-y-3">
          {exp.periods.map((p) => {
            const done = p.toDay < exp.currentDay;
            const now = exp.currentPeriod?.index === p.index;
            return (
              <li
                key={p.label}
                aria-current={now ? "step" : undefined}
                className={`rounded-2xl px-5 py-4 ring-1 ${now ? "bg-white shadow-card ring-sky-500/30" : "bg-white/60 ring-ink/[0.05]"}`}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <p className={`text-[15.5px] font-semibold ${now ? "text-ink" : done ? "text-sage-500" : "text-sage-600"}`}>{p.label}</p>
                  <span className={`shrink-0 text-[12px] font-semibold ${done ? "text-good-600" : now ? "text-sky-700" : "text-sage-400"}`}>
                    {done ? "Done" : now ? "Now" : "Ahead"}
                  </span>
                </div>
                {p.focus && <p className="mt-0.5 text-[14px] text-sage-500">{p.focus}</p>}
              </li>
            );
          })}
        </ol>
      )}

      <p className="mt-7 text-[12.5px] leading-relaxed text-sage-500">
        This shows where you are in your programme. How your recovery is going is for your care team to judge with you.
      </p>
    </>
  );
}

/* ---------------------------------- Care ---------------------------------- */

function CareTab({ exp, providerName }: { exp: ProgrammeExperience; providerName: string }) {
  return (
    <>
      <h1 className="font-display text-[26px] font-semibold leading-tight tracking-tight text-ink">Your care</h1>
      <p className="mt-1.5 text-[15px] leading-relaxed text-sage-600">What {providerName} put together for you.</p>

      <section className="mt-6 rounded-3xl bg-white p-6 shadow-card ring-1 ring-ink/[0.05]">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-sage-400">Your programme</p>
        <h2 className="mt-1.5 font-display text-[21px] font-semibold tracking-tight text-ink">{exp.packageName}</h2>
        <p className="mt-0.5 text-[14.5px] text-sage-600">{exp.programmeName} · {exp.durationDays} days</p>
      </section>

      <CareBlock title="What we'll follow">
        <ul className="flex flex-wrap gap-2">
          {exp.monitoringAreas.map((a) => (
            <li key={a} className="rounded-full bg-mist-100 px-3 py-1.5 text-[13.5px] font-medium text-sage-600">{a}</li>
          ))}
        </ul>
      </CareBlock>

      <CareBlock title="Your care rhythm">
        <dl className="space-y-4">
          {exp.checkinFrequency && <Rhythm label="Check-in">{exp.checkinFrequency}</Rhythm>}
          {exp.reviewFrequency && <Rhythm label="Professional review">{exp.reviewFrequency}</Rhythm>}
          {exp.supportLevel && <Rhythm label="Support">{exp.supportLevel}</Rhythm>}
        </dl>
      </CareBlock>

      {exp.periods.length > 0 && (
        <CareBlock title="Your journey">
          <ol className="space-y-3.5">
            {exp.periods.map((p) => (
              <li key={p.label}>
                <p className="text-[15px] font-semibold text-ink">{p.label}</p>
                {p.focus && <p className="mt-0.5 text-[14px] text-sage-600">{p.focus}</p>}
              </li>
            ))}
          </ol>
        </CareBlock>
      )}

      {exp.includes.length > 0 && (
        <CareBlock title="What's included">
          <ul className="space-y-2">
            {exp.includes.map((i) => (
              <li key={i} className="flex items-baseline gap-2.5 text-[15px] text-ink">
                <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-good-300" />
                {i}
              </li>
            ))}
          </ul>
        </CareBlock>
      )}
    </>
  );
}

function CareBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-sage-400">{title}</h2>
      <div className="mt-3 rounded-3xl bg-white p-6 shadow-card ring-1 ring-ink/[0.05]">{children}</div>
    </section>
  );
}

function Rhythm({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[12.5px] font-medium text-sage-500">{label}</dt>
      <dd className="mt-0.5 text-[15.5px] text-ink">{children}</dd>
    </div>
  );
}

/* -------------------------------- fragments ------------------------------- */

function ProgrammeBar({ exp, bare = false }: { exp: ProgrammeExperience; bare?: boolean }) {
  return (
    <div className={bare ? "" : "mt-5"}>
      <div
        role="progressbar"
        aria-valuenow={exp.percentComplete}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Day ${exp.currentDay} of ${exp.durationDays}`}
        className="h-2 w-full overflow-hidden rounded-full bg-mist-200"
      >
        <div className="h-full rounded-full bg-sky-500 transition-[width]" style={{ width: `${exp.percentComplete}%` }} />
      </div>
      {!bare && (
        <p className="mt-2 text-[12.5px] text-sage-500">
          {exp.finished ? "Programme complete" : `${exp.durationDays - exp.currentDay} days to go`}
        </p>
      )}
    </div>
  );
}

function ProgrammeUnavailable({ reason, onAsk }: { reason: string; onAsk: () => void }) {
  // Never a stack trace and never a blank screen: the care team stays reachable.
  if (import.meta.env.DEV) console.warn("[programme] snapshot unusable:", reason);
  return (
    <section className="rounded-3xl bg-white p-6 shadow-card ring-1 ring-ink/[0.05]">
      <h1 className="font-display text-[21px] font-semibold tracking-tight text-ink">We couldn&apos;t load your programme</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-sage-600">
        Nothing is wrong with your care. Your team can see this and will sort it out — you can message them here at any time.
      </p>
      <button type="button" onClick={onAsk} className="tap mt-5 w-full rounded-2xl bg-brand-800 px-4 py-3.5 text-[15px] font-semibold text-white">
        Ask your care team
      </button>
    </section>
  );
}

const NAV: { key: Tab; label: string; icon: (p: { size?: number }) => ReactNode }[] = [
  { key: "today", label: "Today", icon: HcIcon.Home },
  { key: "progress", label: "Progress", icon: HcIcon.Chart },
  { key: "care", label: "Care", icon: HcIcon.Menu },
  { key: "support", label: "Support", icon: HcIcon.Chat },
];

function BottomNav({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  return (
    <nav aria-label="Sections" className="fixed inset-x-0 bottom-0 z-40 border-t border-line/70 bg-white/95 backdrop-blur">
      <ul className="mx-auto flex max-w-[430px] items-stretch">
        {NAV.map((item) => {
          const on = tab === item.key;
          return (
            <li key={item.key} className="flex-1">
              <button
                type="button"
                aria-current={on ? "page" : undefined}
                onClick={() => setTab(item.key)}
                className={`tap flex w-full flex-col items-center gap-1 py-2.5 text-[11px] font-semibold ${on ? "text-sky-700" : "text-sage-400"}`}
              >
                <item.icon size={21} />
                {item.label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
