ALTER TABLE public.agenda_events
  ADD COLUMN IF NOT EXISTS resource_id uuid REFERENCES public.resources(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS link_url text;