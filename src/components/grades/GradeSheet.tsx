import { useEffect, useMemo, useState } from "react";
import { Table2 } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { TRIMESTER_OPTIONS, trimesterOf } from "@/lib/trimesters";

type Client = SupabaseClient<Database>;
type ClassRow = Database["public"]["Tables"]["classes"]["Row"];

export type Coefs = { evals: number; behavior: number; homework: number; cc: number; devoir: number; exam: number };
const DEFAULT_COEFS: Coefs = { evals: 1, behavior: 1, homework: 1, cc: 1, devoir: 1, exam: 2 };

/** Classe une évaluation selon son titre : الفرض → devoir, الامتحان → examen, sinon contrôle continu. */
export function evalKind(title: string): "devoir" | "exam" | "cc" {
  const t = title.replace(/[إأآ]/g, "ا");
  if (t.includes("امتحان") || t.includes("اختبار")) return "exam";
  if (t.includes("فرض")) return "devoir";
  return "cc";
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Moyenne pondérée sur les parties disponibles uniquement. */
export function weighted(parts: [number | null, number][]): number | null {
  let s = 0;
  let w = 0;
  for (const [v, c] of parts) if (v !== null && c > 0) { s += v * c; w += c; }
  return w > 0 ? s / w : null;
}

const fmt = (n: number | null) => (n === null ? "—" : n.toLocaleString("ar-MA", { maximumFractionDigits: 2 }));

type Student = { id: string; full_name: string | null; email: string };

export function GradeSheet({ client, classes, teacherId }: { client: Client; classes: ClassRow[]; teacherId: string }) {
  const [classId, setClassId] = useState("");
  const [trimester, setTrimester] = useState("");
  const [coefs, setCoefs] = useState<Coefs>(DEFAULT_COEFS);
  const [students, setStudents] = useState<Student[]>([]);
  const [events, setEvents] = useState<{ id: string; title: string; event_date: string; kind: string }[]>([]);
  const [grades, setGrades] = useState<{ evaluation_id: string; student_id: string; grade: number }[]>([]);
  const [hw, setHw] = useState<{ homework_id: string; student_id: string; done: boolean }[]>([]);
  const [behavior, setBehavior] = useState<{ student_id: string; grade: number; created_at: string }[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!classId && classes[0]) setClassId(classes[0].id);
  }, [classes, classId]);

  const storeKey = `gradesheet-coefs:${teacherId}:${classId}`;
  useEffect(() => {
    if (!classId) return;
    try {
      const raw = localStorage.getItem(storeKey);
      setCoefs(raw ? { ...DEFAULT_COEFS, ...JSON.parse(raw) } : DEFAULT_COEFS);
    } catch {
      setCoefs(DEFAULT_COEFS);
    }
  }, [storeKey, classId]);
  const updateCoef = (k: keyof Coefs, v: string) => {
    const n = Math.max(0, Number(v) || 0);
    const next = { ...coefs, [k]: n };
    setCoefs(next);
    localStorage.setItem(storeKey, JSON.stringify(next));
  };

  useEffect(() => {
    if (!classId) return;
    let active = true;
    setLoading(true);
    (async () => {
      const [{ data: st }, { data: ev }] = await Promise.all([
        client.from("profiles").select("id, full_name, email").eq("space", "talameed").eq("class_id", classId).order("full_name"),
        client.from("agenda_events").select("id, title, event_date, kind").eq("class_id", classId),
      ]);
      const evIds = (ev ?? []).filter((e) => e.kind === "evaluation").map((e) => e.id);
      const hwIds = (ev ?? []).filter((e) => e.kind === "homework").map((e) => e.id);
      const [g, h, b] = await Promise.all([
        evIds.length ? client.from("evaluation_grades").select("evaluation_id, student_id, grade").in("evaluation_id", evIds) : Promise.resolve({ data: [] }),
        hwIds.length ? client.from("homework_status").select("homework_id, student_id, done").in("homework_id", hwIds) : Promise.resolve({ data: [] }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (client as any).from("behavior_grades").select("student_id, grade, created_at").eq("class_id", classId).order("created_at", { ascending: false }),
      ]);
      if (!active) return;
      setStudents(st ?? []);
      setEvents(ev ?? []);
      setGrades((g.data ?? []) as typeof grades);
      setHw((h.data ?? []) as typeof hw);
      setBehavior((b.data ?? []) as typeof behavior);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [client, classId]);

  const rows = useMemo(() => {
    const inT = (d: string) => !trimester || trimesterOf(d.slice(0, 10)) === trimester;
    const evs = events.filter((e) => inT(e.event_date));
    const evalById = new Map(evs.filter((e) => e.kind === "evaluation").map((e) => [e.id, e]));
    const homeworks = evs.filter((e) => e.kind === "homework");
    return students.map((s) => {
      const mine = grades.filter((g) => g.student_id === s.id && evalById.has(g.evaluation_id));
      const by = (k: string) => mine.filter((g) => evalKind(evalById.get(g.evaluation_id)!.title) === k).map((g) => Number(g.grade));
      const evals = avg(by("cc"));
      const b = behavior.find((x) => x.student_id === s.id && inT(x.created_at));
      const beh = b ? Number(b.grade) : null;
      const done = homeworks.filter((h) => hw.some((x) => x.homework_id === h.id && x.student_id === s.id && x.done)).length;
      const home = homeworks.length ? (done / homeworks.length) * 20 : null;
      const cc = weighted([[evals, coefs.evals], [beh, coefs.behavior], [home, coefs.homework]]);
      const devoir = avg(by("devoir"));
      const exam = avg(by("exam"));
      const general = weighted([[cc, coefs.cc], [devoir, coefs.devoir], [exam, coefs.exam]]);
      return { s, evals, beh, home, cc, devoir, exam, general };
    });
  }, [students, events, grades, hw, behavior, trimester, coefs]);

  const coefInput = (k: keyof Coefs, label: string) => (
    <label className="flex items-center gap-2 text-xs text-muted-foreground">
      {label}
      <input type="number" min={0} step={0.5} className="field-input w-16 text-sm" value={coefs[k]} onChange={(e) => updateCoef(k, e.target.value)} />
    </label>
  );

  return (
    <section className="space-y-6 text-start">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <Table2 size={18} /> كشف النقاط
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          النقاط مأخوذة من التقييمات: كل تقييم يحتوي عنوانه على «فرض» يُحتسب في الفرض الثاني، و«امتحان» في الإمتحان، والباقي في المراقبة المستمرة.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <select className="field-input text-sm" value={classId} onChange={(e) => setClassId(e.target.value)} aria-label="القسم">
          {classes.length === 0 ? <option value="">لا توجد أقسام</option> : null}
          {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="field-input text-sm" value={trimester} onChange={(e) => setTrimester(e.target.value)} aria-label="الثلاثي">
          <option value="">العام الدراسي</option>
          {TRIMESTER_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>

      <div className="resource-card space-y-3 p-4">
        <div className="text-sm font-semibold text-foreground">المعاملات</div>
        <div className="flex flex-wrap gap-4">
          <span className="text-xs font-semibold text-foreground">المراقبة المستمرة:</span>
          {coefInput("evals", "التقييمات")}
          {coefInput("behavior", "السلوك")}
          {coefInput("homework", "الواجبات المنزلية")}
        </div>
        <div className="flex flex-wrap gap-4">
          <span className="text-xs font-semibold text-foreground">المعدل العام:</span>
          {coefInput("cc", "المراقبة المستمرة")}
          {coefInput("devoir", "الفرض الثاني")}
          {coefInput("exam", "الإمتحان")}
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">جارٍ التحميل…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">لا يوجد تلاميذ في هذا القسم.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-xs text-foreground">
              <tr>
                <th className="p-3 text-start">التلميذ</th>
                <th className="p-3">المراقبة المستمرة</th>
                <th className="p-3">الفرض الثاني</th>
                <th className="p-3">الإمتحان</th>
                <th className="p-3">المعدل العام</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.s.id} className="border-t border-border">
                  <td className="p-3 font-semibold text-foreground">{r.s.full_name?.trim() || r.s.email}</td>
                  <td className="p-3 text-center" title={`التقييمات ${fmt(r.evals)} · السلوك ${fmt(r.beh)} · الواجبات ${fmt(r.home)}`}>
                    {fmt(r.cc)}
                  </td>
                  <td className="p-3 text-center">{fmt(r.devoir)}</td>
                  <td className="p-3 text-center">{fmt(r.exam)}</td>
                  <td className="p-3 text-center font-bold text-primary">{fmt(r.general)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
