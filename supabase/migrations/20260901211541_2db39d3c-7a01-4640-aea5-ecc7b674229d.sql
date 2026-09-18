CREATE TYPE public.agenda_kind AS ENUM ('homework', 'evaluation');

CREATE TABLE public.agenda_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  teacher_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  kind public.agenda_kind NOT NULL DEFAULT 'homework',
  title text NOT NULL,
  description text,
  event_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX agenda_events_class_date_idx ON public.agenda_events (class_id, event_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agenda_events TO authenticated;
GRANT ALL ON public.agenda_events TO service_role;

ALTER TABLE public.agenda_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers insert agenda for their classes"
ON public.agenda_events FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = teacher_id
  AND EXISTS (
    SELECT 1 FROM public.teacher_classes tc
    WHERE tc.teacher_id = auth.uid() AND tc.class_id = agenda_events.class_id
  )
);

CREATE POLICY "Teachers read own agenda"
ON public.agenda_events FOR SELECT TO authenticated
USING (auth.uid() = teacher_id OR public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Students read their class agenda"
ON public.agenda_events FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.class_id = agenda_events.class_id
  )
);

CREATE POLICY "Teachers update own agenda"
ON public.agenda_events FOR UPDATE TO authenticated
USING (auth.uid() = teacher_id OR public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (auth.uid() = teacher_id OR public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Teachers delete own agenda"
ON public.agenda_events FOR DELETE TO authenticated
USING (auth.uid() = teacher_id OR public.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER update_agenda_events_updated_at
BEFORE UPDATE ON public.agenda_events
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();