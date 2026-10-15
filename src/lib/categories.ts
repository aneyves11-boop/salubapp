import type { Database } from "@/integrations/supabase/types";
import dechetsImg from "@/assets/categories/dechets.png";
import voirieImg from "@/assets/categories/voirie.png";
import eauxUseesImg from "@/assets/categories/eaux_usees.png";
import eauStagnanteImg from "@/assets/categories/eau_stagnante.png";
import chantierEcoulementImg from "@/assets/categories/chantier_ecoulement.png";
import fuiteSodeciImg from "@/assets/categories/fuite_sodeci.png";

export type Category = Database["public"]["Enums"]["report_category"];
export type Status = Database["public"]["Enums"]["report_status"];

// ✏️ ÉDITION DES CATÉGORIES
// - Renommer un libellé : modifiez simplement le `label` ci-dessous.
// - Ajouter / supprimer une catégorie : nécessite une migration de l'enum
//   `report_category` en base de données. Demandez-le et je m'en occupe.
// - Réordonner : changez l'ordre des entrées du tableau.
export const CATEGORIES: { value: Category; label: string; image: string }[] = [
  { value: "dechets", label: "Déchets / ordures", image: dechetsImg },
  { value: "eaux_usees", label: "Caniveaux ouverts / bouchés", image: eauxUseesImg },
  { value: "voirie", label: "Voirie / nids-de-poule", image: voirieImg },
  { value: "eau_stagnante", label: "Eau stagnante", image: eauStagnanteImg },
  { value: "emprise_chaussee" as Category, label: "Emprise illicite sur la chaussée", image: chantierEcoulementImg },
  { value: "chantier_ecoulement" as Category, label: "Entrave à l'écoulement des eaux (chantier)", image: chantierEcoulementImg },
  { value: "fuite_sodeci" as Category, label: "Fuite d'eau (tuyaux SODECI)", image: fuiteSodeciImg },
  { value: "autre", label: "Autre", image: dechetsImg },
];

export const STATUSES: { value: Status; label: string; color: string }[] = [
  { value: "nouveau", label: "Nouveau", color: "bg-accent text-accent-foreground" },
  { value: "en_cours", label: "En cours", color: "bg-primary text-primary-foreground" },
  { value: "resolu", label: "Résolu", color: "bg-emerald-600 text-white" },
  { value: "rejete", label: "Rejeté", color: "bg-destructive text-destructive-foreground" },
];

export const categoryLabel = (c: Category) => CATEGORIES.find((x) => x.value === c)?.label ?? c;
export const categoryImage = (c: Category) => CATEGORIES.find((x) => x.value === c)?.image ?? dechetsImg;
export const statusInfo = (s: Status) => STATUSES.find((x) => x.value === s)!;