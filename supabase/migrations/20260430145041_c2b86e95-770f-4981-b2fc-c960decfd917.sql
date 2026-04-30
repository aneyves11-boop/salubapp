-- Comments on reports (moderated, only approved visible to public; admin sees all)
CREATE TABLE public.report_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 1000),
  approved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  approved_by uuid
);
CREATE INDEX idx_report_comments_report ON public.report_comments(report_id);
CREATE INDEX idx_report_comments_pending ON public.report_comments(approved, created_at);

ALTER TABLE public.report_comments ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated (including anonymous) can insert their own comment
CREATE POLICY "comments_insert_self" ON public.report_comments
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- A user can see their own comments (even if pending) + admins see all
CREATE POLICY "comments_select_own_or_admin" ON public.report_comments
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Admin can update (moderate) and delete
CREATE POLICY "comments_admin_update" ON public.report_comments
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "comments_admin_delete" ON public.report_comments
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR user_id = auth.uid());

-- App feedback / ratings (visible only to admin)
CREATE TABLE public.app_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  rating smallint CHECK (rating BETWEEN 1 AND 5),
  message text CHECK (char_length(message) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_app_feedback_created ON public.app_feedback(created_at DESC);

ALTER TABLE public.app_feedback ENABLE ROW LEVEL SECURITY;

-- Anyone (even unauthenticated) can submit feedback
CREATE POLICY "feedback_insert_any" ON public.app_feedback
  FOR INSERT TO anon, authenticated WITH CHECK (true);

-- Only admin can read/delete
CREATE POLICY "feedback_select_admin" ON public.app_feedback
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "feedback_delete_admin" ON public.app_feedback
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));