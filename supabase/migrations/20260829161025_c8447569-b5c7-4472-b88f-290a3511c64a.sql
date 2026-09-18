CREATE TYPE public.app_role AS ENUM ('super_admin');
CREATE TYPE public.app_space AS ENUM ('talameed', 'taleem', 'admin');
CREATE TYPE public.account_status AS ENUM ('pending', 'approved', 'rejected');

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  space public.app_space NOT NULL,
  status public.account_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
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

CREATE POLICY "Users read own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Super admin reads all profiles" ON public.profiles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Super admin updates profiles" ON public.profiles FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Users read own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _space public.app_space;
  _status public.account_status := 'pending';
  _is_first_admin boolean := false;
BEGIN
  _space := COALESCE(NEW.raw_user_meta_data->>'space', 'talameed')::public.app_space;
  IF _space = 'admin' AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE space = 'admin') THEN
    _status := 'approved';
    _is_first_admin := true;
  END IF;
  INSERT INTO public.profiles (id, email, space, status, reviewed_at)
  VALUES (NEW.id, COALESCE(NEW.email, ''), _space, _status, CASE WHEN _is_first_admin THEN now() ELSE NULL END);
  IF _is_first_admin THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'super_admin');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

CREATE TABLE public.levels (
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

CREATE POLICY "Authenticated read levels" ON public.levels FOR SELECT TO authenticated USING (true);
CREATE POLICY "Super admin insert levels" ON public.levels FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Super admin update levels" ON public.levels FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Super admin delete levels" ON public.levels FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));

CREATE TABLE public.classes (
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

CREATE POLICY "Authenticated read classes" ON public.classes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Super admin insert classes" ON public.classes FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Super admin update classes" ON public.classes FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Super admin delete classes" ON public.classes FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));

ALTER TABLE public.profiles
  ADD COLUMN full_name text,
  ADD COLUMN level_id uuid REFERENCES public.levels(id) ON DELETE SET NULL,
  ADD COLUMN class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

CREATE POLICY "Super admin deletes profiles" ON public.profiles FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_levels_updated_at BEFORE UPDATE ON public.levels FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_classes_updated_at BEFORE UPDATE ON public.classes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;

INSERT INTO public.levels (id, name, code, "position", created_at, updated_at) VALUES
('c72155c6-4a88-437a-81a5-be7d423c260e','السنة الأولى ثانوي جذع مشترك علوم و تكنولوجيا','1ASS',1,'2026-08-29 08:25:06.067247+00','2026-08-29 08:25:06.067247+00'),
('0ba2ce1f-d3ca-401c-98fa-dae727c4f467','السنة الأولى ثانوي جذع مشترك آداب','1ASL',2,'2026-08-29 08:26:30.014043+00','2026-08-29 08:26:30.014043+00'),
('b43b093d-668e-4e98-a334-f76761f548ba','السنة الثانية ثانوي شعب تسيير آداب و لغات','2ASL',3,'2026-08-29 08:31:13.038555+00','2026-08-29 08:37:07.761972+00'),
('de3b38fd-8654-45c0-aadc-ecdf83bc2a21','السنة الثانية ثانوي شعب علمي و رياضي','2ASS',4,'2026-08-29 08:39:25.998395+00','2026-08-29 08:39:25.998395+00'),
('5e2f95b4-d1fe-4c2c-ac45-726932c571bf','السنة الثالثة من التعليم الثانوي شعب علمي و رياضي','3ASS',5,'2026-08-29 08:29:17.276796+00','2026-08-29 08:37:40.218424+00'),
('fc05b399-430b-48a0-b1e0-08a4c04d8d74','السنة الثالثة ثانوي شعب آداب و لغات','3ASL',6,'2026-08-29 08:33:08.249508+00','2026-08-29 08:37:54.298577+00'),
('4f1ff455-82a9-4ce9-96e3-b3bd936dbac0','السنة الثالثة ثانوي شعب تسيير و إقتصاد','3ASG',7,'2026-08-29 08:36:12.079094+00','2026-08-29 08:38:04.345115+00')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.classes (id, name, code, level_id, capacity, created_at, updated_at) VALUES
('43ab7b73-9f1c-410f-baf2-d751d19981e9','1أ1',NULL,'c72155c6-4a88-437a-81a5-be7d423c260e',1,'2026-08-29 08:40:34.054397+00','2026-08-29 08:40:34.054397+00'),
('26ccaad0-8ede-4f48-91de-e5324219be5a','1ل1',NULL,'0ba2ce1f-d3ca-401c-98fa-dae727c4f467',4,'2026-08-29 08:42:20.644167+00','2026-08-29 08:42:20.644167+00'),
('14d5f05a-ba92-46c7-af70-a59ec8a85dca','2أ1',NULL,'de3b38fd-8654-45c0-aadc-ecdf83bc2a21',2,'2026-08-29 08:41:26.245743+00','2026-08-29 08:44:27.719532+00'),
('a68ff757-9449-4195-b07d-78d3e284d1a8','3أ1',NULL,'5e2f95b4-d1fe-4c2c-ac45-726932c571bf',3,'2026-08-29 08:41:49.370093+00','2026-08-29 08:44:45.622235+00'),
('a353d2ae-9889-49d6-87ff-1a5f0e27fce5','3ت إ1',NULL,'4f1ff455-82a9-4ce9-96e3-b3bd936dbac0',7,'2026-08-29 08:43:49.291381+00','2026-08-29 08:45:00.164865+00'),
('62265b10-a4fc-47c9-ae0c-a259ddf4fc0f','2ل1',NULL,'b43b093d-668e-4e98-a334-f76761f548ba',5,'2026-08-29 08:42:45.224812+00','2026-08-29 08:45:15.021124+00'),
('90458272-66e5-464d-b48a-66f548ff8ff2','3ل1',NULL,'fc05b399-430b-48a0-b1e0-08a4c04d8d74',6,'2026-08-29 08:43:07.18208+00','2026-08-29 08:46:20.194296+00')
ON CONFLICT (id) DO NOTHING;

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
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
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
CREATE POLICY "Super admin insert teacher classes" ON public.teacher_classes FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "Super admin update teacher classes" ON public.teacher_classes FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'super_admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "Super admin delete teacher classes" ON public.teacher_classes FOR DELETE TO authenticated USING (has_role(auth.uid(), 'super_admin'::app_role));