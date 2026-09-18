import { CalendarPlus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { CATEGORY_LABEL, useResourceList } from "@/components/resources/useResources";
import { AgendaCalendar, formatDayLabelAr } from "./AgendaCalendar";
import { AgendaCard, useAgendaCounts, useAttachedResources } from "./agendaShared";
import {
  AGENDA_KIND_LABEL,
  toDateKey,
  useAgenda,
  useFirstPendingDay,
  type AgendaKind,
  type AgendaRow,
} from "./useAgenda";

type ClassRow = Database["public"]["Tables"]["classes"]["Row"];

export function TeacherAgenda({
  client,
  teacherId,
  classes,
}: {
  client: SupabaseClient<Database>;
  teacherId: string;
  classes: ClassRow[];
}) {
  // Always start on today; jump once to the first future homework (see below).
  const [dateKey, setDateKey] = useState(() => toDateKey(new Date()));
  const [classId, setClassId] = useState<string>("");
  const autoJumpDone = useRef(false);
  const { day: pendingDay, ready: pendingReady } = useFirstPendingDay(client, {
    role: "teacher",
    teacherId,
    ...(classId === "" ? {} : { classId }),
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
  const filter = { teacherId, ...(classId === "" ? {} : { classId }) };
  const { rows, loading, error, setError, reload } = useAgenda(client, filter, dateKey);
  const [version, setVersion] = useState(0);
  const counts = useAgendaCounts(client, filter, dateKey, version);
  const resources = useAttachedResources(client, rows);
  const { rows: myResources } = useResourceList(client, null, [teacherId]);

  const [kind, setKind] = useState<AgendaKind>("homework");
  const [formClassId, setFormClassId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [resourceId, setResourceId] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [editing, setEditing] = useState<AgendaRow | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setEditing(null);
    setTitle("");
    setDescription("");
    setResourceId("");
    setLinkUrl("");
    setKind("homework");
  };

  const startEdit = (row: AgendaRow) => {
    setEditing(row);
    setKind(row.kind);
    setFormClassId(row.class_id);
    setTitle(row.title);
    setDescription(row.description ?? "");
    setResourceId(row.resource_id ?? "");
    setLinkUrl(row.link_url ?? "");
  };

  const refresh = async () => {
    await reload();
    setVersion((v) => v + 1);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const targetClass = formClassId || classes[0]?.id || "";
    if (!targetClass) {
      setError("لا يوجد قسم مسند إليك.");
      return;
    }
    if (title.trim() === "") {
      setError("أدخل عنواناً.");
      return;
    }
    setBusy(true);
    const payload = {
      kind,
      class_id: targetClass,
      title: title.trim(),
      description: description.trim() === "" ? null : description.trim(),
      resource_id: resourceId === "" ? null : resourceId,
      link_url: linkUrl.trim() === "" ? null : linkUrl.trim(),
      event_date: dateKey,
    };

    const { error: err } = editing
      ? await client.from("agenda_events").update(payload).eq("id", editing.id)
      : await client.from("agenda_events").insert({ ...payload, teacher_id: teacherId });

    if (err) setError("تعذّر حفظ العنصر.");
    else {
      if (!editing) await notifyClass(targetClass, payload.title, payload.kind);
      reset();
      await refresh();
    }
    setBusy(false);
  };

  /** Prévient chaque élève de la classe qu'un nouvel élément d'agenda est programmé. */
  const notifyClass = async (targetClass: string, eventTitle: string, eventKind: AgendaKind) => {
    const { data: students } = await client
      .from("profiles")
      .select("id")
      .eq("class_id", targetClass)
      .eq("space", "talameed")
      .eq("status", "approved");
    if (!students || students.length === 0) return;
    const className = classes.find((c) => c.id === targetClass)?.name ?? "";
    await client.from("notifications").insert(
      students.map((s) => ({
        user_id: s.id,
        actor_id: teacherId,
        kind: "agenda",
        title: `${AGENDA_KIND_LABEL[eventKind]} جديد في المفكرة`,
        body: `«${eventTitle}» ${className ? `— ${className} ` : ""}ليوم ${formatDayLabelAr(dateKey)}`,
      })),
    );
  };


  const remove = async (row: AgendaRow) => {
    if (!window.confirm(`حذف «${row.title}»؟`)) return;
    const { error: err } = await client.from("agenda_events").delete().eq("id", row.id);
    if (err) setError("تعذّر الحذف.");
    else await refresh();
  };

  return (
    <section className="text-start">
      <div className="rounded-2xl border border-border bg-gradient-to-l from-brand-green/10 via-card to-brand-red/10 p-4">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <CalendarPlus size={18} className="text-brand-green" /> المفكرة
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          برمج الواجبات والتقييمات ليوم {formatDayLabelAr(dateKey)} مع نص أو ملف مرفق.
        </p>
      </div>


      <div className="mt-4">
        <AgendaCalendar value={dateKey} onChange={navigate} counts={counts} />
      </div>

      <div className="mt-4">
        <select className="field-input" value={classId} onChange={(e) => setClassId(e.target.value)}>
          <option value="">كل أقسامي</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <form onSubmit={submit} className="mt-4 grid gap-3 rounded-2xl border border-border bg-card/95 p-4 shadow-sm sm:grid-cols-2">
        <p className="sm:col-span-2 text-sm font-semibold text-foreground">
          {editing ? "تعديل عنصر" : "إضافة عنصر جديد"}
        </p>
        <select className="field-input" value={kind} onChange={(e) => setKind(e.target.value as AgendaKind)}>
          <option value="homework">{AGENDA_KIND_LABEL.homework}</option>
          <option value="evaluation">{AGENDA_KIND_LABEL.evaluation}</option>
        </select>
        <select className="field-input" value={formClassId} onChange={(e) => setFormClassId(e.target.value)}>
          <option value="">اختر القسم</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <input
          className="field-input sm:col-span-2"
          placeholder="العنوان"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <textarea
          className="field-input sm:col-span-2"
          rows={3}
          placeholder="نص الواجب أو التقييم"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <select className="field-input" value={resourceId} onChange={(e) => setResourceId(e.target.value)}>
          <option value="">بدون ملف مرفق</option>
          {myResources.map((r) => (
            <option key={r.id} value={r.id}>
              {CATEGORY_LABEL[r.category]} — {r.title}
            </option>
          ))}
        </select>
        <input
          className="field-input"
          placeholder="رابط (اختياري)"
          dir="ltr"
          value={linkUrl}
          onChange={(e) => setLinkUrl(e.target.value)}
        />
        <div className="flex gap-2 sm:col-span-2">
          <button type="submit" className="btn-primary" disabled={busy}>
            {editing ? "حفظ التعديل" : "إضافة إلى المفكرة"}
          </button>
          {editing ? (
            <button type="button" className="btn-text" onClick={reset}>
              إلغاء
            </button>
          ) : null}
        </div>
      </form>

      {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}

      <div className="mt-6 space-y-3">
        {loading ? (
          <p className="text-sm text-muted-foreground">جارٍ التحميل…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">لا توجد عناصر في هذا اليوم.</p>
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
              actions={
                <span className="flex gap-2">
                  <button type="button" className="btn-text" onClick={() => startEdit(row)}>
                    تعديل
                  </button>
                  <button type="button" className="btn-text" onClick={() => void remove(row)}>
                    حذف
                  </button>
                </span>
              }
            />
          ))
        )}
      </div>
    </section>
  );
}
