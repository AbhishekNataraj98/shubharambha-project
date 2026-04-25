-- Link notifications to specific daily updates
ALTER TABLE public.notifications
ADD COLUMN IF NOT EXISTS update_id uuid REFERENCES public.daily_updates(id) ON DELETE CASCADE;
