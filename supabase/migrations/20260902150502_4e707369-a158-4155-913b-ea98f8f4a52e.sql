ALTER TABLE public.resources ADD COLUMN IF NOT EXISTS class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS resources_class_id_idx ON public.resources(class_id);

DROP POLICY IF EXISTS "Authenticated read resources" ON public.resources;

CREATE POLICY "Read resources scoped by class"
ON public.resources
FOR SELECT
TO authenticated
USING (
  class_id IS NULL
  OR auth.uid() = teacher_id
  OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.class_id = resources.class_id
  )
  OR EXISTS (
    SELECT 1 FROM public.teacher_classes tc
    WHERE tc.teacher_id = auth.uid() AND tc.class_id = resources.class_id
  )
);