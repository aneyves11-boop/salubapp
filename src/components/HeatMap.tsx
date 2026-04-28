import { MapContainer, TileLayer } from "react-leaflet";
import { useMemo } from "react";
import { HeatmapLayer } from "./HeatmapLayer";
import type { Database } from "@/integrations/supabase/types";

type Report = Database["public"]["Tables"]["reports"]["Row"];

export function HeatMap({ reports }: { reports: Report[] }) {
  const center = useMemo<[number, number]>(() => {
    if (!reports.length) return [7.5, -5.5];
    const lat = reports.reduce((s, r) => s + r.latitude, 0) / reports.length;
    const lng = reports.reduce((s, r) => s + r.longitude, 0) / reports.length;
    return [lat, lng];
  }, [reports]);

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
    <MapContainer center={center} zoom={reports.length ? 11 : 5} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
      <TileLayer
        attribution='&copy; OpenStreetMap'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <HeatmapLayer points={points} />
    </MapContainer>
  );
}
