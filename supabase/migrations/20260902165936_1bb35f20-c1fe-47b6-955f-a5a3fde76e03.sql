-- Types
DO $$ BEGIN CREATE TYPE public.app_role AS ENUM ('super_admin'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.app_space AS ENUM ('eleve', 'enseignant', 'admin'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.account_status AS ENUM ('pending', 'approved', 'rejected'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.resource_category AS ENUM ('cours', 'exercices'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.agenda_kind AS ENUM ('devoir', 'evaluation'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- Profiles
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  space public.app_space NOT NULL,
  status public.account_status NOT NULL DEFAULT 'pending',
  full_name text,
  level_id uuid,
  class_id uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _space public.app_space;
  _status public.account_status := 'pending';
  _first_admin boolean := false;
BEGIN
  _space := COALESCE(NEW.raw_user_meta_data->>'space', 'eleve')::public.app_space;
  IF _space = 'admin' AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE space = 'admin') THEN
    _status := 'approved';
    _first_admin := true;
  END IF;
  INSERT INTO public.profiles (id, email, space, status, full_name, reviewed_at)
  VALUES (NEW.id, COALESCE(NEW.email, ''), _space, _status,
          NULLIF(NEW.raw_user_meta_data->>'full_name', ''),
          CASE WHEN _first_admin THEN now() ELSE NULL END)
  ON CONFLICT (id) DO NOTHING;
  IF _first_admin THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'super_admin') ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Levels / classes
CREATE TABLE IF NOT EXISTS public.levels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text UNIQUE,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.levels TO authenticated;
GRANT ALL ON public.levels TO service_role;
ALTER TABLE public.levels ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text,
  level_id uuid REFERENCES public.levels(id) ON DELETE SET NULL,
  capacity integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.classes TO authenticated;
GRANT ALL ON public.classes TO service_role;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  ALTER TABLE public.profiles ADD CONSTRAINT profiles_level_id_fkey FOREIGN KEY (level_id) REFERENCES public.levels(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.profiles ADD CONSTRAINT profiles_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.teacher_classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (teacher_id, class_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teacher_classes TO authenticated;
GRANT ALL ON public.teacher_classes TO service_role;
ALTER TABLE public.teacher_classes ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.teaches_student(_teacher_id uuid, _student_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.teacher_classes tc ON tc.class_id = p.class_id
    WHERE p.id = _student_id AND tc.teacher_id = _teacher_id
  )
$$;

CREATE OR REPLACE FUNCTION public.my_class_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT class_id FROM public.profiles WHERE id = auth.uid()
$$;

-- Resources
CREATE TABLE IF NOT EXISTS public.resources (
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
CREATE INDEX IF NOT EXISTS resources_level_category_idx ON public.resources (level_id, category);

-- Submissions
CREATE TABLE IF NOT EXISTS public.submissions (
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
  grade numeric,
  graded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.submissions TO authenticated;
GRANT ALL ON public.submissions TO service_role;
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS submissions_teacher_idx ON public.submissions(teacher_id);
CREATE INDEX IF NOT EXISTS submissions_student_idx ON public.submissions(student_id);

CREATE TABLE IF NOT EXISTS public.submission_comments (
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
CREATE INDEX IF NOT EXISTS submission_comments_submission_idx ON public.submission_comments(submission_id);

-- Notifications
CREATE TABLE IF NOT EXISTS public.notifications (
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
CREATE INDEX IF NOT EXISTS notifications_user_idx ON public.notifications(user_id, read_at);

-- Agenda
CREATE TABLE IF NOT EXISTS public.agenda_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  kind public.agenda_kind NOT NULL,
  title text NOT NULL,
  description text,
  date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agenda_events TO authenticated;
GRANT ALL ON public.agenda_events TO service_role;
ALTER TABLE public.agenda_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS agenda_events_class_date_idx ON public.agenda_events(class_id, date);

-- updated_at triggers
DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS update_levels_updated_at ON public.levels;
CREATE TRIGGER update_levels_updated_at BEFORE UPDATE ON public.levels FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS update_classes_updated_at ON public.classes;
CREATE TRIGGER update_classes_updated_at BEFORE UPDATE ON public.classes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS update_resources_updated_at ON public.resources;
CREATE TRIGGER update_resources_updated_at BEFORE UPDATE ON public.resources FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS update_submissions_updated_at ON public.submissions;
CREATE TRIGGER update_submissions_updated_at BEFORE UPDATE ON public.submissions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS update_agenda_events_updated_at ON public.agenda_events;
CREATE TRIGGER update_agenda_events_updated_at BEFORE UPDATE ON public.agenda_events FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Policies: profiles
DROP POLICY IF EXISTS "Users read own profile" ON public.profiles;
CREATE POLICY "Users read own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id AND status = (SELECT status FROM public.profiles p WHERE p.id = auth.uid()) AND space = (SELECT space FROM public.profiles p WHERE p.id = auth.uid()));
DROP POLICY IF EXISTS "Admin reads all profiles" ON public.profiles;
CREATE POLICY "Admin reads all profiles" ON public.profiles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));
DROP POLICY IF EXISTS "Admin updates profiles" ON public.profiles;
CREATE POLICY "Admin updates profiles" ON public.profiles FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
DROP POLICY IF EXISTS "Admin deletes profiles" ON public.profiles;
CREATE POLICY "Admin deletes profiles" ON public.profiles FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));
DROP POLICY IF EXISTS "Teachers read their students profiles" ON public.profiles;
CREATE POLICY "Teachers read their students profiles" ON public.profiles FOR SELECT TO authenticated USING (public.teaches_student(auth.uid(), id));
DROP POLICY IF EXISTS "Approved teachers are visible" ON public.profiles;
CREATE POLICY "Approved teachers are visible" ON public.profiles FOR SELECT TO authenticated USING (space = 'enseignant' AND status = 'approved');

DROP POLICY IF EXISTS "Users read own roles" ON public.user_roles;
CREATE POLICY "Users read own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Policies: levels / classes / teacher_classes
DROP POLICY IF EXISTS "Authenticated read levels" ON public.levels;
CREATE POLICY "Authenticated read levels" ON public.levels FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Admin writes levels" ON public.levels;
CREATE POLICY "Admin writes levels" ON public.levels FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
DROP POLICY IF EXISTS "Authenticated read classes" ON public.classes;
CREATE POLICY "Authenticated read classes" ON public.classes FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Admin writes classes" ON public.classes;
CREATE POLICY "Admin writes classes" ON public.classes FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
DROP POLICY IF EXISTS "Authenticated read teacher classes" ON public.teacher_classes;
CREATE POLICY "Authenticated read teacher classes" ON public.teacher_classes FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Admin writes teacher classes" ON public.teacher_classes;
CREATE POLICY "Admin writes teacher classes" ON public.teacher_classes FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- Policies: resources
DROP POLICY IF EXISTS "Authenticated read resources" ON public.resources;
CREATE POLICY "Authenticated read resources" ON public.resources FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Teachers insert own resources" ON public.resources;
CREATE POLICY "Teachers insert own resources" ON public.resources FOR INSERT TO authenticated WITH CHECK (auth.uid() = teacher_id);
DROP POLICY IF EXISTS "Teachers update own resources" ON public.resources;
CREATE POLICY "Teachers update own resources" ON public.resources FOR UPDATE TO authenticated USING (auth.uid() = teacher_id) WITH CHECK (auth.uid() = teacher_id);
DROP POLICY IF EXISTS "Teachers delete own resources" ON public.resources;
CREATE POLICY "Teachers delete own resources" ON public.resources FOR DELETE TO authenticated USING (auth.uid() = teacher_id OR public.has_role(auth.uid(), 'super_admin'));

-- Policies: submissions
DROP POLICY IF EXISTS "Students insert own submissions" ON public.submissions;
CREATE POLICY "Students insert own submissions" ON public.submissions FOR INSERT TO authenticated WITH CHECK (auth.uid() = student_id);
DROP POLICY IF EXISTS "Students read own submissions" ON public.submissions;
CREATE POLICY "Students read own submissions" ON public.submissions FOR SELECT TO authenticated USING (auth.uid() = student_id);
DROP POLICY IF EXISTS "Teachers read their submissions" ON public.submissions;
CREATE POLICY "Teachers read their submissions" ON public.submissions FOR SELECT TO authenticated USING (auth.uid() = teacher_id);
DROP POLICY IF EXISTS "Admin reads submissions" ON public.submissions;
CREATE POLICY "Admin reads submissions" ON public.submissions FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));
DROP POLICY IF EXISTS "Teachers grade their submissions" ON public.submissions;
CREATE POLICY "Teachers grade their submissions" ON public.submissions FOR UPDATE TO authenticated USING (auth.uid() = teacher_id) WITH CHECK (auth.uid() = teacher_id);
DROP POLICY IF EXISTS "Students delete own submissions" ON public.submissions;
CREATE POLICY "Students delete own submissions" ON public.submissions FOR DELETE TO authenticated USING (auth.uid() = student_id OR public.has_role(auth.uid(), 'super_admin'));

-- Policies: submission_comments
DROP POLICY IF EXISTS "Participants read comments" ON public.submission_comments;
CREATE POLICY "Participants read comments" ON public.submission_comments FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.submissions s WHERE s.id = submission_id AND (s.teacher_id = auth.uid() OR s.student_id = auth.uid()))
  OR public.has_role(auth.uid(), 'super_admin'));
DROP POLICY IF EXISTS "Participants write comments" ON public.submission_comments;
CREATE POLICY "Participants write comments" ON public.submission_comments FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = author_id
  AND EXISTS (SELECT 1 FROM public.submissions s WHERE s.id = submission_id AND (s.teacher_id = auth.uid() OR s.student_id = auth.uid())));
DROP POLICY IF EXISTS "Authors update own comments" ON public.submission_comments;
CREATE POLICY "Authors update own comments" ON public.submission_comments FOR UPDATE TO authenticated USING (auth.uid() = author_id) WITH CHECK (auth.uid() = author_id);
DROP POLICY IF EXISTS "Authors delete own comments" ON public.submission_comments;
CREATE POLICY "Authors delete own comments" ON public.submission_comments FOR DELETE TO authenticated USING (auth.uid() = author_id OR public.has_role(auth.uid(), 'super_admin'));

-- Policies: notifications
DROP POLICY IF EXISTS "Users read own notifications" ON public.notifications;
CREATE POLICY "Users read own notifications" ON public.notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users update own notifications" ON public.notifications;
CREATE POLICY "Users update own notifications" ON public.notifications FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users delete own notifications" ON public.notifications;
CREATE POLICY "Users delete own notifications" ON public.notifications FOR DELETE TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Actors create notifications" ON public.notifications;
CREATE POLICY "Actors create notifications" ON public.notifications FOR INSERT TO authenticated WITH CHECK (auth.uid() = actor_id);

-- Policies: agenda
DROP POLICY IF EXISTS "Teachers manage own agenda" ON public.agenda_events;
CREATE POLICY "Teachers manage own agenda" ON public.agenda_events FOR ALL TO authenticated USING (auth.uid() = teacher_id) WITH CHECK (auth.uid() = teacher_id);
DROP POLICY IF EXISTS "Students read their class agenda" ON public.agenda_events;
CREATE POLICY "Students read their class agenda" ON public.agenda_events FOR SELECT TO authenticated USING (class_id = public.my_class_id());
DROP POLICY IF EXISTS "Admin reads agenda" ON public.agenda_events;
CREATE POLICY "Admin reads agenda" ON public.agenda_events FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));

-- Function grants
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.teaches_student(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.teaches_student(uuid, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.my_class_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_class_id() TO authenticated, service_role;

-- Seed levels / classes
INSERT INTO public.levels (id, name, code, position) VALUES
  ('c72155c6-4a88-437a-81a5-be7d423c260e', '1re année secondaire — Tronc commun sciences et technologie', '1ASS', 1),
  ('0ba2ce1f-d3ca-401c-98fa-dae727c4f467', '1re année secondaire — Tronc commun lettres', '1ASL', 2),
  ('b43b093d-668e-4e98-a334-f76761f548ba', '2e année secondaire — Lettres et langues', '2ASL', 3),
  ('de3b38fd-8654-45c0-aadc-ecdf83bc2a21', '2e année secondaire — Sciences et mathématiques', '2ASS', 4),
  ('5e2f95b4-d1fe-4c2c-ac45-726932c571bf', '3e année secondaire — Sciences et mathématiques', '3ASS', 5),
  ('fc05b399-430b-48a0-b1e0-08a4c04d8d74', '3e année secondaire — Lettres et langues', '3ASL', 6),
  ('4f1ff455-82a9-4ce9-96e3-b3bd936dbac0', '3e année secondaire — Gestion et économie', '3ASG', 7)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.classes (id, name, code, level_id, capacity) VALUES
  ('43ab7b73-9f1c-410f-baf2-d751d19981e9', '1 ST 1', '1ST1', 'c72155c6-4a88-437a-81a5-be7d423c260e', 32),
  ('26ccaad0-8ede-4f48-91de-e5324219be5a', '1 L 1', '1L1', '0ba2ce1f-d3ca-401c-98fa-dae727c4f467', 30),
  ('14d5f05a-ba92-46c7-af70-a59ec8a85dca', '2 SM 1', '2SM1', 'de3b38fd-8654-45c0-aadc-ecdf83bc2a21', 30),
  ('62265b10-a4fc-47c9-ae0c-a259ddf4fc0f', '2 L 1', '2L1', 'b43b093d-668e-4e98-a334-f76761f548ba', 28),
  ('a68ff757-9449-4195-b07d-78d3e284d1a8', '3 SM 1', '3SM1', '5e2f95b4-d1fe-4c2c-ac45-726932c571bf', 28),
  ('90458272-66e5-464d-b48a-66f548ff8ff2', '3 L 1', '3L1', 'fc05b399-430b-48a0-b1e0-08a4c04d8d74', 26),
  ('a353d2ae-9889-49d6-87ff-1a5f0e27fce5', '3 GE 1', '3GE1', '4f1ff455-82a9-4ce9-96e3-b3bd936dbac0', 26)
ON CONFLICT (id) DO NOTHING;