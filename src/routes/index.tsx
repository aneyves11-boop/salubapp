import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, lazy, Suspense } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { AppHeader } from "@/components/AppHeader";
import { AppFooter } from "@/components/AppFooter";
import { ReportCard } from "@/components/ReportCard";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CATEGORIES, type Category } from "@/lib/categories";
import { calculateDistanceMeters, detectCommuneFromCoords, ABIDJAN_COMMUNES } from "@/lib/abidjan";
import type { Database } from "@/integrations/supabase/types";
import { PlusCircle, Loader2, Megaphone, Flame, MapPin, Search, X } from "lucide-react";

const ReportsMap = lazy(() => import("@/components/ReportsMap").then((m) => ({ default: m.ReportsMap })));

type Report = Database["public"]["Tables"]["reports"]["Row"] & {
  distance?: number;
  commune?: string | null;
};

/** Normalise une chaîne pour une recherche insensible aux accents et à la casse */
function normalizeSearch(str: string): string {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

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
  const [searchLocality, setSearchLocality] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {},
      { timeout: 8000, maximumAge: 60000 }
    );
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

  // Enrichit chaque signalement avec sa commune détectée depuis les coordonnées GPS de l'image + sa distance
  const enrichedReports = useMemo(() => {
    if (!reports) return [];
    return reports.map((r) => {
      const distance =
        userCoords && r.latitude && r.longitude
          ? calculateDistanceMeters(userCoords.lat, userCoords.lng, r.latitude, r.longitude)
          : undefined;
      const commune = detectCommuneFromCoords(r.latitude, r.longitude);
      return { ...r, distance, commune };
    });
  }, [reports, userCoords]);

  // Liste dynamique des communes ayant des signalements (calculée à partir des localisations GPS des images et du champ ville)
  const availableCommunes = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of enrichedReports) {
      if (filter !== "all" && r.category !== filter) continue;
      // Identifier la commune soit via les coordonnées GPS de l'image, soit via le texte de ville
      let matchedCommune: string | null = r.commune ?? null;
      if (!matchedCommune && r.ville) {
        const normVille = normalizeSearch(r.ville);
        const found = ABIDJAN_COMMUNES.find((c) => normVille.includes(normalizeSearch(c)));
        if (found) matchedCommune = found;
      }
      if (matchedCommune) {
        counts.set(matchedCommune, (counts.get(matchedCommune) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "fr"));
  }, [enrichedReports, filter]);

  const sortedAndFiltered = useMemo(() => {
    const query = normalizeSearch(searchLocality);

    let list = enrichedReports.filter((r) => {
      const matchCategory = filter === "all" || r.category === filter;
      if (!matchCategory) return false;
      if (!query) return true;

      const communeNorm = r.commune ? normalizeSearch(r.commune) : "";
      const villeNorm = r.ville ? normalizeSearch(r.ville) : "";
      return communeNorm.includes(query) || villeNorm.includes(query);
    });

    if (userCoords) {
      list = [...list].sort(
        (a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity)
      );
    } else {
      list = [...list].sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    }

    return list;
  }, [enrichedReports, filter, searchLocality, userCoords]);

  // Suggestions de communes filtrées pendant la saisie dans la barre de recherche
  const matchingSuggestions = useMemo(() => {
    const q = normalizeSearch(searchLocality);
    if (!q) return availableCommunes;
    return availableCommunes.filter((c) => normalizeSearch(c.name).includes(q));
  }, [availableCommunes, searchLocality]);

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

        {/* Barre de recherche par commune/localité + Filtre catégories */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold shrink-0">
            {reports ? `${sortedAndFiltered.length} signalement${sortedAndFiltered.length > 1 ? "s" : ""}` : "Chargement…"}
          </h2>

          <div className="flex flex-1 flex-wrap items-center justify-end gap-2 sm:max-w-2xl">
            {/* Barre de recherche de commune / localité */}
            <div className="relative flex-1 min-w-[230px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                value={searchLocality}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setTimeout(() => setSearchFocused(false), 180)}
                onChange={(e) => setSearchLocality(e.target.value)}
                placeholder="Rechercher une commune (ex: Yopougon, Cocody…)"
                className="h-9 pl-9 pr-8 text-xs"
              />
              {searchLocality && (
                <button
                  type="button"
                  onClick={() => setSearchLocality("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="Effacer la recherche"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}

              {/* Menu de suggestions des communes détectées dans les signalements */}
              {searchFocused && matchingSuggestions.length > 0 && (
                <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-56 overflow-auto rounded-lg border bg-popover p-1.5 shadow-md">
                  <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Communes avec signalements
                  </div>
                  {matchingSuggestions.map((c) => (
                    <button
                      key={c.name}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setSearchLocality(c.name);
                        setSearchFocused(false);
                      }}
                      className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground"
                    >
                      <span className="flex items-center gap-1.5 font-medium">
                        <MapPin className="h-3.5 w-3.5 text-primary" />
                        {c.name}
                      </span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {c.count} signalement{c.count > 1 ? "s" : ""}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <Select value={filter} onValueChange={(v) => setFilter(v as Category | "all")}>
              <SelectTrigger className="h-9 w-full sm:w-52 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les catégories</SelectItem>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>


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
