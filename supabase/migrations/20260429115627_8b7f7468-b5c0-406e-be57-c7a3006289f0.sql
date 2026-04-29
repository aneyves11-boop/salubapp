
-- 1) report_votes : ne pas exposer user_id en lecture publique
DROP POLICY IF EXISTS "lecture_publique_votes" ON public.report_votes;
DROP POLICY IF EXISTS "retirer_son_vote" ON public.report_votes;
DROP POLICY IF EXISTS "voter" ON public.report_votes;

CREATE POLICY "votes_select_authentifie" ON public.report_votes
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "votes_insert_proprietaire" ON public.report_votes
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "votes_delete_proprietaire" ON public.report_votes
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- 2) report_verifications : restreindre aux authentifiés
DROP POLICY IF EXISTS "lecture_publique_verifications" ON public.report_verifications;
DROP POLICY IF EXISTS "modifier_son_verif" ON public.report_verifications;
DROP POLICY IF EXISTS "retirer_son_verif" ON public.report_verifications;
DROP POLICY IF EXISTS "voter_verification" ON public.report_verifications;

CREATE POLICY "verif_select_authentifie" ON public.report_verifications
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "verif_insert_proprietaire" ON public.report_verifications
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "verif_update_proprietaire" ON public.report_verifications
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "verif_delete_proprietaire" ON public.report_verifications
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- 3) reports : conserver lecture publique (carte publique) mais restreindre admin/autorité aux authentifiés
DROP POLICY IF EXISTS "admin_modifie_verification" ON public.reports;
DROP POLICY IF EXISTS "autorite_modifie_status" ON public.reports;
DROP POLICY IF EXISTS "supprimer_son_report" ON public.reports;

CREATE POLICY "admin_modifie_verification" ON public.reports
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "autorite_modifie_status" ON public.reports
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'autorite'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'autorite'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "supprimer_son_report" ON public.reports
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

-- 4) user_roles : restreindre aux authentifiés
DROP POLICY IF EXISTS "admins_gerent_roles" ON public.user_roles;
DROP POLICY IF EXISTS "admins_voient_tout" ON public.user_roles;
DROP POLICY IF EXISTS "voir_son_role" ON public.user_roles;

CREATE POLICY "roles_admins_gerent" ON public.user_roles
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "roles_voir_son_role" ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- 5) storage.objects : ajouter UPDATE policy pour bucket report-photos
DROP POLICY IF EXISTS "photos_update_proprietaire" ON storage.objects;
CREATE POLICY "photos_update_proprietaire" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'report-photos' AND auth.uid()::text = (storage.foldername(name))[1])
  WITH CHECK (bucket_id = 'report-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
