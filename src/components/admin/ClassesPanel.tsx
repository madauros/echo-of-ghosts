import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type ClassRow = Database["public"]["Tables"]["classes"]["Row"];
type LevelRow = Database["public"]["Tables"]["levels"]["Row"];

export function ClassesPanel({ client }: { client: SupabaseClient<Database> }) {
  const [rows, setRows] = useState<ClassRow[]>([]);
  const [levels, setLevels] = useState<LevelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [levelId, setLevelId] = useState("");
  const [capacity, setCapacity] = useState("");
  const [editing, setEditing] = useState<ClassRow | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data: cls, error: e1 }, { data: lv, error: e2 }] = await Promise.all([
      client.from("classes").select("*").order("name", { ascending: true }),
      client.from("levels").select("*").order("position", { ascending: true }),
    ]);
    if (e1 || e2) setError("تعذّر تحميل الأقسام.");
    else {
      setError(null);
      setRows(cls ?? []);
      setLevels(lv ?? []);
    }
    setLoading(false);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client]);

  const reset = () => {
    setEditing(null);
    setName("");
    setCode("");
    setLevelId("");
    setCapacity("");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const payload = {
      name: name.trim(),
      code: code.trim() === "" ? null : code.trim(),
      level_id: levelId === "" ? null : levelId,
      capacity: capacity.trim() === "" ? null : Number(capacity),
    };
    const { error: err } = editing
      ? await client.from("classes").update(payload).eq("id", editing.id)
      : await client.from("classes").insert(payload);
    if (err) setError("تعذّر حفظ القسم.");
    else {
      setError(null);
      reset();
      await load();
    }
    setBusy(false);
  };

  const remove = async (row: ClassRow) => {
    if (!window.confirm(`حذف القسم «${row.name}»؟`)) return;
    const { error: err } = await client.from("classes").delete().eq("id", row.id);
    if (err) setError("تعذّر حذف القسم.");
    else await load();
  };

  const levelName = (id: string | null) => levels.find((l) => l.id === id)?.name ?? "بدون مستوى";

  return (
    <section>
      <h2 className="text-lg font-semibold text-foreground">الأقسام المتكفّل بها</h2>
      <p className="mt-1 text-sm text-muted-foreground">أضف الأقسام واربطها بمستوى تعليمي.</p>

      <form onSubmit={submit} className="mt-6 grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-5">
        <input
          className="field-input"
          placeholder="اسم القسم"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className="field-input"
          placeholder="الرمز (اختياري)"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <select className="field-input" value={levelId} onChange={(e) => setLevelId(e.target.value)}>
          <option value="">بدون مستوى</option>
          {levels.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <input
          className="field-input"
          type="number"
          placeholder="الطاقة"
          value={capacity}
          onChange={(e) => setCapacity(e.target.value)}
        />
        <div className="flex gap-2">
          <button type="submit" className="btn-primary" disabled={busy}>
            {editing ? "حفظ" : "إضافة"}
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
          <p className="p-6 text-sm text-muted-foreground">لا توجد أقسام بعد.</p>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <div className="text-sm font-semibold text-foreground">{r.name}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {levelName(r.level_id)}
                    {r.code ? ` • ${r.code}` : ""}
                    {r.capacity ? ` • الطاقة: ${r.capacity}` : ""}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="btn-text"
                    onClick={() => {
                      setEditing(r);
                      setName(r.name);
                      setCode(r.code ?? "");
                      setLevelId(r.level_id ?? "");
                      setCapacity(r.capacity == null ? "" : String(r.capacity));
                    }}
                  >
                    تعديل
                  </button>
                  <button type="button" className="btn-text" onClick={() => remove(r)}>
                    حذف
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
