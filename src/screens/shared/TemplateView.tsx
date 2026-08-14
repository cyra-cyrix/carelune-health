import HospitalHeader from "../../components/HospitalHeader";
import { Icon } from "../../components/ui";
import { protocolTemplate } from "../../domain/planning";
import { useCarelune } from "../../store/carelune";

/** Read-only governed pathway/template detail — shared by physio and PM&R views. */
export function TemplateDetail() {
  const { templateGovernanceStatus, templateNotes } = useCarelune();
  const t = protocolTemplate;
  return (
    <div className="space-y-4">
      <section className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="font-display text-[19px] font-semibold text-ink">{t.name}</h2>
            <p className="text-[13px] text-sage-500">
              {t.version} · owner: PM&amp;R · approved by {t.approvedBy} · {t.approvedAt} · review
              due {t.reviewDue}
            </p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-[12px] font-semibold ${
              templateGovernanceStatus === "approved"
                ? "bg-good-100 text-good-600"
                : templateGovernanceStatus === "draft"
                  ? "bg-warn-100 text-warn-600"
                  : "bg-mist-200 text-sage-600"
            }`}
          >
            {templateGovernanceStatus === "approved" ? "Approved (demo)" : templateGovernanceStatus === "draft" ? "Returned — draft" : "Retired"}
          </span>
        </div>
        <p className="mt-2 rounded-xl bg-warn-100/70 px-3 py-2 text-[12px] font-semibold text-warn-600">
          Demonstration template — not approved for clinical use.
        </p>
        <p className="mt-3 text-[14px] text-ink">
          <span className="font-semibold">Intended group: </span>
          {t.intendedGroup}
        </p>
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <ListCard title="Inclusion considerations" items={t.inclusion} />
        <ListCard title="Exclusion / clinical-review triggers" items={t.exclusion} tone="coral" />
        <ListCard title="Required baseline domains" items={t.requiredBaselineDomains} />
        <ListCard title="Activity categories" items={t.activityCategories} />
        <ListCard title="Precautions" items={t.precautions} tone="warn" />
        <ListCard title="Stop conditions" items={t.stopConditions} tone="coral" />
        <ListCard title="Escalation triggers" items={t.escalationRules} tone="coral" />
        <ListCard title="Indian-adaptation notes" items={t.indianAdaptationNotes} />
      </div>

      <section className="card p-5">
        <h3 className="font-display text-[15px] font-semibold text-ink">Evidence references</h3>
        <p className="mt-1.5 text-[13px] italic text-sage-500">{t.evidenceSource}.</p>
      </section>

      <section className="card p-5">
        <h3 className="font-display text-[15px] font-semibold text-ink">Change history</h3>
        <ol className="mt-2.5 space-y-2">
          {[...t.changeHistory].reverse().map((c) => (
            <li key={c.version} className="rounded-xl bg-mist px-3.5 py-2 text-[13px]">
              <span className="font-semibold text-ink">{c.version}</span> · {c.date} · {c.by} —{" "}
              <span className="text-sage-600">{c.note}</span>
            </li>
          ))}
          {templateNotes.map((n, i) => (
            <li key={`n${i}`} className="rounded-xl bg-brand-50 px-3.5 py-2 text-[13px] ring-1 ring-brand-100">
              <span className="font-semibold text-brand-700">Governance note</span> · {n.at} · {n.by} —{" "}
              <span className="text-sage-600">{n.note}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function ListCard({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone?: "warn" | "coral";
}) {
  const dot = tone === "coral" ? "bg-coral-500" : tone === "warn" ? "bg-warn-500" : "bg-brand-400";
  return (
    <section className="card p-4">
      <h3 className="text-[12px] font-bold uppercase tracking-wide text-sage-500">{title}</h3>
      <ul className="mt-2 space-y-1.5">
        {items.map((it) => (
          <li key={it} className="flex gap-2 text-[13px] leading-snug text-ink/85">
            <span className={`mt-[7px] h-1 w-1 shrink-0 rounded-full ${dot}`} />
            {it}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The Lead Physiotherapist's read-only view of the governed pathway. */
export default function TemplateView({ onBack }: { onBack: () => void }) {
  return (
    <div className="min-h-full bg-mist">
      <HospitalHeader crumb="Governed pathway" />
      <main className="mx-auto max-w-[900px] px-5 py-6 lg:px-8">
        <button
          type="button"
          onClick={onBack}
          className="tap -ml-1 inline-flex items-center gap-1 text-[15px] font-semibold text-brand-600 hover:text-brand-700"
        >
          <Icon.ChevronLeft width={18} height={18} /> Anand Menon
        </button>
        <h1 className="mt-3 font-display text-2xl font-semibold text-ink">Governed pathway</h1>
        <p className="mt-1 text-[14px] text-sage-500">
          PM&amp;R-governed. You plan within it; version and governance changes belong to Dr. Meera.
        </p>
        <div className="mt-4">
          <TemplateDetail />
        </div>
      </main>
    </div>
  );
}
