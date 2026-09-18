/**
 * Client-side validation for student uploads: only real PDF or image files,
 * with no embedded executable content (JS, actions, embedded files, scripts,
 * SQL payloads).
 */

export const SUBMISSION_ACCEPT = "application/pdf,image/png,image/jpeg,image/gif,image/webp";
export const MAX_SUBMISSION_BYTES = 20 * 1024 * 1024;

const ALLOWED_EXT = ["pdf", "png", "jpg", "jpeg", "gif", "webp"];

const PDF_BAD_PATTERNS = [
  "/JavaScript",
  "/JS",
  "/OpenAction",
  "/AA",
  "/Launch",
  "/EmbeddedFile",
  "/RichMedia",
  "/SubmitForm",
  "/GoToR",
];

const TEXT_BAD_PATTERNS = [
  "<script",
  "javascript:",
  "<?php",
  "drop table",
  "delete from",
  "insert into",
  "update ",
  "select ",
  "union select",
  "--;",
];

export type FileCheck = { ok: true } | { ok: false; reason: string };

function startsWith(bytes: Uint8Array, sig: number[], offset = 0) {
  return sig.every((b, i) => bytes[offset + i] === b);
}

function sniff(bytes: Uint8Array): "pdf" | "image" | null {
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46])) return "pdf"; // %PDF
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47])) return "image"; // PNG
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image"; // JPEG
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return "image"; // GIF
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8))
    return "image"; // WEBP
  return null;
}

export async function checkSubmissionFile(file: File): Promise<FileCheck> {
  if (file.size === 0) return { ok: false, reason: "الملف فارغ." };
  if (file.size > MAX_SUBMISSION_BYTES) return { ok: false, reason: "حجم الملف يتجاوز 20 ميغابايت." };

  const ext = (file.name.includes(".") ? file.name.split(".").pop() : "")?.toLowerCase() ?? "";
  if (!ALLOWED_EXT.includes(ext)) {
    return { ok: false, reason: "الامتدادات المقبولة: PDF أو PNG أو JPG أو GIF أو WEBP." };
  }
  if (file.name.split(".").length > 2) {
    return { ok: false, reason: "اسم الملف يحتوي على أكثر من امتداد." };
  }
  if (file.type !== "" && file.type !== "application/pdf" && !file.type.startsWith("image/")) {
    return { ok: false, reason: "الملفات المقبولة: PDF أو صورة فقط." };
  }
  if (file.type === "image/svg+xml" || ext === "svg") {
    return { ok: false, reason: "ملفات SVG غير مقبولة (قد تحتوي على سكريبت)." };
  }

  const buffer = new Uint8Array(await file.arrayBuffer());
  const kind = sniff(buffer);
  if (!kind) return { ok: false, reason: "محتوى الملف لا يطابق ملف PDF أو صورة صحيحة." };
  if (kind === "pdf" && ext !== "pdf") return { ok: false, reason: "الامتداد لا يطابق محتوى الملف." };
  if (kind === "image" && ext === "pdf") return { ok: false, reason: "الامتداد لا يطابق محتوى الملف." };

  let text = "";
  for (let i = 0; i < buffer.length; i += 1) {
    const c = buffer[i]!;
    text += c >= 32 && c < 127 ? String.fromCharCode(c) : " ";
  }

  if (kind === "pdf") {
    const bad = PDF_BAD_PATTERNS.find((p) => text.includes(p));
    if (bad) return { ok: false, reason: "الملف يحتوي على عناصر تنفيذية (سكريبت أو إجراء تلقائي)." };
  }

  const lower = text.toLowerCase();
  const badText = TEXT_BAD_PATTERNS.find((p) => lower.includes(p));
  if (kind === "image" && badText) {
    return { ok: false, reason: "الملف يحتوي على نص تنفيذي مشبوه." };
  }

  return { ok: true };
}
