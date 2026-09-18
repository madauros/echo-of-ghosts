import { useEffect, useState, type ReactNode } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { consumeAuthRedirect, getSpaceClient, SPACES, STATUS_LABEL, type SpaceKey } from "@/lib/spaces";
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
  }) => ReactNode;
}

export function SpaceAuth({ space, children }: Props) {
  const config = SPACES[space];
  const client = getSpaceClient(space);

  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
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

  useEffect(() => {
    let active = true;
    if (!session) {
      setProfile(null);
      return;
    }
    client
      .from("profiles")
      .select("*")
      .eq("id", session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (active) setProfile(data ?? null);
      });
    return () => {
      active = false;
    };
  }, [client, session]);

  const signOut = async () => {
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
          emailRedirectTo: `${window.location.origin}/`,
          data: { space },
        },
      });
      if (err) setError(translateError(err.message));
      else
        setMessage(
            "تم إنشاء الحساب. سيتم تأكيده قريباً بعد مصادقة المشرف."
        );
    } else {
      let { error: err } = await client.auth.signInWithPassword({ email, password });
      if (err && /Email not confirmed/i.test(err.message)) {
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

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <span className="text-sm text-muted-foreground">جارٍ التحميل…</span>
      </div>
    );
  }

  if (session && profile && profile.status === "approved") {
    return <>{children({ session, profile, client, signOut })}</>;
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
