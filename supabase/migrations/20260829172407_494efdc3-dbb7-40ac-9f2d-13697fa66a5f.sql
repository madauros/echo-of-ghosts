CREATE OR REPLACE FUNCTION public.teaches_student(_teacher_id uuid, _student_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.teacher_classes tc ON tc.class_id = p.class_id
    WHERE p.id = _student_id AND tc.teacher_id = _teacher_id
  )
$$;

REVOKE ALL ON FUNCTION public.teaches_student(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.teaches_student(uuid, uuid) TO authenticated, service_role;

CREATE POLICY "Teachers read their students profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.teaches_student(auth.uid(), id));