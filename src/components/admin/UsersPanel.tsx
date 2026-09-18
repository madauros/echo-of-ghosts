import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { SPACE_LABEL, STATUS_LABEL, type SpaceKey } from "@/lib/spaces";
import { setUserPassword, setUserEmail, confirmApprovedUserEmail } from "@/lib/admin-users.functions";
import { PasswordField } from "@/components/PasswordField";

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
type LevelRow = Database["public"]["Tables"]["levels"]["Row"];
type ClassRow = Database["public"]["Tables"]["classes"]["Row"];
type TeacherClassRow = Database["public"]["Tables"]["teacher_classes"]["Row"];

const SPACES: SpaceKey[] = ["talameed", "taleem", "admin"];
const STATUSES: Database["public"]["Enums"]["account_status"][] = ["pending", "approved", "rejected"];

export function UsersPanel({ client }: { client: SupabaseClient<Database> }) {
  const [rows, setRows] = useState<ProfileRow[]>([]);
  const [levels, setLevels] = useState<LevelRow[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [teacherClasses, setTeacherClasses] = useState<TeacherClassRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [spaceFilter, setSpaceFilter] = useState<"all" | SpaceKey>("all");
  const [editing, setEditing] = useState<ProfileRow | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data: p, error: e1 }, { data: lv, error: e2 }, { data: cl, error: e3 }, { data: tc, error: e4 }] =
      await Promise.all([
        client.from("profiles").select("*").order("created_at", { ascending: false }),
        client.from("levels").select("*").order("position", { ascending: true }),
        client.from("classes").select("*").order("name", { ascending: true }),
        client.from("teacher_classes").select("*"),
      ]);
    if (e1 || e2 || e3 || e4) setError("تعذّر تحميل المستخدمين. تأكد من صلاحيات المشرف العام.");
    else {
      setError(null);
      setRows(p ?? []);
      setLevels(lv ?? []);
      setClasses(cl ?? []);
      setTeacherClasses(tc ?? []);
    }
    setLoading(false);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client]);

  const save = async (patch: Partial<ProfileRow>, teacherClassIds?: string[]) => {
    if (!editing) return;
    setBusy(true);
    const { error: err } = await client
      .from("profiles")
      .update({ ...patch, reviewed_at: new Date().toISOString() })
      .eq("id", editing.id);
    let syncErr: unknown = null;
    if (!err && teacherClassIds) {
      const current = teacherClasses.filter((t) => t.teacher_id === editing.id).map((t) => t.class_id);
      const toAdd = teacherClassIds.filter((id) => !current.includes(id));
      const toRemove = current.filter((id) => !teacherClassIds.includes(id));
      if (toRemove.length > 0) {
        const { error: e } = await client
          .from("teacher_classes")
          .delete()
          .eq("teacher_id", editing.id)
          .in("class_id", toRemove);
        syncErr = e ?? syncErr;
      }
      if (toAdd.length > 0) {
        const { error: e } = await client
          .from("teacher_classes")
          .insert(toAdd.map((class_id) => ({ teacher_id: editing.id, class_id })));
        syncErr = e ?? syncErr;
      }
    }
    if (!err && patch.status === "approved") {
      // Approving an account must also make it usable: clear any pending
      // email-confirmation gate so the user can sign in right away.
      try {
        await confirmApprovedUserEmail({ data: { email: editing.email } });
      } catch {
        /* non blocking */
      }
    }
    if (err || syncErr) setError("تعذّر حفظ المستخدم.");
    else {
      setError(null);
      setEditing(null);
      await load();
    }
    setBusy(false);
  };

  const remove = async (row: ProfileRow) => {
    if (!window.confirm(`حذف المستخدم «${row.email}»؟`)) return;
    const { error: err } = await client.from("profiles").delete().eq("id", row.id);
    if (err) setError("تعذّر حذف المستخدم.");
    else await load();
  };

  const levelName = (id: string | null) => levels.find((l) => l.id === id)?.name ?? "—";
  const className = (id: string | null) => classes.find((c) => c.id === id)?.name ?? "—";
  const teacherClassIdsOf = (teacherId: string) =>
    teacherClasses.filter((t) => t.teacher_id === teacherId).map((t) => t.class_id);

  const visible = rows.filter((r) => {
    if (spaceFilter !== "all" && r.space !== spaceFilter) return false;
    const q = search.trim().toLowerCase();
    if (q === "") return true;
    return (
      r.email.toLowerCase().includes(q) || (r.full_name ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <section>
      <h2 className="text-lg font-semibold text-foreground">كل المستخدمين</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        عدّل الاسم والحالة والفضاء، وأسند المستوى والقسم إلى التلميذ.
      </p>

      <div className="mt-6 flex flex-wrap gap-3">
        <input
          className="field-input flex-1"
          placeholder="بحث بالبريد أو الاسم"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="field-input"
          value={spaceFilter}
          onChange={(e) => setSpaceFilter(e.target.value as "all" | SpaceKey)}
        >
          <option value="all">كل الفضاءات</option>
          {SPACES.map((s) => (
            <option key={s} value={s}>
              {SPACE_LABEL[s]}
            </option>
          ))}
        </select>
      </div>

      {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}

      <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-card">
        {loading ? (
          <p className="p-6 text-sm text-muted-foreground">جارٍ التحميل…</p>
        ) : visible.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">لا يوجد مستخدمون.</p>
        ) : (
          <ul className="divide-y divide-border">
            {visible.map((r) => (
              <li key={r.id} className="p-4">
                {editing?.id === r.id ? (
                  <UserEditor
                    row={r}
                    levels={levels}
                    classes={classes}
                    teacherClassIds={teacherClassIdsOf(r.id)}
                    busy={busy}
                    onCancel={() => setEditing(null)}
                    onSave={save}
                  />
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-foreground">
                        {r.full_name || <span dir="ltr">{r.email}</span>}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span dir="ltr">{r.email}</span>
                        <span>•</span>
                        <span>{SPACE_LABEL[r.space as SpaceKey]}</span>
                        <span>•</span>
                        <span>{STATUS_LABEL[r.status]}</span>
                        {r.space === "talameed" ? (
                          <>
                            <span>•</span>
                            <span>المستوى: {levelName(r.level_id)}</span>
                            <span>•</span>
                            <span>القسم: {className(r.class_id)}</span>
                          </>
                        ) : null}
                        {r.space === "taleem" ? (
                          <>
                            <span>•</span>
                            <span>
                              الأقسام:{" "}
                              {teacherClassIdsOf(r.id).length === 0
                                ? "—"
                                : teacherClassIdsOf(r.id).map((id) => className(id)).join("، ")}
                            </span>
                          </>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" className="btn-text" onClick={() => setEditing(r)}>
                        تعديل
                      </button>
                      <button type="button" className="btn-text" onClick={() => remove(r)}>
                        حذف
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function UserEditor({
  row,
  levels,
  classes,
  teacherClassIds,
  busy,
  onCancel,
  onSave,
}: {
  row: ProfileRow;
  levels: LevelRow[];
  classes: ClassRow[];
  teacherClassIds: string[];
  busy: boolean;
  onCancel: () => void;
  onSave: (patch: Partial<ProfileRow>, teacherClassIds?: string[]) => Promise<void>;
}) {
  const [fullName, setFullName] = useState(row.full_name ?? "");
  const [space, setSpace] = useState(row.space);
  const [status, setStatus] = useState(row.status);
  const [levelId, setLevelId] = useState(row.level_id ?? "");
  const [classId, setClassId] = useState(row.class_id ?? "");
  const [teacherClasses, setTeacherClasses] = useState<string[]>(teacherClassIds);
  const [newPassword, setNewPassword] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [newEmail, setNewEmail] = useState(row.email);
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailMsg, setEmailMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const updatePasswordFn = useServerFn(setUserPassword);
  const updateEmailFn = useServerFn(setUserEmail);

  const failText = (err: unknown, action: string) => {
    const msg = err instanceof Error ? err.message : "";
    if (/Forbidden/i.test(msg)) return `${action}: هذا الحساب لا يملك صلاحيات المشرف العام.`;
    if (/Unauthorized/i.test(msg)) return `${action}: انتهت جلستك، أعد تسجيل الدخول.`;
    if (/weak|easy to guess/i.test(msg))
      return `${action}: كلمة المرور ضعيفة جداً، اختر كلمة مرور أقوى.`;
    if (/should be at least|Password should be/i.test(msg))
      return `${action}: كلمة المرور قصيرة جداً (6 أحرف على الأقل).`;
    return `${action}${msg ? ` (${msg})` : ""}.`;
  };


  const updatePassword = async () => {
    if (newPassword.length < 6) return;
    setPwBusy(true);
    setPwMsg(null);
    try {
      await updatePasswordFn({ data: { userId: row.id, password: newPassword } });
      setNewPassword("");
      setPwMsg({ ok: true, text: "تم تحديث كلمة المرور." });
    } catch (err) {
      setPwMsg({ ok: false, text: failText(err, "تعذّر تحديث كلمة المرور") });
    }
    setPwBusy(false);
  };

  const updateEmail = async () => {
    const value = newEmail.trim();
    if (value === "" || value === row.email) return;
    setEmailBusy(true);
    setEmailMsg(null);
    try {
      await updateEmailFn({ data: { userId: row.id, email: value } });
      setEmailMsg({ ok: true, text: "تم تحديث البريد الإلكتروني." });
    } catch (err) {
      setEmailMsg({ ok: false, text: failText(err, "تعذّر تحديث البريد الإلكتروني") });
    }
    setEmailBusy(false);
  };


  const filteredClasses = levelId === "" ? classes : classes.filter((c) => c.level_id === levelId);

  const levelNameOfClass = (c: ClassRow) =>
    levels.find((l) => l.id === c.level_id)?.name ?? "بدون مستوى";

  const toggleTeacherClass = (id: string) =>
    setTeacherClasses((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  return (
    <form
      className="grid gap-3 sm:grid-cols-3"
      onSubmit={(e) => {
        e.preventDefault();
        void onSave(
          {
            full_name: fullName.trim() === "" ? null : fullName.trim(),
            space,
            status,
            level_id: levelId === "" ? null : levelId,
            class_id: classId === "" ? null : classId,
          },
          space === "taleem" ? teacherClasses : [],
        );
      }}
    >
      <div className="text-xs text-muted-foreground sm:col-span-3" dir="ltr">
        {row.email}
      </div>
      <input
        className="field-input"
        placeholder="الاسم الكامل"
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
      />
      <select
        className="field-input"
        value={space}
        onChange={(e) => setSpace(e.target.value as ProfileRow["space"])}
      >
        {SPACES.map((s) => (
          <option key={s} value={s}>
            {SPACE_LABEL[s]}
          </option>
        ))}
      </select>
      <select
        className="field-input"
        value={status}
        onChange={(e) => setStatus(e.target.value as ProfileRow["status"])}
      >
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {STATUS_LABEL[s]}
          </option>
        ))}
      </select>
      <select
        className="field-input"
        value={levelId}
        onChange={(e) => {
          setLevelId(e.target.value);
          setClassId("");
        }}
      >
        <option value="">بدون مستوى</option>
        {levels.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </select>
      <select className="field-input" value={classId} onChange={(e) => setClassId(e.target.value)}>
        <option value="">بدون قسم</option>
        {filteredClasses.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      {space === "taleem" ? (
        <fieldset className="sm:col-span-3">
          <legend className="mb-2 text-xs font-semibold text-muted-foreground">
            الأقسام المسندة إلى الأستاذ (يمكن اختيار أكثر من قسم)
          </legend>
          <div className="flex flex-wrap gap-2">
            {classes.length === 0 ? (
              <span className="text-xs text-muted-foreground">لا توجد أقسام بعد.</span>
            ) : (
              classes.map((c) => {
                const checked = teacherClasses.includes(c.id);
                return (
                  <label
                    key={c.id}
                    className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1 text-xs transition-colors ${
                      checked
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border bg-card text-muted-foreground"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="accent-primary"
                      checked={checked}
                      onChange={() => toggleTeacherClass(c.id)}
                    />
                    {c.name}
                    <span className="text-muted-foreground">({levelNameOfClass(c)})</span>
                  </label>
                );
              })
            )}
          </div>
        </fieldset>
      ) : null}
      <fieldset className="sm:col-span-3 rounded-2xl border border-border p-4">
        <legend className="px-1 text-xs font-semibold text-muted-foreground">
          تعيين كلمة مرور جديدة لهذا المستخدم
        </legend>
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-[16rem] flex-1">
            <PasswordField
              label="كلمة المرور الجديدة"
              id={`new-password-${row.id}`}
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => {
                setNewPassword(e.target.value);
                setPwMsg(null);
              }}
            />
          </div>
          <button
            type="button"
            className="btn-text"
            disabled={pwBusy || newPassword.length < 6}
            onClick={() => void updatePassword()}
          >
            {pwBusy ? "جارٍ التحديث…" : "تحديث كلمة المرور"}
          </button>
        </div>
        {pwMsg ? (
          <p className={`mt-2 text-xs ${pwMsg.ok ? "text-muted-foreground" : "text-destructive"}`}>
            {pwMsg.text}
          </p>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">6 أحرف على الأقل.</p>
        )}
      </fieldset>
      <fieldset className="sm:col-span-3 rounded-2xl border border-border p-4">
        <legend className="px-1 text-xs font-semibold text-muted-foreground">
          تغيير البريد الإلكتروني لهذا المستخدم
        </legend>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="email"
            dir="ltr"
            className="field-input min-w-[16rem] flex-1"
            value={newEmail}
            onChange={(e) => {
              setNewEmail(e.target.value);
              setEmailMsg(null);
            }}
          />
          <button
            type="button"
            className="btn-text"
            disabled={emailBusy || newEmail.trim() === "" || newEmail.trim() === row.email}
            onClick={() => void updateEmail()}
          >
            {emailBusy ? "جارٍ التحديث…" : "تحديث البريد"}
          </button>
        </div>
        {emailMsg ? (
          <p className={`mt-2 text-xs ${emailMsg.ok ? "text-muted-foreground" : "text-destructive"}`}>
            {emailMsg.text}
          </p>
        ) : null}
      </fieldset>

      <div className="flex gap-2">
        <button type="submit" className="btn-primary" disabled={busy}>
          حفظ
        </button>
        <button type="button" className="btn-text" onClick={onCancel}>
          إلغاء
        </button>
      </div>
    </form>
  );
}
