import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarX2, Trash2 } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { formatDayLabel } from "@/components/agenda/useAgenda";
import { trimesterOf } from "@/lib/trimesters";

type Client = SupabaseClient<Database>;
type AbsenceRow = Database["public"]["Tables"]["absences"]["Row"];

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function absenceDays(start: string, end: string) {
  const a = Date.parse(`${start}T00:00:00Z`);
  const b = Date.parse(`${end}T00:00:00Z`);
  return Math.round((b - a) / 86400000) + 1;
}

function AbsenceItem({ row, onDelete }: { row: AbsenceRow; onDelete?: (() => void) | undefined }) {
  const days = absenceDays(row.start_date, row.end_date);
  return (
    <li className="flex items-start justify-between gap-3 px-4 py-4">
      <div className="min-w-0">
        <div className="font-semibold text-foreground">
          {days === 1
            ? formatDayLabel(row.start_date)
            : `من ${formatDayLabel(row.start_date)} إلى ${formatDayLabel(row.end_date)}`}
        </div>
        {row.reason ? <div className="mt-1 text-sm font-medium text-primary">{row.reason}</div> : null}
        <div className="mt-2 text-sm text-muted-foreground">
          {row.justified ? "غياب مبرَّر" : "غياب غير مبرَّر"} · {days === 1 ? "يوم واحد" : `${days} أيام`}
        </div>
      </div>
      {onDelete ? (
        <button type="button" className="btn-text text-destructive" onClick={onDelete} aria-label="حذف الغياب">
          <Trash2 size={16} />
        </button>
      ) : null}
    </li>
  );
}

/* ---------------- Student: الغيابات ---------------- */

export function StudentAbsences({ client, studentId, trimester }: { client: Client; studentId: string; trimester: string }) {
  const [rows, setRows] = useState<AbsenceRow[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    client
      .from("absences")
      .select("*")
      .eq("student_id", studentId)
      .order("start_date", { ascending: false })
      .then(({ data }) => {
        if (!active) return;
        setRows(data ?? []);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [client, studentId]);

  const shown = useMemo(() => (trimester ? rows.filter((r) => trimesterOf(r.start_date) === trimester) : rows), [rows, trimester]);
  const total = shown.reduce((n, r) => n + absenceDays(r.start_date, r.end_date), 0);

  return (
    <section className="text-start">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <CalendarX2 size={18} /> الغيابات
        </h2>
        <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">{total} يوم غياب</span>
      </div>
      {loading ? (
        <p className="mt-6 text-sm text-muted-foreground">جارٍ التحميل…</p>
      ) : shown.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-border bg-card px-6 py-10 text-center text-sm text-muted-foreground">
          لا توجد غيابات مسجّلة
        </div>
      ) : (
        <ul className="mt-6 divide-y divide-border rounded-2xl border border-border bg-card">
          {shown.map((r) => (
            <AbsenceItem key={r.id} row={r} />
          ))}
        </ul>
      )}
    </section>
  );
}

/* ---------------- Teacher: add from student list ---------------- */

export function AddAbsenceButton({
  client,
  teacherId,
  studentId,
  classId,
}: {
  client: Client;
  teacherId: string;
  studentId: string;
  classId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<AbsenceRow[]>([]);
  const [start, setStart] = useState(todayKey());
  const [end, setEnd] = useState(todayKey());
  const [reason, setReason] = useState("");
  const [justified, setJustified] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { data } = await client.from("absences").select("*").eq("student_id", studentId).order("start_date", { ascending: false });
    setRows(data ?? []);
  }, [client, studentId]);
  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const save = async () => {
    setError(null);
    if (!start || !end || end < start) return setError("تاريخ النهاية يجب أن يكون بعد تاريخ البداية.");
    setSaving(true);
    const { error: err } = await client.from("absences").insert({
      student_id: studentId,
      teacher_id: teacherId,
      class_id: classId,
      start_date: start,
      end_date: end,
      reason: reason.trim() || null,
      justified,
    });
    setSaving(false);
    if (err) {
      console.error("[absences] insert failed", err);
      return setError("تعذّر تسجيل الغياب.");
    }
    setReason("");
    setJustified(false);
    void load();
  };

  const remove = async (id: string) => {
    if (!confirm("حذف هذا الغياب؟")) return;
    await client.from("absences").delete().eq("id", id);
    void load();
  };

  return (
    <div className="w-full">
      <button type="button" className="btn-text inline-flex items-center gap-1 text-xs" onClick={() => setOpen((v) => !v)}>
        <CalendarX2 size={14} /> {open ? "إغلاق" : "الغيابات"}
      </button>
      {open ? (
        <div className="mt-2 space-y-3 rounded-xl border border-border p-3">
          <div className="flex flex-wrap items-end gap-2 text-sm">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              من
              <input type="date" className="field-input text-sm" value={start} onChange={(e) => { setStart(e.target.value); if (end < e.target.value) setEnd(e.target.value); }} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              إلى
              <input type="date" className="field-input text-sm" value={end} min={start} onChange={(e) => setEnd(e.target.value)} />
            </label>
            <label className="flex min-w-40 flex-1 flex-col gap-1 text-xs text-muted-foreground">
              السبب (اختياري)
              <input className="field-input text-sm" maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="مثال: مرض" />
            </label>
            <label className="flex items-center gap-2 text-xs text-foreground">
              <input type="checkbox" checked={justified} onChange={(e) => setJustified(e.target.checked)} /> مبرَّر
            </label>
            <button type="button" className="btn-primary text-xs" disabled={saving} onClick={save}>
              {saving ? "جارٍ الحفظ…" : "إضافة غياب"}
            </button>
          </div>
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
          {rows.length === 0 ? (
            <p className="text-xs text-muted-foreground">لا توجد غيابات مسجّلة لهذا التلميذ.</p>
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border text-sm">
              {rows.map((r) => (
                <AbsenceItem key={r.id} row={r} onDelete={r.teacher_id === teacherId ? () => void remove(r.id) : undefined} />
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
