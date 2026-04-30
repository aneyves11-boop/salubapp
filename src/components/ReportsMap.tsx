import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import { categoryImage, categoryLabel, statusInfo, type Category } from "@/lib/categories";
import type { Database } from "@/integrations/supabase/types";
import { ABIDJAN_CENTER, ABIDJAN_DEFAULT_ZOOM, ABIDJAN_LEAFLET_BOUNDS } from "@/lib/abidjan";

type Report = Database["public"]["Tables"]["reports"]["Row"];

// Marker construit à partir de l'image du signalement (photo réelle si présente,
// sinon illustration par défaut de la catégorie). Vignette ronde + petit liseré coloré.
function photoMarker(src: string, isReal: boolean) {
  const ring = isReal ? "#16a34a" : "#1e40af"; // vert = vraie photo, bleu = illustration
  return L.divIcon({
    className: "salub-photo-marker",
    html: `<div style="
        width:44px;height:44px;border-radius:9999px;
        border:3px solid ${ring};
        background:#fff center/cover no-repeat url('${src}');
        box-shadow:0 2px 8px rgba(0,0,0,.35);
      "></div>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
    popupAnchor: [0, -22],
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
      {reports.map((r) => {
        const fallback = categoryImage(r.category as Category);
        const src = r.photo_url || fallback;
        const isReal = !!r.photo_url;
        return (
          <Marker key={r.id} position={[r.latitude, r.longitude]} icon={photoMarker(src, isReal)}>
            <Popup>
              <div className="w-48 space-y-1">
                <img src={src} alt={categoryLabel(r.category)} className="h-24 w-full rounded-md object-cover" />
                <div className="font-semibold">{categoryLabel(r.category)}</div>
                <div className="text-xs">{r.description}</div>
                <div className="text-[10px] uppercase opacity-70">
                  {statusInfo(r.status).label} • {r.votes_count} votes
                  {!isReal && " • illustration"}
                </div>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}