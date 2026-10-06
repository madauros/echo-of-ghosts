import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type QuestionRow = Database["public"]["Tables"]["questions"]["Row"];
export type AnswerRow = Database["public"]["Tables"]["question_answers"]["Row"];

export type QuestionItem = QuestionRow & {
  student_name: string;
  answers: (AnswerRow & { teacher_name: string })[];
};

type Client = SupabaseClient<Database>;

function displayName(p?: { full_name: string | null; email: string }) {
  return p?.full_name?.trim() || p?.email?.split("@")[0] || "مستخدم";
}

export function useQuestions(client: Client, classId: string | null, allClasses = false) {
  const [items, setItems] = useState<QuestionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!classId && !allClasses) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    let q = client.from("questions").select("*");
    if (classId) q = q.eq("class_id", classId);
    const { data, error: err } = await q.order("created_at", { ascending: false });

    if (err) {
      setError("تعذّر تحميل الأسئلة.");
      setItems([]);
      setLoading(false);
      return;
    }

    const rows = data ?? [];
    if (rows.length === 0) {
      setError(null);
      setItems([]);
      setLoading(false);
      return;
    }

    const ids = rows.map((r) => r.id);
    const [answersRes, profilesRes] = await Promise.all([
      client.from("question_answers").select("*").in("question_id", ids).order("created_at"),
      client
        .from("profiles")
        .select("id, full_name, email")
        .in("id", [...new Set(rows.map((r) => r.student_id))]),
    ]);

    const answers = answersRes.data ?? [];
    const teacherIds = [...new Set(answers.map((a) => a.teacher_id))];
    const teachers = teacherIds.length
      ? (await client.from("profiles").select("id, full_name, email").in("id", teacherIds)).data ?? []
      : [];

    const pMap = new Map((profilesRes.data ?? []).map((p) => [p.id, p]));
    const tMap = new Map(teachers.map((p) => [p.id, p]));

    setError(null);
    setItems(
      rows.map((row) => ({
        ...row,
        student_name: displayName(pMap.get(row.student_id)),
        answers: answers
          .filter((a) => a.question_id === row.id)
          .map((a) => ({ ...a, teacher_name: displayName(tMap.get(a.teacher_id)) })),
      })),
    );
    setLoading(false);
  }, [client, classId, allClasses]);

  useEffect(() => {
    void load();
  }, [load]);

  return { items, loading, error, setError, reload: load };
}

export async function openQuestionFile(
  client: Client,
  file: { file_path: string | null; file_name: string | null },
  download: boolean,
) {
  if (!file.file_path) return;
  const { data, error } = await client.storage
    .from("questions")
    .createSignedUrl(file.file_path, 120, download ? { download: file.file_name ?? "file" } : undefined);
  if (error || !data) throw new Error("open failed");
  window.open(data.signedUrl, "_blank", "noopener,noreferrer");
}

export async function uploadQuestionFile(client: Client, classId: string, file: File) {
  const ext = file.name.split(".").pop()!.toLowerCase();
  const path = `${classId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await client.storage
    .from("questions")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) return { ok: false as const, reason: `تعذّر رفع الملف: ${error.message}` };
  return {
    ok: true as const,
    path,
    meta: { file_path: path, file_name: file.name, mime_type: file.type, file_size: file.size },
  };
}
