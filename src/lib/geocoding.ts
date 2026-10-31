// Recherche d'adresses, quartiers et repères connus dans le Grand Abidjan
// Combine un répertoire local instantané (communes + sous-quartiers) et l'API OpenStreetMap Nominatim.

import {
  ABIDJAN_BOUNDS,
  detectCommuneFromCoords,
  isInAbidjan,
  type AbidjanCommune,
} from "@/lib/abidjan";

export interface GeocodedPlace {
  id: string;
  label: string;
  sublabel: string;
  commune: AbidjanCommune | null;
  lat: number;
  lng: number;
}

const LOCAL_ABIDJAN_PLACES: Array<{
  label: string;
  commune: AbidjanCommune;
  lat: number;
  lng: number;
  keywords?: string;
}> = [
  // Yopougon
  { label: "Mairie de Yopougon (Place Ficgayo)", commune: "Yopougon", lat: 5.3396, lng: -4.0752, keywords: "ficgayo selmer mairie" },
  { label: "Yopougon Siporex", commune: "Yopougon", lat: 5.3547, lng: -4.0758, keywords: "siporex autoroute" },
  { label: "Yopougon Maroc", commune: "Yopougon", lat: 5.3492, lng: -4.0842, keywords: "maroc carrefour" },
  { label: "Yopougon Niangon Nord", commune: "Yopougon", lat: 5.3318, lng: -4.0985, keywords: "niangon nord" },
  { label: "Yopougon Niangon Sud (À gauche / À droite)", commune: "Yopougon", lat: 5.3175, lng: -4.0968, keywords: "niangon sud base cie" },
  { label: "Yopougon Gesco", commune: "Yopougon", lat: 5.3678, lng: -4.0985, keywords: "gesco manutention" },
  { label: "Yopougon Wassakara", commune: "Yopougon", lat: 5.3361, lng: -4.0631, keywords: "wassakara rue princesse" },
  { label: "Yopougon Toits-Rouges", commune: "Yopougon", lat: 5.3422, lng: -4.0568, keywords: "toits rouges toit rouge" },
  { label: "Yopougon Port-Bouët II", commune: "Yopougon", lat: 5.3468, lng: -4.0908, keywords: "port bouet 2" },
  { label: "Yopougon Ananeraie", commune: "Yopougon", lat: 5.3565, lng: -4.0935, keywords: "ananeraie" },
  { label: "Yopougon Millionnaire / Sicogi", commune: "Yopougon", lat: 5.3385, lng: -4.0825, keywords: "millionnaire sicogi keneya" },
  { label: "Yopougon CHU / Wakouboué", commune: "Yopougon", lat: 5.3522, lng: -4.0684, keywords: "chu wakouboue banco" },
  { label: "Yopougon Kouté / Azito", commune: "Yopougon", lat: 5.3082, lng: -4.0805, keywords: "koute azito village" },

  // Cocody
  { label: "Mairie de Cocody (Hôtel Communal)", commune: "Cocody", lat: 5.3478, lng: -3.9985, keywords: "hotel communal cocody centre" },
  { label: "Cocody Angré Château", commune: "Cocody", lat: 5.4025, lng: -3.9875, keywords: "angre chateau fin goudron" },
  { label: "Cocody Angré 7e / 8e Tranche", commune: "Cocody", lat: 5.3885, lng: -3.9822, keywords: "angre 7eme 8eme tranche djibi" },
  { label: "Cocody Deux-Plateaux (Vallon / Aghien)", commune: "Cocody", lat: 5.3688, lng: -3.9942, keywords: "2 plateaux deux plateaux vallon sococe" },
  { label: "Cocody Riviera 2", commune: "Cocody", lat: 5.3525, lng: -3.9722, keywords: "riviera 2 sainte famille" },
  { label: "Cocody Riviera 3 / Bonoumin", commune: "Cocody", lat: 5.3595, lng: -3.9565, keywords: "riviera 3 bonoumin cap nord" },
  { label: "Cocody Riviera Palmeraie", commune: "Cocody", lat: 5.3712, lng: -3.9515, keywords: "palmeraie rosiers" },
  { label: "Cocody Riviera Faya / Abatta", commune: "Cocody", lat: 5.3662, lng: -3.9325, keywords: "faya abatta akouedo" },
  { label: "Cocody Saint-Jean / Université FHB", commune: "Cocody", lat: 5.3456, lng: -3.9905, keywords: "saint jean universite campus" },
  { label: "Cocody Blockhauss", commune: "Cocody", lat: 5.3315, lng: -3.9965, keywords: "blockhauss" },

  // Bingerville
  { label: "Mairie de Bingerville (Centre-ville)", commune: "Bingerville", lat: 5.3558, lng: -3.8852, keywords: "bingerville centre mairie" },
  { label: "Bingerville Akandjé", commune: "Bingerville", lat: 5.3715, lng: -3.9085, keywords: "akandje" },
  { label: "Bingerville Feh Kessé / Cité Synergie", commune: "Bingerville", lat: 5.3682, lng: -3.8965, keywords: "feh kesse synergie" },
  { label: "Bingerville Jardin Botanique / Gbagba", commune: "Bingerville", lat: 5.3612, lng: -3.8785, keywords: "jardin botanique gbagba" },

  // Autres communes du Grand Abidjan
  { label: "Abobo Mairie / Rond-Point", commune: "Abobo", lat: 5.4185, lng: -4.0195, keywords: "abobo gare mairie samanke" },
  { label: "Abobo Dokui / Plateau Dokui", commune: "Abobo", lat: 5.3985, lng: -4.0065, keywords: "dokui zoo" },
  { label: "Abobo PK18 / N'Dotré", commune: "Abobo", lat: 5.4515, lng: -4.0365, keywords: "pk18 ndotre avocatier" },
  { label: "Adjamé Liberté / Forum / Gare Nord", commune: "Adjamé", lat: 5.3585, lng: -4.0215, keywords: "adjame liberte forum 220 logements" },
  { label: "Plateau Centre Administratif", commune: "Plateau", lat: 5.3258, lng: -4.0202, keywords: "plateau cite administrative" },
  { label: "Treichville Marché / Belleville", commune: "Treichville", lat: 5.3032, lng: -4.0082, keywords: "treichville gare bassam" },
  { label: "Marcory Zone 4 / Grand Marché", commune: "Marcory", lat: 5.3048, lng: -3.9808, keywords: "marcory zone 4 anoumabo remblais" },
  { label: "Koumassi Grand Carrefour / Remblais", commune: "Koumassi", lat: 5.2982, lng: -3.9502, keywords: "koumassi grand carrefour sicogi" },
  { label: "Port-Bouët Vridi / Gonzagueville / Aéroport", commune: "Port-Bouët", lat: 5.2572, lng: -3.9262, keywords: "port bouet gonzagueville vridi adjouffou" },
  { label: "Attécoubé Centre / Agban", commune: "Attécoubé", lat: 5.3442, lng: -4.0352, keywords: "attecoube locodjro mossikro" },
  { label: "Anyama Centre / Gare", commune: "Anyama", lat: 5.4948, lng: -4.0518, keywords: "anyama ebimpe" },
  { label: "Songon Kassemblé / Agban", commune: "Songon", lat: 5.3202, lng: -4.1795, keywords: "songon km17" },
];

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function searchLocalAbidjanPlaces(query: string): GeocodedPlace[] {
  const q = norm(query);
  if (!q) {
    return LOCAL_ABIDJAN_PLACES.slice(0, 6).map((p, idx) => ({
      id: `local-${idx}`,
      label: p.label,
      sublabel: `${p.commune}, Abidjan`,
      commune: p.commune,
      lat: p.lat,
      lng: p.lng,
    }));
  }

  const tokens = q.split(/\s+/).filter(Boolean);
  const scored: Array<{ place: (typeof LOCAL_ABIDJAN_PLACES)[number]; score: number; idx: number }> = [];

  LOCAL_ABIDJAN_PLACES.forEach((p, idx) => {
    const hay = norm(`${p.label} ${p.commune} ${p.keywords ?? ""}`);
    const allMatch = tokens.every((t) => hay.includes(t));
    if (!allMatch) return;
    const starts = norm(p.label).startsWith(q) || norm(p.commune).startsWith(q) ? 2 : 1;
    scored.push({ place: p, score: starts, idx });
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(({ place, idx }) => ({
      id: `local-${idx}`,
      label: place.label,
      sublabel: `${place.commune}, Grand Abidjan`,
      commune: place.commune,
      lat: place.lat,
      lng: place.lng,
    }));
}

interface NominatimItem {
  place_id: number;
  lat: string;
  lon: string;
  name?: string;
  display_name: string;
}

export async function searchAbidjanAddresses(
  query: string,
  signal?: AbortSignal
): Promise<GeocodedPlace[]> {
  const localMatches = searchLocalAbidjanPlaces(query);
  const trimmed = query.trim();
  if (trimmed.length < 2) return localMatches;

  try {
    const viewbox = `${ABIDJAN_BOUNDS.minLng},${ABIDJAN_BOUNDS.maxLat},${ABIDJAN_BOUNDS.maxLng},${ABIDJAN_BOUNDS.minLat}`;
    const qParam = norm(trimmed).includes("abidjan") ? trimmed : `${trimmed}, Abidjan`;
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(
      qParam
    )}&countrycodes=ci&viewbox=${viewbox}&bounded=1&limit=6&accept-language=fr`;

    const res = await fetch(url, {
      signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return localMatches;

    const items = (await res.json()) as NominatimItem[];
    const remoteMatches: GeocodedPlace[] = [];

    for (const item of items) {
      const lat = parseFloat(item.lat);
      const lng = parseFloat(item.lon);
      if (!isInAbidjan(lat, lng)) continue;

      const commune = detectCommuneFromCoords(lat, lng);
      const parts = item.display_name.split(",").map((s) => s.trim());
      const mainLabel = item.name?.trim() || parts[0] || trimmed;
      const sub = parts.slice(1, 3).join(", ") || (commune ? `${commune}, Abidjan` : "Abidjan");

      const dup = localMatches.some(
        (l) => Math.abs(l.lat - lat) < 0.002 && Math.abs(l.lng - lng) < 0.002
      );
      if (!dup) {
        remoteMatches.push({
          id: `osm-${item.place_id}`,
          label: mainLabel,
          sublabel: commune && !norm(sub).includes(norm(commune)) ? `${commune} · ${sub}` : sub,
          commune,
          lat,
          lng,
        });
      }
    }

    return [...localMatches, ...remoteMatches].slice(0, 7);
  } catch {
    return localMatches;
  }
}
