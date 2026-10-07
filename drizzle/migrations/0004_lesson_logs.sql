CREATE TABLE public.lesson_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL DEFAULT auth.uid(),
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  log_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lesson_logs_range CHECK (start_time >= '08:00' AND end_time <= '17:30' AND end_time > start_time),
  CONSTRAINT lesson_logs_content_len CHECK (char_length(content) BETWEEN 1 AND 5000)
);
CREATE INDEX lesson_logs_teacher_date_idx ON public.lesson_logs (teacher_id, log_date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lesson_logs TO authenticated;
GRANT ALL ON public.lesson_logs TO service_role;
ALTER TABLE public.lesson_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Teachers read own logs" ON public.lesson_logs FOR SELECT TO authenticated USING (teacher_id = auth.uid());
CREATE POLICY "Teachers insert own logs" ON public.lesson_logs FOR INSERT TO authenticated WITH CHECK (teacher_id = auth.uid() AND EXISTS (SELECT 1 FROM public.teacher_classes tc WHERE tc.teacher_id = auth.uid() AND tc.class_id = lesson_logs.class_id));
CREATE POLICY "Teachers update own logs" ON public.lesson_logs FOR UPDATE TO authenticated USING (teacher_id = auth.uid()) WITH CHECK (teacher_id = auth.uid());
CREATE POLICY "Teachers delete own logs" ON public.lesson_logs FOR DELETE TO authenticated USING (teacher_id = auth.uid());
CREATE TRIGGER update_lesson_logs_updated_at BEFORE UPDATE ON public.lesson_logs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();