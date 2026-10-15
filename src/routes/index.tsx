import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, lazy, Suspense } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { AppHeader } from "@/components/AppHeader";
import { AppFooter } from "@/components/AppFooter";
import { ReportCard } from "@/components/ReportCard";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CATEGORIES, type Category } from "@/lib/categories";
import { calculateDistanceMeters, formatDistance } from "@/lib/abidjan";
import type { Database } from "@/integrations/supabase/types";
import { PlusCircle, Loader2, Megaphone, Flame, MapPin, Compass } from "lucide-react";

const ReportsMap = lazy(() => import("@/components/ReportsMap").then((m) => ({ default: m.ReportsMap })));

type Report = Database["public"]["Tables"]["reports"]["Row"] & { distance?: number };
type SortMode = "proximity" | "recent" | "votes";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "SalubApp — Signalez l'insalubrité dans votre quartier" },
    { name: "description", content: "Plateforme citoyenne pour signaler les problèmes d'insalubrité et d'incivisme en Afrique francophone." },
  ]}),
  component: HomePage,
});

function HomePage() {
  const { user } = useAuth();
  const [reports, setReports] = useState<Report[] | null>(null);
  const [votedIds, setVotedIds] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<Category | "all">("all");
  const [sortMode, setSortMode] = useState<SortMode>("recent");
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geoLoading, setGeoLoading] = useState(false);

  const askUserLocation = () => {
    if (!navigator.geolocation) return;
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setUserCoords({ lat, lng });
        setSortMode("proximity");
        setGeoLoading(false);
      },
      () => {
        setGeoLoading(false);
      },
      { timeout: 8000, maximumAge: 60000 }
    );
  };

  useEffect(() => {
    askUserLocation();
  }, []);

  const load = async () => {
    // Visiteurs anonymes : on lit la vue publique (sans user_id, coordonnées floutées).
    // Utilisateurs connectés : table complète (nécessaire pour vérifier/voter/commenter).
    const source = user ? "reports" : "reports_public";
    const { data } = await (supabase as any).from(source).select("*").order("created_at", { ascending: false }).limit(200);
    setReports((data ?? []) as Report[]);
    if (user && data && data.length) {
      const { data: votes } = await supabase.from("report_votes").select("report_id").eq("user_id", user.id);
      setVotedIds(new Set((votes ?? []).map((v) => v.report_id)));
    } else {
      setVotedIds(new Set());
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user?.id]);

  const enrichedReports = useMemo(() => {
    if (!reports) return [];
    return reports.map((r) => {
      const distance =
        userCoords && r.latitude && r.longitude
          ? calculateDistanceMeters(userCoords.lat, userCoords.lng, r.latitude, r.longitude)
          : undefined;
      return { ...r, distance };
    });
  }, [reports, userCoords]);

  const sortedAndFiltered = useMemo(() => {
    let list = enrichedReports.filter(
      (r) => filter === "all" || r.category === filter
    );

    if (sortMode === "proximity" && userCoords) {
      list = [...list].sort(
        (a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity)
      );
    } else if (sortMode === "votes") {
      list = [...list].sort(
        (a, b) => (b.votes_count ?? 0) - (a.votes_count ?? 0)
      );
    } else {
      list = [...list].sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    }

    return list;
  }, [enrichedReports, filter, sortMode, userCoords]);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-5xl px-4 py-6 pb-24">
        {/* Hero */}
        <section className="mb-6 overflow-hidden rounded-2xl bg-gradient-to-br from-primary to-primary/70 p-6 text-primary-foreground shadow-lg">
          <div className="flex items-start gap-4">
            <div className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/20 sm:flex">
              <Megaphone className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <h1 className="text-2xl font-bold leading-tight sm:text-3xl">Votre quartier, votre voix.</h1>
              <p className="mt-1 text-sm text-primary-foreground/90">
                Photographiez, géolocalisez, signalez. Les autorités locales reçoivent vos alertes en temps réel.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button asChild variant="secondary" size="lg" className="gap-1">
                  <Link to={user ? "/signaler" : "/login"}>
                    <PlusCircle className="h-5 w-5" /> Signaler maintenant
                  </Link>
                </Button>
                <Button asChild variant="outline" size="lg" className="gap-1 border-white/40 bg-white/10 text-white hover:bg-white/20 hover:text-white">
                  <Link to="/carte"><Flame className="h-5 w-5" /> Voir la carte thermique</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* Filtre + tri + tabs */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">
            {reports ? `${sortedAndFiltered.length} signalement${sortedAndFiltered.length > 1 ? "s" : ""}` : "Chargement…"}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={sortMode} onValueChange={(v) => setSortMode(v as SortMode)}>
              <SelectTrigger className="w-56 text-xs font-medium">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="proximity" disabled={!userCoords}>
                  📍 Autour de moi {!userCoords ? "(GPS requis)" : ""}
                </SelectItem>
                <SelectItem value="recent">⏱️ Plus récents</SelectItem>
                <SelectItem value="votes">🔥 Plus confirmés (+1)</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filter} onValueChange={(v) => setFilter(v as Category | "all")}>
              <SelectTrigger className="w-48 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les catégories</SelectItem>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Indicateur de géolocalisation pour l'entourage */}
        {userCoords && sortMode === "proximity" && (
          <div className="mb-4 flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
            <div className="flex items-center gap-1.5 font-medium">
              <MapPin className="h-3.5 w-3.5 text-emerald-600" />
              Signalements classés par proximité avec votre position actuelle (votre entourage en premier).
            </div>
            <span className="text-[11px] font-semibold text-emerald-700">Abidjan · En direct</span>
          </div>
        )}
        {!userCoords && (
          <div className="mb-4 flex items-center justify-between rounded-lg border bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-primary" />
              Activez la géolocalisation pour afficher en priorité les signalements de votre entourage.
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={askUserLocation}
              disabled={geoLoading}
              className="h-7 text-xs font-medium"
            >
              {geoLoading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Compass className="h-3 w-3 mr-1" />}
              Autour de moi
            </Button>
          </div>
        )}

        <Tabs defaultValue="liste">
          <TabsList className="mb-4">
            <TabsTrigger value="liste">Liste</TabsTrigger>
            <TabsTrigger value="carte">Carte</TabsTrigger>
          </TabsList>

          <TabsContent value="liste">
            {!reports && (
              <div className="flex justify-center py-12 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            )}
            {reports && sortedAndFiltered.length === 0 && (
              <div className="rounded-xl border-2 border-dashed border-border bg-muted/30 p-10 text-center">
                <p className="text-muted-foreground">Aucun signalement pour le moment.</p>
                <Button asChild className="mt-4"><Link to={user ? "/signaler" : "/login"}>Soyez le premier à signaler</Link></Button>
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              {sortedAndFiltered.map((r) => (
                <ReportCard
                  key={r.id}
                  report={r}
                  hasVoted={votedIds.has(r.id)}
                  onVoteChange={load}
                  distanceMeters={r.distance}
                />
              ))}
            </div>
          </TabsContent>

          <TabsContent value="carte">
            <div className="h-[60vh] overflow-hidden rounded-xl border bg-muted">
              <Suspense fallback={<div className="flex h-full items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>}>
                {reports && <ReportsMap reports={sortedAndFiltered} />}
              </Suspense>
            </div>
          </TabsContent>
        </Tabs>
      </main>
      <AppFooter />
    </div>
  );
}
