import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { AppHeader } from "@/components/AppHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CATEGORIES, STATUSES, categoryEmoji, categoryLabel, statusInfo, type Status } from "@/lib/categories";
import type { Database } from "@/integrations/supabase/types";
import { Download, Loader2, ShieldCheck, ThumbsUp, MapPin } from "lucide-react";
import { toast } from "sonner";

type Report = Database["public"]["Tables"]["reports"]["Row"];

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: "Tableau de bord — SalubApp" }] }),
  component: DashboardPage,
});

function toCsv(reports: Report[]): string {
  const headers = ["id","date","categorie","statut","description","ville","latitude","longitude","votes"];
  const escape = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = reports.map((r) => [
    r.id, new Date(r.created_at).toISOString(), categoryLabel(r.category), statusInfo(r.status).label,
    r.description, r.ville ?? "", r.latitude, r.longitude, r.votes_count,
  ].map(escape).join(","));
  return [headers.join(","), ...rows].join("\n");
}

function DashboardPage() {
  const { user, isAutorite, loading } = useAuth();
  const navigate = useNavigate();
  const [reports, setReports] = useState<Report[] | null>(null);
  const [statusFilter, setStatusFilter] = useState<Status | "all">("all");

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
    if (!loading && user && !isAutorite) navigate({ to: "/" });
  }, [user, isAutorite, loading, navigate]);

  const load = async () => {
    const { data } = await supabase.from("reports").select("*").order("created_at", { ascending: false }).limit(1000);
    setReports(data ?? []);
  };
  useEffect(() => { if (isAutorite) load(); }, [isAutorite]);

  const stats = useMemo(() => {
    const r = reports ?? [];
    return {
      total: r.length,
      nouveau: r.filter((x) => x.status === "nouveau").length,
      en_cours: r.filter((x) => x.status === "en_cours").length,
      resolu: r.filter((x) => x.status === "resolu").length,
    };
  }, [reports]);

  const filtered = useMemo(
    () => (reports ?? []).filter((r) => statusFilter === "all" || r.status === statusFilter),
    [reports, statusFilter]
  );

  const updateStatus = async (id: string, s: Status) => {
    const { error } = await supabase.from("reports").update({ status: s }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Statut mis à jour");
    load();
  };

  const downloadCsv = () => {
    if (!reports) return;
    const blob = new Blob(["\ufeff" + toCsv(reports)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `salubapp-signalements-${new Date().toISOString().slice(0, 10)}.csv`;
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
      <main className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold">
              <ShieldCheck className="h-6 w-6 text-primary" /> Tableau de bord autorité
            </h1>
            <p className="text-sm text-muted-foreground">Suivi et traitement des signalements citoyens.</p>
          </div>
          <Button onClick={downloadCsv} variant="outline" className="gap-1">
            <Download className="h-4 w-4" /> Exporter CSV
          </Button>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Total" value={stats.total} />
          <StatCard label="Nouveaux" value={stats.nouveau} accent />
          <StatCard label="En cours" value={stats.en_cours} />
          <StatCard label="Résolus" value={stats.resolu} success />
        </div>

        <div className="mb-4 flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Filtrer :</span>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as Status | "all")}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les statuts</SelectItem>
              {STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-3">
          {filtered.map((r) => (
            <Card key={r.id} className="p-4">
              <div className="flex flex-wrap items-start gap-4">
                {r.photo_url && <img src={r.photo_url} alt="" className="h-24 w-24 shrink-0 rounded-lg object-cover" />}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xl">{categoryEmoji(r.category)}</span>
                    <span className="font-semibold">{categoryLabel(r.category)}</span>
                    <Badge className={statusInfo(r.status).color}>{statusInfo(r.status).label}</Badge>
                    <span className="ml-auto text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString("fr-FR")}</span>
                  </div>
                  <p className="mt-2 text-sm">{r.description}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    {r.ville && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{r.ville}</span>}
                    <a className="underline" target="_blank" rel="noreferrer"
                      href={`https://www.openstreetmap.org/?mlat=${r.latitude}&mlon=${r.longitude}#map=18/${r.latitude}/${r.longitude}`}>
                      {r.latitude.toFixed(4)}, {r.longitude.toFixed(4)}
                    </a>
                    <span className="flex items-center gap-1"><ThumbsUp className="h-3 w-3" />{r.votes_count}</span>
                  </div>
                </div>
                <Select value={r.status} onValueChange={(v) => updateStatus(r.id, v as Status)}>
                  <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </Card>
          ))}
          {reports && filtered.length === 0 && (
            <p className="py-10 text-center text-muted-foreground">Aucun signalement.</p>
          )}
        </div>

        <p className="mt-8 text-center text-xs text-muted-foreground">
          <Link to="/" className="underline">← Retour au fil public</Link>
        </p>
      </main>
    </div>
  );
}

function StatCard({ label, value, accent, success }: { label: string; value: number; accent?: boolean; success?: boolean }) {
  return (
    <Card className={`p-4 ${accent ? "bg-accent/30" : ""} ${success ? "bg-emerald-50" : ""}`}>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-3xl font-bold">{value}</div>
    </Card>
  );
}