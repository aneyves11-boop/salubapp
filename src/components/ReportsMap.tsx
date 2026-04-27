import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import { useMemo } from "react";
import { categoryEmoji, categoryLabel, statusInfo } from "@/lib/categories";
import type { Database } from "@/integrations/supabase/types";

type Report = Database["public"]["Tables"]["reports"]["Row"];

function emojiIcon(emoji: string) {
  return L.divIcon({
    className: "salub-marker",
    html: `<div style="background:white;border:2px solid hsl(var(--ring));border-radius:9999px;width:34px;height:34px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.25);font-size:18px;">${emoji}</div>`,
    iconSize: [34, 34], iconAnchor: [17, 17],
  });
}

export function ReportsMap({ reports }: { reports: Report[] }) {
  const center = useMemo<[number, number]>(() => {
    if (reports.length === 0) return [7.5, -5.5]; // centre Afrique de l'Ouest par défaut
    const lat = reports.reduce((s, r) => s + r.latitude, 0) / reports.length;
    const lng = reports.reduce((s, r) => s + r.longitude, 0) / reports.length;
    return [lat, lng];
  }, [reports]);

  return (
    <MapContainer center={center} zoom={reports.length ? 12 : 5} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {reports.map((r) => (
        <Marker key={r.id} position={[r.latitude, r.longitude]} icon={emojiIcon(categoryEmoji(r.category))}>
          <Popup>
            <div className="space-y-1">
              <div className="font-semibold">{categoryEmoji(r.category)} {categoryLabel(r.category)}</div>
              <div className="text-xs">{r.description}</div>
              <div className="text-[10px] uppercase opacity-70">{statusInfo(r.status).label} • {r.votes_count} votes</div>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}