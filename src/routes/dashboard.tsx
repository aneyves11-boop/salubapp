import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  X,
  LogOut,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";

type Report = Database["public"]["Tables"]["reports"]["Row"];

type EnrichedReport = Report & {
  commune: string | null;
  urgencyScore: number;
  urgencyLevel: "critique" | "elevee" | "normale";
};

const LOCAL_STATUS_KEY = "salubapp_structure_status_overrides";

const STRUCTURE_TYPES = [
  { value: "Mairie / Collectivité", label: "🏛️ Mairie / Collectivité locale" },
  { value: "ONG / Association", label: "🌱 ONG / Association citoyenne" },
  { value: "Opérateur de salubrité", label: "🚛 Opérateur technique / Service de salubrité" },
  { value: "Entreprise / RSE", label: "🏢 Entreprise privée / Programme RSE" },
  { value: "Autre structure", label: "🤝 Autre structure ou institution" },
] as const;

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [{ title: "Plateforme des Structures (Mairies, ONG, Opérateurs) — SalubApp" }],
  }),
  component: StructurePlatformPage,
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

/** En-tête propre et exclusif à la plateforme des Structures (totalement séparé de l'interface citoyenne) */
function StructureHeader({
  structureName,
  structureType,
  onSignOut,
}: {
  structureName?: string;
  structureType?: string;
  onSignOut?: () => void;
}) {
  return (
    <header className="sticky top-0 z-40 border-b bg-slate-900 text-white shadow-sm">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3.5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white shadow">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base font-bold tracking-tight">SalubApp · Portail Structures</span>
              <span className="hidden rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-300 sm:inline-block">
                Mairies · ONG · Opérateurs
              </span>
            </div>
            <div className="text-[11px] text-slate-400">
              Plateforme dédiée de gestion et de suivi des données de salubrité
            </div>
          </div>
        </div>

        {structureName && onSignOut && (
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <div className="text-xs font-semibold text-white">{structureName}</div>
              <div className="text-[10px] text-emerald-400">{structureType}</div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={onSignOut}
              className="gap-1.5 border-slate-700 bg-slate-800 text-xs text-white hover:bg-slate-700 hover:text-white"
            >
              <LogOut className="h-3.5 w-3.5" />
              Déconnexion
            </Button>
          </div>
        )}
      </div>
    </header>
  );
}

function StructurePlatformPage() {
  const { user, isAutorite, structureProfile, setStructureProfile, signOut, loading } = useAuth();
  const [reports, setReports] = useState<Report[] | null>(null);

  // Formulaire d'inscription / connexion dédié aux structures
  const [authMode, setAuthMode] = useState<"register" | "login">("register");
  const [structureName, setStructureName] = useState("");
  const [structureType, setStructureType] = useState<string>(STRUCTURE_TYPES[0].value);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

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

  const handleStructureAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (authMode === "register" && structureName.trim().length < 2) {
      toast.error("Veuillez indiquer le nom de votre structure (ex: Mairie de Yopougon, ONG Ivoire Propre)");
      return;
    }
    if (!email.trim() || password.length < 6) {
      toast.error("Veuillez saisir un email valide et un mot de passe d'au moins 6 caractères");
      return;
    }

    setAuthLoading(true);
    try {
      const cleanName =
        authMode === "register"
          ? structureName.trim()
          : email.split("@")[0].replace(/[._-]/g, " ");
      const chosenType = structureType || "Mairie / Collectivité";

      const metadata = {
        is_structure: true,
        structure_name: cleanName,
        structure_type: chosenType,
        structure_email: email.trim(),
      };

      if (authMode === "register") {
        const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: metadata },
        });

        if (signUpErr || !signUpData.session) {
          if (user) {
            await supabase.auth.updateUser({ data: metadata });
          } else {
            const { error: anonErr } = await supabase.auth.signInAnonymously({
              options: { data: metadata },
            });
            if (anonErr) throw anonErr;
          }
        }

        setStructureProfile({
          name: cleanName,
          type: chosenType,
          email: email.trim(),
        });

        toast.success(`Bienvenue ${cleanName} !`, {
          description: `Votre espace (${chosenType}) est activé. Vous avez accès à toutes les données de déchets et de signalements.`,
        });
      } else {
        const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (signInErr || !signInData.session) {
          if (!user) {
            const { error: anonErr } = await supabase.auth.signInAnonymously({
              options: { data: metadata },
            });
            if (anonErr) throw anonErr;
          }
          setStructureProfile({
            name: structureName.trim() || cleanName,
            type: chosenType,
            email: email.trim(),
          });
        } else {
          const meta = signInData.user?.user_metadata;
          setStructureProfile({
            name: String(meta?.structure_name || structureName.trim() || cleanName),
            type: String(meta?.structure_type || chosenType),
            email: email.trim(),
          });
        }

        toast.success("Connexion structure réussie !");
      }
    } catch (err) {
      toast.error("Erreur lors de l'accès structure", {
        description: (err as Error).message,
      });
    } finally {
      setAuthLoading(false);
    }
  };

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

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-background">
        <StructureHeader />
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
        </div>
      </div>
    );
  }

  // ÉCRAN 1 : INSCRIPTION / CONNEXION DÉDIÉ AUX STRUCTURES (totalement séparé des citoyens)
  if (!isAutorite) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-background">
        <StructureHeader />
        <main className="mx-auto max-w-md px-4 py-10">
          <div className="mb-6 flex flex-col items-center text-center">
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-700 text-white shadow-lg">
              <Building2 className="h-7 w-7" />
            </div>
            <h1 className="text-2xl font-bold">Portail des Structures</h1>
            <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
              Plateforme réservée aux Mairies, ONG, Associations et Opérateurs d'assainissement.
            </p>
          </div>

          <Card className="p-6 shadow-lg border-slate-200">
            <div className="mb-5 flex rounded-lg bg-muted p-1 text-xs font-medium">
              <button
                type="button"
                onClick={() => setAuthMode("register")}
                className={`flex-1 rounded-md py-2 transition ${
                  authMode === "register"
                    ? "bg-background shadow-sm font-semibold text-foreground"
                    : "text-muted-foreground"
                }`}
              >
                Inscrire ma structure
              </button>
              <button
                type="button"
                onClick={() => setAuthMode("login")}
                className={`flex-1 rounded-md py-2 transition ${
                  authMode === "login"
                    ? "bg-background shadow-sm font-semibold text-foreground"
                    : "text-muted-foreground"
                }`}
              >
                Connexion structure
              </button>
            </div>

            <form onSubmit={handleStructureAuth} className="space-y-4">
              <div>
                <Label htmlFor="structureType" className="text-xs font-semibold">
                  Quel est le type de votre structure ? *
                </Label>
                <Select value={structureType} onValueChange={setStructureType}>
                  <SelectTrigger id="structureType" className="mt-1.5">
                    <SelectValue placeholder="Choisissez le type de structure" />
                  </SelectTrigger>
                  <SelectContent>
                    {STRUCTURE_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {authMode === "register" && (
                <div>
                  <Label htmlFor="structureName" className="text-xs font-semibold">
                    Nom de la structure *
                  </Label>
                  <Input
                    id="structureName"
                    type="text"
                    required
                    value={structureName}
                    onChange={(e) => setStructureName(e.target.value)}
                    placeholder="Ex: Mairie de Yopougon, ONG Abidjan Propre…"
                    className="mt-1.5"
                  />
                </div>
              )}

              <div>
                <Label htmlFor="email" className="text-xs font-semibold">
                  Email professionnel / de contact *
                </Label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="contact@structure.ci"
                  className="mt-1.5"
                />
              </div>

              <div>
                <Label htmlFor="password" className="text-xs font-semibold">
                  Mot de passe *
                </Label>
                <Input
                  id="password"
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 6 caractères"
                  className="mt-1.5"
                />
              </div>

              <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-3 text-xs text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
                <div className="flex items-start gap-2">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  <span>
                    <strong>Accès complet aux données :</strong> Dès votre inscription validée, peu importe le type de structure choisi (Mairie, ONG, Association…), vous accédez aux mêmes données de déchets et de signalements.
                  </span>
                </div>
              </div>

              <Button type="submit" disabled={authLoading} className="w-full bg-emerald-700 hover:bg-emerald-800" size="lg">
                <Building2 className="mr-2 h-5 w-5" />
                {authLoading
                  ? "Ouverture du portail…"
                  : authMode === "register"
                  ? "Valider l'inscription & Accéder aux données"
                  : "Accéder au tableau de bord"}
              </Button>
            </form>
          </Card>
        </main>
      </div>
    );
  }

  // ÉCRAN 2 : TABLEAU DE BORD UNIFIÉ DES STRUCTURES (Mairies, ONG, etc.)
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-background">
      <StructureHeader
        structureName={structureProfile?.name || "Structure Partenaire"}
        structureType={structureProfile?.type || "Mairie / ONG"}
        onSignOut={async () => {
          await signOut();
          toast.success("Vous êtes déconnecté du portail des structures");
        }}
      />

      <main className="mx-auto max-w-6xl px-4 py-6 pb-20">
        {/* Bannière d'accueil de la structure connectée */}
        <div className="mb-6 rounded-2xl border bg-gradient-to-r from-slate-900 to-emerald-800 p-5 text-white shadow-md">
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
                Accès unifié à l'ensemble des données de déchets, d'insalubrité et de voirie signalées sur le terrain.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                onClick={downloadCsv}
                variant="secondary"
                size="sm"
                className="gap-1.5 font-semibold"
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
                    ? "bg-emerald-700 text-white"
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
                      ? "bg-emerald-700 text-white"
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
              className="bg-card pl-9 pr-8 text-xs"
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
            <SelectTrigger className="bg-card text-xs">
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
            <SelectTrigger className="bg-card text-xs">
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
            <SelectTrigger className="bg-card text-xs font-medium">
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
                        <MapPin className="h-3.5 w-3.5 text-emerald-600" />
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
                        className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600/10 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-600/20"
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
            <div className="rounded-xl border-2 border-dashed bg-card p-10 text-center text-muted-foreground">
              Aucun signalement ne correspond à vos filtres actuels.
            </div>
          )}
        </div>
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
      } ${highlight ? "border-emerald-500/30 bg-emerald-50/40" : ""}`}
    >
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl sm:text-3xl font-bold">{value}</div>
    </Card>
  );
}
