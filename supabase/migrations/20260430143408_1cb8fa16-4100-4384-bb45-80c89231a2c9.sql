-- 1) Vue publique sans user_id, avec coordonnées arrondies (~100m de précision)
CREATE OR REPLACE VIEW public.reports_public
WITH (security_invoker = on) AS
SELECT
  id,
  category,
  description,
  photo_url,
  ROUND(latitude::numeric, 3)::double precision AS latitude,
  ROUND(longitude::numeric, 3)::double precision AS longitude,
  ville,
  status,
  verified_status,
  votes_count,
  true_count,
  false_count,
  persistent_count,
  resolved_community_count,
  created_at,
  updated_at
FROM public.reports;

GRANT SELECT ON public.reports_public TO anon, authenticated;

-- 2) Restreindre la lecture directe de reports : seuls les utilisateurs authentifiés
--    voient le détail complet (incluant user_id et coordonnées exactes).
DROP POLICY IF EXISTS lecture_publique_reports ON public.reports;

CREATE POLICY reports_select_authentifie
ON public.reports FOR SELECT
TO authenticated
USING (true);
