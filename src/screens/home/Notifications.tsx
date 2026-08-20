import { useEffect, useState } from "react";
import { getMyNotifications, markNotificationsRead, type NotificationRow } from "../../lib/db";
import { BottomSheet, HcIcon, niceTime } from "./hc-kit";

/**
 * The bell and its list.
 *
 * Unread count is loaded once on mount rather than polled: a caregiver opens
 * this app many times a day, and a background poll on a phone costs battery for
 * information that is already stale by the time it is read. Opening the sheet
 * refetches, which is the moment the count actually matters.
 */
export function NotificationBell() {
  const [rows, setRows] = useState<NotificationRow[] | null>(null);
  const [open, setOpen] = useState(false);

  const load = () => {
    // Absent until migration 0027 is applied — an empty list, never a crash.
    void getMyNotifications().then(setRows).catch(() => setRows([]));
  };
  useEffect(load, []);

  const unread = (rows ?? []).filter((n) => !n.read_at).length;

  const openSheet = () => {
    setOpen(true);
    load();
  };

  const markAll = async () => {
    try {
      await markNotificationsRead();
      setRows((xs) => (xs ?? []).map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
    } catch { /* the list still shows; a failed mark is not worth an error screen */ }
  };

  return (
    <>
      <button type="button" className="hc-bell" aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"} onClick={openSheet}>
        <HcIcon.Warn size={17} />
        {unread > 0 && <span className="hc-bell-dot num">{unread > 9 ? "9+" : unread}</span>}
      </button>

      {open && (
        <BottomSheet title="Notifications" onClose={() => setOpen(false)}>
          {rows === null ? (
            <p className="hc-muted">Loading…</p>
          ) : rows.length === 0 ? (
            <div className="hc-empty">
              <b>Nothing new</b>
              <p>Updates from the care team appear here.</p>
            </div>
          ) : (
            <>
              {unread > 0 && (
                <button type="button" className="hc-help-link" onClick={markAll}>Mark all as read</button>
              )}
              {rows.map((n) => (
                <div key={n.id} className={`hc-note-row${n.read_at ? "" : " unread"}`}>
                  <b>{n.title}</b>
                  <small>{[n.body, niceTime(n.created_at)].filter(Boolean).join(" · ")}</small>
                </div>
              ))}
            </>
          )}
        </BottomSheet>
      )}
    </>
  );
}
