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