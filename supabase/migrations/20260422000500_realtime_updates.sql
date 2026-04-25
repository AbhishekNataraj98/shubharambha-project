-- Daily updates enhancement for realtime and materials tracking
ALTER TABLE public.daily_updates
ADD COLUMN IF NOT EXISTS materials_used text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'daily_updates'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.daily_updates;
  END IF;
END $$;

ALTER TABLE public.daily_updates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "project members can view updates" ON public.daily_updates;
CREATE POLICY "project members can view updates"
ON public.daily_updates
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.projects
    WHERE public.projects.id = public.daily_updates.project_id
      AND (
        public.projects.customer_id = auth.uid()
        OR public.projects.contractor_id = auth.uid()
      )
  )
  OR EXISTS (
    SELECT 1 FROM public.project_members
    WHERE public.project_members.project_id = public.daily_updates.project_id
      AND public.project_members.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "contractors can post updates" ON public.daily_updates;
CREATE POLICY "contractors can post updates"
ON public.daily_updates
FOR INSERT
WITH CHECK (
  posted_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.users
    WHERE public.users.id = auth.uid()
      AND public.users.role IN ('contractor', 'worker')
  )
  AND (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE public.projects.id = public.daily_updates.project_id
        AND public.projects.contractor_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.project_members
      WHERE public.project_members.project_id = public.daily_updates.project_id
        AND public.project_members.user_id = auth.uid()
    )
  )
);
