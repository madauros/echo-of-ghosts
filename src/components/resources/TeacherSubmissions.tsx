import { useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { Butterfly } from "@/components/Butterfly";
import { formatSize } from "./useResources";
import { formatDate, notify, openSubmission, useSubmissions, type SubmissionItem } from "./useSubmissions";

type ClassRow = Database["public"]["Tables"]["classes"]["Row"];

export function TeacherSubmissions({
  client,
  teacherId,
  classes,
}: {
  client: SupabaseClient<Database>;
  teacherId: string;
  classes: ClassRow[];
}) {
  const { items, loading, error, setError, reload } = useSubmissions(client, { teacherId });
  const [classId, setClassId] = useState("all");
  const [query, setQuery] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [grades, setGrades] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [gradeBusy, setGradeBusy] = useState<string | null>(null);

  const saveGrade = async (row: SubmissionItem) => {
    const raw = (grades[row.id] ?? "").trim();
    const value = Number(raw.replace(",", "."));
    if (raw === "" || Number.isNaN(value) || value < 0 || value > 20) {
      setError("أدخل نقطة صحيحة بين 0 و 20.");
      return;
    }
    setGradeBusy(row.id);
    const { error: err } = await client
      .from("submissions")
      .update({ grade: value, graded_at: new Date().toISOString() })
      .eq("id", row.id);
    if (err) {
      setError("تعذّر حفظ النقطة.");
      setGradeBusy(null);
      return;
    }
    await notify(client, {
      userId: row.student_id,
      actorId: teacherId,
      kind: "grade",
      title: `نقطتك في «${row.resource_title}»: ${value}/20`,
      submissionId: row.id,
    });
    setGrades((g) => ({ ...g, [row.id]: "" }));
    setGradeBusy(null);
    await reload();
  };

  const className = (id: string | null) => classes.find((c) => c.id === id)?.name ?? "بدون قسم";

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(
      (row) =>
        (classId === "all" || row.class_id === classId) &&
        (q === "" ||
          row.student_name.toLowerCase().includes(q) ||
          row.student_email.toLowerCase().includes(q)),
    );
  }, [items, classId, query]);

  const open = async (row: SubmissionItem, download: boolean) => {
    try {
      await openSubmission(client, row, download);
    } catch {
      setError("تعذّر فتح الملف.");
    }
  };

  const sendComment = async (row: SubmissionItem) => {
    const body = (drafts[row.id] ?? "").trim();
    if (body === "") return;
    setBusy(row.id);
    const { error: err } = await client
      .from("submission_comments")
      .insert({ submission_id: row.id, author_id: teacherId, body });
    if (err) {
      setError("تعذّر إرسال الملاحظة.");
      setBusy(null);
      return;
    }
    await notify(client, {
      userId: row.student_id,
      actorId: teacherId,
      kind: "comment",
      title: `ملاحظة جديدة على جوابك في «${row.resource_title}»`,
      body,
      submissionId: row.id,
    });
    setDrafts((d) => ({ ...d, [row.id]: "" }));
    setBusy(null);
    await reload();
  };

  return (
    <section className="text-start">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">أجوبة التلاميذ</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            كل الملفات المرسلة على تمارينك، حسب القسم والتلميذ.
          </p>
        </div>
        <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
          {filtered.length} جواب
        </span>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <select
          className="field-input w-auto min-w-40 text-sm"
          value={classId}
          onChange={(e) => setClassId(e.target.value)}
          aria-label="تصفية حسب القسم"
        >
          <option value="all">كل الأقسام</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <input
          className="field-input min-w-40 flex-1 text-sm"
          placeholder="بحث باسم التلميذ…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}

      {loading ? (
        <p className="mt-6 text-sm text-muted-foreground">جارٍ التحميل…</p>
      ) : filtered.length === 0 ? (
        <div className="mt-6 flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border bg-card/60 px-6 py-12 text-center">
          <Butterfly />
          <p className="text-sm text-muted-foreground">لا توجد أجوبة مطابقة بعد.</p>
        </div>
      ) : (
        <ul className="mt-6 space-y-4">
          {filtered.map((row) => (
            <li key={row.id} className="resource-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-foreground">{row.resource_title}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {row.student_name} • {className(row.class_id)} • {formatDate(row.created_at)}
                    {row.file_size ? ` • ${formatSize(row.file_size)}` : ""}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button type="button" className="btn-text" onClick={() => open(row, false)}>
                    عرض
                  </button>
                  <button type="button" className="btn-text" onClick={() => open(row, true)}>
                    تحميل
                  </button>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-primary/5 p-3">
                <span className="text-xs font-semibold text-primary">النقطة</span>
                {row.grade !== null ? (
                  <span className="rounded-full bg-primary/15 px-3 py-1 text-sm font-bold text-primary" dir="ltr">
                    {row.grade}/20
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">غير مصحّح</span>
                )}
                <input
                  className="field-input w-24 text-sm"
                  type="number"
                  min={0}
                  max={20}
                  step="0.25"
                  dir="ltr"
                  placeholder="0-20"
                  value={grades[row.id] ?? ""}
                  onChange={(e) => setGrades((g) => ({ ...g, [row.id]: e.target.value }))}
                />
                <button
                  type="button"
                  className="btn-primary"
                  disabled={gradeBusy === row.id}
                  onClick={() => saveGrade(row)}
                >
                  {gradeBusy === row.id ? "…" : row.grade !== null ? "تعديل النقطة" : "حفظ النقطة"}
                </button>
                {row.graded_at ? (
                  <span className="text-[11px] text-muted-foreground">صُحّح في {formatDate(row.graded_at)}</span>
                ) : null}
              </div>

              {row.comments.length > 0 ? (
                <div className="mt-3 space-y-2 rounded-xl bg-primary/5 p-3">
                  {row.comments.map((c) => (
                    <div key={c.id} className="text-sm text-foreground">
                      {c.body}
                      <span className="ms-2 text-[11px] text-muted-foreground">{formatDate(c.created_at)}</span>
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="mt-3 flex flex-wrap gap-2">
                <input
                  className="field-input min-w-40 flex-1 text-sm"
                  placeholder="اكتب ملاحظة للتلميذ…"
                  value={drafts[row.id] ?? ""}
                  onChange={(e) => setDrafts((d) => ({ ...d, [row.id]: e.target.value }))}
                />
                <button
                  type="button"
                  className="btn-primary"
                  disabled={busy === row.id}
                  onClick={() => sendComment(row)}
                >
                  {busy === row.id ? "…" : "إرسال"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
