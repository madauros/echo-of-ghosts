import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type ResourceRow = Database["public"]["Tables"]["resources"]["Row"];
export type LevelRow = Database["public"]["Tables"]["levels"]["Row"];
export type Category = Database["public"]["Enums"]["resource_category"];

export const CATEGORY_LABEL: Record<Category, string> = {
  cours: "الدروس",
  exercices: "التمارين",
};

export const ACCEPTED = "application/pdf,image/*";

export function isAccepted(file: File) {
  return file.type === "application/pdf" || file.type.startsWith("image/");
}

export function formatSize(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} كب`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} مب`;
}

export async function openResource(
  client: SupabaseClient<Database>,
  row: ResourceRow,
  download: boolean,
) {
  const { data, error } = await client.storage
    .from("resources")
    .createSignedUrl(row.file_path, 120, download ? { download: row.file_name } : undefined);
  if (error || !data) throw new Error("تعذّر فتح الملف.");
  window.open(data.signedUrl, "_blank", "noopener,noreferrer");
}

export function useLevels(client: SupabaseClient<Database>) {
  const [levels, setLevels] = useState<LevelRow[]>([]);
  useEffect(() => {
    let active = true;
    client
      .from("levels")
      .select("*")
      .order("position", { ascending: true })
      .then(({ data }) => {
        if (active) setLevels(data ?? []);
      });
    return () => {
      active = false;
    };
  }, [client]);
  return levels;
}

export function useResourceList(
  client: SupabaseClient<Database>,
  levelId?: string | null,
  teacherIds?: string[] | null,
  classId?: string | null,
) {
  const [rows, setRows] = useState<ResourceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const teacherKey = teacherIds ? teacherIds.join(",") : null;

  const load = useCallback(async () => {
    setLoading(true);
    if (teacherKey !== null && teacherKey === "") {
      setRows([]);
      setError(null);
      setLoading(false);
      return;
    }
    let query = client.from("resources").select("*").order("created_at", { ascending: false });
    if (levelId) query = query.eq("level_id", levelId);
    if (teacherKey) query = query.in("teacher_id", teacherKey.split(","));
    if (classId) query = query.or(`class_id.is.null,class_id.eq.${classId}`);
    const { data, error: err } = await query;
    if (err) setError("تعذّر تحميل الملفات.");
    else {
      setError(null);
      setRows(data ?? []);
    }
    setLoading(false);
  }, [client, levelId, teacherKey, classId]);


  useEffect(() => {
    void load();
  }, [load]);

  return { rows, loading, error, setError, reload: load };
}

export type ClassOption = { id: string; name: string; level_id: string | null };

export function useTeacherClasses(client: SupabaseClient<Database>, teacherId: string) {
  const [classes, setClasses] = useState<ClassOption[]>([]);
  useEffect(() => {
    let active = true;
    void (async () => {
      const { data } = await client
        .from("teacher_classes")
        .select("class_id, classes(id, name, level_id)")
        .eq("teacher_id", teacherId);
      if (!active) return;
      const list = (data ?? [])
        .map((r) => (r as { classes: ClassOption | null }).classes)
        .filter((c): c is ClassOption => c !== null)
        .sort((a, b) => a.name.localeCompare(b.name, "ar"));
      setClasses(list);
    })();
    return () => {
      active = false;
    };
  }, [client, teacherId]);
  return classes;
}
