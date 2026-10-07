import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { UserRound } from "lucide-react";
import { SpaceAuth, Wordmark } from "@/components/SpaceAuth";
import { StudentResources } from "@/components/resources/StudentResources";
import { StudentSubmissions } from "@/components/resources/StudentSubmissions";
import { StudentAgenda } from "@/components/agenda/StudentAgenda";
import { QuestionsSpace } from "@/components/questions/QuestionsSpace";
import { NotificationsPanel } from "@/components/NotificationsPanel";
import { useNotifications } from "@/components/resources/useSubmissions";
import { StudentGrades } from "@/components/grades/Grades";
import { StudentHomeworks } from "@/components/grades/Homework";
import { StudentTour, useTourEligible, type TourStep } from "@/components/StudentTour";
import { STATUS_LABEL } from "@/lib/spaces";
import { useSpaceSection } from "@/hooks/useSpaceSection";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/talameed")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "فضاء التلاميذ — مداوروس" },
      { name: "description", content: "تسجيل الدخول وإنشاء حساب لتلاميذ مداوروس، بجلسة مستقلة عن باقي الفضاءات." },
      { property: "og:title", content: "فضاء التلاميذ — مداوروس" },
      { property: "og:description", content: "دخول التلاميذ إلى دروسهم وواجباتهم على منصة مداوروس." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

type Tab = "resources" | "agenda" | "grades" | "questions" | "answers" | "notifications" | "account";

function Page() {
  return (
    <SpaceAuth space="talameed">
      {({ session, profile, client, signOut }) => (
        <StudentShell
          client={client}
          userId={session.user.id}
          email={session.user.email ?? ""}
          name={profile.full_name?.trim() || session.user.email?.split("@")[0] || "تلميذ"}
          status={profile.status}
          levelId={profile.level_id}
          classId={profile.class_id}
          signOut={signOut}
        />
      )}
    </SpaceAuth>
  );
}

function StudentShell({
  client,
  userId,
  email,
  name,
  status,
  levelId,
  classId,
  signOut,
}: {
  client: SupabaseClient<Database>;
  userId: string;
  email: string;
  name: string;
  status: string;
  levelId: string | null;
  classId: string | null;
  signOut: () => Promise<void>;
}) {
  const [tab, setTab, sectionReady] = useSpaceSection<Tab>("talameed", userId, "resources", ["resources", "agenda", "grades", "questions", "answers", "notifications", "account"]);
  const notifications = useNotifications(client, userId);
  const tour = useTourEligible(userId);
  const tourSteps: TourStep<Tab>[] = [
    { key: "resources", title: "الدروس والتمارين", text: "هنا تجد دروس وتمارين قسمك مرتبة حسب المحاور، ويمكنك إرسال أجوبتك." },
    { key: "agenda", title: "المذكرة", text: "تابع مواعيد الواجبات المنزلية والتقييمات التي يبرمجها أساتذتك." },
    { key: "grades", title: "المراقبة المستمرة", text: "اطّلع على نقاطك وتقييماتك." },
    { key: "questions", title: "الأسئلة والأجوبة", text: "اطرح سؤالك على أستاذ قسمك بملف، وشاهد أسئلة زملائك وأجوبة الأستاذ." },
    { key: "answers", title: "أجوبتي", text: "راجع الأجوبة التي أرسلتها وتصحيحها." },
    { key: "notifications", title: "الإشعارات", text: "تصلك هنا التنبيهات عند إضافة حدث جديد أو رد على سؤالك." },
    { key: "account", title: "حسابي", text: "معلوماتك الشخصية، قسمك ومستواك، وزر تسجيل الخروج." },
  ];

  const [className, setClassName] = useState<string | null>(null);
  const [levelName, setLevelName] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    (async () => {
      if (classId) {
        const { data } = await client.from("classes").select("name").eq("id", classId).maybeSingle();
        if (active) setClassName(data?.name ?? null);
      }
      if (levelId) {
        const { data } = await client.from("levels").select("name").eq("id", levelId).maybeSingle();
        if (active) setLevelName(data?.name ?? null);
      }
    })();
    return () => {
      active = false;
    };
  }, [client, classId, levelId]);

  const tabs: { key: Tab; label: string; badge?: number }[] = [
    { key: "resources", label: "الدروس والتمارين" },
    { key: "agenda", label: "المذكرة" },
    { key: "grades", label: "المراقبة المستمرة" },
    { key: "questions", label: "الأسئلة والأجوبة" },
    { key: "answers", label: "أجوبتي" },
    { key: "notifications", label: "الإشعارات", badge: notifications.unread },
    { key: "account", label: "حسابي" },
  ];

  return (
    <div className="min-h-screen bg-canvas">
      <header className="app-bar">
        <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Wordmark space="talameed" />

          <nav className="nav-menu order-3 w-full min-w-0 max-w-full justify-start sm:order-none sm:w-auto sm:justify-center" aria-label="القائمة">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                className="nav-menu-item"
                data-tour={t.key}
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

      {tour.eligible && sectionReady ? (
        <StudentTour steps={tourSteps} initialStep={tab} onStep={setTab} onClose={tour.close} onDisable={tour.disable} />
      ) : null}
      <main className="mx-auto w-full max-w-4xl px-4 py-10">
        {tab === "resources" ? (
          <StudentResources
            client={client}
            levelId={levelId}
            classId={classId}
            studentId={userId}
            studentName={name}
            onSubmitted={() => void notifications.reload()}
          />
        ) : tab === "agenda" ? (
          <StudentAgenda client={client} classId={classId} studentId={userId} />
            ) : tab === "grades" ? (
          <div className="space-y-6">
            <StudentGrades client={client} classId={classId} studentId={userId} />
            <StudentHomeworks client={client} classId={classId} studentId={userId} />
          </div>
        ) : tab === "questions" ? (
          <QuestionsSpace
            client={client}
            userId={userId}
            userName={name}
            role="student"
            classId={classId}
          />
        ) : tab === "answers" ? (
          <StudentSubmissions client={client} studentId={userId} />
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
                <dt className="text-muted-foreground">القسم</dt>
                <dd className="font-semibold text-foreground">{className ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">المستوى</dt>
                <dd className="font-semibold text-foreground">{levelName ?? "—"}</dd>
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
