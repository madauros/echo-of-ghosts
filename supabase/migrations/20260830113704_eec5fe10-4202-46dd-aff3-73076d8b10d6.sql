-- Resources
DO $$ BEGIN CREATE TYPE public.resource_category AS ENUM ('cours', 'exercices'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  level_id uuid REFERENCES public.levels(id) ON DELETE SET NULL,
  category public.resource_category NOT NULL,
  title text NOT NULL,
  description text,
  file_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.resources TO authenticated;
GRANT ALL ON public.resources TO service_role;
ALTER TABLE public.resources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read resources" ON public.resources;
CREATE POLICY "Authenticated read resources" ON public.resources FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Teachers insert own resources" ON public.resources;
CREATE POLICY "Teachers insert own resources" ON public.resources FOR INSERT TO authenticated WITH CHECK (auth.uid() = teacher_id);
DROP POLICY IF EXISTS "Teachers update own resources" ON public.resources;
CREATE POLICY "Teachers update own resources" ON public.resources FOR UPDATE TO authenticated USING (auth.uid() = teacher_id) WITH CHECK (auth.uid() = teacher_id);
DROP POLICY IF EXISTS "Teachers delete own resources" ON public.resources;
CREATE POLICY "Teachers delete own resources" ON public.resources FOR DELETE TO authenticated USING (auth.uid() = teacher_id);

CREATE INDEX IF NOT EXISTS resources_level_category_idx ON public.resources (level_id, category);
DROP TRIGGER IF EXISTS update_resources_updated_at ON public.resources;
CREATE TRIGGER update_resources_updated_at BEFORE UPDATE ON public.resources FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Submissions
CREATE TABLE IF NOT EXISTS public.submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id uuid NOT NULL REFERENCES public.resources(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  answer_text text,
  file_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (resource_id, student_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.submissions TO authenticated;
GRANT ALL ON public.submissions TO service_role;
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;

-- Submission comments
CREATE TABLE IF NOT EXISTS public.submission_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.submission_comments TO authenticated;
GRANT ALL ON public.submission_comments TO service_role;
ALTER TABLE public.submission_comments ENABLE ROW LEVEL SECURITY;

-- Notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  kind text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Helper: teacher teaches student
CREATE OR REPLACE FUNCTION public.teaches_student(_teacher_id uuid, _student_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.teacher_classes tc ON tc.class_id = p.class_id
    WHERE p.id = _student_id AND tc.teacher_id = _teacher_id
  )
$$;
REVOKE ALL ON FUNCTION public.teaches_student(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.teaches_student(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Teachers read their students profiles" ON public.profiles;
CREATE POLICY "Teachers read their students profiles" ON public.profiles FOR SELECT TO authenticated USING (public.teaches_student(auth.uid(), id));