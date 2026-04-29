import type { Database } from "@/integrations/supabase/types";

export type Category = Database["public"]["Enums"]["report_category"];
export type Status = Database["public"]["Enums"]["report_status"];

// ✏️ ÉDITION DES CATÉGORIES
// - Renommer un libellé : modifiez simplement le `label` ci-dessous.
// - Ajouter / supprimer une catégorie : nécessite une migration de l'enum
//   `report_category` en base de données. Demandez-le et je m'en occupe.
// - Réordonner : changez l'ordre des entrées du tableau.
export const CATEGORIES: { value: Category; label: string }[] = [
  { value: "dechets", label: "Déchets / ordures" },
  { value: "eaux_usees", label: "Caniveaux ouverts / bouchés" },
  { value: "voirie", label: "Voirie / nids-de-poule" },
  { value: "marche", label: "Marché insalubre" },
  { value: "eau_stagnante", label: "Eau stagnante" },
  { value: "autre", label: "Autre" },
];

export const STATUSES: { value: Status; label: string; color: string }[] = [
  { value: "nouveau", label: "Nouveau", color: "bg-accent text-accent-foreground" },
  { value: "en_cours", label: "En cours", color: "bg-primary text-primary-foreground" },
  { value: "resolu", label: "Résolu", color: "bg-emerald-600 text-white" },
  { value: "rejete", label: "Rejeté", color: "bg-destructive text-destructive-foreground" },
];

export const categoryLabel = (c: Category) => CATEGORIES.find((x) => x.value === c)?.label ?? c;
export const statusInfo = (s: Status) => STATUSES.find((x) => x.value === s)!;