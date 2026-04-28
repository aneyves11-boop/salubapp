import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, lazy, Suspense } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CATEGORIES, categoryEmoji, categoryLabel, type Category } from "@/lib/categories";
import type { Database } from "@/integrations/supabase/types";
import { Loader2, Flame, MapPin, TrendingUp, Filter } from "lucide-react";

const HeatMap = lazy(() => import("@/components/HeatMap").then((m) => ({ default: m.HeatMap })));

type Report = Database["public"]["Tables"]["reports"]["Row"];

export const Route = createFileRoute("/carte")({
  head: () => ({ meta: [
    { title: "Carte thermique des nuisances — SalubApp" },
    { name: "description", content: "Visualisez les zones les plus touchées par l'insalubrité dans votre ville." },
  ]}),
  component: PublicDashboard,
});

function PublicDashboard() {
  const [reports, setReports] = useState<Report[] | null>(null);
  const [active, setActive] = useState<Set<Category>>(new Set(CATEGORIES.map((c) => c.value)));

  useEffect(() => {
    supabase.from("reports").select("*").order("created_at", { ascending: false }).limit(1000)
      .then(({ data }) => setReports(data ?? []));
  }, []);

  const filtered = useMemo(
    () => (reports ?? []).filter((r) => active.has(r.category as Category)),
    [reports, active]
  );

  const byCategory = useMemo(() => {
    const m = new Map<Category, number>();
    (reports ?? []).forEach((r) => m.set(r.category as Category, (m.get(r.category as Category) ?? 0) + 1));
    return CATEGORIES.map((c) => ({ ...c, count: m.get(c.value) ?? 0 })).sort((a, b) => b.count - a.count);
  }, [reports]);

  const topZones = useMemo(() => {
    const m = new Map<string, number>();
    (reports ?? []).forEach((r) => {
      const key = (r.ville ?? "Zone inconnue").trim() || "Zone inconnue";
      m.set(key, (m.get(key) ?? 0) + 1);
    });
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [reports]);

  const total = reports?.length ?? 0;
  const resolus = (reports ?? []).filter((r) => r.status === "resolu").length;
  const enCours = (reports ?? []).filter((r) => r.status === "en_cours").length;

  const toggle = (c: Category) => {
    const next = new Set(active);
    next.has(c) ? next.delete(c) : next.add(c);
    setActive(next);
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 py-6 pb-24">
        {/* En-tête */}
        <section className="mb-6 overflow-hidden rounded-2xl bg-gradient-to-br from-orange-600 via-red-500 to-rose-600 p-6 text-white shadow-lg">
          <div className="flex items-start gap-4">
            <div className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/20 sm:flex">
              <Flame className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <h1 className="text-2xl font-bold sm:text-3xl">Carte thermique des nuisances</h1>
              <p className="mt-1 text-sm text-white/90">
                Visualisez en temps réel les zones les plus touchées par l'insalubrité et l'incivisme.
              </p>
            </div>
          </div>
        </section>

        {/* Stats globales */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card className="p-4">
            <div className="text-xs text-muted-foreground">Signalements</div>
            <div className="mt-1 text-2xl font-bold">{total}</div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-muted-foreground">En cours</div>
            <div className="mt-1 text-2xl font-bold text-primary">{enCours}</div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-muted-foreground">Résolus</div>
            <div className="mt-1 text-2xl font-bold text-emerald-600">{resolus}</div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-muted-foreground">Affichés</div>
            <div className="mt-1 text-2xl font-bold">{filtered.length}</div>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          {/* Carte */}
          <div>
            <Card className="overflow-hidden">
              <div className="flex items-center justify-between border-b px-4 py-2 text-xs">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Flame className="h-3.5 w-3.5" /> Intensité (vert = faible, rouge = élevée)
                </div>
                <div className="flex items-center gap-1">
                  <span className="h-2 w-6 rounded-l-full bg-green-500" />
                  <span className="h-2 w-6 bg-yellow-500" />
                  <span className="h-2 w-6 bg-orange-500" />
                  <span className="h-2 w-6 bg-red-500" />
                  <span className="h-2 w-6 rounded-r-full bg-red-900" />
                </div>
              </div>
              <div className="h-[60vh] min-h-[420px] bg-muted">
                {!reports ? (
                  <div className="flex h-full items-center justify-center text-muted-foreground">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-muted-foreground">
                    Aucune donnée à afficher.
                  </div>
                ) : (
                  <Suspense fallback={<div className="flex h-full items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>}>
                    <HeatMap reports={filtered} />
                  </Suspense>
                )}
              </div>
            </Card>

            {/* Filtres catégories */}
            <Card className="mt-4 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <Filter className="h-4 w-4" /> Filtrer par type de nuisance
              </div>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((c) => {
                  const on = active.has(c.value);
                  return (
                    <button
                      key={c.value}
                      onClick={() => toggle(c.value)}
                      className={`rounded-full border px-3 py-1.5 text-xs transition ${on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground hover:bg-muted"}`}
                    >
                      {c.emoji} {c.label}
                    </button>
                  );
                })}
              </div>
            </Card>
          </div>

          {/* Sidebar stats */}
          <div className="space-y-4">
            <Card className="p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <TrendingUp className="h-4 w-4 text-primary" /> Répartition par type
              </div>
              <div className="space-y-2">
                {byCategory.map((c) => {
                  const pct = total ? (c.count / total) * 100 : 0;
                  return (
                    <div key={c.value}>
                      <div className="flex items-center justify-between text-xs">
                        <span>{c.emoji} {c.label}</span>
                        <span className="font-mono text-muted-foreground">{c.count}</span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
                {!total && <p className="text-xs text-muted-foreground">Aucune donnée.</p>}
              </div>
            </Card>

            <Card className="p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <MapPin className="h-4 w-4 text-destructive" /> Zones les plus touchées
              </div>
              {topZones.length === 0 ? (
                <p className="text-xs text-muted-foreground">Aucune zone identifiée.</p>
              ) : (
                <ol className="space-y-2">
                  {topZones.map(([ville, n], i) => (
                    <li key={ville} className="flex items-center justify-between gap-2 text-sm">
                      <span className="flex items-center gap-2">
                        <Badge variant={i === 0 ? "destructive" : "secondary"} className="h-6 w-6 justify-center rounded-full p-0 text-xs">
                          {i + 1}
                        </Badge>
                        <span className="truncate">{ville}</span>
                      </span>
                      <span className="font-mono text-xs text-muted-foreground">{n}</span>
                    </li>
                  ))}
                </ol>
              )}
            </Card>

            <Button asChild variant="outline" className="w-full">
              <Link to="/">← Voir le fil des signalements</Link>
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
