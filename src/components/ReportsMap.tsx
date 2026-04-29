import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import { categoryLabel, statusInfo } from "@/lib/categories";
import type { Database } from "@/integrations/supabase/types";
import { ABIDJAN_CENTER, ABIDJAN_DEFAULT_ZOOM, ABIDJAN_LEAFLET_BOUNDS } from "@/lib/abidjan";

type Report = Database["public"]["Tables"]["reports"]["Row"];

function categoryMarker(label: string) {
  const letter = label.charAt(0).toUpperCase();
  return L.divIcon({
    className: "salub-marker",
    html: `<div style="background:#1e40af;border-radius:9999px;width:34px;height:34px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.25);font-size:14px;font-weight:600;color:white;">${letter}</div>`,
    iconSize: [34, 34], iconAnchor: [17, 17],
  });
}

export function ReportsMap({ reports }: { reports: Report[] }) {
  return (
    <MapContainer
      center={ABIDJAN_CENTER}
      zoom={ABIDJAN_DEFAULT_ZOOM}
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
      {reports.map((r) => (
        <Marker key={r.id} position={[r.latitude, r.longitude]} icon={categoryMarker(categoryLabel(r.category))}>
          <Popup>
            <div className="space-y-1">
              <div className="font-semibold">{categoryLabel(r.category)}</div>
              <div className="text-xs">{r.description}</div>
              <div className="text-[10px] uppercase opacity-70">{statusInfo(r.status).label} • {r.votes_count} votes</div>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}