-- 8. Politiques RLS ------------------------------------------------------------
-- (CREATE POLICY n'est pas idempotent : on supprime puis recrée.)

DROP POLICY IF EXISTS "Users read own profile" ON public.profiles;
CREATE POLICY "Users read own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
DROP POLICY IF EXISTS "Super admin reads all profiles" ON public.profiles;
CREATE POLICY "Super admin reads all profiles" ON public.profiles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));
DROP POLICY IF EXISTS "Super admin updates profiles" ON public.profiles;
CREATE POLICY "Super admin updates profiles" ON public.profiles FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
DROP POLICY IF EXISTS "Super admin deletes profiles" ON public.profiles;
CREATE POLICY "Super admin deletes profiles" ON public.profiles FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));
DROP POLICY IF EXISTS "Teachers read their students profiles" ON public.profiles;
CREATE POLICY "Teachers read their students profiles" ON public.profiles FOR SELECT TO authenticated USING (public.teaches_student(auth.uid(), id));

DROP POLICY IF EXISTS "Users read own roles" ON public.user_roles;
CREATE POLICY "Users read own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Authenticated read levels" ON public.levels;
CREATE POLICY "Authenticated read levels" ON public.levels FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Super admin insert levels" ON public.levels;
CREATE POLICY "Super admin insert levels" ON public.levels FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
DROP POLICY IF EXISTS "Super admin update levels" ON public.levels;
CREATE POLICY "Super admin update levels" ON public.levels FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
DROP POLICY IF EXISTS "Super admin delete levels" ON public.levels;
CREATE POLICY "Super admin delete levels" ON public.levels FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "Authenticated read classes" ON public.classes;
CREATE POLICY "Authenticated read classes" ON public.classes FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Super admin insert classes" ON public.classes;
CREATE POLICY "Super admin insert classes" ON public.classes FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
DROP POLICY IF EXISTS "Super admin update classes" ON public.classes;
CREATE POLICY "Super admin update classes" ON public.classes FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
DROP POLICY IF EXISTS "Super admin delete classes" ON public.classes;
CREATE POLICY "Super admin delete classes" ON public.classes FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "Authenticated read teacher classes" ON public.teacher_classes;
CREATE POLICY "Authenticated read teacher classes" ON public.teacher_classes FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Super admin insert teacher classes" ON public.teacher_classes;
CREATE POLICY "Super admin insert teacher classes" ON public.teacher_classes FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
DROP POLICY IF EXISTS "Super admin update teacher classes" ON public.teacher_classes;
CREATE POLICY "Super admin update teacher classes" ON public.teacher_classes FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
DROP POLICY IF EXISTS "Super admin delete teacher classes" ON public.teacher_classes;
CREATE POLICY "Super admin delete teacher classes" ON public.teacher_classes FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "Authenticated read resources" ON public.resources;
CREATE POLICY "Authenticated read resources" ON public.resources FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Teachers insert own resources" ON public.resources;
CREATE POLICY "Teachers insert own resources" ON public.resources FOR INSERT TO authenticated WITH CHECK (auth.uid() = teacher_id);
DROP POLICY IF EXISTS "Teachers update own resources" ON public.resources;
CREATE POLICY "Teachers update own resources" ON public.resources FOR UPDATE TO authenticated USING (auth.uid() = teacher_id) WITH CHECK (auth.uid() = teacher_id);
DROP POLICY IF EXISTS "Teachers delete own resources" ON public.resources;
CREATE POLICY "Teachers delete own resources" ON public.resources FOR DELETE TO authenticated USING (auth.uid() = teacher_id OR public.has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "Students insert own submissions" ON public.submissions;
CREATE POLICY "Students insert own submissions" ON public.submissions FOR INSERT TO authenticated WITH CHECK (auth.uid() = student_id);
DROP POLICY IF EXISTS "Students read own submissions" ON public.submissions;
CREATE POLICY "Students read own submissions" ON public.submissions FOR SELECT TO authenticated USING (auth.uid() = student_id);
DROP POLICY IF EXISTS "Teachers read their submissions" ON public.submissions;
CREATE POLICY "Teachers read their submissions" ON public.submissions FOR SELECT TO authenticated USING (auth.uid() = teacher_id);
DROP POLICY IF EXISTS "Super admin reads submissions" ON public.submissions;
CREATE POLICY "Super admin reads submissions" ON public.submissions FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));
DROP POLICY IF EXISTS "Students delete own submissions" ON public.submissions;
CREATE POLICY "Students delete own submissions" ON public.submissions FOR DELETE TO authenticated USING (auth.uid() = student_id OR public.has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "Teachers comment on their submissions" ON public.submission_comments;
CREATE POLICY "Teachers comment on their submissions" ON public.submission_comments FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = author_id
  AND EXISTS (SELECT 1 FROM public.submissions s WHERE s.id = submission_id AND s.teacher_id = auth.uid())
);
DROP POLICY IF EXISTS "Participants read comments" ON public.submission_comments;
CREATE POLICY "Participants read comments" ON public.submission_comments FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.submissions s WHERE s.id = submission_id AND (s.teacher_id = auth.uid() OR s.student_id = auth.uid()))
  OR public.has_role(auth.uid(), 'super_admin')
);
DROP POLICY IF EXISTS "Authors update own comments" ON public.submission_comments;
CREATE POLICY "Authors update own comments" ON public.submission_comments FOR UPDATE TO authenticated USING (auth.uid() = author_id) WITH CHECK (auth.uid() = author_id);
DROP POLICY IF EXISTS "Authors delete own comments" ON public.submission_comments;
CREATE POLICY "Authors delete own comments" ON public.submission_comments FOR DELETE TO authenticated USING (auth.uid() = author_id OR public.has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "Users read own notifications" ON public.notifications;
CREATE POLICY "Users read own notifications" ON public.notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users update own notifications" ON public.notifications;
CREATE POLICY "Users update own notifications" ON public.notifications FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
