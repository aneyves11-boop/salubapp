import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, lazy, Suspense } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { AppHeader } from "@/components/AppHeader";
import { ReportCard } from "@/components/ReportCard";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CATEGORIES, type Category } from "@/lib/categories";
import type { Database } from "@/integrations/supabase/types";
import { PlusCircle, Loader2, Megaphone, Flame } from "lucide-react";

const ReportsMap = lazy(() => import("@/components/ReportsMap").then((m) => ({ default: m.ReportsMap })));

type Report = Database["public"]["Tables"]["reports"]["Row"];

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

  const load = async () => {
    const { data } = await supabase.from("reports").select("*").order("created_at", { ascending: false }).limit(200);
    setReports(data ?? []);
    if (user && data && data.length) {
      const { data: votes } = await supabase.from("report_votes").select("report_id").eq("user_id", user.id);
      setVotedIds(new Set((votes ?? []).map((v) => v.report_id)));
    } else {
      setVotedIds(new Set());
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user?.id]);

  const filtered = useMemo(
    () => (reports ?? []).filter((r) => filter === "all" || r.category === filter),
    [reports, filter]
  );

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

        {/* Filtre + tabs */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">
            {reports ? `${filtered.length} signalement${filtered.length > 1 ? "s" : ""}` : "Chargement…"}
          </h2>
          <Select value={filter} onValueChange={(v) => setFilter(v as Category | "all")}>
            <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les catégories</SelectItem>
              {CATEGORIES.map((c) => (
                <SelectItem key={c.value} value={c.value}>{c.emoji} {c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Tabs defaultValue="liste">
          <TabsList className="mb-4">
            <TabsTrigger value="liste">📋 Liste</TabsTrigger>
            <TabsTrigger value="carte">🗺️ Carte</TabsTrigger>
          </TabsList>

          <TabsContent value="liste">
            {!reports && (
              <div className="flex justify-center py-12 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            )}
            {reports && filtered.length === 0 && (
              <div className="rounded-xl border-2 border-dashed border-border bg-muted/30 p-10 text-center">
                <p className="text-muted-foreground">Aucun signalement pour le moment.</p>
                <Button asChild className="mt-4"><Link to={user ? "/signaler" : "/login"}>Soyez le premier à signaler</Link></Button>
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              {filtered.map((r) => (
                <ReportCard key={r.id} report={r} hasVoted={votedIds.has(r.id)} onVoteChange={load} />
              ))}
            </div>
          </TabsContent>

          <TabsContent value="carte">
            <div className="h-[60vh] overflow-hidden rounded-xl border bg-muted">
              <Suspense fallback={<div className="flex h-full items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>}>
                {reports && <ReportsMap reports={filtered} />}
              </Suspense>
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
