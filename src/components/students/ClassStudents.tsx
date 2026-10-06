import { useEffect, useMemo, useState } from "react";
import { UsersRound } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { STATUS_LABEL } from "@/lib/spaces";
import { AddGradeButton } from "@/components/grades/Grades";
import { HomeworkStatusButton } from "@/components/grades/Homework";

type ClassRow = Database["public"]["Tables"]["classes"]["Row"];

type StudentRow = {
  id: string;
  full_name: string | null;
  email: string;
  status: string;
  class_id: string | null;
};

export function ClassStudents({
  client,
  classes,
  isAdmin,
  teacherId,
}: {
  teacherId: string;
  client: SupabaseClient<Database>;
  classes: ClassRow[];
  isAdmin: boolean;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    (async () => {
      const classIds = classes.map((c) => c.id);
      if (!isAdmin && classIds.length === 0) {
        if (active) {
          setStudents([]);
          setLoading(false);
        }
        return;
      }
      let query = client
        .from("profiles")
        .select("id, full_name, email, status, class_id")
        .eq("space", "talameed");
      if (!isAdmin) query = query.in("class_id", classIds);
      if (selected) query = query.eq("class_id", selected);   
      const { data, error: err } = await query.order("full_name", {
        ascending: true,
        nullsFirst: false,
      });
      if (!active) return;
      if (err) setError("تعذّر تحميل قائمة التلاميذ.");
      else setStudents(data ?? []);
      if (active) setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [client, isAdmin, selected]);

  const className = (id: string | null) => classes.find((c) => c.id === id)?.name ?? null;

  const groups = useMemo(() => {
    if (!selected) {
      const byClass = new Map<string, StudentRow[]>();
      for (const s of students) {
        const key = s.class_id ?? "";
        if (!byClass.has(key)) byClass.set(key, []);
        byClass.get(key)!.push(s);
      }
      return [...byClass.entries()]
        .map(([cid, rows]) => ({ label: className(cid) || "غير معيّن إلى قسم", rows }))
        .sort((a, b) => a.label.localeCompare(b.label, "ar"));
    }
    return [{ label: className(selected) ?? "", rows: students }];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [students, selected, classes]);

  return (
    <section className="text-start">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <UsersRound size={18} /> قائمة التلاميذ
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {isAdmin ? "جميع تلاميذ المنصة موزعين على الأقسام." : "تلاميذ أقسامك المسندة إليك."}
          </p>
        </div>
        <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
          {students.length} تلميذ
        </span>
      </div>

      <div className="mt-6">
        <select
          className="field-input w-auto min-w-48 text-sm"
          value={selected ?? ""}
          onChange={(e) => setSelected(e.target.value || null)}
          aria-label="اختيار القسم"
        >
          <option value="">كل الأقسام</option>
          {!isAdmin && classes.length === 0 ? <option value="">لا توجد أقسام</option> : null}
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}

      {loading ? (
        <p className="mt-6 text-sm text-muted-foreground">جارٍ التحميل…</p>
      ) : students.length === 0 ? (
        <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-card/60 px-6 py-12 text-center">
          <UsersRound size={32} className="text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">لا يوجد تلاميذ في هذا القسم بعد.</p>
        </div>
      ) : (
        <div className="mt-6 space-y-8">
          {groups.map((g) => (
            <div key={g.label}>
              {g.label ? (
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    قسم
                  </span>
                  {g.label}
                </h3>
              ) : null}
              <ul className="space-y-3">
                {g.rows.map((s) => (
                  <li key={s.id} className="resource-card flex flex-wrap items-center gap-4 p-4">
                    <span
                      className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary"
                      aria-hidden="true"
                    >
                      {(s.full_name?.trim()?.[0] ?? "ط").trim()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-foreground">
                        {s.full_name?.trim() || "بدون اسم"}
                      </div>
                      <div className="mt-0.5 truncate text-xs text-muted-foreground" dir="ltr">
                        {s.email}
                      </div>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        s.status === "approved" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {STATUS_LABEL[s.status] ?? s.status}
                    </span>
                    <AddGradeButton client={client} teacherId={teacherId} studentId={s.id} classId={s.class_id} />
                    <HomeworkStatusButton client={client} teacherId={teacherId} studentId={s.id} classId={s.class_id} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
