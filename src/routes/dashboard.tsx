import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { AppHeader } from "@/components/AppHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CATEGORIES, STATUSES, categoryLabel, statusInfo, type Category, type Status } from "@/lib/categories";
import { detectCommuneFromCoords } from "@/lib/abidjan";
import type { Database } from "@/integrations/supabase/types";
import {
  Download,
  Loader2,
  Building2,
  ThumbsUp,
  MapPin,
  Search,
  Navigation,
  CheckCircle2,
  Clock,
  Flame,
  X,
} from "lucide-react";
import { toast } from "sonner";

type Report = Database["public"]["Tables"]["reports"]["Row"];

type EnrichedReport = Report & {
  commune: string | null;
  urgencyScore: number;
  urgencyLevel: "critique" | "elevee" | "normale";
};

const LOCAL_STATUS_KEY = "salubapp_structure_status_overrides";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: "Portail Structures & Données Déchets — SalubApp" }] }),
  component: DashboardPage,
});

function normalizeSearch(str: string): string {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function computeUrgency(r: Report): { score: number; level: "critique" | "elevee" | "normale" } {
  const votes = r.votes_count ?? 0;
  const verifTrue = r.true_count ?? 0;
  const persistent = r.persistent_count ?? 0;
  const score = votes * 3 + verifTrue * 2 + persistent * 2;
  if (score >= 8 || votes >= 3) return { score, level: "critique" };
  if (score >= 3 || votes >= 1 || verifTrue >= 1) return { score, level: "elevee" };
  return { score, level: "normale" };
}

function toCsv(reports: EnrichedReport[]): string {
  const headers = [
    "id",
    "date",
    "commune_gps",
    "localite_saisie",
    "categorie",
    "urgence",
    "statut",
    "description",
    "latitude",
    "longitude",
    "confirmations_citoyens",
    "votes_vrai",
    "votes_persistant",
  ];
  const escape = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = reports.map((r) =>
    [
      r.id,
      new Date(r.created_at).toISOString(),
      r.commune ?? "",
      r.ville ?? "",
      categoryLabel(r.category),
      r.urgencyLevel.toUpperCase(),
      statusInfo(r.status).label,
      r.description,
      r.latitude,
      r.longitude,
      r.votes_count,
      r.true_count,
      r.persistent_count,
    ]
      .map(escape)
      .join(",")
  );
  return [headers.join(","), ...rows].join("\n");
}

function DashboardPage() {
  const { user, isAutorite, structureProfile, loading } = useAuth();
  const navigate = useNavigate();
  const [reports, setReports] = useState<Report[] | null>(null);
  const [statusOverrides, setStatusOverrides] = useState<Record<string, Status>>(() => {
    if (typeof window !== "undefined") {
      try {
        const raw = localStorage.getItem(LOCAL_STATUS_KEY);
        if (raw) return JSON.parse(raw);
      } catch {
        // ignore
      }
    }
    return {};
  });

  const [searchLocality, setSearchLocality] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<Category | "all">("all");
  const [statusFilter, setStatusFilter] = useState<Status | "all">("all");
  const [sortBy, setSortBy] = useState<"urgency" | "recent">("urgency");

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login", search: { mode: "structure" } as any });
    if (!loading && user && !isAutorite) navigate({ to: "/login", search: { mode: "structure" } as any });
  }, [user, isAutorite, loading, navigate]);

  const load = async () => {
    const { data } = await supabase
      .from("reports")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1000);
    setReports(data ?? []);
  };

  useEffect(() => {
    if (isAutorite) load();
  }, [isAutorite]);

  const enrichedReports = useMemo<EnrichedReport[]>(() => {
    return (reports ?? []).map((r) => {
      const effectiveStatus = statusOverrides[r.id] ?? r.status;
      const commune = detectCommuneFromCoords(r.latitude, r.longitude);
      const { score, level } = computeUrgency(r);
      return {
        ...r,
        status: effectiveStatus,
        commune,
        urgencyScore: score,
        urgencyLevel: level,
      };
    });
  }, [reports, statusOverrides]);

  const stats = useMemo(() => {
    const total = enrichedReports.length;
    const nouveau = enrichedReports.filter((x) => x.status === "nouveau").length;
    const en_cours = enrichedReports.filter((x) => x.status === "en_cours").length;
    const resolu = enrichedReports.filter((x) => x.status === "resolu").length;
    const dechetsCount = enrichedReports.filter((x) => x.category === "dechets").length;
    const resolutionRate = total > 0 ? Math.round((resolu / total) * 100) : 0;
    return { total, nouveau, en_cours, resolu, dechetsCount, resolutionRate };
  }, [enrichedReports]);

  // Répartition par commune (calculée depuis les localisations GPS des images)
  const communeBreakdown = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of enrichedReports) {
      const c = r.commune || r.ville;
      if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [enrichedReports]);

  const filtered = useMemo(() => {
    const q = normalizeSearch(searchLocality);
    const list = enrichedReports.filter((r) => {
      if (categoryFilter !== "all" && r.category !== categoryFilter) return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (q) {
        const cNorm = r.commune ? normalizeSearch(r.commune) : "";
        const vNorm = r.ville ? normalizeSearch(r.ville) : "";
        const dNorm = normalizeSearch(r.description);
        if (!cNorm.includes(q) && !vNorm.includes(q) && !dNorm.includes(q)) return false;
      }
      return true;
    });

    if (sortBy === "urgency") {
      return [...list].sort(
        (a, b) =>
          b.urgencyScore - a.urgencyScore ||
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    }
    return [...list].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [enrichedReports, categoryFilter, statusFilter, searchLocality, sortBy]);

  const updateStatus = async (id: string, s: Status) => {
    const nextOverrides = { ...statusOverrides, [id]: s };
    setStatusOverrides(nextOverrides);
    if (typeof window !== "undefined") {
      localStorage.setItem(LOCAL_STATUS_KEY, JSON.stringify(nextOverrides));
    }

    const { error } = await supabase.from("reports").update({ status: s }).eq("id", id);
    if (error) {
      toast.success(`Statut passé à « ${statusInfo(s).label} » pour votre structure`);
      return;
    }
    toast.success(`Statut mis à jour : ${statusInfo(s).label}`);
    load();
  };

  const downloadCsv = () => {
    const blob = new Blob(["\ufeff" + toCsv(filtered)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `salubapp-donnees-structures-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading || !isAutorite) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin" /></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 py-6 pb-20">
        {/* Bannière d'accueil de la structure connectée */}
        <div className="mb-6 rounded-2xl border bg-gradient-to-r from-emerald-900 to-emerald-700 p-5 text-white shadow-md">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-0.5 text-xs font-semibold">
                <Building2 className="h-3.5 w-3.5" />
                {structureProfile?.type || "Structure Partenaire"}
              </div>
              <h1 className="text-2xl font-bold">
                {structureProfile?.name || "Portail des Structures & Collectivités"}
              </h1>
              <p className="mt-1 text-xs sm:text-sm text-emerald-100">
                Accès unifié à l'ensemble des données de déchets, d'insalubrité et de voirie signalées par les citoyens.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button asChild variant="secondary" size="sm" className="gap-1">
                <Link to="/carte">
                  <Flame className="h-4 w-4 text-orange-600" /> Carte thermique
                </Link>
              </Button>
              <Button
                onClick={downloadCsv}
                variant="outline"
                size="sm"
                className="gap-1 border-white/40 bg-white/10 text-white hover:bg-white/20 hover:text-white"
              >
                <Download className="h-4 w-4" /> Exporter les données (CSV)
              </Button>
            </div>
          </div>
        </div>

        {/* Indicateurs clés */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <StatCard label="Total signalements" value={stats.total} />
          <StatCard label="Déchets / Ordures" value={stats.dechetsCount} highlight />
          <StatCard label="Nouveaux (À traiter)" value={stats.nouveau} accent />
          <StatCard label="En cours" value={stats.en_cours} />
          <StatCard label={`Résolus (${stats.resolutionRate}%)`} value={stats.resolu} success />
        </div>

        {/* Filtrage rapide par Commune détectée via les images */}
        {communeBreakdown.length > 0 && (
          <div className="mb-5 rounded-xl border bg-card p-3.5">
            <div className="mb-2 text-xs font-semibold text-muted-foreground">
              📍 Filtrer par commune / localité des signalements :
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setSearchLocality("")}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  searchLocality === ""
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                Toutes les communes ({enrichedReports.length})
              </button>
              {communeBreakdown.map((c) => (
                <button
                  key={c.name}
                  type="button"
                  onClick={() => setSearchLocality(c.name)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                    normalizeSearch(searchLocality) === normalizeSearch(c.name)
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  {c.name} ({c.count})
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Barre de recherche et filtres */}
        <div className="mb-5 grid grid-cols-1 gap-2.5 sm:grid-cols-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              value={searchLocality}
              onChange={(e) => setSearchLocality(e.target.value)}
              placeholder="Rechercher commune ou quartier…"
              className="pl-9 pr-8 text-xs"
            />
            {searchLocality && (
              <button
                type="button"
                onClick={() => setSearchLocality("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v as Category | "all")}>
            <SelectTrigger className="text-xs">
              <SelectValue placeholder="Type de déchet / problème" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les catégories (Déchets, Voirie…)</SelectItem>
              {CATEGORIES.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as Status | "all")}>
            <SelectTrigger className="text-xs">
              <SelectValue placeholder="Statut d'intervention" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les statuts</SelectItem>
              {STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={sortBy} onValueChange={(v) => setSortBy(v as "urgency" | "recent")}>
            <SelectTrigger className="text-xs font-medium">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="urgency">🚨 Trier par urgence citoyenne</SelectItem>
              <SelectItem value="recent">⏱️ Trier par date (plus récents)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Liste des signalements accessibles à la structure */}
        <div className="space-y-3">
          {filtered.map((r) => {
            const localityLabel = r.ville || r.commune || "Abidjan";
            return (
              <Card key={r.id} className="p-4 transition hover:shadow-sm">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                  {r.photo_url && (
                    <img
                      src={r.photo_url}
                      alt={categoryLabel(r.category)}
                      className="h-32 w-full shrink-0 rounded-lg object-cover sm:h-28 sm:w-36"
                    />
                  )}
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-sm">{categoryLabel(r.category)}</span>
                      <Badge className={statusInfo(r.status).color}>{statusInfo(r.status).label}</Badge>

                      {r.urgencyLevel === "critique" && (
                        <Badge className="bg-red-600 text-white hover:bg-red-600">
                          🔴 Urgence Critique
                        </Badge>
                      )}
                      {r.urgencyLevel === "elevee" && (
                        <Badge className="bg-amber-500 text-white hover:bg-amber-500">
                          🟠 Priorité Élevée
                        </Badge>
                      )}

                      <span className="ml-auto text-xs text-muted-foreground">
                        {new Date(r.created_at).toLocaleString("fr-FR")}
                      </span>
                    </div>

                    <p className="text-sm">{r.description}</p>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1 font-medium text-foreground">
                        <MapPin className="h-3.5 w-3.5 text-primary" />
                        {localityLabel}
                        {r.commune && r.ville && !normalizeSearch(r.ville).includes(normalizeSearch(r.commune))
                          ? ` (${r.commune})`
                          : ""}
                      </span>

                      <span className="inline-flex items-center gap-1">
                        <ThumbsUp className="h-3.5 w-3.5 text-emerald-600" />
                        <strong>{r.votes_count}</strong> confirmation{r.votes_count > 1 ? "s" : ""} (+1)
                      </span>

                      <span className="inline-flex items-center gap-1">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                        <strong>{r.true_count}</strong> Vrai
                      </span>

                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5 text-amber-600" />
                        <strong>{r.persistent_count}</strong> Persistant
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <a
                        target="_blank"
                        rel="noreferrer"
                        href={`https://www.google.com/maps/dir/?api=1&destination=${r.latitude},${r.longitude}`}
                        className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary hover:bg-primary/20"
                      >
                        <Navigation className="h-3.5 w-3.5" />
                        Itinéraire terrain (Google Maps)
                      </a>
                      <a
                        target="_blank"
                        rel="noreferrer"
                        href={`https://www.openstreetmap.org/?mlat=${r.latitude}&mlon=${r.longitude}#map=18/${r.latitude}/${r.longitude}`}
                        className="text-xs text-muted-foreground underline hover:text-foreground"
                      >
                        GPS : {r.latitude.toFixed(4)}, {r.longitude.toFixed(4)}
                      </a>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5 sm:items-end">
                    <span className="text-[11px] font-medium text-muted-foreground">
                      Statut d'intervention :
                    </span>
                    <Select value={r.status} onValueChange={(v) => updateStatus(r.id, v as Status)}>
                      <SelectTrigger className="w-full sm:w-40 text-xs font-semibold">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUSES.map((s) => (
                          <SelectItem key={s.value} value={s.value}>
                            {s.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </Card>
            );
          })}

          {reports && filtered.length === 0 && (
            <div className="rounded-xl border-2 border-dashed p-10 text-center text-muted-foreground">
              Aucun signalement ne correspond à vos filtres actuels.
            </div>
          )}
        </div>

        <p className="mt-8 text-center text-xs text-muted-foreground">
          <Link to="/" className="underline">← Retour au fil citoyen public</Link>
        </p>
      </main>
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
  success,
  highlight,
}: {
  label: string;
  value: number;
  accent?: boolean;
  success?: boolean;
  highlight?: boolean;
}) {
  return (
    <Card
      className={`p-4 ${accent ? "border-amber-300 bg-amber-50/60 dark:bg-amber-950/30" : ""} ${
        success ? "border-emerald-300 bg-emerald-50/70 dark:bg-emerald-950/30" : ""
      } ${highlight ? "border-primary/30 bg-primary/5" : ""}`}
    >
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl sm:text-3xl font-bold">{value}</div>
    </Card>
  );
}