import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { UserRound } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { SpaceAuth, Wordmark } from "@/components/SpaceAuth";
import { TeacherResources } from "@/components/resources/TeacherResources";
import { TeacherSubmissions } from "@/components/resources/TeacherSubmissions";
import { TeacherAgenda } from "@/components/agenda/TeacherAgenda";
import { NotificationsPanel } from "@/components/NotificationsPanel";
import { useNotifications } from "@/components/resources/useSubmissions";
import { STATUS_LABEL } from "@/lib/spaces";

export const Route = createFileRoute("/taleem")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "فضاء التعليم — مداوروس" },
      { name: "description", content: "تسجيل الدخول وإنشاء حساب لأساتذة مداوروس، بجلسة مستقلة عن باقي الفضاءات." },
      { property: "og:title", content: "فضاء التعليم — مداوروس" },
      { property: "og:description", content: "دخول الأساتذة لإدارة الأقسام والدروس على منصة مداوروس." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

type Tab = "resources" | "agenda" | "answers" | "notifications" | "account";
type ClassRow = Database["public"]["Tables"]["classes"]["Row"];

function Page() {
  return (
    <SpaceAuth space="taleem">
      {({ session, profile, client, signOut }) => (
        <TeacherShell
          client={client}
          userId={session.user.id}
          email={session.user.email ?? ""}
          name={profile.full_name?.trim() || session.user.email?.split("@")[0] || "أستاذ(ة)"}
          status={profile.status}
          signOut={signOut}
        />
      )}
    </SpaceAuth>
  );
}

function TeacherShell({
  client,
  userId,
  email,
  name,
  status,
  signOut,
}: {
  client: SupabaseClient<Database>;
  userId: string;
  email: string;
  name: string;
  status: string;
  signOut: () => Promise<void>;
}) {
  const [tab, setTab] = useState<Tab>("resources");
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const notifications = useNotifications(client, userId);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: links } = await client
        .from("teacher_classes")
        .select("class_id")
        .eq("teacher_id", userId);
      const ids = (links ?? []).map((l) => l.class_id);
      if (ids.length === 0) {
        if (active) setClasses([]);
        return;
      }
      const { data } = await client.from("classes").select("*").in("id", ids).order("name");
      if (active) setClasses(data ?? []);
    })();
    return () => {
      active = false;
    };
  }, [client, userId]);

  const tabs: { key: Tab; label: string; badge?: number }[] = [
    { key: "resources", label: "الدروس والتمارين" },
    { key: "agenda", label: "المفكرة" },
    { key: "answers", label: "أجوبة التلاميذ" },
    { key: "notifications", label: "الإشعارات", badge: notifications.unread },
    { key: "account", label: "حسابي" },
  ];

  return (
    <div className="min-h-screen bg-canvas">
      <header className="app-bar">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Wordmark space="taleem" />

          <nav className="nav-menu order-3 w-full min-w-0 max-w-full justify-start sm:order-none sm:w-auto sm:justify-center" aria-label="القائمة">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                className="nav-menu-item"
                data-active={tab === t.key}
                onClick={() => setTab(t.key)}
              >
                {t.label}
                {t.badge ? <span className="nav-badge">{t.badge}</span> : null}
              </button>
            ))}
          </nav>

          <div className="user-chip min-w-0 max-w-[45vw]">
            <span className="user-avatar" aria-hidden="true">
              <UserRound size={18} />
            </span>
            <span className="truncate text-sm font-semibold text-foreground">{name}</span>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 py-10">
        {tab === "resources" ? (
          <TeacherResources client={client} teacherId={userId} />
        ) : tab === "agenda" ? (
          <TeacherAgenda client={client} teacherId={userId} classes={classes} />
        ) : tab === "answers" ? (
          <TeacherSubmissions client={client} teacherId={userId} classes={classes} />
        ) : tab === "notifications" ? (
          <NotificationsPanel
            rows={notifications.rows}
            loading={notifications.loading}
            onMarkAllRead={() => void notifications.markAllRead()}
            onRemove={(id) => void notifications.remove(id)}
          />
        ) : (
          <section className="resource-card p-6 text-start">
            <h2 className="text-lg font-semibold text-foreground">حسابي</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">الاسم</dt>
                <dd className="font-semibold text-foreground">{name}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">البريد الإلكتروني</dt>
                <dd className="font-semibold text-foreground" dir="ltr">
                  {email}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">الحالة</dt>
                <dd className="font-semibold text-foreground">{STATUS_LABEL[status]}</dd>
              </div>
            </dl>
            <div className="mt-6 flex justify-end">
              <button type="button" onClick={signOut} className="btn-text">
                تسجيل الخروج
              </button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
