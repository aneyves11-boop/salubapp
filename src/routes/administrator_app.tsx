import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, readStoredAdminToken } from "@/lib/auth-context";
import { AppFooter } from "@/components/AppFooter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { categoryLabel } from "@/lib/categories";
import { ABIDJAN_COMMUNES } from "@/lib/abidjan";
import {
  generateStructureAccessCodeServerFn,
  verifyAdminSessionServerFn,
} from "@/lib/structure-auth-fn";
import type { Database } from "@/integrations/supabase/types";
import {
  ShieldCheck,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ThumbsUp,
  ThumbsDown,
  Trash2,
  MapPin,
  MessageSquare,
  Star,
  Lock,
  Mail,
  Building2,
  PlusCircle,
  LogOut,
} from "lucide-react";
import { toast } from "sonner";

type Report = Database["public"]["Tables"]["reports"]["Row"];
type VerifStatus = "en_attente" | "valide" | "rejete" | "douteux";
type PendingComment = { id: string; report_id: string; content: string; created_at: string; approved: boolean };
type Feedback = { id: string; rating: number | null; message: string | null; created_at: string };

type GeneratedInviteItem = {
  code: string;
  communeLabel: string;
  note: string;
  createdAt: string;
};

const GENERATED_CODES_STORAGE_KEY = "salubapp_admin_generated_codes_v1";

export const Route = createFileRoute("/administrator_app")({
  head: () => ({
    meta: [
      { title: "Administration SalubApp" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminPage,
});

const VERIF_LABEL: Record<VerifStatus, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  en_attente: { label: "En attente", color: "bg-slate-100 text-slate-700", icon: AlertTriangle },
  valide: { label: "Validé", color: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 },
  rejete: { label: "Rejeté", color: "bg-red-100 text-red-700", icon: XCircle },
  douteux: { label: "Douteux", color: "bg-amber-100 text-amber-700", icon: AlertTriangle },
};

function AdminHeader({ onSignOut }: { onSignOut: () => void }) {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <div className="flex items-center gap-2.5">
          <img
            src="/logo-salubapp.png"
            alt="SalubApp"
            className="h-8 w-8 rounded-lg object-cover shadow-xs"
          />
          <div>
            <div className="text-sm font-bold leading-none text-foreground">
              SalubApp <span className="text-emerald-700">· Administration</span>
            </div>
            <div className="text-[10px] text-muted-foreground">Espace Modération & Collectivités</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button asChild size="sm" variant="ghost" className="text-xs">
            <Link to="/">Site public ↗</Link>
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-xs gap-1 border-slate-300"
            onClick={onSignOut}
          >
            <LogOut className="h-3.5 w-3.5" />
            Déconnexion
          </Button>
        </div>
      </div>
    </header>
  );
}

function AdminPage() {
  const { user, session, roles, loading, signOut, refreshRoles, setAdminToken } = useAuth();
  const isAdmin = roles.includes("admin");
  const [reports, setReports] = useState<Report[] | null>(null);
  const [filter, setFilter] = useState<VerifStatus | "all">("en_attente");
  const [section, setSection] = useState<"reports" | "codes" | "contacts" | "comments" | "feedback">("reports");
  const [comments, setComments] = useState<PendingComment[] | null>(null);
  const [feedback, setFeedback] = useState<Feedback[] | null>(null);
  const [signinBusy, setSigninBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [directAdminKey, setDirectAdminKey] = useState("");
  const [showDirectKeyField, setShowDirectKeyField] = useState(false);
  const [missingAdminAlert, setMissingAdminAlert] = useState<{ userId: string; email: string } | null>(null);
  const [masterKeyInput, setMasterKeyInput] = useState("");

  // Générateur de codes d'accès structures (SalubApp)
  const [targetCommune, setTargetCommune] = useState<string>("all");
  const [recipientNote, setRecipientNote] = useState("");
  const [generatingCode, setGeneratingCode] = useState(false);
  const [generatedList, setGeneratedList] = useState<GeneratedInviteItem[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem(GENERATED_CODES_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as GeneratedInviteItem[]) : [];
    } catch {
      return [];
    }
  });

  const load = async () => {
    const { data } = await supabase
      .from("reports")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    setReports(data ?? []);
  };
  const loadComments = async () => {
    const { data } = await (supabase as any)
      .from("report_comments")
      .select("id, report_id, content, created_at, approved")
      .order("created_at", { ascending: false })
      .limit(500);
    setComments(data ?? []);
  };
  const loadFeedback = async () => {
    const { data } = await (supabase as any)
      .from("app_feedback")
      .select("id, rating, message, created_at")
      .order("created_at", { ascending: false })
      .limit(500);
    setFeedback(data ?? []);
  };

  useEffect(() => {
    if (isAdmin) {
      load();
      loadComments();
      loadFeedback();
    }
  }, [isAdmin]);

  const copyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copié !`);
    } catch {
      toast.info(text);
    }
  };

  const adminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSigninBusy(true);
    setMissingAdminAlert(null);

    // Option 1 : Connexion directe avec la clé maître si email vide ou mode clé
    if (!email.trim() && directAdminKey.trim()) {
      try {
        const res = await verifyAdminSessionServerFn({
          data: { adminKey: directAdminKey.trim() },
        });
        if (res.ok && res.adminToken) {
          setAdminToken(res.adminToken);
          await refreshRoles();
          toast.success("Connexion réussie avec la clé d'administration");
        } else {
          toast.error(res.error || "Clé d'administration invalide");
        }
      } catch (err) {
        toast.error("Erreur serveur", { description: (err as Error).message });
      } finally {
        setSigninBusy(false);
      }
      return;
    }

    // Option 2 : Connexion standard Supabase Auth Email + Mot de passe
    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (authError) {
        setSigninBusy(false);
        toast.error("Identifiants incorrects", { description: authError.message });
        return;
      }

      if (!authData.user) {
        setSigninBusy(false);
        toast.error("Utilisateur introuvable");
        return;
      }

      // Valider ou dériver le jeton administrateur côté serveur
      const serverRes = await verifyAdminSessionServerFn({
        data: {
          accessToken: authData.session?.access_token,
          adminKey: directAdminKey.trim() || undefined,
        },
      }).catch(() => ({ ok: false, adminToken: undefined }));

      if (serverRes.ok && serverRes.adminToken) {
        setAdminToken(serverRes.adminToken);
      }

      await refreshRoles();

      // Vérifier les rôles réels
      const { data: roleRows } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", authData.user.id);
      const userRoles = (roleRows ?? []).map((r) => r.role);

      if (userRoles.includes("admin") || serverRes.ok) {
        toast.success("Bienvenue dans l'espace administration SalubApp");
      } else {
        setMissingAdminAlert({
          userId: authData.user.id,
          email: authData.user.email || email,
        });
        toast.warning("Compte connecté, rôle administrateur en attente", {
          description: "Entrez la clé d'administration ci-dessous pour activer l'accès.",
        });
      }
    } catch (err) {
      toast.error("Erreur de connexion", { description: (err as Error).message });
    } finally {
      setSigninBusy(false);
    }
  };

  const activateWithKey = async () => {
    if (!masterKeyInput.trim()) {
      toast.error("Veuillez saisir la clé d'administration");
      return;
    }
    setSigninBusy(true);
    try {
      const res = await verifyAdminSessionServerFn({
        data: {
          accessToken: session?.access_token || undefined,
          adminKey: masterKeyInput.trim(),
        },
      });
      if (res.ok && res.adminToken) {
        setAdminToken(res.adminToken);
        await refreshRoles();
        setMissingAdminAlert(null);
        toast.success("Rôle administrateur activé avec succès !");
      } else {
        toast.error(res.error || "Clé d'administration incorrecte");
      }
    } catch (err) {
      toast.error("Erreur serveur", { description: (err as Error).message });
    } finally {
      setSigninBusy(false);
    }
  };

  const signInGoogle = async () => {
    setSigninBusy(true);
    if (user) await supabase.auth.signOut();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/administrator_app` },
    });
    if (error) {
      toast.error("Connexion Google impossible", { description: error.message });
      setSigninBusy(false);
    }
  };

  const handleGenerateCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const accessToken = session?.access_token || "";
    const adminToken = readStoredAdminToken() || undefined;

    setGeneratingCode(true);
    try {
      const res = await generateStructureAccessCodeServerFn({
        data: {
          commune: targetCommune === "all" ? null : targetCommune,
          accessToken,
          adminToken,
        },
      });

      if (!res.ok || !res.code) {
        toast.error("Impossible de générer le code", { description: res.error });
        return;
      }

      const item: GeneratedInviteItem = {
        code: res.code,
        communeLabel: res.commune ? `Commune de ${res.commune}` : "Grand Abidjan (au choix)",
        note: recipientNote.trim() || (res.commune ? `Mairie de ${res.commune}` : "Partenaire / ONG"),
        createdAt: new Date().toISOString(),
      };

      const next = [item, ...generatedList].slice(0, 50);
      setGeneratedList(next);
      if (typeof window !== "undefined") {
        localStorage.setItem(GENERATED_CODES_STORAGE_KEY, JSON.stringify(next));
      }
      setRecipientNote("");

      if (navigator.clipboard) {
        await navigator.clipboard.writeText(res.code).catch(() => {});
      }

      toast.success(`Nouveau code généré : ${res.code}`, {
        description: "Le code a été copié dans votre presse-papiers et est actif immédiatement.",
      });
    } catch (err) {
      toast.error("Erreur serveur", { description: (err as Error).message });
    } finally {
      setGeneratingCode(false);
    }
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

  const contactMessages = useMemo(
    () => (feedback ?? []).filter((f) => (f.message || "").startsWith("[CONTACT]")),
    [feedback]
  );

  const appReviews = useMemo(
    () => (feedback ?? []).filter((f) => !(f.message || "").startsWith("[CONTACT]")),
    [feedback]
  );

  const setVerification = async (id: string, status: VerifStatus) => {
    const { error } = await supabase.from("reports").update({ verified_status: status }).eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Marqué : ${VERIF_LABEL[status].label}`);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Supprimer définitivement ce signalement ?")) return;
    const { error } = await supabase.from("reports").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Supprimé");
    load();
  };

  const approveComment = async (id: string) => {
    const { error } = await (supabase as any)
      .from("report_comments")
      .update({ approved: true, approved_at: new Date().toISOString(), approved_by: user?.id })
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Commentaire approuvé");
    loadComments();
  };
  const deleteComment = async (id: string) => {
    if (!confirm("Supprimer ce commentaire ?")) return;
    const { error } = await (supabase as any).from("report_comments").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    loadComments();
  };
  const deleteFeedback = async (id: string) => {
    if (!confirm("Supprimer cette entrée ?")) return;
    const { error } = await (supabase as any).from("app_feedback").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    loadFeedback();
  };

  if (loading || !isAdmin) {
    return (
      <div className="min-h-screen bg-background flex flex-col justify-between">
        <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12">
          {/* Logo SalubApp centré juste au-dessus du bloc */}
          <div className="mb-4 flex flex-col items-center justify-center text-center">
            <img
              src="/logo-salubapp.png"
              alt="Logo SalubApp"
              className="h-16 w-16 rounded-2xl object-cover shadow-md ring-1 ring-emerald-600/20"
            />
            <h1 className="mt-3 text-2xl font-bold tracking-tight text-foreground">
              Administration SalubApp
            </h1>
            <p className="mt-1 text-xs text-muted-foreground">
              Espace de modération et gestion sécurisé
            </p>
          </div>

          <Card className="p-6 shadow-sm border-slate-200 dark:border-slate-800">
            {missingAdminAlert && (
              <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3.5 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                <div className="flex items-center gap-1.5 font-bold">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                  Compte connecté ({missingAdminAlert.email}) sans rôle admin
                </div>
                <p className="mt-1.5 leading-relaxed">
                  Votre compte est authentifié dans Supabase, mais n'a pas encore le rôle « admin » dans la base de données.
                  Activez-le immédiatement avec la clé d'administration ou la commande SQL.
                </p>
                <div className="mt-2.5 flex items-center gap-2">
                  <Input
                    type="password"
                    placeholder="Clé admin (ex: SALUBAPP-ADMIN-2026)"
                    value={masterKeyInput}
                    onChange={(e) => setMasterKeyInput(e.target.value)}
                    className="h-8 text-xs bg-white dark:bg-card"
                  />
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 bg-emerald-700 hover:bg-emerald-800 shrink-0 text-xs"
                    onClick={activateWithKey}
                    disabled={signinBusy}
                  >
                    Activer
                  </Button>
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px] text-amber-800 dark:text-amber-300">
                  <span>Ou via Supabase SQL :</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[10px] underline"
                    onClick={() =>
                      copyText(
                        `INSERT INTO public.user_roles (user_id, role) VALUES ('${missingAdminAlert.userId}', 'admin') ON CONFLICT DO NOTHING;`,
                        "Requête SQL"
                      )
                    }
                  >
                    Copier le SQL
                  </Button>
                </div>
              </div>
            )}

            <form onSubmit={adminLogin} className="space-y-3.5">
              <div>
                <Label htmlFor="email" className="text-xs font-semibold">
                  Email administrateur
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@salubapp.ci"
                  required
                  autoComplete="email"
                  className="mt-1"
                />
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-xs font-semibold">
                    Mot de passe
                  </Label>
                </div>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  required
                  autoComplete="current-password"
                  className="mt-1"
                />
              </div>

              {showDirectKeyField && (
                <div className="rounded-md border border-slate-200 bg-muted/40 p-3 dark:border-slate-800">
                  <Label htmlFor="directAdminKey" className="text-xs font-semibold">
                    Clé secrète Administrateur (Optionnel)
                  </Label>
                  <Input
                    id="directAdminKey"
                    type="password"
                    value={directAdminKey}
                    onChange={(e) => setDirectAdminKey(e.target.value)}
                    placeholder="Clé maître (ex: SALUBAPP-ADMIN-2026)"
                    className="mt-1 h-8 text-xs bg-white dark:bg-card"
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Permet la connexion immédiate même si le rôle SQL n'est pas encore assigné.
                  </p>
                </div>
              )}

              <Button
                type="submit"
                disabled={signinBusy}
                className="w-full gap-2 bg-emerald-700 hover:bg-emerald-800"
                size="lg"
              >
                {signinBusy ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Connexion en cours…
                  </>
                ) : (
                  <>
                    <Lock className="h-4 w-4" /> Se connecter à l'administration
                  </>
                )}
              </Button>

              <div className="flex items-center justify-between pt-1 text-xs">
                <button
                  type="button"
                  onClick={() => setShowDirectKeyField((v) => !v)}
                  className="text-muted-foreground hover:text-foreground underline text-[11px]"
                >
                  {showDirectKeyField ? "Masquer la clé maître" : "Entrer une clé maître admin"}
                </button>
              </div>
            </form>

            <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
              <div className="h-px flex-1 bg-border" /> ou <div className="h-px flex-1 bg-border" />
            </div>

            <Button
              onClick={signInGoogle}
              disabled={signinBusy}
              variant="outline"
              className="w-full text-xs"
              size="sm"
            >
              <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Continuer avec Google
            </Button>

            <p className="mt-4 text-center text-xs text-muted-foreground">
              <Link to="/" className="underline hover:text-foreground">
                ← Retour au site public
              </Link>
            </p>
          </Card>
        </main>
        <AppFooter />
      </div>
    );
  }

  const pendingCount = comments?.filter((c) => !c.approved).length ?? 0;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <AdminHeader onSignOut={() => signOut()} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <div className="mb-6">
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <ShieldCheck className="h-6 w-6 text-primary" /> Administration SalubApp
          </h1>
          <p className="text-sm text-muted-foreground">
            Validation des signalements, génération de codes d'accès structures, messages de contact et modération.
          </p>
        </div>

        <Tabs value={section} onValueChange={(v) => setSection(v as typeof section)} className="mb-5">
          <TabsList className="flex-wrap">
            <TabsTrigger value="reports">
              <ShieldCheck className="mr-1 h-4 w-4" />
              Signalements
            </TabsTrigger>
            <TabsTrigger value="codes">
              <Building2 className="mr-1 h-4 w-4" />
              Codes Structures
            </TabsTrigger>
            <TabsTrigger value="contacts">
              <Mail className="mr-1 h-4 w-4" />
              Contacts{contactMessages.length > 0 ? ` (${contactMessages.length})` : ""}
            </TabsTrigger>
            <TabsTrigger value="comments">
              <MessageSquare className="mr-1 h-4 w-4" />
              Commentaires{pendingCount > 0 ? ` (${pendingCount})` : ""}
            </TabsTrigger>
            <TabsTrigger value="feedback">
              <Star className="mr-1 h-4 w-4" />
              Avis app{appReviews.length > 0 ? ` (${appReviews.length})` : ""}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {section === "codes" && (
          <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
            <Card className="p-5 border-emerald-200 shadow-sm">
              <div className="mb-3 flex items-center gap-2 text-base font-bold">
                <Lock className="h-4 w-4 text-emerald-700" />
                Générer un nouveau code d'accès
              </div>
              <p className="mb-4 text-xs text-muted-foreground">
                Crée instantanément un code officiel signé par le serveur SalubApp pour une nouvelle Mairie, ONG ou opérateur sur <code>/dashboard</code>.
              </p>

              <form onSubmit={handleGenerateCode} className="space-y-4">
                <div>
                  <Label htmlFor="targetCommune" className="text-xs font-semibold">
                    Périmètre communal attribué au code *
                  </Label>
                  <Select value={targetCommune} onValueChange={setTargetCommune}>
                    <SelectTrigger id="targetCommune" className="mt-1.5">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">
                        🌍 Grand Abidjan / ONG (Commune au choix)
                      </SelectItem>
                      {ABIDJAN_COMMUNES.map((c) => (
                        <SelectItem key={c} value={c}>
                          📍 Mairie / Commune de {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="recipientNote" className="text-xs font-semibold">
                    Nom du destinataire (mémo interne)
                  </Label>
                  <Input
                    id="recipientNote"
                    type="text"
                    value={recipientNote}
                    onChange={(e) => setRecipientNote(e.target.value)}
                    placeholder="Ex: Mairie d'Abobo — Dir. Technique"
                    className="mt-1.5"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={generatingCode}
                  className="w-full gap-1.5 bg-emerald-700 hover:bg-emerald-800"
                >
                  <PlusCircle className="h-4 w-4" />
                  {generatingCode ? "Signature du code…" : "Générer le code officiel"}
                </Button>
              </form>
            </Card>

            <Card className="p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-base font-bold">Codes générés récemment</h2>
                <span className="text-xs text-muted-foreground">
                  Actifs immédiatement sans redéploiement
                </span>
              </div>

              {generatedList.length === 0 ? (
                <p className="py-10 text-center text-xs text-muted-foreground">
                  Aucun code généré depuis cet appareil pour le moment. Utilisez le formulaire ci-contre pour créer un code pour une nouvelle structure.
                </p>
              ) : (
                <div className="space-y-3">
                  {generatedList.map((item) => {
                    const inviteMsg = `Bonjour, voici votre code d'accréditation officiel SalubApp pour ${item.note} :\n\n🔑 Code : ${item.code}\n🌐 Portail Structures : ${window.location.origin}/dashboard`;
                    return (
                      <div
                        key={item.code + item.createdAt}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3"
                      >
                        <div>
                          <div className="font-mono text-base font-bold tracking-wider text-emerald-700">
                            {item.code}
                          </div>
                          <div className="text-xs font-medium text-foreground">
                            {item.note} · <span className="text-muted-foreground">{item.communeLabel}</span>
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            Créé le {new Date(item.createdAt).toLocaleString("fr-FR")}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => copyText(item.code, "Code")}
                          >
                            Copier le code
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            className="bg-emerald-700 hover:bg-emerald-800"
                            onClick={() => copyText(inviteMsg, "Message d'invitation")}
                          >
                            Copier l'invitation WhatsApp/Mail
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>
        )}

        {section === "contacts" && (
          <div className="space-y-3">
            {feedback === null && <p className="text-sm text-muted-foreground">Chargement…</p>}
            {feedback && contactMessages.length === 0 && (
              <p className="py-10 text-center text-muted-foreground">
                Aucun message reçu via la page « Nous contacter » pour le moment.
              </p>
            )}
            {contactMessages.map((f) => (
              <Card key={f.id} className="p-4 border-emerald-200/80">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <Badge className="bg-emerald-100 text-emerald-800">
                    📩 Message Contact
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {new Date(f.created_at).toLocaleString("fr-FR")}
                  </span>
                </div>
                <p className="whitespace-pre-wrap text-sm">
                  {(f.message || "").replace(/^\[CONTACT\]\n?/, "")}
                </p>
                <div className="mt-3 flex justify-end">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="gap-1 text-red-600 hover:text-red-700"
                    onClick={() => deleteFeedback(f.id)}
                  >
                    <Trash2 className="h-4 w-4" /> Supprimer
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}

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
                        {r.photo_url && (
                          <img
                            src={r.photo_url}
                            alt=""
                            className="h-28 w-28 shrink-0 rounded-lg object-cover"
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold">{categoryLabel(r.category)}</span>
                            <Badge className={v.color}>
                              <Icon className="mr-1 h-3 w-3" />
                              {v.label}
                            </Badge>
                            <span className="ml-auto text-xs text-muted-foreground">
                              {new Date(r.created_at).toLocaleString("fr-FR")}
                            </span>
                          </div>
                          <p className="mt-2 text-sm">{r.description}</p>
                          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                            {r.ville && (
                              <span className="flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {r.ville}
                              </span>
                            )}
                            <span className="flex items-center gap-1 text-emerald-700">
                              <ThumbsUp className="h-3 w-3" />
                              {r.true_count} vrai
                            </span>
                            <span className="flex items-center gap-1 text-red-700">
                              <ThumbsDown className="h-3 w-3" />
                              {r.false_count} faux
                            </span>
                            <a
                              className="underline"
                              target="_blank"
                              rel="noreferrer"
                              href={`https://www.openstreetmap.org/?mlat=${r.latitude}&mlon=${r.longitude}#map=18/${r.latitude}/${r.longitude}`}
                            >
                              {r.latitude.toFixed(4)}, {r.longitude.toFixed(4)}
                            </a>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              variant="default"
                              className="gap-1 bg-emerald-600 hover:bg-emerald-700"
                              onClick={() => setVerification(r.id, "valide")}
                            >
                              <CheckCircle2 className="h-4 w-4" /> Valider
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              className="gap-1"
                              onClick={() => setVerification(r.id, "rejete")}
                            >
                              <XCircle className="h-4 w-4" /> Rejeter
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1"
                              onClick={() => setVerification(r.id, "en_attente")}
                            >
                              Réinitialiser
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="ml-auto gap-1 text-red-600 hover:text-red-700"
                              onClick={() => remove(r.id)}
                            >
                              <Trash2 className="h-4 w-4" /> Supprimer
                            </Button>
                          </div>
                        </div>
                      </div>
                    </Card>
                  );
                })}
                {reports && filtered.length === 0 && (
                  <p className="py-10 text-center text-muted-foreground">
                    Aucun signalement dans cette catégorie.
                  </p>
                )}
              </TabsContent>
            </Tabs>
          </>
        )}

        {section === "comments" && (
          <div className="space-y-3">
            {comments === null && <p className="text-sm text-muted-foreground">Chargement…</p>}
            {comments && comments.length === 0 && (
              <p className="py-10 text-center text-muted-foreground">Aucun commentaire.</p>
            )}
            {comments?.map((c) => (
              <Card key={c.id} className="p-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <Badge
                    className={
                      c.approved ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                    }
                  >
                    {c.approved ? "Approuvé" : "En attente"}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {new Date(c.created_at).toLocaleString("fr-FR")}
                  </span>
                </div>
                <p className="whitespace-pre-wrap text-sm">{c.content}</p>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Signalement #{c.report_id.slice(0, 8)}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {!c.approved && (
                    <Button
                      size="sm"
                      className="gap-1 bg-emerald-600 hover:bg-emerald-700"
                      onClick={() => approveComment(c.id)}
                    >
                      <CheckCircle2 className="h-4 w-4" /> Approuver
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto gap-1 text-red-600 hover:text-red-700"
                    onClick={() => deleteComment(c.id)}
                  >
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
            {feedback && appReviews.length === 0 && (
              <p className="py-10 text-center text-muted-foreground">Aucun avis pour le moment.</p>
            )}
            {appReviews.map((f) => (
              <Card key={f.id} className="p-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star
                        key={i}
                        className={`h-4 w-4 ${
                          f.rating && i < f.rating
                            ? "fill-amber-400 text-amber-400"
                            : "text-muted-foreground"
                        }`}
                      />
                    ))}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(f.created_at).toLocaleString("fr-FR")}
                  </span>
                </div>
                {f.message && <p className="whitespace-pre-wrap text-sm">{f.message}</p>}
                <div className="mt-2 flex justify-end">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="gap-1 text-red-600 hover:text-red-700"
                    onClick={() => deleteFeedback(f.id)}
                  >
                    <Trash2 className="h-4 w-4" /> Supprimer
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}

        <p className="mt-8 text-center text-xs text-muted-foreground">
          <Link to="/" className="underline">
            ← Retour au fil public
          </Link>
        </p>
      </main>
      <AppFooter />
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
  success,
  warn,
  danger,
}: {
  label: string;
  value: number;
  accent?: boolean;
  success?: boolean;
  warn?: boolean;
  danger?: boolean;
}) {
  const bg = accent
    ? "bg-accent/30"
    : success
    ? "bg-emerald-50"
    : warn
    ? "bg-amber-50"
    : danger
    ? "bg-red-50"
    : "";
  return (
    <Card className={`p-4 ${bg}`}>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-3xl font-bold">{value}</div>
    </Card>
  );
}
