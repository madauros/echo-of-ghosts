import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { UserRound } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SpaceAuth, Wordmark } from "@/components/SpaceAuth";
import { LevelsPanel } from "@/components/admin/LevelsPanel";
import { ChaptersPanel } from "@/components/admin/ChaptersPanel";
import { SchoolPanel } from "@/components/admin/SchoolPanel";
import { ClassesPanel } from "@/components/admin/ClassesPanel";
import { UsersPanel } from "@/components/admin/UsersPanel";
import type { Database } from "@/integrations/supabase/types";
import { SPACE_LABEL, STATUS_LABEL, type SpaceKey } from "@/lib/spaces";
import { externalAdminUrl } from "@/lib/admin-host";
import { useSpaceSection } from "@/hooks/useSpaceSection";


type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
type Tab = "accounts" | "users" | "levels" | "chapters" | "classes" | "school";

const TABS: { key: Tab; label: string }[] = [
  { key: "accounts", label: "المصادقة" },
  { key: "users", label: "المستخدمون" },
  { key: "levels", label: "المستويات" },
  { key: "chapters", label: "البرنامج" },
  { key: "classes", label: "الأقسام" },
  { key: "school", label: "المؤسسة" },
];


export const Route = createFileRoute("/admin")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "فضاء الإدارة — مداوروس" },
      { name: "description", content: "لوحة المشرف العام للمصادقة على حسابات التلاميذ والأساتذة الجديدة." },
      { property: "og:title", content: "فضاء الإدارة — مداوروس" },
      { property: "og:description", content: "المشرف العام يصادق على الحسابات الجديدة في منصة مداوروس." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

function Page() {
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    const url = externalAdminUrl(window.location.pathname + window.location.search);
    if (!url) return;
    setRedirecting(true);
    window.location.replace(url);
  }, []);

  if (redirecting) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas px-6">
        <p className="text-center text-sm text-muted-foreground">
          جارٍ تحويلك إلى فضاء الإدارة…
        </p>
      </div>
    );
  }

  return (
    <SpaceAuth space="admin">
      {({ session, profile, client, signOut }) => (
        <AdminDashboard
          userId={session.user.id}
          name={profile.full_name?.trim() || session.user.email?.split("@")[0] || "المشرف"}
          email={session.user.email ?? ""}
          client={client}
          signOut={signOut}
        />
      )}
    </SpaceAuth>
  );
}


function AdminDashboard({
  userId,
  name,
  email,
  client,
  signOut,
}: {
  userId: string;
  name: string;
  email: string;
  client: SupabaseClient<Database>;
  signOut: () => Promise<void>;
}) {
  const [tab, setTab] = useSpaceSection<Tab>("admin", userId, "accounts", TABS.map((item) => item.key));

  return (
    <div className="min-h-screen bg-canvas">
      <header className="app-bar">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3">
          <div className="min-w-0 shrink-0">
            <Wordmark space="admin" />
          </div>

          <div className="flex min-w-0 items-center gap-2">
            <div className="user-chip min-w-0 max-w-[40vw] sm:max-w-[16rem]" title={email}>
              <span className="user-avatar" aria-hidden="true">
                <UserRound size={18} />
              </span>
              <span className="truncate text-sm font-semibold text-foreground">{name}</span>
            </div>
            <button type="button" onClick={signOut} className="btn-text shrink-0 whitespace-nowrap">
              تسجيل الخروج
            </button>
          </div>

          <nav className="nav-menu w-full min-w-0 max-w-full justify-start sm:justify-center" aria-label="القائمة">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                className="nav-menu-item"
                data-active={tab === t.key}
                onClick={() => setTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">
        {tab === "accounts" ? <AccountsPanel client={client} /> : null}
        {tab === "users" ? <UsersPanel client={client} /> : null}
        {tab === "levels" ? <LevelsPanel client={client} /> : null}
        {tab === "chapters" ? <ChaptersPanel client={client} /> : null}
        {tab === "classes" ? <ClassesPanel client={client} /> : null}
        {tab === "school" ? <SchoolPanel client={client} /> : null}
      </main>
    </div>
  );
}

function AccountsPanel({ client }: { client: SupabaseClient<Database> }) {
  const [rows, setRows] = useState<ProfileRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"pending" | "all">("pending");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error: err } = await client
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });
    if (err) setError("تعذّر تحميل الحسابات. تأكد من صلاحيات المشرف العام.");
    else {
      setError(null);
      setRows(data ?? []);
    }
    setLoading(false);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client]);

  const review = async (id: string, status: "approved" | "rejected") => {
    setBusyId(id);
    const { error: err } = await client
      .from("profiles")
      .update({ status, reviewed_at: new Date().toISOString() })
      .eq("id", id);
    if (err) setError("تعذّر تحديث الحساب.");
    else await load();
    setBusyId(null);
  };

  const visible = rows.filter((r) => (filter === "pending" ? r.status === "pending" : true));

  return (
    <section>
        <h2 className="text-lg font-semibold text-foreground">مصادقة الحسابات الجديدة</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          صادق على حسابات التلاميذ والأساتذة قبل السماح لهم بالدخول إلى فضاءاتهم.
        </p>


        <div className="mt-6 flex gap-2">
          <button
            type="button"
            className={filter === "pending" ? "btn-primary" : "btn-text"}
            onClick={() => setFilter("pending")}
          >
            في انتظار المصادقة
          </button>
          <button
            type="button"
            className={filter === "all" ? "btn-primary" : "btn-text"}
            onClick={() => setFilter("all")}
          >
            كل الحسابات
          </button>
        </div>

        {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}

        <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-card">
          {loading ? (
            <p className="p-6 text-sm text-muted-foreground">جارٍ التحميل…</p>
          ) : visible.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">لا توجد حسابات لعرضها.</p>
          ) : (
            <ul className="divide-y divide-border">
              {visible.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div>
                    <div className="text-sm font-semibold text-foreground" dir="ltr">
                      {r.email}
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{SPACE_LABEL[r.space as SpaceKey]}</span>
                      <span>•</span>
                      <span>{STATUS_LABEL[r.status]}</span>
                    </div>
                  </div>
                  {r.status === "pending" ? (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={busyId === r.id}
                        onClick={() => review(r.id, "approved")}
                        className="btn-primary"
                      >
                        مصادقة
                      </button>
                      <button
                        type="button"
                        disabled={busyId === r.id}
                        onClick={() => review(r.id, "rejected")}
                        className="btn-text"
                      >
                        رفض
                      </button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
    </section>
  );
}

