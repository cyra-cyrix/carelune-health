import { useEffect, useState } from "react";
import { Icon } from "../../components/ui";
import { useBranding } from "../../branding/BrandingProvider";
import { listTeamUsers, createTeamUser, resetTeamUserPassword, removeTeamUser, updateMyName, type TeamUser, type NewTeamUser } from "../../lib/db";
import { credentialsText, shareOnWhatsApp, generatePassword } from "../../lib/share";
import { loginUrl as appLoginUrl } from "../../config/urls";

const ROLE_OPTIONS: { value: NewTeamUser["role"]; label: string }[] = [
  { value: "pmr", label: "Doctor" },
  { value: "duty_doctor", label: "Duty Doctor" },
  { value: "nurse", label: "Nurse" },
  { value: "caregiver", label: "Caregiver" },
  { value: "family", label: "Family" },
];
const roleLabel = (r: TeamUser["role"]) => ROLE_OPTIONS.find((o) => o.value === r)?.label ?? r;

const FIELD =
  "w-full rounded-xl bg-white px-3 py-2 text-[14px] text-ink ring-1 ring-line focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500";

/**
 * Admin team management. Lists the org's people and creates new teammates
 * (email + password + role) through the admin-users Edge Function. The new
 * person signs in with these credentials and can reset the password later.
 */
export default function Team() {
  const { platformName, profile, refresh } = useBranding();
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [draft, setDraft] = useState<NewTeamUser>({ email: "", password: generatePassword(), full_name: "", role: "nurse" });
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [lastCreated, setLastCreated] = useState<NewTeamUser | null>(null);

  // per-person actions (reset password / remove)
  const [actingId, setActingId] = useState<string | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [resetInfo, setResetInfo] = useState<{ email: string; password: string; role: TeamUser["role"] } | null>(null);

  const resetPw = async (u: TeamUser) => {
    const password = generatePassword();
    setActingId(u.id);
    setRowError(null);
    setResetInfo(null);
    try {
      await resetTeamUserPassword(u.id, password);
      setResetInfo({ email: u.email, password, role: u.role });
    } catch (e) {
      setRowError(e instanceof Error ? e.message : "Could not reset the password.");
    } finally {
      setActingId(null);
    }
  };

  const remove = async (u: TeamUser) => {
    setActingId(u.id);
    setConfirmRemoveId(null);
    setRowError(null);
    try {
      await removeTeamUser(u.id);
      await load();
    } catch (e) {
      setRowError(e instanceof Error ? e.message : "Could not remove the teammate.");
    } finally {
      setActingId(null);
    }
  };

  const load = async () => {
    try {
      setUsers(await listTeamUsers());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load your team.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  // Your own display name (feeds greetings + headers). Editable anytime.
  const [myName, setMyName] = useState("");
  const [nameBusy, setNameBusy] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  useEffect(() => { setMyName(profile?.full_name ?? ""); }, [profile?.full_name]);

  const saveMyName = async () => {
    if (!myName.trim() || myName.trim() === profile?.full_name) return;
    setNameBusy(true); setNameError(null); setNameSaved(false);
    try {
      await updateMyName(myName.trim());
      await refresh();
      setNameSaved(true); setTimeout(() => setNameSaved(false), 2000);
    } catch (e) {
      setNameError(e instanceof Error ? e.message : "Could not save your name.");
    } finally { setNameBusy(false); }
  };

  const create = async () => {
    setBusy(true);
    setFormError(null);
    try {
      await createTeamUser(draft);
      setLastCreated(draft);
      setDraft({ email: "", password: generatePassword(), full_name: "", role: "nurse" });
      await load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Could not create the account.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-full bg-mist">
      <div className="mx-auto max-w-[1100px] px-5 py-6 lg:px-8">
        <h1 className="font-display text-2xl font-semibold text-ink">Your team</h1>
        <p className="mt-0.5 text-[14px] text-sage-500">
          Create accounts for your doctors, nurses, caregivers and families. They sign in with the email
          and password you set.
        </p>

        {/* Your account — set your own name (shown in greetings + headers) */}
        <section className="mt-5 rounded-2xl bg-white p-5 shadow-lift ring-1 ring-ink/[0.05]">
          <h2 className="font-display text-[15px] font-semibold text-ink">Your account</h2>
          <p className="mt-0.5 text-[13px] text-sage-500">
            This is the name shown in your greeting and headers{profile?.full_name ? <> — currently <span className="font-semibold text-ink">{profile.full_name}</span></> : ""}.
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-2.5">
            <label className="block min-w-[220px] flex-1">
              <span className="mb-1 block text-[12px] font-semibold text-sage-600">Your name</span>
              <input value={myName} onChange={(e) => setMyName(e.target.value)} placeholder="e.g. Meera Nair" className={FIELD} />
            </label>
            <button
              type="button"
              onClick={saveMyName}
              disabled={nameBusy || !myName.trim() || myName.trim() === profile?.full_name}
              className="tap shrink-0 rounded-xl bg-brand-800 px-4 py-2 text-[14px] font-semibold text-white hover:bg-brand-900 disabled:opacity-60"
            >
              {nameBusy ? "Saving…" : "Save name"}
            </button>
            {nameSaved && <span className="text-[12.5px] font-semibold text-good-600">Saved ✓</span>}
          </div>
          {nameError && <p className="mt-2 text-[13px] text-coral-600">{nameError}</p>}
        </section>

        <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_1.1fr]">
          {/* Create */}
          <section className="rounded-2xl bg-white p-5 shadow-lift ring-1 ring-ink/[0.05]">
            <h2 className="font-display text-[15px] font-semibold text-ink">Add a teammate</h2>
            <div className="mt-3 space-y-3">
              <label className="block">
                <span className="mb-1 block text-[12px] font-semibold text-sage-600">Full name</span>
                <input value={draft.full_name} onChange={(e) => setDraft({ ...draft, full_name: e.target.value })} placeholder="e.g. Nisha Rao" className={FIELD} />
              </label>
              <label className="block">
                <span className="mb-1 block text-[12px] font-semibold text-sage-600">Email</span>
                <input value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} type="email" placeholder="name@centre.in" className={FIELD} />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block text-[12px] font-semibold text-sage-600">Temporary password</span>
                  <div className="flex items-center gap-1.5">
                    <input value={draft.password} readOnly className={`${FIELD} font-mono`} />
                    <button
                      type="button"
                      onClick={() => setDraft({ ...draft, password: generatePassword() })}
                      title="Generate a new password"
                      className="tap shrink-0 rounded-lg border border-line px-2.5 py-2 text-[13px] font-semibold text-sage-600 hover:bg-mist-100 hover:text-ink"
                    >
                      ↻
                    </button>
                  </div>
                </label>
                <label className="block">
                  <span className="mb-1 block text-[12px] font-semibold text-sage-600">Role</span>
                  <select value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value as NewTeamUser["role"] })} className={FIELD}>
                    {ROLE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </label>
              </div>

              {formError && <p className="text-[13px] text-coral-600">{formError}</p>}

              <button
                type="button"
                onClick={create}
                disabled={busy || !draft.email || !draft.password}
                className="tap w-full rounded-xl bg-brand-800 py-2.5 text-[15px] font-semibold text-white hover:bg-brand-900 disabled:opacity-60"
              >
                {busy ? "Creating…" : "Create account"}
              </button>

              {lastCreated && !formError && (
                <div className="rounded-2xl bg-good-100 p-3.5 ring-1 ring-good-500/20">
                  <p className="text-[13px] font-semibold text-ink">Account created — {lastCreated.email}</p>
                  <p className="mt-0.5 text-[12px] text-sage-600">
                    Temporary password <span className="font-semibold text-ink">{lastCreated.password}</span> · they reset it on first login.
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      shareOnWhatsApp(
                        credentialsText({
                          platformName,
                          loginUrl: appLoginUrl(),
                          email: lastCreated.email,
                          password: lastCreated.password,
                          roleLabel: ROLE_OPTIONS.find((o) => o.value === lastCreated.role)?.label,
                        }),
                      )
                    }
                    className="tap mt-2 inline-flex items-center gap-1.5 rounded-full bg-brand-800 px-3.5 py-1.5 text-[13px] font-semibold text-white hover:bg-brand-900"
                  >
                    <Icon.Phone width={14} height={14} /> Share on WhatsApp
                  </button>
                </div>
              )}
              <p className="text-[12px] leading-relaxed text-sage-500">
                Caregivers and families are linked to a specific patient when you onboard that patient.
              </p>
            </div>
          </section>

          {/* List */}
          <section className="rounded-2xl bg-white p-5 shadow-lift ring-1 ring-ink/[0.05]">
            <h2 className="font-display text-[15px] font-semibold text-ink">People</h2>

            {resetInfo && (
              <div className="mt-3 rounded-2xl bg-good-100 p-3.5 ring-1 ring-good-500/20">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[13px] font-semibold text-ink">New password set — {resetInfo.email}</p>
                  <button type="button" onClick={() => setResetInfo(null)} className="tap shrink-0 text-[12px] font-semibold text-sage-500 hover:text-ink">Dismiss</button>
                </div>
                <p className="mt-0.5 text-[12px] text-sage-600">
                  Temporary password <span className="font-semibold text-ink">{resetInfo.password}</span> · they reset it on next login.
                </p>
                <button
                  type="button"
                  onClick={() =>
                    shareOnWhatsApp(
                      credentialsText({
                        platformName, loginUrl: appLoginUrl(),
                        email: resetInfo.email, password: resetInfo.password,
                        roleLabel: ROLE_OPTIONS.find((o) => o.value === resetInfo.role)?.label,
                      }),
                    )
                  }
                  className="tap mt-2 inline-flex items-center gap-1.5 rounded-full bg-brand-800 px-3.5 py-1.5 text-[13px] font-semibold text-white hover:bg-brand-900"
                >
                  <Icon.Phone width={14} height={14} /> Share on WhatsApp
                </button>
              </div>
            )}
            {rowError && <p className="mt-3 rounded-xl bg-coral-100 px-3 py-2 text-[13px] text-coral-600 ring-1 ring-coral-200">{rowError}</p>}

            {loading ? (
              <div className="mt-3 space-y-2">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-12 animate-pulse rounded-xl bg-mist" />
                ))}
              </div>
            ) : error ? (
              <div className="mt-3 rounded-xl bg-mist p-3 text-[13px] text-sage-600">
                {error}
                <p className="mt-1 text-[12px] text-sage-500">If this is the first time, deploy the admin-users function first.</p>
              </div>
            ) : users.length === 0 ? (
              <p className="mt-3 text-[13px] text-sage-500">No teammates yet.</p>
            ) : (
              <ul className="mt-3 divide-y divide-ink/[0.05]">
                {users.map((u) => (
                  <li key={u.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-mist text-[12px] font-semibold text-brand-700">
                      {(u.full_name ?? u.email).split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-semibold text-ink">{u.full_name ?? u.email}</span>
                      <span className="block truncate text-[12px] text-sage-500">{u.email}</span>
                    </span>
                    <span className="shrink-0 rounded-full bg-mist px-2.5 py-1 text-[12px] font-semibold text-ink">
                      {u.is_admin ? "Admin" : roleLabel(u.role)}
                    </span>
                    {!u.is_admin && (
                      <div className="flex shrink-0 items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => resetPw(u)}
                          disabled={actingId === u.id}
                          className="tap rounded-lg border border-line px-2.5 py-1 text-[12px] font-semibold text-sage-600 hover:bg-mist-100 hover:text-ink disabled:opacity-60"
                        >
                          {actingId === u.id ? "…" : "Reset password"}
                        </button>
                        {confirmRemoveId === u.id ? (
                          <>
                            <button type="button" onClick={() => remove(u)} disabled={actingId === u.id} className="tap rounded-lg bg-coral-600 px-2.5 py-1 text-[12px] font-semibold text-white hover:bg-coral-500 disabled:opacity-60">
                              Confirm remove
                            </button>
                            <button type="button" onClick={() => setConfirmRemoveId(null)} className="tap rounded-lg px-2 py-1 text-[12px] font-semibold text-sage-600 hover:text-ink">Cancel</button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => { setConfirmRemoveId(u.id); setRowError(null); }}
                            className="tap rounded-lg border border-coral-200 px-2.5 py-1 text-[12px] font-semibold text-coral-600 hover:bg-coral-100"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
