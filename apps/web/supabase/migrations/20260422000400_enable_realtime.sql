-- Enable realtime for chat and updates
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;
END $$;

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

-- Track per-user read cursor for unread count
CREATE TABLE IF NOT EXISTS public.project_chat_reads (
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, user_id)
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_chat_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "project members can read messages" ON public.messages;
CREATE POLICY "project members can read messages"
ON public.messages FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.projects
    WHERE public.projects.id = public.messages.project_id
      AND (
        public.projects.customer_id = auth.uid()
        OR public.projects.contractor_id = auth.uid()
      )
  )
  OR EXISTS (
    SELECT 1 FROM public.project_members
    WHERE public.project_members.project_id = public.messages.project_id
      AND public.project_members.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "project members can insert messages" ON public.messages;
CREATE POLICY "project members can insert messages"
ON public.messages FOR INSERT
WITH CHECK (
  public.messages.sender_id = auth.uid()
  AND (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE public.projects.id = public.messages.project_id
        AND (
          public.projects.customer_id = auth.uid()
          OR public.projects.contractor_id = auth.uid()
        )
    )
    OR EXISTS (
      SELECT 1 FROM public.project_members
      WHERE public.project_members.project_id = public.messages.project_id
        AND public.project_members.user_id = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS "members can manage chat read status" ON public.project_chat_reads;
CREATE POLICY "members can manage chat read status"
ON public.project_chat_reads
FOR ALL
USING (
  user_id = auth.uid()
  AND (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE public.projects.id = public.project_chat_reads.project_id
        AND (
          public.projects.customer_id = auth.uid()
          OR public.projects.contractor_id = auth.uid()
        )
    )
    OR EXISTS (
      SELECT 1 FROM public.project_members
      WHERE public.project_members.project_id = public.project_chat_reads.project_id
        AND public.project_members.user_id = auth.uid()
    )
  )
)
WITH CHECK (
  user_id = auth.uid()
  AND (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE public.projects.id = public.project_chat_reads.project_id
        AND (
          public.projects.customer_id = auth.uid()
          OR public.projects.contractor_id = auth.uid()
        )
    )
    OR EXISTS (
      SELECT 1 FROM public.project_members
      WHERE public.project_members.project_id = public.project_chat_reads.project_id
        AND public.project_members.user_id = auth.uid()
    )
  )
);
