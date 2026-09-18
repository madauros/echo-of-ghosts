import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/**
 * Called by the student space right after an answer file is uploaded.
 * Verifies the caller's bearer token, then emails the teacher.
 *
 * Email delivery requires a configured sending domain. Until then the
 * notification is logged and the in-app notification remains the source of truth.
 */
export const Route = createFileRoute("/api/public/notify-submission")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization") ?? "";
        const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
        if (!token) return new Response("Unauthorized", { status: 401 });

        let body: { submissionId?: unknown };
        try {
          body = (await request.json()) as { submissionId?: unknown };
        } catch {
          return new Response("Bad request", { status: 400 });
        }
        const submissionId = typeof body.submissionId === "string" ? body.submissionId : "";
        if (!/^[0-9a-f-]{36}$/i.test(submissionId)) {
          return new Response("Bad request", { status: 400 });
        }

        const url = process.env["SUPABASE_URL"]!;
        const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
        const anon = createClient<Database>(url, key, {
          auth: { persistSession: false, autoRefreshToken: false },
          global: {
            fetch: (input, init) => {
              const h = new Headers(init?.headers);
              if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) {
                h.delete("Authorization");
              }
              h.set("apikey", key);
              return fetch(input, { ...init, headers: h });
            },
          },
        });

        const { data: userData, error: userErr } = await anon.auth.getUser(token);
        if (userErr || !userData.user) return new Response("Unauthorized", { status: 401 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: submission } = await supabaseAdmin
          .from("submissions")
          .select("id, student_id, teacher_id, resource_id, file_name, created_at")
          .eq("id", submissionId)
          .maybeSingle();

        if (!submission || submission.student_id !== userData.user.id) {
          return new Response("Not found", { status: 404 });
        }

        const [{ data: teacher }, { data: student }, { data: resource }] = await Promise.all([
          supabaseAdmin.from("profiles").select("email, full_name").eq("id", submission.teacher_id).maybeSingle(),
          supabaseAdmin.from("profiles").select("email, full_name").eq("id", submission.student_id).maybeSingle(),
          supabaseAdmin.from("resources").select("title").eq("id", submission.resource_id).maybeSingle(),
        ]);

        if (!teacher?.email) return Response.json({ sent: false, reason: "no_teacher_email" });

        const studentName = student?.full_name?.trim() || student?.email || "تلميذ";
        const subject = `جواب جديد: ${resource?.title ?? "تمرين"}`;
        const text = `أرسل التلميذ ${studentName} جواباً على «${resource?.title ?? "تمرين"}» (${submission.file_name}).`;

        console.info("[submission-email]", { to: teacher.email, subject, text });

        return Response.json({ sent: false, reason: "email_domain_not_configured" });
      },
    },
  },
});
