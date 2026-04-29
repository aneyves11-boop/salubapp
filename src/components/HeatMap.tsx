import { MapContainer, TileLayer, Rectangle } from "react-leaflet";
import { useMemo } from "react";
import { HeatmapLayer } from "./HeatmapLayer";
import type { Database } from "@/integrations/supabase/types";
import { ABIDJAN_CENTER, ABIDJAN_DEFAULT_ZOOM, ABIDJAN_LEAFLET_BOUNDS } from "@/lib/abidjan";

type Report = Database["public"]["Tables"]["reports"]["Row"];

export function HeatMap({ reports }: { reports: Report[] }) {
  const points = useMemo(
    () => reports.map((r) => ({
      lat: r.latitude,
      lng: r.longitude,
      // intensité = 1 + nombre de votes (plus voté = plus chaud)
      intensity: Math.min(5, 1 + (r.votes_count ?? 0) * 0.5),
    })),
    [reports]
  );

  return (
    <MapContainer
      center={ABIDJAN_CENTER}
      zoom={ABIDJAN_DEFAULT_ZOOM}
      minZoom={10}
      maxZoom={18}
      maxBounds={ABIDJAN_LEAFLET_BOUNDS}
      maxBoundsViscosity={1}
      style={{ height: "100%", width: "100%" }}
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; OpenStreetMap'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Rectangle bounds={ABIDJAN_LEAFLET_BOUNDS} pathOptions={{ color: "#f97316", weight: 2, fill: false, dashArray: "6 6" }} />
      <HeatmapLayer points={points} />
    </MapContainer>
  );
}
