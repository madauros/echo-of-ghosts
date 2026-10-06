CREATE TABLE public.questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  teacher_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  title text NOT NULL, body text, file_path text, file_name text, mime_type text, file_size bigint,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX questions_class_idx ON public.questions (class_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.questions TO authenticated;
GRANT ALL ON public.questions TO service_role;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read questions of own class" ON public.questions FOR SELECT TO authenticated
USING (auth.uid() = student_id OR public.has_role(auth.uid(), 'super_admin')
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.class_id = questions.class_id)
  OR EXISTS (SELECT 1 FROM public.teacher_classes tc WHERE tc.teacher_id = auth.uid() AND tc.class_id = questions.class_id));
CREATE POLICY "Students ask questions in own class" ON public.questions FOR INSERT TO authenticated
WITH CHECK (auth.uid() = student_id AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.class_id = questions.class_id));
CREATE POLICY "Authors update own questions" ON public.questions FOR UPDATE TO authenticated
USING (auth.uid() = student_id) WITH CHECK (auth.uid() = student_id);
CREATE POLICY "Authors delete own questions" ON public.questions FOR DELETE TO authenticated
USING (auth.uid() = student_id OR public.has_role(auth.uid(), 'super_admin'));
CREATE TRIGGER update_questions_updated_at BEFORE UPDATE ON public.questions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.question_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text, file_path text, file_name text, mime_type text, file_size bigint,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX question_answers_question_idx ON public.question_answers (question_id, created_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.question_answers TO authenticated;
GRANT ALL ON public.question_answers TO service_role;
ALTER TABLE public.question_answers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read answers of visible questions" ON public.question_answers FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.questions q WHERE q.id = question_answers.question_id AND (
  q.student_id = auth.uid() OR public.has_role(auth.uid(), 'super_admin')
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.class_id = q.class_id)
  OR EXISTS (SELECT 1 FROM public.teacher_classes tc WHERE tc.teacher_id = auth.uid() AND tc.class_id = q.class_id))));
CREATE POLICY "Teachers answer questions of their classes" ON public.question_answers FOR INSERT TO authenticated
WITH CHECK (auth.uid() = teacher_id AND EXISTS (SELECT 1 FROM public.questions q JOIN public.teacher_classes tc ON tc.class_id = q.class_id WHERE q.id = question_answers.question_id AND tc.teacher_id = auth.uid()));
CREATE POLICY "Teachers update own answers" ON public.question_answers FOR UPDATE TO authenticated
USING (auth.uid() = teacher_id) WITH CHECK (auth.uid() = teacher_id);
CREATE POLICY "Teachers delete own answers" ON public.question_answers FOR DELETE TO authenticated
USING (auth.uid() = teacher_id OR public.has_role(auth.uid(), 'super_admin'));
CREATE TRIGGER update_question_answers_updated_at BEFORE UPDATE ON public.question_answers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Read question files of own class" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'questions' AND (owner = auth.uid() OR public.has_role(auth.uid(), 'super_admin')
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.class_id::text = (storage.foldername(name))[1])
  OR EXISTS (SELECT 1 FROM public.teacher_classes tc WHERE tc.teacher_id = auth.uid() AND tc.class_id::text = (storage.foldername(name))[1])));
CREATE POLICY "Upload question files in own class" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'questions' AND (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.class_id::text = (storage.foldername(name))[1])
  OR EXISTS (SELECT 1 FROM public.teacher_classes tc WHERE tc.teacher_id = auth.uid() AND tc.class_id::text = (storage.foldername(name))[1])));
CREATE POLICY "Delete own question files" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'questions' AND (owner = auth.uid() OR public.has_role(auth.uid(), 'super_admin')));

CREATE OR REPLACE FUNCTION public.shares_class(_viewer uuid, _target uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles v JOIN public.profiles t ON t.class_id = v.class_id
    WHERE v.id = _viewer AND t.id = _target AND v.class_id IS NOT NULL)
  OR EXISTS (SELECT 1 FROM public.profiles v JOIN public.teacher_classes tc ON tc.class_id = v.class_id
    WHERE v.id = _viewer AND tc.teacher_id = _target AND v.class_id IS NOT NULL)
$$;
REVOKE EXECUTE ON FUNCTION public.shares_class(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.shares_class(uuid, uuid) TO authenticated;
CREATE POLICY "Classmates and class teachers read profiles" ON public.profiles FOR SELECT TO authenticated
USING (public.shares_class(auth.uid(), id));

CREATE TABLE public.chapters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  level_id uuid NOT NULL REFERENCES public.levels(id) ON DELETE CASCADE,
  name text NOT NULL, position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chapters TO authenticated;
GRANT ALL ON public.chapters TO service_role;
ALTER TABLE public.chapters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read chapters" ON public.chapters FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins insert chapters" ON public.chapters FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Admins update chapters" ON public.chapters FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Admins delete chapters" ON public.chapters FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));
CREATE INDEX chapters_level_idx ON public.chapters(level_id, position);
CREATE TRIGGER update_chapters_updated_at BEFORE UPDATE ON public.chapters FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
ALTER TABLE public.resources ADD COLUMN IF NOT EXISTS chapter_id uuid REFERENCES public.chapters(id) ON DELETE SET NULL;
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS chapter_id uuid REFERENCES public.chapters(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS resources_chapter_idx ON public.resources(chapter_id);
CREATE INDEX IF NOT EXISTS questions_chapter_idx ON public.questions(chapter_id);

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_path text;
CREATE POLICY "Signed-in users view avatars" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'avatars');
CREATE POLICY "Admins upload avatars" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'avatars' AND public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Admins update avatars" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'avatars' AND public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Admins delete avatars" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'avatars' AND public.has_role(auth.uid(), 'super_admin'));

CREATE TABLE public.homework_status (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  homework_id uuid NOT NULL REFERENCES public.agenda_events(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  done boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (homework_id, student_id)
);
CREATE INDEX homework_status_student_idx ON public.homework_status (student_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.homework_status TO authenticated;
GRANT ALL ON public.homework_status TO service_role;
ALTER TABLE public.homework_status ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_homework_status_updated_at BEFORE UPDATE ON public.homework_status FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE POLICY "Read homework status" ON public.homework_status FOR SELECT TO authenticated
USING (auth.uid() = student_id OR auth.uid() = teacher_id OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  OR EXISTS (SELECT 1 FROM public.agenda_events e JOIN public.teacher_classes tc ON tc.class_id = e.class_id WHERE e.id = homework_status.homework_id AND tc.teacher_id = auth.uid()));
CREATE POLICY "Teachers write homework status" ON public.homework_status FOR INSERT TO authenticated
WITH CHECK (auth.uid() = teacher_id AND (public.has_role(auth.uid(), 'super_admin'::public.app_role)
  OR EXISTS (SELECT 1 FROM public.agenda_events e JOIN public.teacher_classes tc ON tc.class_id = e.class_id WHERE e.id = homework_status.homework_id AND e.kind = 'homework' AND tc.teacher_id = auth.uid())));
CREATE POLICY "Teachers update homework status" ON public.homework_status FOR UPDATE TO authenticated
USING (auth.uid() = teacher_id OR public.has_role(auth.uid(), 'super_admin'::public.app_role))
WITH CHECK (auth.uid() = teacher_id OR public.has_role(auth.uid(), 'super_admin'::public.app_role));
CREATE POLICY "Teachers delete homework status" ON public.homework_status FOR DELETE TO authenticated
USING (auth.uid() = teacher_id OR public.has_role(auth.uid(), 'super_admin'::public.app_role));

CREATE TABLE public.evaluation_grades (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  evaluation_id uuid NOT NULL REFERENCES public.agenda_events(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  grade numeric(5,2) NOT NULL CHECK (grade >= 0 AND grade <= 20),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (evaluation_id, student_id)
);
CREATE INDEX evaluation_grades_student_idx ON public.evaluation_grades (student_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.evaluation_grades TO authenticated;
GRANT ALL ON public.evaluation_grades TO service_role;
ALTER TABLE public.evaluation_grades ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_evaluation_grades_updated_at BEFORE UPDATE ON public.evaluation_grades FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE POLICY "Read grades" ON public.evaluation_grades FOR SELECT TO authenticated
USING (auth.uid() = student_id OR auth.uid() = teacher_id OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  OR EXISTS (SELECT 1 FROM public.agenda_events e JOIN public.teacher_classes tc ON tc.class_id = e.class_id WHERE e.id = evaluation_grades.evaluation_id AND tc.teacher_id = auth.uid()));
CREATE POLICY "Teachers write grades" ON public.evaluation_grades FOR INSERT TO authenticated
WITH CHECK (auth.uid() = teacher_id AND (public.has_role(auth.uid(), 'super_admin'::public.app_role)
  OR EXISTS (SELECT 1 FROM public.agenda_events e JOIN public.teacher_classes tc ON tc.class_id = e.class_id WHERE e.id = evaluation_grades.evaluation_id AND e.kind = 'evaluation' AND tc.teacher_id = auth.uid())));
CREATE POLICY "Teachers update grades" ON public.evaluation_grades FOR UPDATE TO authenticated
USING (auth.uid() = teacher_id OR public.has_role(auth.uid(), 'super_admin'::public.app_role))
WITH CHECK (auth.uid() = teacher_id OR public.has_role(auth.uid(), 'super_admin'::public.app_role));
CREATE POLICY "Teachers delete grades" ON public.evaluation_grades FOR DELETE TO authenticated
USING (auth.uid() = teacher_id OR public.has_role(auth.uid(), 'super_admin'::public.app_role));