import { supabase } from "@/integrations/supabase/client";

/** Nom de fichier sûr pour le stockage (ASCII, sans espaces). */
export function safeFileName(name: string) {
  const normalized = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return normalized.length > 0 ? normalized.slice(-90) : "fichier";
}

export function storagePath(userId: string, fileName: string) {
  const stamp = Date.now().toString(36);
  return `${userId}/${stamp}-${safeFileName(fileName)}`;
}

export function formatSize(bytes: number | null) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

export function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export function formatDateTime(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Ouvre un fichier privé du stockage via une URL signée. */
export async function openStoredFile(bucket: "resources" | "submissions", path: string) {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 10);
  if (error || !data) throw error ?? new Error("Lien indisponible");
  window.open(data.signedUrl, "_blank", "noopener,noreferrer");
}
