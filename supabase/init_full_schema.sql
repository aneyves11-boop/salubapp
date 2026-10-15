-- ==============================================================================
-- SALUBAPP - Script SQL complet d'initialisation de la base de données
-- À exécuter dans le SQL Editor de votre projet Supabase (https://supabase.com)
-- ==============================================================================

-- 1. Énumérations (Types)
DO $$ BEGIN
  CREATE TYPE public.report_category AS ENUM (
    'dechets',
    'eaux_usees',
    'voirie',
    'marche',
    'eau_stagnante',
    'autre',
    'chantier_peril',
    'chantier_signalisation',
    'emprise_chaussee',
    'chantier_ecoulement',
    'fuite_sodeci'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.report_status AS ENUM ('nouveau', 'en_cours', 'resolu', 'rejete');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('citoyen', 'autorite', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.verification_status AS ENUM ('en_attente', 'valide', 'rejete', 'douteux');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.verification_kind AS ENUM ('veracite', 'persistance');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Table: user_roles
CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL DEFAULT 'citoyen',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Fonction de vérification de rôle
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

-- Rôle citoyen automatique pour tout nouvel utilisateur (y compris anonyme)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'citoyen')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Politiques RLS pour user_roles
DROP POLICY IF EXISTS "roles_voir_son_role" ON public.user_roles;
CREATE POLICY "roles_voir_son_role" ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "roles_admins_gerent" ON public.user_roles;
CREATE POLICY "roles_admins_gerent" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 3. Table: reports
CREATE TABLE IF NOT EXISTS public.reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category public.report_category NOT NULL,
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 1 AND 1000),
  photo_url TEXT,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  ville TEXT,
  status public.report_status NOT NULL DEFAULT 'nouveau',
  votes_count INTEGER NOT NULL DEFAULT 0,
  verified_status public.verification_status NOT NULL DEFAULT 'en_attente',
  true_count INTEGER NOT NULL DEFAULT 0,
  false_count INTEGER NOT NULL DEFAULT 0,
  persistent_count INTEGER NOT NULL DEFAULT 0,
  resolved_community_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reports_created ON public.reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_status ON public.reports(status);
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

-- Trigger touch updated_at
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS reports_touch ON public.reports;
CREATE TRIGGER reports_touch BEFORE UPDATE ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Politiques RLS pour reports
DROP POLICY IF EXISTS "reports_select_authentifie" ON public.reports;
CREATE POLICY "reports_select_authentifie" ON public.reports
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "creer_son_report" ON public.reports;
CREATE POLICY "creer_son_report" ON public.reports
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "supprimer_son_report" ON public.reports;
CREATE POLICY "supprimer_son_report" ON public.reports
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "autorite_modifie_status" ON public.reports;
CREATE POLICY "autorite_modifie_status" ON public.reports
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'autorite'::public.app_role) OR public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'autorite'::public.app_role) OR public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "admin_modifie_verification" ON public.reports;
CREATE POLICY "admin_modifie_verification" ON public.reports
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 4. Vue publique (reports_public)
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

-- 5. Table: report_votes
CREATE TABLE IF NOT EXISTS public.report_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(report_id, user_id)
);
ALTER TABLE public.report_votes ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.update_votes_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.reports SET votes_count = votes_count + 1 WHERE id = NEW.report_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.reports SET votes_count = GREATEST(votes_count - 1, 0) WHERE id = OLD.report_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS votes_count_trigger ON public.report_votes;
CREATE TRIGGER votes_count_trigger
  AFTER INSERT OR DELETE ON public.report_votes
  FOR EACH ROW EXECUTE FUNCTION public.update_votes_count();

DROP POLICY IF EXISTS "votes_select_authentifie" ON public.report_votes;
CREATE POLICY "votes_select_authentifie" ON public.report_votes
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "votes_insert_proprietaire" ON public.report_votes;
CREATE POLICY "votes_insert_proprietaire" ON public.report_votes
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "votes_delete_proprietaire" ON public.report_votes;
CREATE POLICY "votes_delete_proprietaire" ON public.report_votes
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- 6. Table: report_verifications
CREATE TABLE IF NOT EXISTS public.report_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_true BOOLEAN NOT NULL,
  kind public.verification_kind NOT NULL DEFAULT 'veracite',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT report_verifications_report_user_kind_key UNIQUE (report_id, user_id, kind)
);
CREATE INDEX IF NOT EXISTS idx_report_verifications_report ON public.report_verifications(report_id);
ALTER TABLE public.report_verifications ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.update_verification_counts()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_report_id UUID;
  v_true INT;
  v_false INT;
  v_persistent INT;
  v_resolved INT;
  v_current public.verification_status;
BEGIN
  v_report_id := COALESCE(NEW.report_id, OLD.report_id);

  SELECT
    COUNT(*) FILTER (WHERE kind = 'veracite' AND is_true = true),
    COUNT(*) FILTER (WHERE kind = 'veracite' AND is_true = false),
    COUNT(*) FILTER (WHERE kind = 'persistance' AND is_true = true),
    COUNT(*) FILTER (WHERE kind = 'persistance' AND is_true = false)
  INTO v_true, v_false, v_persistent, v_resolved
  FROM public.report_verifications
  WHERE report_id = v_report_id;

  SELECT verified_status INTO v_current FROM public.reports WHERE id = v_report_id;

  IF v_current IN ('en_attente', 'douteux') THEN
    UPDATE public.reports
    SET true_count = v_true,
        false_count = v_false,
        persistent_count = v_persistent,
        resolved_community_count = v_resolved,
        verified_status = CASE
          WHEN v_false >= 3 AND v_false > v_true THEN 'douteux'::public.verification_status
          ELSE 'en_attente'::public.verification_status
        END
    WHERE id = v_report_id;
  ELSE
    UPDATE public.reports
    SET true_count = v_true,
        false_count = v_false,
        persistent_count = v_persistent,
        resolved_community_count = v_resolved
    WHERE id = v_report_id;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_verification_counts ON public.report_verifications;
CREATE TRIGGER trg_verification_counts
  AFTER INSERT OR UPDATE OR DELETE ON public.report_verifications
  FOR EACH ROW EXECUTE FUNCTION public.update_verification_counts();

DROP POLICY IF EXISTS "verif_select_authentifie" ON public.report_verifications;
CREATE POLICY "verif_select_authentifie" ON public.report_verifications
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "verif_insert_proprietaire" ON public.report_verifications;
CREATE POLICY "verif_insert_proprietaire" ON public.report_verifications
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "verif_update_proprietaire" ON public.report_verifications;
CREATE POLICY "verif_update_proprietaire" ON public.report_verifications
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "verif_delete_proprietaire" ON public.report_verifications;
CREATE POLICY "verif_delete_proprietaire" ON public.report_verifications
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- 7. Table: report_comments
CREATE TABLE IF NOT EXISTS public.report_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 1000),
  approved BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at TIMESTAMPTZ,
  approved_by UUID
);
CREATE INDEX IF NOT EXISTS idx_report_comments_report ON public.report_comments(report_id);
CREATE INDEX IF NOT EXISTS idx_report_comments_pending ON public.report_comments(approved, created_at);
ALTER TABLE public.report_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "comments_insert_self" ON public.report_comments;
CREATE POLICY "comments_insert_self" ON public.report_comments
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "comments_select_own_or_admin" ON public.report_comments;
CREATE POLICY "comments_select_own_or_admin" ON public.report_comments
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "comments_admin_update" ON public.report_comments;
CREATE POLICY "comments_admin_update" ON public.report_comments
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "comments_admin_delete" ON public.report_comments;
CREATE POLICY "comments_admin_delete" ON public.report_comments
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR user_id = auth.uid());

-- 8. Table: app_feedback
CREATE TABLE IF NOT EXISTS public.app_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  rating SMALLINT CHECK (rating BETWEEN 1 AND 5),
  message TEXT CHECK (char_length(message) <= 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_app_feedback_created ON public.app_feedback(created_at DESC);
ALTER TABLE public.app_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "feedback_insert_any" ON public.app_feedback;
CREATE POLICY "feedback_insert_any" ON public.app_feedback
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "feedback_select_admin" ON public.app_feedback;
CREATE POLICY "feedback_select_admin" ON public.app_feedback
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "feedback_delete_admin" ON public.app_feedback;
CREATE POLICY "feedback_delete_admin" ON public.app_feedback
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 9. Storage Bucket pour les photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('report-photos', 'report-photos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "photos_upload_authentifie" ON storage.objects;
CREATE POLICY "photos_upload_authentifie" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'report-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "photos_update_proprietaire" ON storage.objects;
CREATE POLICY "photos_update_proprietaire" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'report-photos' AND auth.uid()::text = (storage.foldername(name))[1])
  WITH CHECK (bucket_id = 'report-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "photos_delete_proprietaire" ON storage.objects;
CREATE POLICY "photos_delete_proprietaire" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'report-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

-- 10. Sécurisation des fonctions
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_votes_count() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_verification_counts() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
