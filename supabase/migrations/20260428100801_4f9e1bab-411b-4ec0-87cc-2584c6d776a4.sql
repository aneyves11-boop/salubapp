
-- Statut de vérification
CREATE TYPE public.verification_status AS ENUM ('en_attente', 'valide', 'rejete', 'douteux');

-- Colonnes sur reports
ALTER TABLE public.reports
  ADD COLUMN verified_status verification_status NOT NULL DEFAULT 'en_attente',
  ADD COLUMN true_count integer NOT NULL DEFAULT 0,
  ADD COLUMN false_count integer NOT NULL DEFAULT 0;

-- Table des votes de vérification
CREATE TABLE public.report_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  is_true boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (report_id, user_id)
);

ALTER TABLE public.report_verifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lecture_publique_verifications"
  ON public.report_verifications FOR SELECT
  USING (true);

CREATE POLICY "voter_verification"
  ON public.report_verifications FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "modifier_son_verif"
  ON public.report_verifications FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "retirer_son_verif"
  ON public.report_verifications FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Admins peuvent forcer le statut de vérification
CREATE POLICY "admin_modifie_verification"
  ON public.reports FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Trigger : recalcule compteurs et bascule statut
CREATE OR REPLACE FUNCTION public.update_verification_counts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_report_id uuid;
  v_true int;
  v_false int;
  v_current verification_status;
BEGIN
  v_report_id := COALESCE(NEW.report_id, OLD.report_id);

  SELECT
    COUNT(*) FILTER (WHERE is_true = true),
    COUNT(*) FILTER (WHERE is_true = false)
  INTO v_true, v_false
  FROM public.report_verifications
  WHERE report_id = v_report_id;

  SELECT verified_status INTO v_current FROM public.reports WHERE id = v_report_id;

  -- N'écrase pas un statut admin (valide/rejete)
  IF v_current IN ('en_attente', 'douteux') THEN
    UPDATE public.reports
    SET true_count = v_true,
        false_count = v_false,
        verified_status = CASE
          WHEN v_false >= 3 AND v_false > v_true THEN 'douteux'::verification_status
          ELSE 'en_attente'::verification_status
        END
    WHERE id = v_report_id;
  ELSE
    UPDATE public.reports
    SET true_count = v_true, false_count = v_false
    WHERE id = v_report_id;
  END IF;

  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_verification_counts
AFTER INSERT OR UPDATE OR DELETE ON public.report_verifications
FOR EACH ROW EXECUTE FUNCTION public.update_verification_counts();

CREATE INDEX idx_report_verifications_report ON public.report_verifications(report_id);
