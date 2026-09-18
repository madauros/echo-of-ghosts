import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { checkSubmissionFile } from "@/lib/safeFile";
import { notify } from "./useSubmissions";
import type { ResourceRow } from "./useResources";

type Client = SupabaseClient<Database>;

export async function submitAnswer(
  client: Client,
  opts: {
    resource: ResourceRow;
    studentId: string;
    studentName: string;
    classId: string | null;
    file: File;
  },
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const check = await checkSubmissionFile(opts.file);
  if (!check.ok) return check;

  const ext = opts.file.name.split(".").pop()!.toLowerCase();
  const path = `${opts.studentId}/${opts.resource.id}/${crypto.randomUUID()}.${ext}`;

  const { error: upErr } = await client.storage
    .from("submissions")
    .upload(path, opts.file, { contentType: opts.file.type, upsert: false });
  if (upErr) {
    console.error("[submissions] upload failed", upErr);
    return { ok: false, reason: `تعذّر رفع الملف: ${upErr.message}` };
  }

  const { data: inserted, error: insErr } = await client
    .from("submissions")
    .insert({
      resource_id: opts.resource.id,
      student_id: opts.studentId,
      teacher_id: opts.resource.teacher_id,
      class_id: opts.classId,
      level_id: opts.resource.level_id,
      file_path: path,
      file_name: opts.file.name,
      mime_type: opts.file.type,
      file_size: opts.file.size,
    })
    .select("id")
    .maybeSingle();

  // Only a real error means the save failed. A missing returned row just means
  // the SELECT policy hid it from us — the insert itself went through.
  if (insErr) {
    console.error("[submissions] insert failed", insErr);
    await client.storage.from("submissions").remove([path]);
    return { ok: false, reason: `تعذّر حفظ الجواب: ${insErr.message}` };
  }

  let submissionId = inserted?.id ?? null;
  if (!submissionId) {
    const { data: found } = await client
      .from("submissions")
      .select("id")
      .eq("file_path", path)
      .maybeSingle();
    submissionId = found?.id ?? null;
  }

  if (submissionId) {
    await notify(client, {
      userId: opts.resource.teacher_id,
      actorId: opts.studentId,
      kind: "submission",
      title: `جواب جديد على «${opts.resource.title}»`,
      body: `أرسل ${opts.studentName} ملف ${opts.file.name}`,
      submissionId,
    });
  }

  try {
    const { data } = await client.auth.getSession();
    const token = data.session?.access_token;
    if (token && submissionId) {
      await fetch("/api/public/notify-submission", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ submissionId }),
      });
    }
  } catch {
    // email is best-effort; the in-app notification already exists
  }

  return { ok: true };
}
