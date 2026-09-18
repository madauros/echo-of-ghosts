import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { Butterfly } from "@/components/Butterfly";
import { formatSize } from "./useResources";
import { formatDate, openSubmission, useSubmissions, type SubmissionItem } from "./useSubmissions";

export function StudentSubmissions({
  client,
  studentId,
}: {
  client: SupabaseClient<Database>;
  studentId: string;
}) {
  const { items, loading, error, setError, reload } = useSubmissions(client, { studentId });

  const remove = async (row: SubmissionItem) => {
    if (!window.confirm(`حذف جوابك على «${row.resource_title}»؟`)) return;
    const { error: err } = await client.from("submissions").delete().eq("id", row.id);
    if (err) {
      setError("تعذّر الحذف.");
      return;
    }
    await client.storage.from("submissions").remove([row.file_path]);
    await reload();
  };

  const open = async (row: SubmissionItem, download: boolean) => {
    try {
      await openSubmission(client, row, download);
    } catch {
      setError("تعذّر فتح الملف.");
    }
  };

  return (
    <section className="text-start">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">أجوبتي</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            الملفات التي أرسلتها إلى أساتذتك، مع ملاحظاتهم عليها.
          </p>
        </div>
        <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
          {items.length} جواب
        </span>
      </div>

      {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}

      {loading ? (
        <p className="mt-6 text-sm text-muted-foreground">جارٍ التحميل…</p>
      ) : items.length === 0 ? (
        <div className="mt-6 flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border bg-card/60 px-6 py-12 text-center">
          <Butterfly />
          <div>
            <p className="text-sm font-semibold text-foreground">لم ترسل أي جواب بعد</p>
            <p className="mt-1 text-xs text-muted-foreground">
              افتح قائمة التمارين واضغط «إرسال جواب» لإرفاق ملف PDF أو صورة.
            </p>
          </div>
        </div>
      ) : (
        <ul className="mt-6 space-y-4">
          {items.map((row) => (
            <li key={row.id} className="resource-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-foreground">{row.resource_title}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {row.file_name}
                    {row.file_size ? ` • ${formatSize(row.file_size)}` : ""} • {formatDate(row.created_at)}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {row.grade !== null ? (
                    <span
                      className="rounded-full bg-primary/15 px-3 py-1 text-sm font-bold text-primary"
                      dir="ltr"
                      title={row.graded_at ? `صُحّح في ${formatDate(row.graded_at)}` : undefined}
                    >
                      {row.grade}/20
                    </span>
                  ) : (
                    <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">
                      في انتظار التصحيح
                    </span>
                  )}
                  <button type="button" className="btn-text" onClick={() => open(row, false)}>
                    عرض
                  </button>
                  <button type="button" className="btn-text" onClick={() => open(row, true)}>
                    تحميل
                  </button>
                  <button type="button" className="btn-text" onClick={() => remove(row)}>
                    حذف
                  </button>
                </div>
              </div>


              {row.comments.length > 0 ? (
                <div className="mt-3 space-y-2 rounded-xl bg-primary/5 p-3">
                  <p className="text-xs font-semibold text-primary">ملاحظات الأستاذ</p>
                  {row.comments.map((c) => (
                    <div key={c.id} className="text-sm text-foreground">
                      {c.body}
                      <span className="ms-2 text-[11px] text-muted-foreground">{formatDate(c.created_at)}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
