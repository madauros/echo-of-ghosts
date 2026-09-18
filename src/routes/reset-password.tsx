import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SpaceShell, translateError } from "@/components/SpaceAuth";
import { PasswordField } from "@/components/PasswordField";
import { getSpaceClient, SPACES, type SpaceKey } from "@/lib/spaces";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  component: ResetPasswordPage,
  head: () => ({
    meta: [
      { title: "إعادة تعيين كلمة المرور | مداوروس" },
      {
        name: "description",
        content: "أنشئ كلمة مرور جديدة لحسابك على منصة مداوروس التعليمية.",
      },
      { property: "og:title", content: "إعادة تعيين كلمة المرور | مداوروس" },
      {
        property: "og:description",
        content: "أنشئ كلمة مرور جديدة لحسابك على منصة مداوروس التعليمية.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function readSpace(): SpaceKey {
  if (typeof window === "undefined") return "talameed";
  const params = new URLSearchParams(window.location.search);
  const s = params.get("space");
  return s === "taleem" || s === "admin" ? s : "talameed";
}

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [space] = useState<SpaceKey>(readSpace);
  const client = getSpaceClient(space);

  const [checking, setChecking] = useState(true);
  const [valid, setValid] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let active = true;
    const run = async () => {
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const search = new URLSearchParams(window.location.search);
      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");
      const code = search.get("code");

      if (accessToken && refreshToken) {
        await client.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
      } else if (code) {
        await client.auth.exchangeCodeForSession(code);
      }

      const { data } = await client.auth.getSession();
      if (!active) return;
      setValid(Boolean(data.session));
      setChecking(false);
    };
    void run();
    return () => {
      active = false;
    };
  }, [client]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("كلمتا المرور غير متطابقتين.");
      return;
    }
    setBusy(true);
    const { error: err } = await client.auth.updateUser({ password });
    setBusy(false);
    if (err) {
      setError(translateError(err.message));
      return;
    }
    setDone(true);
    setTimeout(() => navigate({ to: SPACES[space].path }), 1500);
  };

  return (
    <SpaceShell space={space}>
      <h1 className="text-center text-2xl font-normal text-foreground">تعيين كلمة مرور جديدة</h1>

      {checking ? (
        <p className="mt-6 text-center text-sm text-muted-foreground">جارٍ التحقق…</p>
      ) : !valid ? (
        <p className="mt-6 text-center text-sm text-destructive">
          الرابط غير صالح أو انتهت صلاحيته. اطلب رابطاً جديداً من صفحة تسجيل الدخول.
        </p>
      ) : done ? (
        <p className="mt-6 text-center text-sm text-success">
          تم تحديث كلمة المرور بنجاح. جارٍ تحويلك…
        </p>
      ) : (
        <form onSubmit={submit} className="mt-8 space-y-5">
          <PasswordField
            id="new-password"
            name="new-password"
            label="كلمة المرور الجديدة"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />

          <PasswordField
            id="confirm-password"
            name="confirm-password"
            label="تأكيد كلمة المرور"
            required
            minLength={6}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
          />

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <div className="flex justify-end pt-2">
            <button type="submit" disabled={busy} className="btn-primary">
              {busy ? "…" : "حفظ"}
            </button>
          </div>
        </form>
      )}
    </SpaceShell>
  );
}
