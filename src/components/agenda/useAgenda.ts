import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type AgendaRow = Database["public"]["Tables"]["agenda_events"]["Row"];
export type AgendaKind = Database["public"]["Enums"]["agenda_kind"];

type Client = SupabaseClient<Database>;

export const AGENDA_KIND_LABEL: Record<AgendaKind, string> = {
  homework: "واجب منزلي",
  evaluation: "تقييم",
};

/** yyyy-mm-dd in local time (matches the `date` column). */
export function toDateKey(date: Date) {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function shiftDay(key: string, days: number) {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
  date.setDate(date.getDate() + days);
  return toDateKey(date);
}

export function formatDayLabel(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
  return date.toLocaleDateString("ar-MA", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * Turns a PostgREST error into an actionable Arabic message.
 * The generic "تعذّر تحميل المفكرة" hid the real cause (missing table on the
 * external database, or a permission problem), so we surface it explicitly.
 */
export function describeAgendaError(err: { code?: string; message?: string } | null): string {
  const code = err?.code ?? "";
  const message = err?.message ?? "";
  if (code === "42P01" || code === "PGRST205" || /agenda_events.*(not exist|not find|schema cache)/i.test(message)) {
    return "تعذّر تحميل المفكرة: جدول المفكرة غير موجود في قاعدة البيانات. نفّذ ملف supabase/setup-external.sql.";
  }
  if (code === "42501" || code === "PGRST301" || /permission denied/i.test(message)) {
    return "تعذّر تحميل المفكرة: ليست لديك صلاحية قراءة المفكرة.";
  }
  if (code === "42703" || /column .* does not exist/i.test(message)) {
    return "تعذّر تحميل المفكرة: بنية جدول المفكرة قديمة. نفّذ ملف supabase/setup-external.sql.";
  }
  return "تعذّر تحميل المفكرة.";
}

export function useAgenda(
  client: Client,
  filter: { classId?: string | null; teacherId?: string },
  dateKey: string,
) {
  const [rows, setRows] = useState<AgendaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { classId, teacherId } = filter;

  const load = useCallback(async () => {
    if (classId === null) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    let query = client
      .from("agenda_events")
      .select("*")
      .eq("event_date", dateKey)
      .order("created_at", { ascending: true });
    if (classId) query = query.eq("class_id", classId);
    if (teacherId) query = query.eq("teacher_id", teacherId);
    const { data, error: err } = await query;
    if (err) {
      console.error("[agenda] load failed", err);
      setError(describeAgendaError(err));
      setRows([]);
    } else {
      setError(null);
      setRows(data ?? []);
    }
    setLoading(false);
  }, [client, classId, teacherId, dateKey]);

  useEffect(() => {
    void load();
  }, [load]);

  return { rows, loading, error, setError, reload: load };
}

export type FirstPendingDayTarget =
  | { role: "student"; classId: string | null; studentId: string }
  | { role: "teacher"; teacherId: string; classId?: string };

/**
 * Finds the first *future* homework date the user should be looking at.
 *
 * - teacher: the first future date carrying a homework the teacher scheduled
 *   (optionally narrowed to one class).
 * - student: the first future homework of the class that is still pending —
 *   i.e. it has no attached resource, or the student has no submission for
 *   that `resource_id` yet.
 *
 * `ready` flips to true once the lookup has resolved (even with no result),
 * so callers can apply the automatic jump exactly once.
 */
export function useFirstPendingDay(client: Client, target: FirstPendingDayTarget) {
  const [day, setDay] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const role = target.role;
  const classId = target.classId ?? null;
  const studentId = target.role === "student" ? target.studentId : null;
  const teacherId = target.role === "teacher" ? target.teacherId : null;

  useEffect(() => {
    if (role === "student" && classId === null) {
      setDay(null);
      setReady(true);
      return;
    }
    let active = true;
    setReady(false);
    (async () => {
      const today = toDateKey(new Date());
      let query = client
        .from("agenda_events")
        .select("event_date, resource_id")
        .eq("kind", "homework")
        .gt("event_date", today)
        .order("event_date", { ascending: true })
        .limit(100);
      if (classId) query = query.eq("class_id", classId);
      if (teacherId) query = query.eq("teacher_id", teacherId);
      const { data, error } = await query;
      if (!active) return;
      if (error || !data || data.length === 0) {
        setDay(null);
        setReady(true);
        return;
      }

      if (role === "teacher" || !studentId) {
        setDay(data[0]?.event_date ?? null);
        setReady(true);
        return;
      }

      const resourceIds = Array.from(
        new Set(data.map((r) => r.resource_id).filter((id): id is string => Boolean(id))),
      );
      const submitted = new Set<string>();
      if (resourceIds.length > 0) {
        const { data: subs } = await client
          .from("submissions")
          .select("resource_id")
          .eq("student_id", studentId)
          .in("resource_id", resourceIds);
        if (!active) return;
        for (const s of subs ?? []) submitted.add(s.resource_id);
      }
      const pending = data.find((r) => !r.resource_id || !submitted.has(r.resource_id));
      setDay(pending?.event_date ?? null);
      setReady(true);
    })();
    return () => {
      active = false;
    };
  }, [client, role, classId, studentId, teacherId]);

  return { day, ready };
}
