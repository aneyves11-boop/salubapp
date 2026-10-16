// Périmètre géographique d'Abidjan (boîte englobante large couvrant
// toutes les communes : Abobo, Adjamé, Anyama, Attécoubé, Bingerville,
// Cocody, Koumassi, Marcory, Plateau, Port-Bouët, Songon, Treichville, Yopougon).
export const ABIDJAN_BOUNDS = {
  minLat: 5.20,
  maxLat: 5.55,
  minLng: -4.20,
  maxLng: -3.78,
};

export const ABIDJAN_CENTER: [number, number] = [5.345, -4.024];
export const ABIDJAN_DEFAULT_ZOOM = 11;

export function isInAbidjan(lat: number, lng: number): boolean {
  return (
    lat >= ABIDJAN_BOUNDS.minLat &&
    lat <= ABIDJAN_BOUNDS.maxLat &&
    lng >= ABIDJAN_BOUNDS.minLng &&
    lng <= ABIDJAN_BOUNDS.maxLng
  );
}

// Bounds au format Leaflet [[southWest], [northEast]]
export const ABIDJAN_LEAFLET_BOUNDS: [[number, number], [number, number]] = [
  [ABIDJAN_BOUNDS.minLat, ABIDJAN_BOUNDS.minLng],
  [ABIDJAN_BOUNDS.maxLat, ABIDJAN_BOUNDS.maxLng],
];

/** Calcule la distance en mètres entre deux points GPS (Formule de Haversine) */
export function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3; // Rayon moyen de la Terre en mètres
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const deltaPhi = toRad(lat2 - lat1);
  const deltaLambda = toRad(lon2 - lon1);

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) *
    Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/** Formate une distance en mètres de façon lisible ("350 m", "1.4 km") */
export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(1)} km`;
}

export const ABIDJAN_COMMUNES = [
  "Abobo",
  "Adjamé",
  "Anyama",
  "Attécoubé",
  "Bingerville",
  "Cocody",
  "Koumassi",
  "Marcory",
  "Plateau",
  "Port-Bouët",
  "Songon",
  "Treichville",
  "Yopougon",
] as const;

export type AbidjanCommune = (typeof ABIDJAN_COMMUNES)[number];

const COMMUNE_ZONES: Array<{
  name: AbidjanCommune;
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  center: [number, number];
}> = [
  { name: "Anyama", minLat: 5.47, maxLat: 5.56, minLng: -4.10, maxLng: -3.98, center: [5.495, -4.052] },
  { name: "Abobo", minLat: 5.40, maxLat: 5.47, minLng: -4.06, maxLng: -3.97, center: [5.426, -4.015] },
  { name: "Songon", minLat: 5.25, maxLat: 5.42, minLng: -4.25, maxLng: -4.12, center: [5.320, -4.180] },
  { name: "Yopougon", minLat: 5.30, maxLat: 5.42, minLng: -4.12, maxLng: -4.045, center: [5.348, -4.076] },
  { name: "Attécoubé", minLat: 5.32, maxLat: 5.39, minLng: -4.045, maxLng: -4.025, center: [5.344, -4.035] },
  { name: "Adjamé", minLat: 5.345, maxLat: 5.40, minLng: -4.030, maxLng: -4.008, center: [5.360, -4.021] },
  { name: "Plateau", minLat: 5.315, maxLat: 5.345, minLng: -4.030, maxLng: -4.008, center: [5.326, -4.020] },
  { name: "Cocody", minLat: 5.325, maxLat: 5.42, minLng: -4.008, maxLng: -3.930, center: [5.360, -3.975] },
  { name: "Bingerville", minLat: 5.32, maxLat: 5.43, minLng: -3.930, maxLng: -3.78, center: [5.356, -3.885] },
  { name: "Treichville", minLat: 5.288, maxLat: 5.315, minLng: -4.025, maxLng: -3.995, center: [5.303, -4.008] },
  { name: "Marcory", minLat: 5.288, maxLat: 5.320, minLng: -3.995, maxLng: -3.965, center: [5.305, -3.980] },
  { name: "Koumassi", minLat: 5.285, maxLat: 5.320, minLng: -3.965, maxLng: -3.925, center: [5.298, -3.950] },
  { name: "Port-Bouët", minLat: 5.20, maxLat: 5.288, minLng: -4.05, maxLng: -3.78, center: [5.257, -3.926] },
];

/**
 * Détermine automatiquement la commune d'Abidjan à partir des coordonnées GPS
 * envoyées avec l'image du signalement.
 */
export function detectCommuneFromCoords(
  lat?: number | null,
  lng?: number | null
): AbidjanCommune | null {
  if (typeof lat !== "number" || typeof lng !== "number" || isNaN(lat) || isNaN(lng)) {
    return null;
  }
  if (!isInAbidjan(lat, lng)) return null;

  // 1. Vérification dans les boîtes englobantes des communes
  for (const zone of COMMUNE_ZONES) {
    if (
      lat >= zone.minLat &&
      lat <= zone.maxLat &&
      lng >= zone.minLng &&
      lng <= zone.maxLng
    ) {
      return zone.name;
    }
  }

  // 2. Fallback : commune dont le centre est le plus proche
  let closest: AbidjanCommune = "Cocody";
  let minDist = Infinity;
  for (const zone of COMMUNE_ZONES) {
    const d = calculateDistanceMeters(lat, lng, zone.center[0], zone.center[1]);
    if (d < minDist) {
      minDist = d;
      closest = zone.name;
    }
  }
  return closest;
}