CREATE TABLE public.report_comments (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id   uuid        NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL,
  user_email  text        NOT NULL,
  content     text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT comment_content_length CHECK (char_length(content) BETWEEN 1 AND 500)
);

ALTER TABLE public.report_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lecture publique des commentaires"
  ON public.report_comments FOR SELECT USING (true);

CREATE POLICY "Insertion par utilisateur authentifié"
  ON public.report_comments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Suppression par l'auteur"
  ON public.report_comments FOR DELETE
  USING (auth.uid() = user_id);
