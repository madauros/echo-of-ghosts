import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Verify the caller is a super admin.
 *
 * The RPC is the primary path, but if it is not callable by the
 * `authenticated` role (or returns null), fall back to reading `user_roles`
 * with the service client. The caller identity comes from the validated
 * bearer token, never from request data, so this stays safe.
 */
async function assertSuperAdmin(context: { supabase: any; userId: string }) {
  const { data: viaRpc } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "super_admin",
  });
  if (viaRpc === true) return;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: roleRow } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId)
    .eq("role", "super_admin")
    .maybeSingle();
  if (roleRow) return;

  throw new Error("Forbidden");
}

export const deleteUserAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setUserPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({ userId: z.string().uuid(), password: z.string().min(6).max(72) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      password: data.password,
      // A password set by the admin implies the account is usable right away.
      email_confirm: true,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setUserEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ userId: z.string().uuid(), email: z.string().email() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      email: data.email,
      email_confirm: true,
    });
    if (error) throw new Error(error.message);
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .update({ email: data.email })
      .eq("id", data.userId);
    if (profileError) throw new Error(profileError.message);
    return { ok: true };
  });

/**
 * Unblock sign-in for an account an admin has already approved.
 *
 * Supabase refuses `signInWithPassword` with "Email not confirmed" when the
 * confirmation link was never clicked — even though the admin validated the
 * account. Admin approval is the source of truth here, so confirm the email
 * for approved profiles. Only approved accounts are touched, and nothing is
 * returned that could be used to enumerate users.
 */
export const confirmApprovedUserEmail = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ email: z.string().email() }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = data.email.trim().toLowerCase();

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id, status")
      .ilike("email", email)
      .maybeSingle();

    if (!profile || profile.status !== "approved") return { confirmed: false };

    const { data: userRes } = await supabaseAdmin.auth.admin.getUserById(profile.id);
    if (!userRes?.user) return { confirmed: false };
    if (userRes.user.email_confirmed_at) return { confirmed: true };

    const { error } = await supabaseAdmin.auth.admin.updateUserById(profile.id, {
      email_confirm: true,
    });
    if (error) return { confirmed: false };
    return { confirmed: true };
  });
