import { useEffect } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet.heat";

interface HeatmapPoint { lat: number; lng: number; intensity: number; }

export function HeatmapLayer({ points }: { points: HeatmapPoint[] }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    // @ts-expect-error leaflet.heat n'a pas de types
    const layer = L.heatLayer(
      points.map((p) => [p.lat, p.lng, p.intensity]),
      {
        radius: 35,
        blur: 25,
        maxZoom: 15,
        max: 5,
        gradient: { 0.2: "#22c55e", 0.4: "#eab308", 0.6: "#f97316", 0.8: "#ef4444", 1.0: "#7f1d1d" },
      }
    ).addTo(map);
    return () => { map.removeLayer(layer); };
  }, [map, points]);
  return null;
}
