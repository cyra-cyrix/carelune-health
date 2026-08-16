import { useState } from "react";
import { Icon } from "./ui";
import { PERMISSION_LABEL, PERMISSIONS, ROLE_META } from "../domain/roles";
import type { RoleId } from "../domain/types";

/**
 * "What this role can and cannot do" — the scope panel for clinician review.
 *
 * Built for demonstrating the programme to a real physiotherapist, PM&R
 * specialist, coordinator, nurse or medical clinician: each one needs to see
 * their own authority and their own boundaries before they can judge whether
 * the workflow is right.
 *
 * Everything here is read from the single source of truth — `ROLE_META.owns`,
 * `ROLE_META.cannot` and `PERMISSIONS` — so the panel cannot drift from the
 * guards that actually enforce these boundaries in the store. If a boundary
 * changes, this panel changes with it.
 */
export default function RoleScope({ role }: { role: RoleId }) {
  const [open, setOpen] = useState(true);
  const meta = ROLE_META[role];
  const perms = PERMISSIONS[role];
  const panelId = `role-scope-${role}`;

  return (
    <section className="card overflow-hidden" aria-labelledby={`${panelId}-title`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className="tap flex w-full items-center gap-3 p-4 text-left hover:bg-mist/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 sm:p-5"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-sage-600">
            Your role in this programme
          </span>
          <span
            id={`${panelId}-title`}
            className="mt-0.5 block font-display text-[17px] font-semibold leading-snug text-ink"
          >
            {meta.label}
          </span>
          {meta.persona && (
            <span className="mt-0.5 block text-[12px] text-sage-600">
              Shown in this demo as {meta.persona.name}
              {perms.readOnly ? " · read-only" : ""}
            </span>
          )}
        </span>
        <span
          className={`shrink-0 text-brand-600 transition-transform ${open ? "rotate-90" : ""}`}
          aria-hidden
        >
          <Icon.ChevronRight width={18} height={18} />
        </span>
      </button>

      {open && (
        <div id={panelId} className="grid gap-4 border-t border-ink/[0.06] p-4 sm:grid-cols-3 sm:p-5">
          <ScopeList
            title="What you own"
            tone="brand"
            items={meta.owns}
            empty="No ownership defined for this role."
          />
          <ScopeList
            title="What you can do here"
            tone="good"
            items={perms.flags.map((f) => PERMISSION_LABEL[f])}
            empty="View-only access."
          />
          <ScopeList
            title="What you must not do"
            tone="coral"
            items={meta.cannot}
            empty="No boundaries specific to this role."
          />

          <p className="text-[11px] leading-relaxed text-sage-600 sm:col-span-3">
            These boundaries are enforced in the shared store, not only in this screen — an action
            outside your scope is refused and the refusal is recorded in the audit trail. Fictional
            demonstration data; not approved for clinical use.
          </p>
        </div>
      )}
    </section>
  );
}

const TONE = {
  brand: { dot: "bg-brand-600", label: "text-brand-700" },
  good: { dot: "bg-good-500", label: "text-good-600" },
  coral: { dot: "bg-coral-500", label: "text-coral-600" },
} as const;

function ScopeList({
  title,
  items,
  tone,
  empty,
}: {
  title: string;
  items: string[];
  tone: keyof typeof TONE;
  empty: string;
}) {
  return (
    <div className="min-w-0">
      <h3
        className={`text-[11px] font-semibold uppercase tracking-[0.12em] ${TONE[tone].label}`}
      >
        {title}
      </h3>
      {items.length === 0 ? (
        <p className="mt-1.5 text-[13px] text-sage-600">{empty}</p>
      ) : (
        <ul className="mt-1.5 space-y-1.5">
          {items.map((i) => (
            <li key={i} className="flex gap-2 text-[13px] leading-snug text-ink">
              <span
                className={`mt-[0.4rem] h-1.5 w-1.5 shrink-0 rounded-full ${TONE[tone].dot}`}
                aria-hidden
              />
              <span className="min-w-0 break-words">{i}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
