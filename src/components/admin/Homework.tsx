import { useCallback, useEffect, useMemo, useState } from "react";
import { BookCheck, ListChecks } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { formatDayLabel, type AgendaRow } from "@/components/agenda/useAgenda";
import { applyAgendaFilter, type AgendaFilter } from "@/components/grades/AgendaFilters";

type Client = SupabaseClient<Database>;
type ClassRow = Database["public"]["Tables"]["classes"]["Row"];
type StatusRow = Database["public"]["Tables"]["homework_status"]["Row"];

function useHomeworks(client: Client, classIds: string[]) {
  const [rows, setRows] = useState<AgendaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const key = classIds.join(",");
  useEffect(() => {
    let active = true;
    if (key === "") {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    client
      .from("agenda_events")
      .select("*")
      .eq("kind", "homework")
      .in("class_id", key.split(","))
      .order("event_date", { ascending: false })
      .then(({ data }) => {
        if (!active) return;
        setRows(data ?? []);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [client, key]);
  return { rows, loading };
}

function StatusChip({ done }: { done: boolean | undefined }) {
  if (done === undefined)
    return <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">لم يُحدَّد بعد</span>;
  return done ? (
    <span className="rounded-full bg-success/10 px-3 py-1 text-xs font-bold text-success">منجز</span>
  ) : (
    <span className="rounded-full bg-destructive/10 px-3 py-1 text-xs font-bold text-destructive">غير منجز</span>
  );
}

/* ---------------- Teacher: per-student marking (قائمة التلاميذ) ---------------- */

export function HomeworkStatusButton({
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
  const { rows, loading } = useHomeworks(client, open && classId ? [classId] : []);
  const [status, setStatus] = useState<StatusRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await client.from("homework_status").select("*").eq("student_id", studentId);
    setStatus(data ?? []);
  }, [client, studentId]);
  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const mark = async (homeworkId: string, done: boolean) => {
    setError(null);
    const { error: err } = await client
      .from("homework_status")
      .upsert({ homework_id: homeworkId, student_id: studentId, teacher_id: teacherId, done }, { onConflict: "homework_id,student_id" });
    if (err) {
      console.error("[homework] save failed", err);
      setError("تعذّر الحفظ.");
      return;
    }
    void load();
  };

  return (
    <div className="w-full">
      <button type="button" className="btn-text inline-flex items-center gap-1 text-xs" onClick={() => setOpen((v) => !v)}>
        <ListChecks size={14} /> {open ? "إغلاق" : "متابعة الواجبات المنزلية"}
      </button>
      {open ? (
        !classId ? (
          <p className="mt-2 text-xs text-muted-foreground">التلميذ غير معيّن إلى قسم.</p>
        ) : loading ? (
          <p className="mt-2 text-xs text-muted-foreground">جارٍ التحميل…</p>
        ) : rows.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">لا توجد واجبات منزلية لهذا القسم.</p>
        ) : (
          <ul className="mt-2 divide-y divide-border rounded-xl border border-border text-sm">
            {rows.map((r) => {
              const done = status.find((s) => s.homework_id === r.id)?.done;
              return (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <div className="min-w-0">
                    <div className="font-medium text-foreground">{r.title}</div>
                    <div className="text-xs text-muted-foreground">{formatDayLabel(r.event_date)}</div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => mark(r.id, true)}
                      className={`rounded-full px-3 py-1 text-xs font-bold transition ${
                        done === true ? "bg-success text-success-foreground" : "bg-success/10 text-success hover:bg-success/20"
                      }`}
                    >
                      منجز
                    </button>
                    <button
                      type="button"
                      onClick={() => mark(r.id, false)}
                      className={`rounded-full px-3 py-1 text-xs font-bold transition ${
                        done === false
                          ? "bg-destructive text-destructive-foreground"
                          : "bg-destructive/10 text-destructive hover:bg-destructive/20"
                      }`}
                    >
                      غير منجز
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )
      ) : null}
      {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

/* ---------------- Teacher: summary (المراقبة المستمرة) ---------------- */

export function TeacherHomeworks({ client, classes, filter }: { client: Client; classes: ClassRow[]; filter?: AgendaFilter }) {
  const classIds = useMemo(() => classes.map((c) => c.id), [classes]);
  const { rows: allRows, loading } = useHomeworks(client, classIds);
  const rows = useMemo(() => (filter ? applyAgendaFilter(allRows, filter) : allRows), [allRows, filter]);
  const [status, setStatus] = useState<StatusRow[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    if (rows.length === 0) return setStatus([]);
    let active = true;
    (async () => {
      const { data } = await client.from("homework_status").select("*").in("homework_id", rows.map((r) => r.id));
      if (!active) return;
      setStatus(data ?? []);
      const ids = Array.from(new Set((data ?? []).map((s) => s.student_id)));
      if (ids.length) {
        const { data: profs } = await client.from("profiles").select("id, full_name, email").in("id", ids);
        if (!active) return;
        const m: Record<string, string> = {};
        for (const p of profs ?? []) m[p.id] = p.full_name?.trim() || p.email;
        setNames(m);
      }
    })();
    return () => {
      active = false;
    };
  }, [client, rows]);

  const className = (id: string) => classes.find((c) => c.id === id)?.name ?? "";

  return (
    <section className="mt-10 text-start">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
        <BookCheck size={18} /> الواجبات المنزلية
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">الواجبات المُنشأة من المذكرة. حدّد الإنجاز من قائمة التلاميذ.</p>
      {loading ? (
        <p className="mt-6 text-sm text-muted-foreground">جارٍ التحميل…</p>
      ) : rows.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-dashed border-border bg-card/60 px-6 py-10 text-center text-sm text-muted-foreground">
          لا توجد واجبات منزلية بعد.
        </p>
      ) : (
        <ul className="mt-6 space-y-3">
          {rows.map((r) => {
            const s = status.filter((x) => x.homework_id === r.id);
            const doneCount = s.filter((x) => x.done).length;
            return (
              <li key={r.id} className="resource-card p-4">
                <button
                  type="button"
                  className="flex w-full flex-wrap items-center justify-between gap-2 text-start"
                  onClick={() => setOpen(open === r.id ? null : r.id)}
                >
                  <div>
                    <div className="text-sm font-semibold text-foreground">{r.title}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {className(r.class_id)} — {formatDayLabel(r.event_date)}
                    </div>
                  </div>
                  <div className="flex gap-2 text-xs">
                    <span className="rounded-full bg-success/10 px-3 py-1 font-semibold text-success">منجز {doneCount}</span>
                    <span className="rounded-full bg-destructive/10 px-3 py-1 font-semibold text-destructive">
                      غير منجز {s.length - doneCount}
                    </span>
                  </div>
                </button>
                {open === r.id ? (
                  s.length === 0 ? (
                    <p className="mt-3 text-xs text-muted-foreground">لم يُحدَّد أي إنجاز بعد.</p>
                  ) : (
                    <ul className="mt-3 divide-y divide-border text-sm">
                      {s.map((x) => (
                        <li key={x.id} className="flex items-center justify-between gap-3 py-2">
                          <span>{names[x.student_id] ?? "—"}</span>
                          <StatusChip done={x.done} />
                        </li>
                      ))}
                    </ul>
                  )
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/* ---------------- Student side ---------------- */

export function StudentHomeworks({ client, classId, studentId }: { client: Client; classId: string | null; studentId: string }) {
  const { rows, loading } = useHomeworks(client, classId ? [classId] : []);
  const [status, setStatus] = useState<StatusRow[]>([]);
  useEffect(() => {
    client
      .from("homework_status")
      .select("*")
      .eq("student_id", studentId)
      .then(({ data }) => setStatus(data ?? []));
  }, [client, studentId]);

  if (!classId) return null;
  return (
    <section className="mt-10 text-start">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
        <BookCheck size={18} /> الواجبات المنزلية
      </h2>
      {loading ? (
        <p className="mt-6 text-sm text-muted-foreground">جارٍ التحميل…</p>
      ) : rows.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-dashed border-border bg-card/60 px-6 py-10 text-center text-sm text-muted-foreground">
          لا توجد واجبات منزلية بعد.
        </p>
      ) : (
        <ul className="mt-6 space-y-3">
          {rows.map((r) => (
            <li key={r.id} className="resource-card flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-foreground">{r.title}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">{formatDayLabel(r.event_date)}</div>
              </div>
              <StatusChip done={status.find((s) => s.homework_id === r.id)?.done} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
