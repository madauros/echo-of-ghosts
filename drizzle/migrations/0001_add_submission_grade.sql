ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS grade numeric,
  ADD COLUMN IF NOT EXISTS graded_at timestamptz;

DROP POLICY IF EXISTS "Teachers update their submissions" ON public.submissions;
CREATE POLICY "Teachers update their submissions" ON public.submissions
  FOR UPDATE TO authenticated
  USING (auth.uid() = teacher_id)
  WITH CHECK (auth.uid() = teacher_id);
