-- Absences et notes de comportement (import friendly-ghost-importer)
CREATE TABLE IF NOT EXISTS public.absences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  teacher_id uuid NOT NULL,
  class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  justified boolean NOT NULL DEFAULT false,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT absences_dates_check CHECK (end_date >= start_date)
);

CREATE TABLE IF NOT EXISTS public.behavior_grades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  teacher_id uuid NOT NULL,
  class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  grade numeric NOT NULL CHECK (grade >= 0 AND grade <= 20),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, teacher_id)
);

CREATE TRIGGER behavior_grades_updated_at BEFORE UPDATE ON public.behavior_grades
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.absences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.behavior_grades ENABLE ROW LEVEL SECURITY;

CREATE POLICY absences_select ON public.absences FOR SELECT TO authenticated
  USING (auth.uid() = student_id OR auth.uid() = teacher_id OR public.has_role(auth.uid(), 'super_admin'::public.app_role));
CREATE POLICY absences_insert ON public.absences FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = teacher_id OR public.has_role(auth.uid(), 'super_admin'::public.app_role));
CREATE POLICY absences_update ON public.absences FOR UPDATE TO authenticated
  USING (auth.uid() = teacher_id OR public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (auth.uid() = teacher_id OR public.has_role(auth.uid(), 'super_admin'::public.app_role));
CREATE POLICY absences_delete ON public.absences FOR DELETE TO authenticated
  USING (auth.uid() = teacher_id OR public.has_role(auth.uid(), 'super_admin'::public.app_role));

CREATE POLICY behavior_grades_select ON public.behavior_grades FOR SELECT TO authenticated
  USING (auth.uid() = student_id OR auth.uid() = teacher_id OR public.has_role(auth.uid(), 'super_admin'::public.app_role));
CREATE POLICY behavior_grades_insert ON public.behavior_grades FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = teacher_id OR public.has_role(auth.uid(), 'super_admin'::public.app_role));
CREATE POLICY behavior_grades_update ON public.behavior_grades FOR UPDATE TO authenticated
  USING (auth.uid() = teacher_id OR public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (auth.uid() = teacher_id OR public.has_role(auth.uid(), 'super_admin'::public.app_role));
CREATE POLICY behavior_grades_delete ON public.behavior_grades FOR DELETE TO authenticated
  USING (auth.uid() = teacher_id OR public.has_role(auth.uid(), 'super_admin'::public.app_role));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.absences TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.behavior_grades TO authenticated;
