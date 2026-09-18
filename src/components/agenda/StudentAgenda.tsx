import { CalendarHeart } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { AgendaCalendar, formatDayLabelAr } from "./AgendaCalendar";
import { AgendaCard, useAgendaCounts, useAttachedResources } from "./agendaShared";
import { toDateKey, useAgenda, useFirstPendingDay } from "./useAgenda";

export function StudentAgenda({
  client,
  classId,
  studentId,
}: {
  client: SupabaseClient<Database>;
  classId: string | null;
  studentId: string;
}) {
  // Always start on today; jump once to the first pending homework (see below).
  const [dateKey, setDateKey] = useState(() => toDateKey(new Date()));
  const autoJumpDone = useRef(false);
  const { day: pendingDay, ready: pendingReady } = useFirstPendingDay(client, {
    role: "student",
    classId,
    studentId,
  });

  useEffect(() => {
    if (autoJumpDone.current || !pendingReady) return;
    autoJumpDone.current = true;
    if (pendingDay) setDateKey(pendingDay);
  }, [pendingDay, pendingReady]);

  // Any manual navigation disables the automatic jump for good.
  const navigate = useCallback((key: string) => {
    autoJumpDone.current = true;
    setDateKey(key);
  }, []);

  const { rows, loading, error, setError } = useAgenda(client, { classId }, dateKey);
  const counts = useAgendaCounts(client, { classId }, dateKey, 0);
  const resources = useAttachedResources(client, rows);

  return (
    <section className="text-start">
      <div className="rounded-2xl border border-border bg-gradient-to-l from-brand-green/10 via-card to-brand-red/10 p-4">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <CalendarHeart size={18} className="text-brand-green" /> المفكرة
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          الواجبات والتقييمات المبرمجة ليوم {formatDayLabelAr(dateKey)}.
        </p>
      </div>

      <div className="mt-4">
        <AgendaCalendar value={dateKey} onChange={navigate} counts={counts} />
      </div>

      {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}

      <div className="mt-6 space-y-3">
        {classId === null ? (
          <p className="text-sm text-muted-foreground">لم يتم تعيين قسم لحسابك بعد.</p>
        ) : loading ? (
          <p className="text-sm text-muted-foreground">جارٍ التحميل…</p>
        ) : rows.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border bg-card/60 p-6 text-center text-sm text-muted-foreground">
            لا توجد واجبات أو تقييمات في هذا اليوم.
          </p>
        ) : (
          rows.map((row) => (
            <AgendaCard
              key={row.id}
              client={client}
              row={row}
              {...(row.resource_id && resources[row.resource_id]
                ? { resource: resources[row.resource_id] }
                : {})}
              onError={setError}
            />
          ))
        )}
      </div>
    </section>
  );
}
