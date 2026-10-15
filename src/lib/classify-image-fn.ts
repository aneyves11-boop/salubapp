import { createServerFn } from "@tanstack/react-start";
import type { Category } from "./categories";

const VALID_CATEGORIES = [
  "dechets",
  "eaux_usees",
  "voirie",
  "eau_stagnante",
  "emprise_chaussee",
  "chantier_ecoulement",
  "fuite_sodeci",
  "autre",
] as const;

export type ClassificationResult = {
  is_relevant: boolean;
  reason?: string;
  category?: Category;
  description?: string;
  confidence?: number;
  error?: string;
};

export const classifyImageServerFn = createServerFn({ method: "POST" })
  .validator((data: { imageBase64: string; mimeType?: string }) => data)
  .handler(async ({ data }): Promise<ClassificationResult> => {
    const { imageBase64, mimeType = "image/jpeg" } = data;
    const apiKey =
      process.env.GEMINI_API_KEY ||
      process.env.VITE_GEMINI_API_KEY;

    if (!apiKey) {
      return {
        is_relevant: true,
        error:
          "Clé GEMINI_API_KEY non configurée sur le serveur. Veuillez ajouter GEMINI_API_KEY dans les variables d'environnement Vercel (ou votre fichier .env).",
      };
    }

    try {
      const prompt = `Tu es un expert strict en salubrité urbaine, assainissement et voirie à Abidjan (Côte d'Ivoire).
Tu analyses une photo envoyée par un citoyen sur l'application citoyenne SalubApp.

RÈGLE DE FILTRAGE STRICTE :
L'application n'accepte QUE les photos montrant un problème réel d'insalubrité urbaine ou de voirie sur l'espace public (ordures, caniveaux bouchés/débordants, nids-de-poule, eau stagnante sur la voie, entrave à la chaussée, fuite d'eau SODECI).

Si l'image NE MONTRE PAS un problème de ce type — par exemple :
- Un tableau blanc, paperboard ou tableau à feuilles
- Un document, texte, feuille de papier, cahier ou livre
- Un selfie, un portrait ou une personne
- Un écran d'ordinateur, de télévision ou de téléphone
- Un intérieur de bureau, salon, chambre ou pièce propre
- Un meuble, objet domestique ou appareil électronique
- Un animal, un plat ou de la nourriture
- Un dessin, mème ou capture d'écran
- Un paysage naturel propre sans aucune insalubrité

Tu DOIS impérativement mettre "is_relevant": false et expliquer clairement pourquoi dans "reason" (en français, par exemple : "Cette image montre un tableau et non un problème d'insalubrité urbaine.").

Si et seulement si l'image montre un problème urbain réel, mets "is_relevant": true et choisis la catégorie la plus adaptée parmi :
- "dechets" : Déchets, ordures, dépotoir sauvage
- "eaux_usees" : Caniveaux ouverts, bouchés, eaux usées débordantes
- "voirie" : Nids-de-poule, route défoncée, affaissement de chaussée
- "eau_stagnante" : Mare ou flaque d'eau croupie importante
- "emprise_chaussee" : Encombrement illégal de la chaussée
- "chantier_ecoulement" : Entrave à l'écoulement des eaux par des gravats/terrassements
- "fuite_sodeci" : Fuite d'eau potable sur canalisations publiques
- "autre" : Autre insalubrité urbaine réelle

Réponds STRICTEMENT avec un objet JSON respectant ce schéma :
{
  "is_relevant": boolean,
  "reason": string,
  "category": "dechets" | "eaux_usees" | "voirie" | "eau_stagnante" | "emprise_chaussee" | "chantier_ecoulement" | "fuite_sodeci" | "autre",
  "description": "Courte description en français (1 phrase)",
  "confidence": number
}`;

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: prompt },
                  {
                    inline_data: {
                      mime_type: mimeType,
                      data: imageBase64,
                    },
                  },
                ],
              },
            ],
            generationConfig: {
              response_mime_type: "application/json",
              temperature: 0.1,
            },
          }),
        }
      );

      if (!res.ok) {
        const errorText = await res.text();
        console.error("Gemini API error:", res.status, errorText);
        return {
          is_relevant: true,
          error: `Erreur API Gemini (${res.status}). Vérifiez le quota de votre clé.`,
        };
      }

      const json = await res.json();
      const rawText = json.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) {
        return { is_relevant: true, error: "Réponse vide de l'IA" };
      }

      const parsed = JSON.parse(rawText) as ClassificationResult;
      if (parsed.category && !VALID_CATEGORIES.includes(parsed.category as any)) {
        parsed.category = "autre";
      }

      return parsed;
    } catch (err) {
      console.error("Classification error:", err);
      return {
        is_relevant: true,
        error: "Erreur lors de l'analyse de l'image.",
      };
    }
  });
