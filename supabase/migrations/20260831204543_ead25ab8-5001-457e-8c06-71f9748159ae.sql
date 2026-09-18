DROP POLICY IF EXISTS "Users delete own notifications" ON public.notifications;
CREATE POLICY "Users delete own notifications" ON public.notifications FOR DELETE TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Actors create notifications" ON public.notifications;
CREATE POLICY "Actors create notifications" ON public.notifications FOR INSERT TO authenticated WITH CHECK (auth.uid() = actor_id);

-- 9. Permissions des fonctions -------------------------------------------------

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.teaches_student(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.teaches_student(uuid, uuid) TO authenticated, service_role;

-- 10. Politiques de stockage ---------------------------------------------------

DROP POLICY IF EXISTS "Authenticated read resource files" ON storage.objects;
CREATE POLICY "Authenticated read resource files" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'resources');
DROP POLICY IF EXISTS "Teachers upload own resource files" ON storage.objects;
CREATE POLICY "Teachers upload own resource files" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'resources' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS "Teachers update own resource files" ON storage.objects;
CREATE POLICY "Teachers update own resource files" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'resources' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'resources' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS "Teachers delete own resource files" ON storage.objects;
CREATE POLICY "Teachers delete own resource files" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'resources' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Students manage own submission files" ON storage.objects;
CREATE POLICY "Students manage own submission files" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'submissions' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'submissions' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS "Teachers read submission files" ON storage.objects;
CREATE POLICY "Teachers read submission files" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'submissions'
    AND EXISTS (SELECT 1 FROM public.submissions s WHERE s.file_path = name AND s.teacher_id = auth.uid())
  );

-- 11. Données initiales : les 7 niveaux et 7 classes (sans écraser l'existant) -

INSERT INTO public.levels (id, name, code, position) VALUES
  ('c72155c6-4a88-437a-81a5-be7d423c260e', 'السنة الأولى ثانوي جذع مشترك علوم و تكنولوجيا', '1ASS', 1),
  ('0ba2ce1f-d3ca-401c-98fa-dae727c4f467', 'السنة الأولى ثانوي جذع مشترك آداب', '1ASL', 2),
  ('b43b093d-668e-4e98-a334-f76761f548ba', 'السنة الثانية ثانوي شعب تسيير آداب و لغات', '2ASL', 3),
  ('de3b38fd-8654-45c0-aadc-ecdf83bc2a21', 'السنة الثانية ثانوي شعب علمي و رياضي', '2ASS', 4),
  ('5e2f95b4-d1fe-4c2c-ac45-726932c571bf', 'السنة الثالثة من التعليم الثانوي شعب علمي و رياضي', '3ASS', 5),
  ('fc05b399-430b-48a0-b1e0-08a4c04d8d74', 'السنة الثالثة ثانوي شعب آداب و لغات', '3ASL', 6),
  ('4f1ff455-82a9-4ce9-96e3-b3bd936dbac0', 'السنة الثالثة ثانوي شعب تسيير و إقتصاد', '3ASG', 7)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.classes (id, name, level_id, capacity) VALUES
  ('43ab7b73-9f1c-410f-baf2-d751d19981e9', '1أ1', 'c72155c6-4a88-437a-81a5-be7d423c260e', 1),
  ('26ccaad0-8ede-4f48-91de-e5324219be5a', '1ل1', '0ba2ce1f-d3ca-401c-98fa-dae727c4f467', 4),
  ('14d5f05a-ba92-46c7-af70-a59ec8a85dca', '2أ1', 'de3b38fd-8654-45c0-aadc-ecdf83bc2a21', 2),
  ('a68ff757-9449-4195-b07d-78d3e284d1a8', '3أ1', '5e2f95b4-d1fe-4c2c-ac45-726932c571bf', 3),
  ('a353d2ae-9889-49d6-87ff-1a5f0e27fce5', '3ت إ1', '4f1ff455-82a9-4ce9-96e3-b3bd936dbac0', 7),
  ('62265b10-a4fc-47c9-ae0c-a259ddf4fc0f', '2ل1', 'b43b093d-668e-4e98-a334-f76761f548ba', 5),
  ('90458272-66e5-464d-b48a-66f548ff8ff2', '3ل1', 'fc05b399-430b-48a0-b1e0-08a4c04d8d74', 6)
ON CONFLICT (id) DO NOTHING;
