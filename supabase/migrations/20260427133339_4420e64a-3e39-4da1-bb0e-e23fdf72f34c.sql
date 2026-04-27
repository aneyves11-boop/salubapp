-- Enums
CREATE TYPE public.report_category AS ENUM ('dechets','eaux_usees','voirie','marche','eau_stagnante','autre');
CREATE TYPE public.report_status AS ENUM ('nouveau','en_cours','resolu','rejete');
CREATE TYPE public.app_role AS ENUM ('citoyen','autorite','admin');

-- user_roles
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'citoyen',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- Auto-attribuer le rôle citoyen à chaque nouvel utilisateur
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'citoyen')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE POLICY "voir_son_role" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "admins_voient_tout" ON public.user_roles FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admins_gerent_roles" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- reports
CREATE TABLE public.reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category report_category NOT NULL,
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 1 AND 1000),
  photo_url TEXT,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  ville TEXT,
  status report_status NOT NULL DEFAULT 'nouveau',
  votes_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_reports_created ON public.reports(created_at DESC);
CREATE INDEX idx_reports_status ON public.reports(status);
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lecture_publique_reports" ON public.reports FOR SELECT USING (true);
CREATE POLICY "creer_son_report" ON public.reports FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "supprimer_son_report" ON public.reports FOR DELETE TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "autorite_modifie_status" ON public.reports FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'autorite') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'autorite') OR public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
CREATE TRIGGER reports_touch BEFORE UPDATE ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- report_votes
CREATE TABLE public.report_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(report_id, user_id)
);
ALTER TABLE public.report_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lecture_publique_votes" ON public.report_votes FOR SELECT USING (true);
CREATE POLICY "voter" ON public.report_votes FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "retirer_son_vote" ON public.report_votes FOR DELETE TO authenticated USING (user_id = auth.uid());

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
CREATE TRIGGER votes_count_trigger
  AFTER INSERT OR DELETE ON public.report_votes
  FOR EACH ROW EXECUTE FUNCTION public.update_votes_count();

-- Storage bucket photos
INSERT INTO storage.buckets (id, name, public) VALUES ('report-photos','report-photos', true);

CREATE POLICY "photos_lecture_publique" ON storage.objects FOR SELECT USING (bucket_id = 'report-photos');
CREATE POLICY "photos_upload_authentifie" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'report-photos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "photos_delete_proprietaire" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'report-photos' AND (storage.foldername(name))[1] = auth.uid()::text);