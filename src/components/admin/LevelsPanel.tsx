import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type LevelRow = Database["public"]["Tables"]["levels"]["Row"];

export function LevelsPanel({ client }: { client: SupabaseClient<Database> }) {
  const [rows, setRows] = useState<LevelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [position, setPosition] = useState("0");
  const [editing, setEditing] = useState<LevelRow | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error: err } = await client
      .from("levels")
      .select("*")
      .order("position", { ascending: true })
      .order("name", { ascending: true });
    if (err) setError("تعذّر تحميل المستويات.");
    else {
      setError(null);
      setRows(data ?? []);
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
    setPosition("0");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const payload = {
      name: name.trim(),
      code: code.trim() === "" ? null : code.trim(),
      position: Number(position) || 0,
    };
    const { error: err } = editing
      ? await client.from("levels").update(payload).eq("id", editing.id)
      : await client.from("levels").insert(payload);
    if (err) setError("تعذّر حفظ المستوى.");
    else {
      setError(null);
      reset();
      await load();
    }
    setBusy(false);
  };

  const remove = async (row: LevelRow) => {
    if (!window.confirm(`حذف المستوى «${row.name}»؟`)) return;
    const { error: err } = await client.from("levels").delete().eq("id", row.id);
    if (err) setError("تعذّر حذف المستوى.");
    else await load();
  };

  return (
    <section>
      <h2 className="text-lg font-semibold text-foreground">المستويات المدرّسة</h2>
      <p className="mt-1 text-sm text-muted-foreground">أضف المستويات التعليمية وعدّلها أو احذفها.</p>

      <form onSubmit={submit} className="mt-6 grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-4">
        <input
          className="field-input"
          placeholder="اسم المستوى"
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
        <input
          className="field-input"
          type="number"
          placeholder="الترتيب"
          value={position}
          onChange={(e) => setPosition(e.target.value)}
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
          <p className="p-6 text-sm text-muted-foreground">لا توجد مستويات بعد.</p>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <div className="text-sm font-semibold text-foreground">{r.name}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {r.code ? `${r.code} • ` : ""}الترتيب: {r.position}
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
                      setPosition(String(r.position));
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
