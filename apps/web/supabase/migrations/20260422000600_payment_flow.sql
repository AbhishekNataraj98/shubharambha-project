-- Payment approval flow and notifications
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'payment_status'
      AND e.enumlabel = 'declined'
  ) THEN
    ALTER TYPE public.payment_status ADD VALUE 'declined';
  END IF;
END $$;

-- payments.status already uses enum payment_status, so enum values enforce allowed status values.

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS recorded_by_role text DEFAULT 'customer';

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS decline_reason text;

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  type text NOT NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  payment_id uuid REFERENCES public.payments(id) ON DELETE CASCADE,
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users see own notifications" ON public.notifications;
CREATE POLICY "users see own notifications"
ON public.notifications FOR SELECT
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "system can insert notifications" ON public.notifications;
CREATE POLICY "system can insert notifications"
ON public.notifications FOR INSERT
WITH CHECK (true);

DROP POLICY IF EXISTS "users can update own notifications" ON public.notifications;
CREATE POLICY "users can update own notifications"
ON public.notifications FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'payments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.payments;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "project members can view payments" ON public.payments;
DROP POLICY IF EXISTS "contractors can insert payments" ON public.payments;
DROP POLICY IF EXISTS "project parties view payments" ON public.payments;
DROP POLICY IF EXISTS "customer records payment" ON public.payments;
DROP POLICY IF EXISTS "contractor updates payment status" ON public.payments;

CREATE POLICY "project parties view payments"
ON public.payments FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.projects
    WHERE public.projects.id = public.payments.project_id
      AND (
        public.projects.customer_id = auth.uid()
        OR public.projects.contractor_id = auth.uid()
      )
  )
);

CREATE POLICY "customer records payment"
ON public.payments FOR INSERT
WITH CHECK (
  recorded_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.projects
    WHERE public.projects.id = public.payments.project_id
      AND public.projects.customer_id = auth.uid()
  )
  AND EXISTS (
    SELECT 1 FROM public.users
    WHERE public.users.id = auth.uid()
      AND public.users.role = 'customer'
  )
);

CREATE POLICY "contractor updates payment status"
ON public.payments FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.projects
    WHERE public.projects.id = public.payments.project_id
      AND public.projects.contractor_id = auth.uid()
  )
  AND EXISTS (
    SELECT 1 FROM public.users
    WHERE public.users.id = auth.uid()
      AND public.users.role = 'contractor'
  )
);
