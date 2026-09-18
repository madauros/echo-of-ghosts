import { useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type SubmissionRow = Database["public"]["Tables"]["submissions"]["Row"];
export type CommentRow = Database["public"]["Tables"]["submission_comments"]["Row"];
export type NotificationRow = Database["public"]["Tables"]["notifications"]["Row"];

export type SubmissionItem = SubmissionRow & {
  resource_title: string;
  resource_category: Database["public"]["Enums"]["resource_category"];
  student_name: string;
  student_email: string;
  comments: CommentRow[];
};

type Client = SupabaseClient<Database>;

export function formatDate(iso: string) {
  return new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export async function openSubmission(client: Client, row: SubmissionRow, download: boolean) {
  const { data, error } = await client.storage
    .from("submissions")
    .createSignedUrl(row.file_path, 120, download ? { download: row.file_name } : undefined);
  if (error || !data) throw new Error("open failed");
  window.open(data.signedUrl, "_blank", "noopener,noreferrer");
}

async function hydrate(client: Client, rows: SubmissionRow[]): Promise<SubmissionItem[]> {
  if (rows.length === 0) return [];
  const resourceIds = [...new Set(rows.map((r) => r.resource_id))];
  const studentIds = [...new Set(rows.map((r) => r.student_id))];
  const ids = rows.map((r) => r.id);

  const [resources, students, comments] = await Promise.all([
    client.from("resources").select("id, title, category").in("id", resourceIds),
    client.from("profiles").select("id, full_name, email").in("id", studentIds),
    client
      .from("submission_comments")
      .select("*")
      .in("submission_id", ids)
      .order("created_at", { ascending: true }),
  ]);

  const rMap = new Map((resources.data ?? []).map((r) => [r.id, r]));
  const sMap = new Map((students.data ?? []).map((p) => [p.id, p]));

  return rows.map((row) => {
    const res = rMap.get(row.resource_id);
    const stu = sMap.get(row.student_id);
    return {
      ...row,
      resource_title: res?.title ?? "تمرين محذوف",
      resource_category: res?.category ?? "exercices",
      student_name: stu?.full_name?.trim() || stu?.email?.split("@")[0] || "تلميذ",
      student_email: stu?.email ?? "",
      comments: (comments.data ?? []).filter((c) => c.submission_id === row.id),
    };
  });
}

export function useSubmissions(client: Client, filter: { studentId?: string; teacherId?: string }) {
  const [items, setItems] = useState<SubmissionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { studentId, teacherId } = filter;

  const load = useCallback(async () => {
    setLoading(true);
    let query = client.from("submissions").select("*").order("created_at", { ascending: false });
    if (studentId) query = query.eq("student_id", studentId);
    if (teacherId) query = query.eq("teacher_id", teacherId);
    const { data, error: err } = await query;
    if (err) {
      setError("تعذّر تحميل الأجوبة.");
      setItems([]);
    } else {
      setError(null);
      setItems(await hydrate(client, data ?? []));
    }
    setLoading(false);
  }, [client, studentId, teacherId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { items, loading, error, setError, reload: load };
}

export function useNotifications(client: Client, userId: string | undefined) {
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const { data } = await client
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);
    setRows(data ?? []);
    setLoading(false);
  }, [client, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const unread = useMemo(() => rows.filter((r) => r.read_at === null).length, [rows]);

  const markAllRead = useCallback(async () => {
    if (!userId) return;
    const ids = rows.filter((r) => r.read_at === null).map((r) => r.id);
    if (ids.length === 0) return;
    await client.from("notifications").update({ read_at: new Date().toISOString() }).in("id", ids);
    await load();
  }, [client, load, rows, userId]);

  const remove = useCallback(
    async (id: string) => {
      await client.from("notifications").delete().eq("id", id);
      await load();
    },
    [client, load],
  );

  return { rows, loading, unread, reload: load, markAllRead, remove };
}

export async function notify(
  client: Client,
  payload: {
    userId: string;
    actorId: string;
    kind: string;
    title: string;
    body?: string;
    submissionId?: string;
  },
) {
  await client.from("notifications").insert({
    user_id: payload.userId,
    actor_id: payload.actorId,
    kind: payload.kind,
    title: payload.title,
    body: payload.body ?? null,
    submission_id: payload.submissionId ?? null,
  });
}
