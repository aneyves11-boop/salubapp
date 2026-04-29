-- Restreindre la lecture des commentaires aux utilisateurs authentifiés
-- (les utilisateurs anonymes via signInAnonymously() ont le rôle "authenticated" → pas impacté)

DROP POLICY IF EXISTS "Lecture publique des commentaires" ON public.report_comments;

CREATE POLICY "Lecture commentaires authentifies"
  ON public.report_comments FOR SELECT
  TO authenticated
  USING (true);
