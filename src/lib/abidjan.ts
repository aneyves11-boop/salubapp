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