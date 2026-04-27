-- Bucket: empêcher le listing public, garder accès par URL publique
DROP POLICY IF EXISTS "photos_lecture_publique" ON storage.objects;
-- Pas de SELECT policy => fichiers accessibles seulement via URL publique de Supabase Storage

-- Révoquer EXECUTE des fonctions security definer
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_votes_count() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;
-- has_role doit rester appelable par les utilisateurs connectés (utilisée par RLS)
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;

-- Le linter signale aussi touch_updated_at sans search_path : déjà SECURITY INVOKER mais on fixe le path
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;