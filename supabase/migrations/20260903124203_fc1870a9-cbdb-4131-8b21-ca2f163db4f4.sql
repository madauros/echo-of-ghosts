DROP POLICY IF EXISTS "Authenticated read resource files" ON storage.objects;
CREATE POLICY "Read resource files scoped by class"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'resources'
  AND EXISTS (
    SELECT 1 FROM public.resources r
    WHERE r.file_path = storage.objects.name
      AND (
        r.class_id IS NULL
        OR r.teacher_id = auth.uid()
        OR public.has_role(auth.uid(), 'super_admin')
        OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.class_id = r.class_id)
        OR EXISTS (SELECT 1 FROM public.teacher_classes tc WHERE tc.teacher_id = auth.uid() AND tc.class_id = r.class_id)
      )
  )
);