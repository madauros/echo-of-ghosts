ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS grade numeric(5,2),
  ADD COLUMN IF NOT EXISTS graded_at timestamptz;