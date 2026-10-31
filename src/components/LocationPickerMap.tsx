import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from "react-leaflet";
import L from "leaflet";
import {
  ABIDJAN_CENTER,
  ABIDJAN_LEAFLET_BOUNDS,
  detectCommuneFromCoords,
  isInAbidjan,
  type AbidjanCommune,
} from "@/lib/abidjan";

const COMMUNE_QUICK_CENTERS: Array<{ name: AbidjanCommune; center: [number, number] }> = [
  { name: "Yopougon", center: [5.348, -4.076] },
  { name: "Cocody", center: [5.360, -3.975] },
  { name: "Bingerville", center: [5.356, -3.885] },
  { name: "Abobo", center: [5.426, -4.015] },
  { name: "Adjamé", center: [5.360, -4.021] },
  { name: "Marcory", center: [5.305, -3.980] },
  { name: "Koumassi", center: [5.298, -3.950] },
  { name: "Treichville", center: [5.303, -4.008] },
  { name: "Port-Bouët", center: [5.257, -3.926] },
  { name: "Plateau", center: [5.326, -4.020] },
  { name: "Attécoubé", center: [5.344, -4.035] },
  { name: "Anyama", center: [5.495, -4.052] },
  { name: "Songon", center: [5.320, -4.180] },
];

let cachedPickerPinIcon: L.DivIcon | null = null;
function getPickerPinIcon(): L.DivIcon {
  if (!cachedPickerPinIcon) {
    cachedPickerPinIcon = L.divIcon({
      className: "salub-location-picker-pin",
      html: `<div style="position:relative;width:36px;height:36px;display:flex;align-items:center;justify-content:center;">
        <div style="
          width:30px;height:30px;border-radius:9999px 9999px 9999px 0;
          background:#059669;border:3px solid #ffffff;
          transform:rotate(-45deg);
          box-shadow:0 3px 10px rgba(0,0,0,0.35);
          display:flex;align-items:center;justify-content:center;
        ">
          <div style="width:8px;height:8px;border-radius:9999px;background:#ffffff;"></div>
        </div>
      </div>`,
      iconSize: [36, 36],
      iconAnchor: [18, 34],
    });
  }
  return cachedPickerPinIcon;
}

function MapClickHandler({
  onPick,
}: {
  onPick: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(e: L.LeafletMouseEvent) {
      if (isInAbidjan(e.latlng.lat, e.latlng.lng)) {
        onPick(e.latlng.lat, e.latlng.lng);
      }
    },
  });
  return null;
}

function MapFlyTo({ coords }: { coords: { lat: number; lng: number } | null }) {
  const map = useMap();
  useEffect(() => {
    if (coords && isInAbidjan(coords.lat, coords.lng)) {
      const targetZoom = Math.max(map.getZoom(), 14);
      map.setView([coords.lat, coords.lng], targetZoom, { animate: true });
    }
  }, [coords?.lat, coords?.lng, map]);
  return null;
}

export function LocationPickerMap({
  coords,
  onSelectLocation,
}: {
  coords: { lat: number; lng: number } | null;
  onSelectLocation: (lat: number, lng: number, commune: AbidjanCommune | null) => void;
}) {
  const activeCommune = coords ? detectCommuneFromCoords(coords.lat, coords.lng) : null;

  const handlePick = (lat: number, lng: number) => {
    if (!isInAbidjan(lat, lng)) return;
    onSelectLocation(lat, lng, detectCommuneFromCoords(lat, lng));
  };

  return (
    <div className="space-y-2.5">
      <div>
        <div className="mb-1.5 text-[11px] font-medium text-muted-foreground">
          Accès rapide par commune (puis touchez l'endroit exact sur la carte) :
        </div>
        <div className="flex flex-wrap gap-1">
          {COMMUNE_QUICK_CENTERS.map((c) => {
            const selected = activeCommune === c.name;
            return (
              <button
                key={c.name}
                type="button"
                onClick={() => handlePick(c.center[0], c.center[1])}
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition ${
                  selected
                    ? "bg-emerald-700 text-white"
                    : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                }`}
              >
                {c.name}
              </button>
            );
          })}
        </div>
      </div>

      <div className="h-64 w-full overflow-hidden rounded-xl border border-border bg-muted">
        <MapContainer
          center={coords ? [coords.lat, coords.lng] : ABIDJAN_CENTER}
          zoom={coords ? 15 : 12}
          minZoom={10}
          maxBounds={ABIDJAN_LEAFLET_BOUNDS}
          maxBoundsViscosity={1}
          style={{ height: "100%", width: "100%" }}
          scrollWheelZoom
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapClickHandler onPick={handlePick} />
          <MapFlyTo coords={coords} />
          {coords && (
            <Marker
              position={[coords.lat, coords.lng]}
              icon={getPickerPinIcon()}
              draggable
              eventHandlers={{
                dragend(e: L.LeafletEvent) {
                  const marker = e.target as L.Marker;
                  const pos = marker.getLatLng();
                  handlePick(pos.lat, pos.lng);
                },
              }}
            />
          )}
        </MapContainer>
      </div>

      <p className="text-[11px] text-muted-foreground">
        👆 Touchez directement la carte ou faites glisser le marqueur vert jusqu'à l'emplacement précis du problème.
      </p>
    </div>
  );
}
