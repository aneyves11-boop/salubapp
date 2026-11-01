import { MapContainer, TileLayer, Rectangle, useMap } from "react-leaflet";
import { useEffect, useMemo } from "react";
import { HeatmapLayer } from "./HeatmapLayer";
import type { Database } from "@/integrations/supabase/types";
import {
  ABIDJAN_CENTER,
  ABIDJAN_DEFAULT_ZOOM,
  ABIDJAN_LEAFLET_BOUNDS,
  getCommuneCenter,
} from "@/lib/abidjan";

type Report = Database["public"]["Tables"]["reports"]["Row"];

function HeatMapCommuneFocus({ focusCommune }: { focusCommune?: string | null }) {
  const map = useMap();

  useEffect(() => {
    const center = getCommuneCenter(focusCommune);
    if (center) {
      map.setView(center, 13, { animate: true });
    } else if (focusCommune === "") {
      map.setView(ABIDJAN_CENTER, ABIDJAN_DEFAULT_ZOOM, { animate: true });
    }
  }, [focusCommune, map]);

  return null;
}

export function HeatMap({
  reports,
  focusCommune,
}: {
  reports: Report[];
  focusCommune?: string | null;
}) {
  const points = useMemo(
    () =>
      reports.map((r) => ({
        lat: r.latitude,
        lng: r.longitude,
        // intensité = 1 + nombre de votes (plus voté = plus chaud)
        intensity: Math.min(5, 1 + (r.votes_count ?? 0) * 0.5),
      })),
    [reports]
  );

  const initialCenter = getCommuneCenter(focusCommune) ?? ABIDJAN_CENTER;
  const initialZoom = focusCommune && getCommuneCenter(focusCommune) ? 13 : ABIDJAN_DEFAULT_ZOOM;

  return (
    <MapContainer
      center={initialCenter}
      zoom={initialZoom}
      minZoom={10}
      maxZoom={18}
      maxBounds={ABIDJAN_LEAFLET_BOUNDS}
      maxBoundsViscosity={1}
      style={{ height: "100%", width: "100%" }}
      scrollWheelZoom
    >
      <HeatMapCommuneFocus focusCommune={focusCommune} />
      <TileLayer
        attribution="&copy; OpenStreetMap"
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Rectangle
        bounds={ABIDJAN_LEAFLET_BOUNDS}
        pathOptions={{ color: "#f97316", weight: 2, fill: false, dashArray: "6 6" }}
      />
      <HeatmapLayer points={points} />
    </MapContainer>
  );
}
