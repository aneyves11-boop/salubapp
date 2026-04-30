import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { AppHeader } from "@/components/AppHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { categoryLabel } from "@/lib/categories";
import type { Database } from "@/integrations/supabase/types";
import { ShieldCheck, Loader2, CheckCircle2, XCircle, AlertTriangle, ThumbsUp, ThumbsDown, Trash2, MapPin, MessageSquare, Star, Lock } from "lucide-react";
import { toast } from "sonner";

type Report = Database["public"]["Tables"]["reports"]["Row"];
type VerifStatus = "en_attente" | "valide" | "rejete" | "douteux";
type PendingComment = { id: string; report_id: string; content: string; created_at: string; approved: boolean };
type Feedback = { id: string; rating: number | null; message: string | null; created_at: string };

export const Route = createFileRoute("/administrator_app")({
  head: () => ({ meta: [
    { title: "Administration — SalubApp" },
    { name: "robots", content: "noindex, nofollow" },
  ]}),
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
  const [section, setSection] = useState<"reports" | "comments" | "feedback">("reports");
  const [comments, setComments] = useState<PendingComment[] | null>(null);
  const [feedback, setFeedback] = useState<Feedback[] | null>(null);
  const [signinBusy, setSigninBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const load = async () => {
    const { data } = await supabase.from("reports").select("*").order("created_at", { ascending: false }).limit(500);
    setReports(data ?? []);
  };
  const loadComments = async () => {
    const { data } = await (supabase as any).from("report_comments")
      .select("id, report_id, content, created_at, approved")
      .order("created_at", { ascending: false }).limit(500);
    setComments(data ?? []);
  };
  const loadFeedback = async () => {
    const { data } = await (supabase as any).from("app_feedback")
      .select("id, rating, message, created_at")
      .order("created_at", { ascending: false }).limit(500);
    setFeedback(data ?? []);
  };
  useEffect(() => { if (isAdmin) { load(); loadComments(); loadFeedback(); } }, [isAdmin]);

  const adminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSigninBusy(true);
    if (user) await supabase.auth.signOut();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setSigninBusy(false);
    if (error) { toast.error("Identifiants invalides"); return; }
    toast.success("Bienvenue Admin");
  };

  const signInGoogle = async () => {
    setSigninBusy(true);
    if (user) await supabase.auth.signOut();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/administrator_app` },
    });
    if (error) { toast.error("Connexion Google impossible", { description: error.message }); setSigninBusy(false); }
  };

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

  const approveComment = async (id: string) => {
    const { error } = await (supabase as any).from("report_comments")
      .update({ approved: true, approved_at: new Date().toISOString(), approved_by: user?.id }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Commentaire approuvé"); loadComments();
  };
  const deleteComment = async (id: string) => {
    if (!confirm("Supprimer ce commentaire ?")) return;
    const { error } = await (supabase as any).from("report_comments").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    loadComments();
  };
  const deleteFeedback = async (id: string) => {
    if (!confirm("Supprimer cet avis ?")) return;
    const { error } = await (supabase as any).from("app_feedback").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    loadFeedback();
  };

  if (loading || !isAdmin) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : (
          <main className="mx-auto max-w-md px-4 py-10">
            <Card className="p-6">
              <div className="mb-4 flex items-center gap-2">
                <Lock className="h-5 w-5 text-primary" />
                <h1 className="text-xl font-bold">Espace administrateur</h1>
              </div>
              <p className="mb-4 text-sm text-muted-foreground">
                Accès réservé. Cette page n'est ni indexée ni accessible depuis le menu public.
              </p>
              <Button onClick={signInGoogle} disabled={signinBusy} variant="outline" className="w-full" size="lg">
                <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                {signinBusy ? "Connexion…" : "Continuer avec Google"}
              </Button>

              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <div className="h-px flex-1 bg-border" /> ou <div className="h-px flex-1 bg-border" />
              </div>

              <form onSubmit={adminLogin} className="space-y-3">
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
                </div>
                <div>
                  <Label htmlFor="password">Mot de passe</Label>
                  <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
                </div>
                <Button type="submit" disabled={signinBusy} className="w-full">
                  {signinBusy ? "Connexion…" : "Se connecter"}
                </Button>
              </form>
              <p className="mt-4 text-center text-xs text-muted-foreground">
                <Link to="/" className="underline">← Retour au site</Link>
              </p>
            </Card>
          </main>
        )}
      </div>
    );
  }

  const pendingCount = comments?.filter((c) => !c.approved).length ?? 0;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-6">
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <ShieldCheck className="h-6 w-6 text-primary" /> Administration
          </h1>
          <p className="text-sm text-muted-foreground">Validation des signalements, modération des commentaires et avis utilisateurs.</p>
        </div>

        <Tabs value={section} onValueChange={(v) => setSection(v as typeof section)} className="mb-4">
          <TabsList className="flex-wrap">
            <TabsTrigger value="reports"><ShieldCheck className="mr-1 h-4 w-4" />Signalements</TabsTrigger>
            <TabsTrigger value="comments"><MessageSquare className="mr-1 h-4 w-4" />Commentaires{pendingCount > 0 ? ` (${pendingCount})` : ""}</TabsTrigger>
            <TabsTrigger value="feedback"><Star className="mr-1 h-4 w-4" />Avis app{feedback ? ` (${feedback.length})` : ""}</TabsTrigger>
          </TabsList>
        </Tabs>

        {section === "reports" && (
          <>
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
          </>
        )}

        {section === "comments" && (
          <div className="space-y-3">
            {comments === null && <p className="text-sm text-muted-foreground">Chargement…</p>}
            {comments && comments.length === 0 && <p className="py-10 text-center text-muted-foreground">Aucun commentaire.</p>}
            {comments?.map((c) => (
              <Card key={c.id} className="p-4">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <Badge className={c.approved ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}>
                    {c.approved ? "Approuvé" : "En attente"}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{new Date(c.created_at).toLocaleString("fr-FR")}</span>
                </div>
                <p className="text-sm whitespace-pre-wrap">{c.content}</p>
                <p className="mt-1 text-[10px] text-muted-foreground">Signalement #{c.report_id.slice(0, 8)}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {!c.approved && (
                    <Button size="sm" className="gap-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => approveComment(c.id)}>
                      <CheckCircle2 className="h-4 w-4" /> Approuver
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" className="gap-1 text-red-600 hover:text-red-700 ml-auto" onClick={() => deleteComment(c.id)}>
                    <Trash2 className="h-4 w-4" /> Supprimer
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}

        {section === "feedback" && (
          <div className="space-y-3">
            {feedback === null && <p className="text-sm text-muted-foreground">Chargement…</p>}
            {feedback && feedback.length === 0 && <p className="py-10 text-center text-muted-foreground">Aucun avis pour le moment.</p>}
            {feedback?.map((f) => (
              <Card key={f.id} className="p-4">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-1">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} className={`h-4 w-4 ${f.rating && i < f.rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`} />
                    ))}
                  </div>
                  <span className="text-xs text-muted-foreground">{new Date(f.created_at).toLocaleString("fr-FR")}</span>
                </div>
                {f.message && <p className="text-sm whitespace-pre-wrap">{f.message}</p>}
                <div className="mt-2 flex justify-end">
                  <Button size="sm" variant="ghost" className="gap-1 text-red-600 hover:text-red-700" onClick={() => deleteFeedback(f.id)}>
                    <Trash2 className="h-4 w-4" /> Supprimer
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}

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
