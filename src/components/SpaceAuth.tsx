import { useEffect, useState, type ReactNode } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { consumeAuthRedirect, getSpaceClient, SPACES, SPACE_LABEL, STATUS_LABEL, type SpaceKey } from "@/lib/spaces";
import { MainNav } from "@/components/MainNav";
import { PasswordField } from "@/components/PasswordField";
import { PublicBackdrop } from "@/components/PublicBackdrop";
import { confirmApprovedUserEmail } from "@/lib/admin-users.functions";

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

interface Props {
  space: SpaceKey;
  children: (ctx: {
    session: Session;
    profile: ProfileRow;
    client: SupabaseClient<Database>;
    signOut: () => Promise<void>;
    isAdmin: boolean;
  }) => ReactNode;
}

export function SpaceAuth({ space, children }: Props) {
  const config = SPACES[space];
  const client = getSpaceClient(space);

  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [ready, setReady] = useState(false);


  const [mode, setMode] = useState<"login" | "signup" | "forgot">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const { data: sub } = client.auth.onAuthStateChange((_e, s) => {
      setSession(s);
    });
    consumeAuthRedirect(client).then(() =>
      client.auth.getSession().then(({ data }) => {
        setSession(data.session);
        setReady(true);
      }),
    );
    return () => sub.subscription.unsubscribe();
  }, [client]);

  const sessionUserId = session?.user.id;

  useEffect(() => {
    let active = true;
    if (!sessionUserId) {
      setProfile(null);
      setIsAdmin(false);
      setProfileLoaded(false);
      return;
    }
    // Show the cached profile instantly, then refresh it in the background.
    const cacheKey = `profile-cache:${space}:${sessionUserId}`;
    let cached = false;
    try {
      const raw = localStorage.getItem(cacheKey);
      if (raw) {
        const c = JSON.parse(raw) as { profile: ProfileRow | null; isAdmin: boolean };
        setProfile(c.profile);
        setIsAdmin(c.isAdmin);
        setProfileLoaded(true);
        cached = true;
      }
    } catch {
      // ignore cache errors
    }
    if (!cached) setProfileLoaded(false);
    void (async () => {
      const [{ data: prof }, { data: roles }] = await Promise.all([
        client.from("profiles").select("*").eq("id", sessionUserId).maybeSingle(),
        client.from("user_roles").select("role").eq("user_id", sessionUserId),
      ]);
      if (!active) return;
      const admin = (roles ?? []).some((r) => r.role === "super_admin");
      setProfile(prof ?? null);
      setIsAdmin(admin);
      setProfileLoaded(true);
      try {
        localStorage.setItem(cacheKey, JSON.stringify({ profile: prof ?? null, isAdmin: admin }));
      } catch {
        // ignore
      }
    })();
    return () => {
      active = false;
    };
  }, [client, sessionUserId]);


  const signOut = async () => {
    try {
      // Forget the last open section so the next login starts on the first one.
      const stale: string[] = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        if (k?.startsWith("navigation:section:")) stale.push(k);
      }
      stale.forEach((k) => sessionStorage.removeItem(k));
    } catch {
      // Storage unavailable: nothing to clear.
    }
    try {
      if (session) localStorage.removeItem(`profile-cache:${space}:${session.user.id}`);
    } catch {
      // ignore
    }
    await client.auth.signOut();
    setSession(null);
    setProfile(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    if (mode === "forgot") {
      const { error: err } = await client.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password?space=${space}`,
      });
      if (err) setError(translateError(err.message));
      else setMessage("إذا كان هذا البريد مسجّلاً، فقد أرسلنا إليه رابطاً لإعادة تعيين كلمة المرور.");
    } else if (mode === "signup") {
      const { error: err } = await client.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}${config.path}`,
          data: { space },
        },
      });
      if (err) setError(translateError(err.message));
      else setMessage("تم إنشاء الحساب. في انتظار مصادقة المشرف العام لتفعيله.");
    } else {
      let { error: err } = await client.auth.signInWithPassword({ email, password });
      if (err && /Email not confirmed/i.test(err.message)) {
        // The admin already validated this account: confirm the address
        // server-side (approved profiles only) and retry the sign-in.
        try {
          const res = await confirmApprovedUserEmail({ data: { email } });
          if (res.confirmed) {
            ({ error: err } = await client.auth.signInWithPassword({ email, password }));
          }
        } catch {
          /* keep the original error */
        }
      }
      if (err) setError(translateError(err.message));
    }
    setBusy(false);
  };

  if (!ready || (session && !profileLoaded)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <span className="text-sm text-muted-foreground">جارٍ التحميل…</span>
      </div>
    );
  }

  const spaceAllowed = !!profile && (isAdmin || profile.space === space);

  if (session && profile && profile.status === "approved" && spaceAllowed) {
    return <>{children({ session, profile, client, signOut, isAdmin })}</>;
  }

  if (session && profile && profile.status === "approved" && !spaceAllowed) {
    return (
      <SpaceShell space={space} onSignOut={signOut}>
        <div className="text-center">
          <h1 className="text-2xl font-normal text-foreground">{session.user.email}</h1>
          <p className="mt-4 text-sm text-muted-foreground">
            هذا الحساب مخصص لفضاء {SPACE_LABEL[profile.space]} ولا يمكنه الدخول إلى {config.title}.
          </p>
          <a href={SPACES[profile.space].path} className="btn-primary mt-6 inline-block">
            الانتقال إلى فضائي
          </a>
          <div className="mt-8 flex justify-end">
            <button type="button" onClick={signOut} className="btn-text">
              تسجيل الخروج
            </button>
          </div>
        </div>
      </SpaceShell>
    );
  }

  if (session) {
    const status = profile?.status ?? "pending";
    return (

      <SpaceShell space={space} onSignOut={signOut}>
        <div className="text-center">
          <h1 className="text-2xl font-normal text-foreground">{session.user.email}</h1>
          <p className="mt-4 text-sm text-muted-foreground">
            {status === "rejected"
              ? "تم رفض حسابك من طرف المشرف العام."
              : "حسابك في انتظار مصادقة المشرف العام. سيتم تفعيله قريباً."}
          </p>
          <span className="mt-4 inline-block rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
            {STATUS_LABEL[status]}
          </span>
          <div className="mt-8 flex justify-end">
            <button type="button" onClick={signOut} className="btn-text">
              تسجيل الخروج
            </button>
          </div>
        </div>
      </SpaceShell>
    );
  }

  return (
    <SpaceShell space={space}>
      <h1 className="text-center text-2xl font-normal text-foreground">
        {mode === "login" ? "تسجيل الدخول" : mode === "signup" ? "إنشاء حساب" : "نسيت كلمة المرور"}
      </h1>
      <p className="mt-2 text-center text-sm text-muted-foreground">
        {mode === "forgot"
          ? "أدخل بريدك الإلكتروني وسنرسل لك رابطاً لإعادة تعيين كلمة المرور."
          : config.subtitle}
      </p>

      <form onSubmit={submit} className="mt-8 space-y-5">
        <div className="field">
          <input
            id="email"
            type="email"
            required
            dir="ltr"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder=" "
            className="field-input"
            autoComplete="email"
          />
          <label htmlFor="email" className="field-label">
            البريد الإلكتروني
          </label>
        </div>

        {mode === "forgot" ? null : (
          <PasswordField
            id="password"
            name="password"
            label="كلمة المرور"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
          />
        )}

        {/* Password reset link hidden (email sending limits) */}


        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {message ? <p className="text-sm text-success">{message}</p> : null}

        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            className="btn-text"
            onClick={() => {
              setMode(mode === "login" ? "signup" : "login");
              setError(null);
              setMessage(null);
            }}
          >
            {mode === "login" ? "إنشاء حساب" : mode === "signup" ? "لدي حساب بالفعل" : "العودة لتسجيل الدخول"}
          </button>
          <button type="submit" disabled={busy} className="btn-primary">
            {busy ? "…" : mode === "login" ? "التالي" : mode === "signup" ? "تسجيل" : "إرسال الرابط"}
          </button>
        </div>
      </form>
    </SpaceShell>
  );
}

export function translateError(msg: string) {
  if (/Invalid login credentials/i.test(msg)) return "البريد الإلكتروني أو كلمة المرور غير صحيحة.";
  if (/already registered/i.test(msg)) return "هذا البريد الإلكتروني مسجّل مسبقاً.";
  if (/Password should be/i.test(msg)) return "كلمة المرور قصيرة جداً (6 أحرف على الأقل).";
  if (/Email not confirmed/i.test(msg)) return "لم يتم تأكيد بريدك الإلكتروني بعد.";
  if (/New password should be different/i.test(msg))
    return "يجب أن تكون كلمة المرور الجديدة مختلفة عن القديمة.";
  if (/rate limit|too many requests/i.test(msg))
    return "عدد كبير من المحاولات. حاول مرة أخرى بعد قليل.";
  return msg;
}

export function SpaceShell({
  space,
  children,
  onSignOut,
}: {
  space: SpaceKey;
  children: ReactNode;
  onSignOut?: (() => void) | undefined;
}) {
  const config = SPACES[space];
  return (
    <PublicBackdrop>
      <div className="flex min-h-screen flex-col items-center justify-center px-4 pb-10 pt-24">
        <MainNav space={space} onSignOut={onSignOut} />
        <div className="w-full max-w-[450px] rounded-[28px] border border-border bg-card/95 px-8 py-10 shadow-lg backdrop-blur-sm sm:px-11">
          <div className="mb-6 flex flex-col items-center gap-2">
            <Wordmark space={space} />
            <span className="text-xs tracking-wide text-muted-foreground" dir="ltr">
              {config.host}
            </span>
          </div>
          {children}
        </div>
        <p className="mt-6 text-xs text-muted-foreground">مداوروس — فضاءات منفصلة، جلسات منفصلة</p>
      </div>
    </PublicBackdrop>
  );
}

export function Wordmark({ space }: { space: SpaceKey }) {
  const letters = "madauros".split("");
  return (
    <div dir="ltr" className="font-wordmark text-3xl tracking-tight">
      {letters.map((l, i) => (
        <span key={`${l}-${i}`} className={i < 4 ? "text-brand-green" : "text-brand-red"}>
          {l}
        </span>
      ))}
      <span className="ms-2 align-middle text-sm text-muted-foreground">/ {SPACES[space].key}</span>
    </div>
  );
}
