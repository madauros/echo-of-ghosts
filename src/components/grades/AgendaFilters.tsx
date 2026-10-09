import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { formatDayLabel } from "@/components/agenda/useAgenda";
import { TRIMESTER_OPTIONS, trimesterOf } from "@/lib/trimesters";

type Client = SupabaseClient<Database>;
type ClassRow = Database["public"]["Tables"]["classes"]["Row"];

export type AgendaFilter = { classId: string; month: string; trimester: string };
export const EMPTY_FILTER: AgendaFilter = { classId: "", month: "", trimester: "" };

export function applyAgendaFilter<T extends { class_id: string; event_date: string }>(
  rows: T[],
  f: AgendaFilter,
): T[] {
  return rows.filter((r) => {
    if (f.classId && r.class_id !== f.classId) return false;
    if (f.month && r.event_date.slice(0, 7) !== f.month) return false;
    if (f.trimester && trimesterOf(r.event_date) !== f.trimester) return false;
    return true;
  });
}

/** Months (YYYY-MM) present in the agenda for the given classes, all kinds. */
export function useAgendaMonths(client: Client, classIds: string[]): string[] {
  const [months, setMonths] = useState<string[]>([]);
  const key = classIds.join(",");
  useEffect(() => {
    let active = true;
    if (key === "") {
      setMonths([]);
      return;
    }
    client
      .from("agenda_events")
      .select("event_date")
      .in("class_id", key.split(","))
      .then(({ data }) => {
        if (!active) return;
        setMonths(Array.from(new Set((data ?? []).map((r) => r.event_date.slice(0, 7)))).sort().reverse());
      });
    return () => {
      active = false;
    };
  }, [client, key]);
  return months;
}

export function AgendaFilterBar({
  classes,
  months,
  filter,
  onChange,
}: {
  classes: ClassRow[];
  months: string[];
  filter: AgendaFilter;
  onChange: (f: AgendaFilter) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <select
        className="field-input text-sm"
        value={filter.classId}
        onChange={(e) => onChange({ ...filter, classId: e.target.value })}
        aria-label="تصفية حسب القسم"
      >
        <option value="">كل الأقسام</option>
        {classes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <select
        className="field-input text-sm"
        value={filter.month}
        onChange={(e) => onChange({ ...filter, month: e.target.value })}
        aria-label="تصفية حسب الشهر"
      >
        <option value="">كل الأشهر</option>
        {months.map((m) => (
          <option key={m} value={m}>
            {formatDayLabel(`${m}-01`)}
          </option>
        ))}
      </select>
      <select
        className="field-input text-sm"
        value={filter.trimester}
        onChange={(e) => onChange({ ...filter, trimester: e.target.value })}
        aria-label="تصفية حسب الثلاثي"
      >
        <option value="">كل الثلاثيات</option>
        {TRIMESTER_OPTIONS.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </select>
    </div>
  );
}
