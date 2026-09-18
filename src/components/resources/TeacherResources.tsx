import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  ACCEPTED,
  CATEGORY_LABEL,
  formatSize,
  isAccepted,
  openResource,
  useLevels,
  useResourceList,
  useTeacherClasses,
  type Category,
  type ResourceRow,
} from "./useResources";

export function TeacherResources({
  client,
  teacherId,
}: {
  client: SupabaseClient<Database>;
  teacherId: string;
}) {
  const levels = useLevels(client);
  const classes = useTeacherClasses(client, teacherId);
  const { rows, loading, error, setError, reload } = useResourceList(client, null, [teacherId]);

  const [category, setCategory] = useState<Category>("cours");
  const [title, setTitle] = useState("");
  const [levelId, setLevelId] = useState("");
  const [classId, setClassId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<ResourceRow | null>(null);

  const reset = () => {
    setEditing(null);
    setTitle("");
    setLevelId("");
    setClassId("");
    setFile(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);

    if (editing) {
      const { error: err } = await client
        .from("resources")
        .update({
          title: title.trim(),
          level_id: levelId === "" ? null : levelId,
          class_id: classId === "" ? null : classId,
          category,
        })
        .eq("id", editing.id);
      if (err) setError("تعذّر حفظ التعديل.");
      else {
        reset();
        await reload();
      }
      setBusy(false);
      return;
    }

    if (!file) {
      setError("اختر ملفاً (PDF أو صورة).");
      setBusy(false);
      return;
    }
    if (!isAccepted(file)) {
      setError("الملفات المقبولة: PDF أو صورة فقط.");
      setBusy(false);
      return;
    }

    const ext = (file.name.includes(".") ? file.name.split(".").pop() : "bin") || "bin";
    const path = `${teacherId}/${category}/${crypto.randomUUID()}.${ext.toLowerCase()}`;
    const { error: upErr } = await client.storage
      .from("resources")
      .upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
    if (upErr) {
      console.error("[resources] upload failed", upErr);
      setError(`تعذّر رفع الملف: ${upErr.message}`);
      setBusy(false);
      return;
    }

    const { error: insErr } = await client.from("resources").insert({
      teacher_id: teacherId,
      level_id: levelId === "" ? null : levelId,
      class_id: classId === "" ? null : classId,
      category,
      title: title.trim() === "" ? file.name : title.trim(),
      file_path: path,
      file_name: file.name,
      mime_type: file.type,
      file_size: file.size,
    });
    if (insErr) {
      console.error("[resources] insert failed", insErr);
      await client.storage.from("resources").remove([path]);
      setError(`تعذّر حفظ الملف: ${insErr.message}`);
    } else {
      reset();
      await reload();
    }
    setBusy(false);
  };

  const remove = async (row: ResourceRow) => {
    if (!window.confirm(`حذف «${row.title}»؟`)) return;
    const { error: err } = await client.from("resources").delete().eq("id", row.id);
    if (err) {
      setError("تعذّر الحذف.");
      return;
    }
    await client.storage.from("resources").remove([row.file_path]);
    await reload();
  };

  const open = async (row: ResourceRow, download: boolean) => {
    try {
      await openResource(client, row, download);
    } catch {
      setError("تعذّر فتح الملف.");
    }
  };

  const className = (id: string | null) =>
    id === null ? "كل الأقسام" : (classes.find((c) => c.id === id)?.name ?? "قسم محدد");

  const levelName = (id: string | null) => levels.find((l) => l.id === id)?.name ?? "كل المستويات";

  return (
    <section>
      <h2 className="text-lg font-semibold text-foreground">الدروس والتمارين</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        ارفع ملفات PDF أو صوراً حسب المستوى، وسيطّلع عليها التلاميذ المعنيون.
      </p>

      <form onSubmit={submit} className="mt-6 grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-6">
        <select
          className="field-input"
          value={category}
          onChange={(e) => setCategory(e.target.value as Category)}
        >
          <option value="cours">{CATEGORY_LABEL.cours}</option>
          <option value="exercices">{CATEGORY_LABEL.exercices}</option>
        </select>
        <select className="field-input" value={levelId} onChange={(e) => setLevelId(e.target.value)}>
          <option value="">كل المستويات</option>
          {levels.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <select className="field-input" value={classId} onChange={(e) => setClassId(e.target.value)}>
          <option value="">كل أقسام المستوى</option>
          {classes
            .filter((c) => levelId === "" || c.level_id === levelId)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </select>
        <input
          className="field-input sm:col-span-2"
          placeholder="عنوان الملف"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        {editing ? null : (
          <input
            className="field-input sm:col-span-2"
            type="file"
            accept={ACCEPTED}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        )}
        <div className="flex gap-2">
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? "…" : editing ? "حفظ" : "رفع"}
          </button>
          {editing ? (
            <button type="button" className="btn-text" onClick={reset}>
              إلغاء
            </button>
          ) : null}
        </div>
      </form>

      {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}

      <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-card">
        {loading ? (
          <p className="p-6 text-sm text-muted-foreground">جارٍ التحميل…</p>
        ) : rows.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">لا توجد ملفات بعد.</p>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <div className="text-sm font-semibold text-foreground">{r.title}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {CATEGORY_LABEL[r.category]} • {levelName(r.level_id)} • {className(r.class_id)}
                    {r.file_size ? ` • ${formatSize(r.file_size)}` : ""}
                    {r.teacher_id === teacherId ? "" : " • ملف أستاذ آخر"}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn-text" onClick={() => open(r, false)}>
                    عرض
                  </button>
                  <button type="button" className="btn-text" onClick={() => open(r, true)}>
                    تحميل
                  </button>
                  {r.teacher_id === teacherId ? (
                    <>
                      <button
                        type="button"
                        className="btn-text"
                        onClick={() => {
                          setEditing(r);
                          setTitle(r.title);
                          setLevelId(r.level_id ?? "");
                          setClassId(r.class_id ?? "");
                          setCategory(r.category);
                          setFile(null);
                        }}
                      >
                        تعديل
                      </button>
                      <button type="button" className="btn-text" onClick={() => remove(r)}>
                        حذف
                      </button>
                    </>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
