// Edge function : classification d'image pour SalubApp
// Utilise Lovable AI Gateway (Gemini multimodal) pour suggérer catégorie + description.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CATEGORIES = [
  { value: "dechets", label: "Déchets / ordures" },
  { value: "eaux_usees", label: "Caniveaux ouverts / bouchés" },
  { value: "voirie", label: "Voirie / nids-de-poule" },
  { value: "eau_stagnante", label: "Eau stagnante" },
  { value: "chantier_peril", label: "Nuisance / péril imminent (chantier)" },
  { value: "chantier_signalisation", label: "Absence de signalisation de chantier" },
  { value: "emprise_chaussee", label: "Emprise illicite sur la chaussée" },
  { value: "chantier_ecoulement", label: "Entrave à l'écoulement des eaux (chantier)" },
  { value: "fuite_sodeci", label: "Fuite d'eau (tuyaux SODECI)" },
  { value: "autre", label: "Autre" },
] as const;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // 🔐 Authentification obligatoire : seuls les utilisateurs connectés peuvent appeler l'IA.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Authentification requise" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supa = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: authErr } = await supa.auth.getUser();
    if (authErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Session invalide" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { imageBase64, mimeType } = await req.json();
    if (!imageBase64) {
      return new Response(JSON.stringify({ error: "imageBase64 manquant" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY non configuré");

    const dataUrl = `data:${mimeType || "image/jpeg"};base64,${imageBase64}`;
    const allowedValues = CATEGORIES.map((c) => c.value).join(", ");
    const labelMap = CATEGORIES.map((c) => `${c.value} = ${c.label}`).join(" | ");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `Tu es un expert en salubrité urbaine et voirie à Abidjan. Tu analyses UNIQUEMENT des photos liées à : insalubrité urbaine (déchets, eaux usées, eau stagnante), voirie (nids-de-poule), problèmes de chantiers urbains (signalisation manquante, péril, emprise sur la chaussée, entrave à l'écoulement), et fuites de canalisations d'eau publique (SODECI).

Si l'image NE MONTRE PAS un problème urbain de ce type (par exemple : photo d'appareil électronique, selfie, animal de compagnie, intérieur de maison, écran, document, capture d'écran, dessin, paysage naturel sans problème, nourriture, etc.), tu dois mettre is_relevant=false avec un message d'explication court. Sinon is_relevant=true.

Réponds UNIQUEMENT en français. Catégories disponibles : ${labelMap}.`,
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Analyse cette photo et propose une classification." },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "classify_report",
              description: "Classifie un signalement d'insalubrité",
              parameters: {
                type: "object",
                properties: {
                  is_relevant: { type: "boolean", description: "true si l'image montre un problème d'insalubrité urbaine ou de voirie/chantier à Abidjan, false sinon" },
                  reason: { type: "string", description: "Si is_relevant=false, courte raison du rejet en français" },
                  category: { type: "string", enum: CATEGORIES.map((c) => c.value), description: `Une parmi : ${allowedValues}` },
                  description: { type: "string", description: "Description courte (1-2 phrases) en français du problème observé" },
                  confidence: { type: "number", description: "Confiance entre 0 et 1" },
                },
                required: ["is_relevant", "category", "description", "confidence"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "classify_report" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Trop de requêtes, réessayez dans un instant." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Crédits IA épuisés. Ajoutez des crédits dans votre workspace Lovable." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "Service IA indisponible" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      return new Response(JSON.stringify({ error: "Aucune classification retournée" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const args = JSON.parse(toolCall.function.arguments);
    return new Response(JSON.stringify(args), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("classify-image error:", e);
    return new Response(JSON.stringify({ error: "Service IA indisponible" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
