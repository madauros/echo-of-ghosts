import { useCallback, useEffect, useMemo, useState } from "react";
import { ClipboardCheck, GraduationCap, Plus } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { formatDayLabel, type AgendaRow } from "@/components/agenda/useAgenda";

type Client = SupabaseClient<Database>;
type ClassRow = Database["public"]["Tables"]["classes"]["Row"];
export type GradeRow = Database["public"]["Tables"]["evaluation_grades"]["Row"];

const fmt = (n: number) => Number(n).toLocaleString("ar-MA", { maximumFractionDigits: 2 });

/** Evaluations (from المفكرة) for the given classes. */
export function useEvaluations(client: Client, classIds: string[], version = 0) {
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
      .eq("kind", "evaluation")
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
  }, [client, key, version]);
  return { rows, loading };
}

/* ------------------------------ Teacher side ------------------------------ */

export function TeacherEvaluations({ client, classes }: { client: Client; classes: ClassRow[] }) {
  const classIds = useMemo(() => classes.map((c) => c.id), [classes]);
  const { rows, loading } = useEvaluations(client, classIds);
  const [grades, setGrades] = useState<GradeRow[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    if (rows.length === 0) {
      setGrades([]);
      return;
    }
    let active = true;
    (async () => {
      const { data } = await client
        .from("evaluation_grades")
        .select("*")
        .in("evaluation_id", rows.map((r) => r.id));
      if (!active) return;
      setGrades(data ?? []);
      const ids = Array.from(new Set((data ?? []).map((g) => g.student_id)));
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
    <section className="text-start">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
        <ClipboardCheck size={18} /> التقييمات
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        التقييمات المُنشأة من المفكرة. أضف النقط من قائمة التلاميذ.
      </p>
      {loading ? (
        <p className="mt-6 text-sm text-muted-foreground">جارٍ التحميل…</p>
      ) : rows.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-dashed border-border bg-card/60 px-6 py-10 text-center text-sm text-muted-foreground">
          لا توجد تقييمات بعد. أنشئ تقييماً من المفكرة.
        </p>
      ) : (
        <ul className="mt-6 space-y-3">
          {rows.map((r) => {
            const g = grades.filter((x) => x.evaluation_id === r.id);
            const avg = g.length ? g.reduce((s, x) => s + Number(x.grade), 0) / g.length : null;
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
                    <span className="rounded-full bg-primary/10 px-3 py-1 font-semibold text-primary">
                      {g.length} نقطة
                    </span>
                    {avg !== null ? (
                      <span className="rounded-full bg-muted px-3 py-1 font-semibold text-foreground">
                        المعدل {fmt(avg)}/20
                      </span>
                    ) : null}
                  </div>
                </button>
                {open === r.id ? (
                  g.length === 0 ? (
                    <p className="mt-3 text-xs text-muted-foreground">لم تُسجَّل أي نقطة بعد.</p>
                  ) : (
                    <ul className="mt-3 divide-y divide-border text-sm">
                      {g.map((x) => (
                        <li key={x.id} className="flex justify-between gap-3 py-2">
                          <span>{names[x.student_id] ?? "—"}</span>
                          <span className="font-semibold">{fmt(x.grade)}/20</span>
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

/** Inline form to add/update one student's grade. */
export function GradeForm({
  client,
  teacherId,
  studentId,
  classId,
  onDone,
}: {
  client: Client;
  teacherId: string;
  studentId: string;
  classId: string | null;
  onDone: () => void;
}) {
  const { rows, loading } = useEvaluations(client, classId ? [classId] : []);
  const [existing, setExisting] = useState<GradeRow[]>([]);
  const [evalId, setEvalId] = useState("");
  const [grade, setGrade] = useState("");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const loadExisting = useCallback(async () => {
    const { data } = await client.from("evaluation_grades").select("*").eq("student_id", studentId);
    setExisting(data ?? []);
  }, [client, studentId]);
  useEffect(() => {
    void loadExisting();
  }, [loadExisting]);

  useEffect(() => {
    const g = existing.find((x) => x.evaluation_id === evalId);
    setGrade(g ? String(g.grade) : "");
    setComment(g?.comment ?? "");
  }, [evalId, existing]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = Number(grade.replace(",", "."));
    if (!evalId) return setMsg("اختر التقييم.");
    if (!Number.isFinite(n) || n < 0 || n > 20) return setMsg("النقطة يجب أن تكون بين 0 و 20.");
    setBusy(true);
    setMsg(null);
    const { error } = await client.from("evaluation_grades").upsert(
      { evaluation_id: evalId, student_id: studentId, teacher_id: teacherId, grade: n, comment: comment.trim() || null },
      { onConflict: "evaluation_id,student_id" },
    );
    setBusy(false);
    if (error) {
      console.error("[grades] save failed", error);
      setMsg("تعذّر حفظ النقطة.");
      return;
    }
    onDone();
  };

  if (!classId) return <p className="text-xs text-muted-foreground">التلميذ غير معيّن إلى قسم.</p>;

  return (
    <form onSubmit={save} className="grid w-full gap-2 sm:grid-cols-[2fr_1fr_2fr_auto]">
      <select className="field-input text-sm" value={evalId} onChange={(e) => setEvalId(e.target.value)} aria-label="التقييم">
        <option value="">{loading ? "جارٍ التحميل…" : rows.length ? "اختر التقييم" : "لا توجد تقييمات"}</option>
        {rows.map((r) => (
          <option key={r.id} value={r.id}>
            {r.title} — {r.event_date}
          </option>
        ))}
      </select>
      <input
        className="field-input text-sm"
        inputMode="decimal"
        placeholder="النقطة /20"
        value={grade}
        onChange={(e) => setGrade(e.target.value)}
        aria-label="النقطة"
      />
      <input
        className="field-input text-sm"
        placeholder="ملاحظة (اختياري)"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
      />
      <button type="submit" className="btn-primary text-sm" disabled={busy}>
        {busy ? "…" : "حفظ"}
      </button>
      {msg ? <p className="text-xs text-destructive sm:col-span-4">{msg}</p> : null}
    </form>
  );
}

export function AddGradeButton(props: {
  client: Client;
  teacherId: string;
  studentId: string;
  classId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  return (
    <div className="w-full">
      <button
        type="button"
        className="btn-text inline-flex items-center gap-1 text-xs"
        onClick={() => {
          setOpen((v) => !v);
          setSaved(false);
        }}
      >
        <Plus size={14} /> {open ? "إغلاق" : "إضافة نقطة تقييم"}
      </button>
      {saved ? <span className="ms-2 text-xs text-success">تم حفظ النقطة.</span> : null}
      {open ? (
        <div className="mt-2">
          <GradeForm
            {...props}
            onDone={() => {
              setOpen(false);
              setSaved(true);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------ Student side ------------------------------ */

export function StudentGrades({ client, classId, studentId }: { client: Client; classId: string | null; studentId: string }) {
  const { rows, loading } = useEvaluations(client, classId ? [classId] : []);
  const [grades, setGrades] = useState<GradeRow[]>([]);
  useEffect(() => {
    client
      .from("evaluation_grades")
      .select("*")
      .eq("student_id", studentId)
      .then(({ data }) => setGrades(data ?? []));
  }, [client, studentId]);

  const graded = grades.filter((g) => rows.some((r) => r.id === g.evaluation_id));
  const avg = graded.length ? graded.reduce((s, g) => s + Number(g.grade), 0) / graded.length : null;

  return (
    <section className="text-start">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <GraduationCap size={18} /> المراقبة المستمرة
        </h2>
        {avg !== null ? (
          <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            المعدل {fmt(avg)}/20
          </span>
        ) : null}
      </div>
      {!classId ? (
        <p className="mt-6 text-sm text-muted-foreground">لم يتم تعيينك إلى قسم بعد.</p>
      ) : loading ? (
        <p className="mt-6 text-sm text-muted-foreground">جارٍ التحميل…</p>
      ) : rows.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-dashed border-border bg-card/60 px-6 py-10 text-center text-sm text-muted-foreground">
          لا توجد تقييمات بعد.
        </p>
      ) : (
        <ul className="mt-6 space-y-3">
          {rows.map((r) => {
            const g = grades.find((x) => x.evaluation_id === r.id);
            return (
              <li key={r.id} className="resource-card flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-foreground">{r.title}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{formatDayLabel(r.event_date)}</div>
                  {g?.comment ? <div className="mt-1 text-xs text-foreground">{g.comment}</div> : null}
                </div>
                {g ? (
                  <span className="rounded-full bg-success/10 px-3 py-1 text-sm font-bold text-success">
                    {fmt(g.grade)}/20
                  </span>
                ) : (
                  <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">لم تُسجَّل بعد</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
