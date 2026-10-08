import { Clock, NotebookPen, Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { LessonLogPdfButton } from "./LessonLogPdf";

type LogRow = Database["public"]["Tables"]["lesson_logs"]["Row"];
type ClassRow = Database["public"]["Tables"]["classes"]["Row"];

/** Day runs 08:00 → 17:30, starts every 30 min. */
const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};
const toTime = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const DAY_START = 8 * 60;
const DAY_END = 17 * 60 + 30;
const STARTS: string[] = [];
for (let m = DAY_START; m <= DAY_END - 60; m += 30) STARTS.push(toTime(m));
const short = (t: string) => t.slice(0, 5);

export function LessonLog({
  client,
  teacherId,
  classes,
  dateKey,
}: {
  client: SupabaseClient<Database>;
  teacherId: string;
  classes: ClassRow[];
  dateKey: string;
}) {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<LogRow | null>(null);
  const [classId, setClassId] = useState("");
  const [start, setStart] = useState("08:00");
  const [duration, setDuration] = useState(60);
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await client
      .from("lesson_logs")
      .select("*")
      .eq("teacher_id", teacherId)
      .eq("log_date", dateKey)
      .order("start_time");
    setRows(data ?? []);
  }, [client, teacherId, dateKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const durations = [60, 120].filter((d) => toMin(start) + d <= DAY_END);

  const reset = () => {
    setEditing(null);
    setOpen(false);
    setContent("");
    setStart("08:00");
    setDuration(60);
    setError(null);
  };

  const startEdit = (r: LogRow) => {
    setEditing(r);
    setOpen(true);
    setClassId(r.class_id);
    setStart(short(r.start_time));
    setDuration(toMin(r.end_time) - toMin(r.start_time));
    setContent(r.content);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cls = classId || classes[0]?.id || "";
    if (!cls) return setError("اختر القسم.");
    if (content.trim() === "") return setError("اكتب العناصر المتناولة مع التلاميذ.");
    const end = toMin(start) + duration;
    if (end > DAY_END) return setError("يجب أن تنتهي الحصة قبل 17:30.");
    const s = toMin(start);
    const overlap = rows.some(
      (r) => r.id !== editing?.id && s < toMin(r.end_time) && end > toMin(r.start_time),
    );
    if (overlap) return setError("هذه الفترة تتداخل مع حصة مسجلة.");
    setBusy(true);
    const payload = {
      class_id: cls,
      log_date: dateKey,
      start_time: start,
      end_time: toTime(end),
      content: content.trim().slice(0, 5000),
    };
    const { error: err } = editing
      ? await client.from("lesson_logs").update(payload).eq("id", editing.id)
      : await client.from("lesson_logs").insert({ ...payload, teacher_id: teacherId });
    setBusy(false);
    if (err) return setError("تعذّر حفظ الحصة.");
    reset();
    await load();
  };

  const remove = async (r: LogRow) => {
    if (!window.confirm("حذف هذه الحصة؟")) return;
    await client.from("lesson_logs").delete().eq("id", r.id);
    await load();
  };

  return (
    <section className="mt-6 rounded-2xl border border-border bg-card/95 p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
          <NotebookPen size={18} className="text-brand-green" /> متابعة العمل المنجز
          <span className="text-xs font-normal text-muted-foreground">(خاص بالأستاذ)</span>
        </h3>
        <span className="flex flex-wrap items-start gap-2">
        <LessonLogPdfButton client={client} teacherId={teacherId} classes={classes} dateKey={dateKey} />
        {!open ? (
          <button type="button" className="btn-primary inline-flex items-center gap-1" onClick={() => setOpen(true)}>
            <Plus size={16} /> إضافة متابعة
          </button>
        ) : null}
        </span>
      </div>

      {open ? (
        <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-3">
          <select className="field-input" value={classId} onChange={(e) => setClassId(e.target.value)}>
            <option value="">اختر القسم</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select
            className="field-input"
            value={start}
            onChange={(e) => {
              setStart(e.target.value);
              if (toMin(e.target.value) + duration > DAY_END) setDuration(60);
            }}
          >
            {STARTS.map((t) => (
              <option key={t} value={t}>من {t}</option>
            ))}
          </select>
          <select className="field-input" value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
            {durations.map((d) => (
              <option key={d} value={d}>
                {d === 60 ? "ساعة" : "ساعتان"} — إلى {toTime(toMin(start) + d)}
              </option>
            ))}
          </select>
          <textarea
            className="field-input sm:col-span-3"
            rows={4}
            maxLength={5000}
            placeholder="العناصر المتناولة مع التلاميذ…"
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
          {error ? <p className="sm:col-span-3 text-sm text-destructive">{error}</p> : null}
          <div className="flex gap-2 sm:col-span-3">
            <button type="submit" className="btn-primary" disabled={busy}>
              {editing ? "حفظ التعديل" : "حفظ"}
            </button>
            <button type="button" className="btn-text" onClick={reset}>إلغاء</button>
          </div>
        </form>
      ) : null}

      <ol className="mt-4 space-y-2">
        {rows.length === 0 ? (
          <li className="text-sm text-muted-foreground">لا توجد حصص مسجلة في هذا اليوم.</li>
        ) : (
          rows.map((r) => (
            <li key={r.id} className="flex gap-3 rounded-xl border border-border/70 bg-background/60 p-3">
              <div className="flex w-24 shrink-0 flex-col items-center justify-center rounded-lg bg-brand-green/10 py-2 text-brand-green" dir="ltr">
                <Clock size={14} />
                <span className="text-sm font-semibold">{short(r.start_time)}</span>
                <span className="text-xs">{short(r.end_time)}</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
                    {classes.find((c) => c.id === r.class_id)?.name ?? "—"}
                  </span>
                  <span className="flex gap-2">
                    <button type="button" className="btn-text" onClick={() => startEdit(r)}>تعديل</button>
                    <button type="button" className="btn-text" onClick={() => void remove(r)}>حذف</button>
                  </span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground">{r.content}</p>
              </div>
            </li>
          ))
        )}
      </ol>
    </section>
  );
}
