import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import { categoryImage, categoryLabel, statusInfo, type Category, type Status } from "@/lib/categories";
import type { Database } from "@/integrations/supabase/types";
import { ABIDJAN_CENTER, ABIDJAN_DEFAULT_ZOOM, ABIDJAN_LEAFLET_BOUNDS, detectCommuneFromCoords } from "@/lib/abidjan";

type Report = Database["public"]["Tables"]["reports"]["Row"];

// Marker construit à partir de l'image du signalement (photo réelle si présente,
// sinon illustration par défaut de la catégorie). Vignette ronde + liseré selon le statut.
function photoMarker(src: string, status: Status, isReal: boolean) {
  const ring =
    status === "resolu"
      ? "#10b981" // vert émeraude = résolu
      : status === "en_cours"
      ? "#f59e0b" // ambre = en cours
      : isReal
      ? "#ef4444" // rouge = nouveau avec photo
      : "#1e40af"; // bleu = illustration
  const badgeHtml =
    status === "resolu"
      ? `<span style="position:absolute;bottom:-2px;right:-2px;width:16px;height:16px;border-radius:9999px;background:#10b981;color:#fff;font-size:10px;font-weight:bold;display:flex;align-items:center;justify-content:center;border:1.5px solid #fff;">✓</span>`
      : status === "en_cours"
      ? `<span style="position:absolute;bottom:-2px;right:-2px;width:16px;height:16px;border-radius:9999px;background:#f59e0b;color:#fff;font-size:10px;font-weight:bold;display:flex;align-items:center;justify-content:center;border:1.5px solid #fff;">⏳</span>`
      : "";
  return L.divIcon({
    className: "salub-photo-marker",
    html: `<div style="position:relative;width:44px;height:44px;">
      <div style="
        width:44px;height:44px;border-radius:9999px;
        border:3px solid ${ring};
        background:#fff center/cover no-repeat url('${src}');
        box-shadow:0 2px 8px rgba(0,0,0,.35);
      "></div>
      ${badgeHtml}
    </div>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
    popupAnchor: [0, -22],
  });
}

export function ReportsMap({
  reports,
  onSelectStatus,
}: {
  reports: Report[];
  onSelectStatus?: (reportId: string, newStatus: Status) => void;
}) {
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
        const locality = r.ville || detectCommuneFromCoords(r.latitude, r.longitude);
        const sInfo = statusInfo(r.status);
        return (
          <Marker key={r.id} position={[r.latitude, r.longitude]} icon={photoMarker(src, r.status, isReal)}>
            <Popup>
              <div className="w-52 space-y-1.5">
                <img src={src} alt={categoryLabel(r.category)} className="h-24 w-full rounded-md object-cover" />
                <div className="flex items-center justify-between gap-1">
                  <span className="font-semibold text-xs">{categoryLabel(r.category)}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      r.status === "resolu"
                        ? "bg-emerald-100 text-emerald-800"
                        : r.status === "en_cours"
                        ? "bg-amber-100 text-amber-800"
                        : "bg-red-100 text-red-800"
                    }`}
                  >
                    {sInfo.label}
                  </span>
                </div>
                {locality && <div className="text-[11px] font-medium text-emerald-700">📍 {locality}</div>}
                <div className="text-xs">{r.description}</div>
                <div className="text-[10px] uppercase opacity-70">
                  {sInfo.label} • {r.votes_count} confirmation(s)
                  {!isReal && " • illustration"}
                </div>
                {onSelectStatus && (
                  <div className="border-t pt-1.5 mt-1 flex flex-wrap gap-1">
                    {(["nouveau", "en_cours", "resolu"] as Status[]).map((st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => onSelectStatus(r.id, st)}
                        className={`rounded px-1.5 py-0.5 text-[10px] font-semibold transition ${
                          r.status === st
                            ? "bg-slate-900 text-white"
                            : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                        }`}
                      >
                        {statusInfo(st).label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}