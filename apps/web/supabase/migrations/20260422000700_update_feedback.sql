-- Update feedback: likes + threaded comments
CREATE TABLE IF NOT EXISTS public.update_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  update_id uuid NOT NULL REFERENCES public.daily_updates(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (update_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.update_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  update_id uuid NOT NULL REFERENCES public.daily_updates(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  parent_comment_id uuid REFERENCES public.update_comments(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.update_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.update_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "project members view update likes" ON public.update_likes;
CREATE POLICY "project members view update likes"
ON public.update_likes FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.daily_updates du
    JOIN public.projects p ON p.id = du.project_id
    WHERE du.id = public.update_likes.update_id
      AND (
        p.customer_id = auth.uid()
        OR p.contractor_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.project_members pm
          WHERE pm.project_id = p.id
            AND pm.user_id = auth.uid()
        )
      )
  )
);

DROP POLICY IF EXISTS "project members add update likes" ON public.update_likes;
CREATE POLICY "project members add update likes"
ON public.update_likes FOR INSERT
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.daily_updates du
    JOIN public.projects p ON p.id = du.project_id
    WHERE du.id = public.update_likes.update_id
      AND (
        p.customer_id = auth.uid()
        OR p.contractor_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.project_members pm
          WHERE pm.project_id = p.id
            AND pm.user_id = auth.uid()
        )
      )
  )
);

DROP POLICY IF EXISTS "users remove own likes" ON public.update_likes;
CREATE POLICY "users remove own likes"
ON public.update_likes FOR DELETE
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "project members view update comments" ON public.update_comments;
CREATE POLICY "project members view update comments"
ON public.update_comments FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.daily_updates du
    JOIN public.projects p ON p.id = du.project_id
    WHERE du.id = public.update_comments.update_id
      AND (
        p.customer_id = auth.uid()
        OR p.contractor_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.project_members pm
          WHERE pm.project_id = p.id
            AND pm.user_id = auth.uid()
        )
      )
  )
);

DROP POLICY IF EXISTS "project members add comments" ON public.update_comments;
CREATE POLICY "project members add comments"
ON public.update_comments FOR INSERT
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.daily_updates du
    JOIN public.projects p ON p.id = du.project_id
    WHERE du.id = public.update_comments.update_id
      AND (
        p.customer_id = auth.uid()
        OR p.contractor_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.project_members pm
          WHERE pm.project_id = p.id
            AND pm.user_id = auth.uid()
        )
      )
  )
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'update_likes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.update_likes;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'update_comments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.update_comments;
  END IF;
END $$;
