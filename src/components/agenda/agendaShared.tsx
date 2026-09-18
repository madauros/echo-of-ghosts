import { useEffect, useState } from "react";
import { BookOpen, ClipboardCheck, Download, LinkIcon, Paperclip } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { openResource, type ResourceRow } from "@/components/resources/useResources";
import { AGENDA_KIND_LABEL, shiftDay, type AgendaRow } from "./useAgenda";

type Client = SupabaseClient<Database>;

/** Compte les entrées autour du jour affiché, pour marquer les jours du calendrier. */
export function useAgendaCounts(
  client: Client,
  filter: { classId?: string | null; teacherId?: string },
  dateKey: string,
  version: number,
) {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const { classId, teacherId } = filter;

  useEffect(() => {
    if (classId === null) {
      setCounts({});
      return;
    }
    let active = true;
    (async () => {
      let query = client
        .from("agenda_events")
        .select("event_date")
        .gte("event_date", shiftDay(dateKey, -60))
        .lte("event_date", shiftDay(dateKey, 60));
      if (classId) query = query.eq("class_id", classId);
      if (teacherId) query = query.eq("teacher_id", teacherId);
      const { data } = await query;
      if (!active) return;
      const next: Record<string, number> = {};
      for (const row of data ?? []) next[row.event_date] = (next[row.event_date] ?? 0) + 1;
      setCounts(next);
    })();
    return () => {
      active = false;
    };
  }, [client, classId, teacherId, dateKey, version]);

  return counts;
}

/** Charge les ressources référencées par les entrées d'agenda. */
export function useAttachedResources(client: Client, rows: AgendaRow[]) {
  const ids = Array.from(new Set(rows.map((r) => r.resource_id).filter(Boolean) as string[]));
  const key = ids.join(",");
  const [map, setMap] = useState<Record<string, ResourceRow>>({});

  useEffect(() => {
    if (key === "") {
      setMap({});
      return;
    }
    let active = true;
    client
      .from("resources")
      .select("*")
      .in("id", key.split(","))
      .then(({ data }) => {
        if (!active) return;
        const next: Record<string, ResourceRow> = {};
        for (const r of data ?? []) next[r.id] = r;
        setMap(next);
      });
    return () => {
      active = false;
    };
  }, [client, key]);

  return map;
}

export function AgendaCard({
  client,
  row,
  resource,
  onError,
  actions,
}: {
  client: Client;
  row: AgendaRow;
  resource?: ResourceRow;
  onError: (msg: string) => void;
  actions?: React.ReactNode;
}) {
  const open = async (download: boolean) => {
    if (!resource) return;
    try {
      await openResource(client, resource, download);
    } catch {
      onError("تعذّر فتح الملف.");
    }
  };

  const isEval = row.kind === "evaluation";
  const accent = isEval ? "bg-brand-red" : "bg-brand-green";
  const tint = isEval
    ? "bg-brand-red/10 text-brand-red"
    : "bg-brand-green/10 text-brand-green";

  return (
    <article className="group relative overflow-hidden rounded-2xl border border-border bg-card/95 p-4 ps-5 text-start shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg">
      <span aria-hidden className={`absolute inset-y-0 end-0 w-1.5 ${accent}`} />

      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-3">
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tint}`}>
            {isEval ? <ClipboardCheck size={18} /> : <BookOpen size={18} />}
          </span>
          <div>
            <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${tint}`}>
              {AGENDA_KIND_LABEL[row.kind]}
            </span>
            <h3 className="mt-1 text-base font-semibold leading-tight text-foreground">{row.title}</h3>
          </div>
        </div>
        {actions}
      </div>

      {row.description ? (
        <p className="mt-3 whitespace-pre-wrap rounded-xl bg-muted/50 p-3 text-sm leading-relaxed text-muted-foreground">
          {row.description}
        </p>
      ) : null}

      {resource ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-border/70 bg-background/60 px-3 py-2 text-sm">
          <Paperclip size={14} className="text-muted-foreground" />
          <span className="font-medium text-foreground">{resource.title}</span>
          <span className="ms-auto flex gap-2">
            <button type="button" className="btn-text" onClick={() => void open(false)}>
              فتح
            </button>
            <button type="button" className="btn-text" onClick={() => void open(true)}>
              <Download size={14} className="inline" /> تحميل
            </button>
          </span>
        </div>
      ) : null}

      {row.link_url ? (
        <div className="mt-2 flex items-center gap-2 text-sm">
          <LinkIcon size={14} className="text-muted-foreground" />
          <a
            href={row.link_url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-text truncate"
            dir="ltr"
          >
            {row.link_url}
          </a>
        </div>
      ) : null}
    </article>
  );
}

