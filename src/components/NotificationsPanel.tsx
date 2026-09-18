import { Bell } from "lucide-react";
import { formatDate, type NotificationRow } from "@/components/resources/useSubmissions";

export function NotificationsPanel({
  rows,
  loading,
  onMarkAllRead,
  onRemove,
}: {
  rows: NotificationRow[];
  loading: boolean;
  onMarkAllRead: () => void;
  onRemove: (id: string) => void;
}) {
  const unread = rows.filter((r) => r.read_at === null).length;

  return (
    <section className="text-start">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <Bell size={18} /> الإشعارات
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">تنبيهات الأجوبة والملاحظات.</p>
        </div>
        {unread > 0 ? (
          <button type="button" className="btn-text" onClick={onMarkAllRead}>
            تحديد الكل كمقروء ({unread})
          </button>
        ) : null}
      </div>

      {loading ? (
        <p className="mt-6 text-sm text-muted-foreground">جارٍ التحميل…</p>
      ) : rows.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-dashed border-border bg-card/60 p-6 text-center text-sm text-muted-foreground">
          لا توجد إشعارات.
        </p>
      ) : (
        <ul className="mt-6 space-y-3">
          {rows.map((n) => (
            <li
              key={n.id}
              className="resource-card flex flex-wrap items-start justify-between gap-3 p-4"
              data-unread={n.read_at === null}
            >
              <div>
                <div className="text-sm font-semibold text-foreground">
                  {n.read_at === null ? <span className="notif-dot" aria-hidden="true" /> : null}
                  {n.title}
                </div>
                {n.body ? <div className="mt-1 text-xs text-muted-foreground">{n.body}</div> : null}
                <div className="mt-1 text-[11px] text-muted-foreground">{formatDate(n.created_at)}</div>
              </div>
              <button type="button" className="btn-text" onClick={() => onRemove(n.id)}>
                حذف
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
