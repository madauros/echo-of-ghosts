import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { useLevels, type ChapterRow } from "@/components/resources/useResources";

export function ChaptersPanel({ client }: { client: SupabaseClient<Database> }) {
  const levels = useLevels(client);
  const [levelId, setLevelId] = useState("");
  const [rows, setRows] = useState<ChapterRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [position, setPosition] = useState("0");
  const [editing, setEditing] = useState<ChapterRow | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!levelId && levels[0]) setLevelId(levels[0].id);
  }, [levels, levelId]);

  const load = async () => {
    if (!levelId) return;
    setLoading(true);
    const { data, error: err } = await client
      .from("chapters")
      .select("*")
      .eq("level_id", levelId)
      .order("position")
      .order("name");
    if (err) setError("تعذّر تحميل المحاور.");
    else {
      setError(null);
      setRows(data ?? []);
    }
    setLoading(false);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, levelId]);

  const reset = () => {
    setEditing(null);
    setName("");
    setPosition(String(rows.length + 1));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!levelId || name.trim() === "") return;
    setBusy(true);
    const payload = { name: name.trim(), position: Number(position) || 0, level_id: levelId };
    const { error: err } = editing
      ? await client.from("chapters").update(payload).eq("id", editing.id)
      : await client.from("chapters").insert(payload);
    if (err) setError("تعذّر حفظ المحور.");
    else {
      setError(null);
      setEditing(null);
      setName("");
      setPosition("0");
      await load();
    }
    setBusy(false);
  };

  const remove = async (row: ChapterRow) => {
    if (!window.confirm(`حذف المحور «${row.name}»؟ ستبقى الملفات المرتبطة به بدون محور.`)) return;
    const { error: err } = await client.from("chapters").delete().eq("id", row.id);
    if (err) setError("تعذّر حذف المحور.");
    else await load();
  };

  return (
    <section>
      <h2 className="text-lg font-semibold text-foreground">البرنامج حسب المستوى</h2>
      <p className="mt-1 text-sm text-muted-foreground">أضف محاور (فصول) البرنامج لكل مستوى وعدّلها أو احذفها.</p>

      <div className="mt-6">
        <select className="field-input w-auto min-w-48" value={levelId} onChange={(e) => { setLevelId(e.target.value); setEditing(null); setName(""); }}>
          {levels.map((l) => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
      </div>

      <form onSubmit={submit} className="mt-4 grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-4">
        <input className="field-input sm:col-span-2" placeholder="اسم المحور" required value={name} onChange={(e) => setName(e.target.value)} />
        <input className="field-input" type="number" placeholder="الترتيب" value={position} onChange={(e) => setPosition(e.target.value)} />
        <div className="flex gap-2">
          <button type="submit" className="btn-primary" disabled={busy || !levelId}>{editing ? "حفظ" : "إضافة"}</button>
          {editing ? <button type="button" className="btn-text" onClick={reset}>إلغاء</button> : null}
        </div>
      </form>

      {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}

      <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-card">
        {loading ? (
          <p className="p-6 text-sm text-muted-foreground">جارٍ التحميل…</p>
        ) : rows.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">لا توجد محاور لهذا المستوى بعد.</p>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <div className="text-sm font-semibold text-foreground">{r.name}</div>
                  <div className="mt-1 text-xs text-muted-foreground">الترتيب: {r.position}</div>
                </div>
                <div className="flex gap-2">
                  <button type="button" className="btn-text" onClick={() => { setEditing(r); setName(r.name); setPosition(String(r.position)); }}>تعديل</button>
                  <button type="button" className="btn-text" onClick={() => remove(r)}>حذف</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
