CREATE TYPE public.resource_category AS ENUM ('cours', 'exercices');

CREATE TABLE public.resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  level_id uuid REFERENCES public.levels(id) ON DELETE SET NULL,
  category public.resource_category NOT NULL,
  title text NOT NULL,
  description text,
  file_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text,
  file_size bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.resources TO authenticated;
GRANT ALL ON public.resources TO service_role;

ALTER TABLE public.resources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read resources" ON public.resources
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Teachers insert own resources" ON public.resources
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = teacher_id);
CREATE POLICY "Teachers update own resources" ON public.resources
  FOR UPDATE TO authenticated USING (auth.uid() = teacher_id) WITH CHECK (auth.uid() = teacher_id);
CREATE POLICY "Teachers delete own resources" ON public.resources
  FOR DELETE TO authenticated USING (auth.uid() = teacher_id OR public.has_role(auth.uid(), 'super_admin'));

CREATE INDEX resources_level_category_idx ON public.resources (level_id, category);

CREATE TRIGGER update_resources_updated_at
  BEFORE UPDATE ON public.resources
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Authenticated read resource files" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'resources');
CREATE POLICY "Teachers upload own resource files" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'resources' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Teachers update own resource files" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'resources' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'resources' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Teachers delete own resource files" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'resources' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE TABLE public.teacher_classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (teacher_id, class_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.teacher_classes TO authenticated;
GRANT ALL ON public.teacher_classes TO service_role;

ALTER TABLE public.teacher_classes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read teacher classes" ON public.teacher_classes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Super admin insert teacher classes" ON public.teacher_classes FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Super admin update teacher classes" ON public.teacher_classes FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Super admin delete teacher classes" ON public.teacher_classes FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));

CREATE TABLE public.submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id uuid NOT NULL REFERENCES public.resources(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  level_id uuid REFERENCES public.levels(id) ON DELETE SET NULL,
  file_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text,
  file_size bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.submissions TO authenticated;
GRANT ALL ON public.submissions TO service_role;
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students insert own submissions" ON public.submissions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = student_id);
CREATE POLICY "Students read own submissions" ON public.submissions
  FOR SELECT TO authenticated USING (auth.uid() = student_id);
CREATE POLICY "Teachers read their submissions" ON public.submissions
  FOR SELECT TO authenticated USING (auth.uid() = teacher_id);
CREATE POLICY "Super admin reads submissions" ON public.submissions
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Students delete own submissions" ON public.submissions
  FOR DELETE TO authenticated USING (auth.uid() = student_id OR public.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER update_submissions_updated_at BEFORE UPDATE ON public.submissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX submissions_teacher_idx ON public.submissions(teacher_id);
CREATE INDEX submissions_student_idx ON public.submissions(student_id);

CREATE TABLE public.submission_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.submission_comments TO authenticated;
GRANT ALL ON public.submission_comments TO service_role;
ALTER TABLE public.submission_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers comment on their submissions" ON public.submission_comments
  FOR INSERT TO authenticated WITH CHECK (
    auth.uid() = author_id
    AND EXISTS (SELECT 1 FROM public.submissions s WHERE s.id = submission_id AND s.teacher_id = auth.uid())
  );
CREATE POLICY "Participants read comments" ON public.submission_comments
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.submissions s
      WHERE s.id = submission_id AND (s.teacher_id = auth.uid() OR s.student_id = auth.uid())
    )
    OR public.has_role(auth.uid(), 'super_admin')
  );
CREATE POLICY "Authors update own comments" ON public.submission_comments
  FOR UPDATE TO authenticated USING (auth.uid() = author_id) WITH CHECK (auth.uid() = author_id);
CREATE POLICY "Authors delete own comments" ON public.submission_comments
  FOR DELETE TO authenticated USING (auth.uid() = author_id OR public.has_role(auth.uid(), 'super_admin'));

CREATE INDEX submission_comments_submission_idx ON public.submission_comments(submission_id);

CREATE TRIGGER update_submission_comments_updated_at BEFORE UPDATE ON public.submission_comments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  kind text NOT NULL,
  title text NOT NULL,
  body text,
  submission_id uuid REFERENCES public.submissions(id) ON DELETE CASCADE,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own notifications" ON public.notifications
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users update own notifications" ON public.notifications
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own notifications" ON public.notifications
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Actors create notifications" ON public.notifications
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = actor_id);

CREATE INDEX notifications_user_idx ON public.notifications(user_id, read_at);

CREATE POLICY "Students manage own submission files" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'submissions' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'submissions' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Teachers read submission files" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'submissions'
    AND EXISTS (SELECT 1 FROM public.submissions s WHERE s.file_path = name AND s.teacher_id = auth.uid())
  );

CREATE OR REPLACE FUNCTION public.teaches_student(_teacher_id uuid, _student_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.teacher_classes tc ON tc.class_id = p.class_id
    WHERE p.id = _student_id AND tc.teacher_id = _teacher_id
  )
$$;

REVOKE ALL ON FUNCTION public.teaches_student(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.teaches_student(uuid, uuid) TO authenticated, service_role;

CREATE POLICY "Teachers read their students profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.teaches_student(auth.uid(), id));