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
  faces?: Array<[number, number, number, number]>;
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

1. RÈGLE DE FILTRAGE STRICTE :
L'application n'accepte QUE les photos montrant un problème réel d'insalubrité urbaine ou de voirie sur l'espace public (ordures, caniveaux bouchés/débordants, nids-de-poule, eau stagnante sur la voie, entrave à la chaussée, fuite d'eau SODECI).

Si l'image NE MONTRE PAS un problème de ce type — par exemple :
- Un tableau blanc, paperboard ou tableau à feuilles
- Un document, texte, feuille de papier, cahier ou livre
- Un selfie, un portrait ou une personne seule
- Un écran d'ordinateur, de télévision ou de téléphone
- Un intérieur de bureau, salon, chambre ou pièce propre
- Un meuble, objet domestique ou appareil électronique
- Un animal, un plat ou de la nourriture
- Un dessin, mème ou capture d'écran
- Un paysage naturel propre sans aucune insalubrité

Tu DOIS impérativement mettre "is_relevant": false et expliquer clairement pourquoi dans "reason" (en français, par exemple : "Cette image montre un tableau et non un problème d'insalubrité urbaine.").

2. CLASSIFICATION URBAINE :
Si et seulement si l'image montre un problème urbain réel, mets "is_relevant": true et choisis la catégorie la plus adaptée parmi :
- "dechets" : Déchets, ordures, dépotoir sauvage
- "eaux_usees" : Caniveaux ouverts, bouchés, eaux usées débordantes
- "voirie" : Nids-de-poule, route défoncée, affaissement de chaussée
- "eau_stagnante" : Mare ou flaque d'eau croupie importante
- "emprise_chaussee" : Encombrement illégal de la chaussée
- "chantier_ecoulement" : Entrave à l'écoulement des eaux par des gravats/terrassements
- "fuite_sodeci" : Fuite d'eau potable sur canalisations publiques
- "autre" : Autre insalubrité urbaine réelle

3. DÉTECTION STRICTE DES TÊTES / VISAGES (CONFIDENTIALITÉ) :
Détecte UNIQUEMENT la zone de la tête et du visage de chaque personne humaine visible (du sommet de la tête/chapeau jusqu'au menton).
ATTENTION ABSOLUE : N'englobe JAMAIS le cou, le torse, les bras, les jambes ou le corps de la personne ! Uniquement la boîte englobante serrée de la tête/visage.
Pour chaque tête/visage, donne sa boîte englobante serrée [ymin, xmin, ymax, xmax] avec des entiers normalisés de 0 à 1000.
Si aucune personne ou tête n'est visible, renvoie un tableau vide [].

Réponds STRICTEMENT avec un objet JSON respectant ce schéma :
{
  "is_relevant": boolean,
  "reason": string,
  "category": "dechets" | "eaux_usees" | "voirie" | "eau_stagnante" | "emprise_chaussee" | "chantier_ecoulement" | "fuite_sodeci" | "autre",
  "description": "Courte description en français (1 phrase)",
  "confidence": number,
  "faces": [[ymin, xmin, ymax, xmax]]
}`;

const CANDIDATE_MODELS = [
  "gemini-flash-lite-latest",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-flash-latest",
];

      let lastStatus = 0;
      let lastErrorText = "";
      let json: any = null;

      for (const model of CANDIDATE_MODELS) {
        try {
          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
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

          if (res.ok) {
            json = await res.json();
            break;
          }

          lastStatus = res.status;
          lastErrorText = await res.text();
          console.warn(`Model ${model} returned ${res.status}, trying fallback...`);
        } catch (callErr) {
          console.warn(`Model ${model} network error, trying fallback...`, callErr);
        }
      }

      if (!json) {
        console.error("All Gemini models failed:", lastStatus, lastErrorText);
        return {
          is_relevant: true,
          error: `Service IA temporairement indisponible (${lastStatus || 429}).`,
        };
      }

      const rawText = json.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) {
        return { is_relevant: true, error: "Réponse vide de l'IA" };
      }

      const parsed = JSON.parse(rawText) as ClassificationResult;
      if (parsed.category && !VALID_CATEGORIES.includes(parsed.category as any)) {
        parsed.category = "autre";
      }

      if (Array.isArray(parsed.faces)) {
        parsed.faces = parsed.faces.filter(
          (b) =>
            Array.isArray(b) &&
            b.length === 4 &&
            b.every((n) => typeof n === "number" && !isNaN(n))
        );
      } else {
        parsed.faces = [];
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

export type CandidateReportForDuplicate = {
  id: string;
  photo_url: string;
  description: string;
  category: string;
  distance: number;
};

export type DuplicateComparisonResult = {
  is_duplicate: boolean;
  matched_report_id?: string | null;
  similarity_reason?: string;
  confidence?: number;
};

export const compareDuplicateImagesServerFn = createServerFn({ method: "POST" })
  .validator(
    (data: {
      newImageBase64: string;
      newMimeType?: string;
      candidates: CandidateReportForDuplicate[];
    }) => data
  )
  .handler(async ({ data }): Promise<DuplicateComparisonResult> => {
    const { newImageBase64, newMimeType = "image/jpeg", candidates } = data;
    const apiKey =
      process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;

    if (!apiKey || !candidates || candidates.length === 0) {
      return { is_duplicate: false };
    }

    try {
      // Récupérer en base64 jusqu'aux 3 signalements proches ayant une photo
      const topCandidates = candidates.slice(0, 3);
      const fetchedCandidates: Array<{
        meta: CandidateReportForDuplicate;
        base64: string;
        mimeType: string;
      }> = [];

      for (const cand of topCandidates) {
        if (!cand.photo_url) continue;
        try {
          const imgRes = await fetch(cand.photo_url);
          if (!imgRes.ok) continue;
          const contentType = imgRes.headers.get("content-type") || "image/jpeg";
          const arrayBuffer = await imgRes.arrayBuffer();
          const base64 = Buffer.from(arrayBuffer).toString("base64");
          fetchedCandidates.push({
            meta: cand,
            base64,
            mimeType: contentType,
          });
        } catch (e) {
          console.warn("Impossible de charger la photo candidate :", cand.photo_url, e);
        }
      }

      if (fetchedCandidates.length === 0) {
        return { is_duplicate: false };
      }

      const candidateDescriptions = fetchedCandidates
        .map(
          (c, idx) =>
            `- IMAGE CANDIDATE #${idx + 1} (ID: "${c.meta.id}", distance GPS: ${c.meta.distance} mètres, description: "${c.meta.description}")`
        )
        .join("\n");

      const prompt = `Tu es un expert en vision par ordinateur pour l'application citoyenne SalubApp à Abidjan.
Un citoyen vient de prendre une NOUVELLE PHOTO d'un problème d'insalubrité dans son quartier.
Dans la même zone géographique (coordonnées GPS proches), il existe déjà ${fetchedCandidates.length} signalement(s) actif(s) avec photo.

RÈGLE FONDAMENTALE DE DÉTECTION DE DOUBLON :
Ce n'est PAS parce que deux photos ont été prises dans la même zone ou à 30 mètres d'écart que c'est le même signalement ! Dans une même rue, il peut y avoir deux tas d'ordures différents à 30 mètres d'intervalle.
Pour qu'il y ait DOUBLON ("is_duplicate": true), il faut OBLIGATOIREMENT une SIMILITUDE VISUELLE prouvant que la NOUVELLE PHOTO et l'une des IMAGES CANDIDATES montrent le MÊME ENDROIT EXACT et le MÊME PROBLÈME (même prises sous un angle légèrement différent) :
- Mêmes repères visuels environnants : par exemple la même devanture de commerce (ex: une pharmacie, une boutique, un panneau), le même bâtiment, le même mur, le même trottoir ou carrefour reconnaissable.
- Et/ou la même configuration visuelle du problème (le même tas d'ordures au même emplacement précis, le même nid-de-poule, le même caniveau bouché devant le même repère).

Voici la liste des images que je te fournis dans l'ordre :
1. La première image est la NOUVELLE PHOTO prise par le citoyen actuel.
2. Les images suivantes sont les IMAGES CANDIDATES existantes :
${candidateDescriptions}

Compare attentivement la NOUVELLE PHOTO avec chaque IMAGE CANDIDATE.
Si l'une des images candidates montre clairement le même endroit précis et le même problème (similitude des repères visuels/décor + problème), mets "is_duplicate": true, indique son ID exact dans "matched_report_id", et explique en 1 phrase claire en français dans "similarity_reason" quels éléments visuels communs tu as reconnus (ex: "Même tas d'ordures situé devant le même bâtiment / commerce visible en arrière-plan.").
Sinon, si les lieux ou les problèmes semblent distincts malgré la proximité GPS, mets STRICTEMENT "is_duplicate": false.

Réponds UNIQUEMENT en JSON valide selon ce format :
{
  "is_duplicate": boolean,
  "matched_report_id": string | null,
  "similarity_reason": "Explication courte des éléments visuels communs reconnus par l'IA",
  "confidence": number
}`;

      const parts: any[] = [
        { text: prompt },
        { text: "NOUVELLE PHOTO DU CITOYEN :" },
        {
          inline_data: {
            mime_type: newMimeType,
            data: newImageBase64,
          },
        },
      ];

      fetchedCandidates.forEach((c, idx) => {
        parts.push({
          text: `IMAGE CANDIDATE #${idx + 1} (ID: ${c.meta.id}) :`,
        });
        parts.push({
          inline_data: {
            mime_type: c.mimeType,
            data: c.base64,
          },
        });
      });

      const CANDIDATE_MODELS = [
        "gemini-flash-lite-latest",
        "gemini-3.5-flash-lite",
        "gemini-3.1-flash-lite",
        "gemini-3.6-flash",
        "gemini-3.5-flash",
      ];

      let json: any = null;
      for (const model of CANDIDATE_MODELS) {
        try {
          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [{ parts }],
                generationConfig: {
                  response_mime_type: "application/json",
                  temperature: 0.1,
                },
              }),
            }
          );
          if (res.ok) {
            json = await res.json();
            break;
          }
        } catch {
          // continue fallback
        }
      }

      if (!json) {
        return { is_duplicate: false };
      }

      const rawText = json.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) {
        return { is_duplicate: false };
      }

      const parsed = JSON.parse(rawText) as DuplicateComparisonResult;
      return {
        is_duplicate: Boolean(parsed.is_duplicate && parsed.matched_report_id),
        matched_report_id: parsed.matched_report_id ?? null,
        similarity_reason: parsed.similarity_reason,
        confidence: parsed.confidence,
      };
    } catch (err) {
      console.error("Erreur lors de la comparaison visuelle des doublons :", err);
      return { is_duplicate: false };
    }
  });

