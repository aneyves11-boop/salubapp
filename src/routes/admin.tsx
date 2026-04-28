import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { AppHeader } from "@/components/AppHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { categoryLabel } from "@/lib/categories";
import type { Database } from "@/integrations/supabase/types";
import { ShieldCheck, Loader2, CheckCircle2, XCircle, AlertTriangle, ThumbsUp, ThumbsDown, Trash2, MapPin } from "lucide-react";
import { toast } from "sonner";

type Report = Database["public"]["Tables"]["reports"]["Row"];
type VerifStatus = "en_attente" | "valide" | "rejete" | "douteux";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Administration — SalubApp" }] }),
  component: AdminPage,
});

const VERIF_LABEL: Record<VerifStatus, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  en_attente: { label: "En attente", color: "bg-slate-100 text-slate-700", icon: AlertTriangle },
  valide: { label: "Validé", color: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 },
  rejete: { label: "Rejeté", color: "bg-red-100 text-red-700", icon: XCircle },
  douteux: { label: "Douteux", color: "bg-amber-100 text-amber-700", icon: AlertTriangle },
};

function AdminPage() {
  const { user, roles, loading } = useAuth();
  const navigate = useNavigate();
  const isAdmin = roles.includes("admin");
  const [reports, setReports] = useState<Report[] | null>(null);
  const [filter, setFilter] = useState<VerifStatus | "all">("en_attente");

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
    if (!loading && user && !isAdmin) navigate({ to: "/" });
  }, [user, isAdmin, loading, navigate]);

  const load = async () => {
    const { data } = await supabase.from("reports").select("*").order("created_at", { ascending: false }).limit(500);
    setReports(data ?? []);
  };
  useEffect(() => { if (isAdmin) load(); }, [isAdmin]);

  const stats = useMemo(() => {
    const r = reports ?? [];
    return {
      total: r.length,
      en_attente: r.filter((x) => x.verified_status === "en_attente").length,
      valide: r.filter((x) => x.verified_status === "valide").length,
      rejete: r.filter((x) => x.verified_status === "rejete").length,
      douteux: r.filter((x) => x.verified_status === "douteux").length,
    };
  }, [reports]);

  const filtered = useMemo(
    () => (reports ?? []).filter((r) => filter === "all" || r.verified_status === filter),
    [reports, filter]
  );

  const setVerification = async (id: string, status: VerifStatus) => {
    const { error } = await supabase.from("reports").update({ verified_status: status }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(`Marqué : ${VERIF_LABEL[status].label}`);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Supprimer définitivement ce signalement ?")) return;
    const { error } = await supabase.from("reports").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Supprimé");
    load();
  };

  if (loading || !isAdmin) {
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
      <main className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-6">
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <ShieldCheck className="h-6 w-6 text-primary" /> Administration
          </h1>
          <p className="text-sm text-muted-foreground">Validation des signalements et modération.</p>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <StatCard label="Total" value={stats.total} />
          <StatCard label="À vérifier" value={stats.en_attente} accent />
          <StatCard label="Douteux" value={stats.douteux} warn />
          <StatCard label="Validés" value={stats.valide} success />
          <StatCard label="Rejetés" value={stats.rejete} danger />
        </div>

        <Tabs value={filter} onValueChange={(v) => setFilter(v as VerifStatus | "all")}>
          <TabsList className="mb-4 flex-wrap">
            <TabsTrigger value="en_attente">À vérifier ({stats.en_attente})</TabsTrigger>
            <TabsTrigger value="douteux">Douteux ({stats.douteux})</TabsTrigger>
            <TabsTrigger value="valide">Validés</TabsTrigger>
            <TabsTrigger value="rejete">Rejetés</TabsTrigger>
            <TabsTrigger value="all">Tous</TabsTrigger>
          </TabsList>

          <TabsContent value={filter} className="space-y-3">
            {filtered.map((r) => {
              const v = VERIF_LABEL[r.verified_status as VerifStatus];
              const Icon = v.icon;
              return (
                <Card key={r.id} className="p-4">
                  <div className="flex flex-wrap items-start gap-4">
                    {r.photo_url && <img src={r.photo_url} alt="" className="h-28 w-28 shrink-0 rounded-lg object-cover" />}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{categoryLabel(r.category)}</span>
                        <Badge className={v.color}><Icon className="mr-1 h-3 w-3" />{v.label}</Badge>
                        <span className="ml-auto text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString("fr-FR")}</span>
                      </div>
                      <p className="mt-2 text-sm">{r.description}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        {r.ville && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{r.ville}</span>}
                        <span className="flex items-center gap-1 text-emerald-700"><ThumbsUp className="h-3 w-3" />{r.true_count} vrai</span>
                        <span className="flex items-center gap-1 text-red-700"><ThumbsDown className="h-3 w-3" />{r.false_count} faux</span>
                        <a className="underline" target="_blank" rel="noreferrer"
                          href={`https://www.openstreetmap.org/?mlat=${r.latitude}&mlon=${r.longitude}#map=18/${r.latitude}/${r.longitude}`}>
                          {r.latitude.toFixed(4)}, {r.longitude.toFixed(4)}
                        </a>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button size="sm" variant="default" className="gap-1 bg-emerald-600 hover:bg-emerald-700"
                          onClick={() => setVerification(r.id, "valide")}>
                          <CheckCircle2 className="h-4 w-4" /> Valider
                        </Button>
                        <Button size="sm" variant="destructive" className="gap-1"
                          onClick={() => setVerification(r.id, "rejete")}>
                          <XCircle className="h-4 w-4" /> Rejeter
                        </Button>
                        <Button size="sm" variant="outline" className="gap-1"
                          onClick={() => setVerification(r.id, "en_attente")}>
                          Réinitialiser
                        </Button>
                        <Button size="sm" variant="ghost" className="ml-auto gap-1 text-red-600 hover:text-red-700"
                          onClick={() => remove(r.id)}>
                          <Trash2 className="h-4 w-4" /> Supprimer
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
            {reports && filtered.length === 0 && (
              <p className="py-10 text-center text-muted-foreground">Aucun signalement dans cette catégorie.</p>
            )}
          </TabsContent>
        </Tabs>

        <p className="mt-8 text-center text-xs text-muted-foreground">
          <Link to="/" className="underline">← Retour au fil public</Link>
        </p>
      </main>
    </div>
  );
}

function StatCard({ label, value, accent, success, warn, danger }: { label: string; value: number; accent?: boolean; success?: boolean; warn?: boolean; danger?: boolean }) {
  const bg = accent ? "bg-accent/30" : success ? "bg-emerald-50" : warn ? "bg-amber-50" : danger ? "bg-red-50" : "";
  return (
    <Card className={`p-4 ${bg}`}>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-3xl font-bold">{value}</div>
    </Card>
  );
}
