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