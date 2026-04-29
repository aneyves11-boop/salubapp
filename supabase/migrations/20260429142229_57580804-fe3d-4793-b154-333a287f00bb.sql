-- 1. Ajout des nouvelles valeurs à l'enum report_category
ALTER TYPE public.report_category ADD VALUE IF NOT EXISTS 'chantier_peril';
ALTER TYPE public.report_category ADD VALUE IF NOT EXISTS 'chantier_signalisation';
ALTER TYPE public.report_category ADD VALUE IF NOT EXISTS 'emprise_chaussee';
ALTER TYPE public.report_category ADD VALUE IF NOT EXISTS 'chantier_ecoulement';
ALTER TYPE public.report_category ADD VALUE IF NOT EXISTS 'fuite_sodeci';

-- 2. Ajout d'un type de "vote" sur la vérification : vrai/faux + persistant/résolu
-- On étend la table report_verifications avec une colonne 'kind'
DO $$ BEGIN
  CREATE TYPE public.verification_kind AS ENUM ('veracite', 'persistance');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.report_verifications
  ADD COLUMN IF NOT EXISTS kind public.verification_kind NOT NULL DEFAULT 'veracite';

-- Drop old unique constraint si existante, recréer avec kind
ALTER TABLE public.report_verifications DROP CONSTRAINT IF EXISTS report_verifications_report_id_user_id_key;
DO $$ BEGIN
  ALTER TABLE public.report_verifications ADD CONSTRAINT report_verifications_report_user_kind_key UNIQUE (report_id, user_id, kind);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. Compteurs supplémentaires sur reports
ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS persistent_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS resolved_community_count integer NOT NULL DEFAULT 0;

-- 4. Mise à jour du trigger pour gérer les deux types de votes
CREATE OR REPLACE FUNCTION public.update_verification_counts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_report_id uuid;
  v_true int;
  v_false int;
  v_persistent int;
  v_resolved int;
  v_current verification_status;
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
          WHEN v_false >= 3 AND v_false > v_true THEN 'douteux'::verification_status
          ELSE 'en_attente'::verification_status
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
$function$;

-- Recréer le trigger si nécessaire
DROP TRIGGER IF EXISTS trg_update_verification_counts ON public.report_verifications;
CREATE TRIGGER trg_update_verification_counts
AFTER INSERT OR UPDATE OR DELETE ON public.report_verifications
FOR EACH ROW EXECUTE FUNCTION public.update_verification_counts();