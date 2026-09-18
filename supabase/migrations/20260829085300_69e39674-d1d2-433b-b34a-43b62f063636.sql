CREATE TABLE public.teacher_classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (teacher_id, class_id)
);

GRANT SELECT, INSERT, DELETE ON public.teacher_classes TO authenticated;
GRANT ALL ON public.teacher_classes TO service_role;

ALTER TABLE public.teacher_classes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teacher reads own classes" ON public.teacher_classes FOR SELECT TO authenticated USING (auth.uid() = teacher_id);
CREATE POLICY "Super admin reads teacher classes" ON public.teacher_classes FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Super admin inserts teacher classes" ON public.teacher_classes FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Super admin deletes teacher classes" ON public.teacher_classes FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));