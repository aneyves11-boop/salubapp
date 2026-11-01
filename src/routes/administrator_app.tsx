import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, readStoredAdminToken, writeStoredAdminToken } from "@/lib/auth-context";
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
  Eye,
  EyeOff,
  Sparkles,
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
  const { user, session, roles, signOut, setAdminToken } = useAuth();
  const isAdmin = roles.includes("admin");

  // Vérifier si un token admin signé est déjà actif dans le navigateur
  const [adminSessionActive, setAdminSessionActive] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return Boolean(readStoredAdminToken());
  });

  const isAuthorized = isAdmin || adminSessionActive;

  const [reports, setReports] = useState<Report[] | null>(null);
  const [filter, setFilter] = useState<VerifStatus | "all">("en_attente");
  const [section, setSection] = useState<"reports" | "codes" | "contacts" | "comments" | "feedback">("reports");
  const [comments, setComments] = useState<PendingComment[] | null>(null);
  const [feedback, setFeedback] = useState<Feedback[] | null>(null);

  // Formulaire d'authentification
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [signinBusy, setSigninBusy] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Optionnel : connexion email/mot de passe Supabase
  const [showEmailLogin, setShowEmailLogin] = useState(false);
  const [emailInput, setEmailInput] = useState("");
  const [emailPasswordInput, setEmailPasswordInput] = useState("");

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
    if (isAuthorized) {
      load();
      loadComments();
      loadFeedback();
    }
  }, [isAuthorized]);

  const copyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copié !`);
    } catch {
      toast.info(text);
    }
  };

  // Connexion directe par mot de passe administrateur
  const handleAdminPasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSigninBusy(true);
    setLoginError(null);

    const cleanPwd = password.trim();
    if (!cleanPwd) {
      setSigninBusy(false);
      setLoginError("Veuillez saisir le mot de passe administrateur.");
      return;
    }

    try {
      // S'assurer qu'une session authentifiée anonyme existe pour satisfaire RLS sur les signalements
      const sess = (await supabase.auth.getSession()).data.session;
      if (!sess?.user) {
        await supabase.auth.signInAnonymously().catch(() => {});
      }

      // Vérification côté serveur
      const res = await verifyAdminSessionServerFn({
        data: { adminKey: cleanPwd },
      });

      if (res.ok && res.adminToken) {
        writeStoredAdminToken(res.adminToken);
        setAdminToken(res.adminToken);
        setAdminSessionActive(true);
        toast.success("Bienvenue dans l'espace administration SalubApp");
        return;
      }

      setLoginError(
        res.error ||
          "Mot de passe administrateur incorrect. Veuillez vérifier la saisie ou utiliser le mot de passe officiel ci-dessous."
      );
    } catch (err) {
      setLoginError((err as Error).message || "Erreur de vérification du mot de passe.");
    } finally {
      setSigninBusy(false);
    }
  };

  // Connexion alternative via email + mot de passe Supabase
  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSigninBusy(true);
    setLoginError(null);

    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: emailInput.trim(),
        password: emailPasswordInput,
      });

      if (authError) {
        setSigninBusy(false);
        setLoginError(`Identifiants Supabase invalides : ${authError.message}`);
        return;
      }

      const serverRes = await verifyAdminSessionServerFn({
        data: { accessToken: authData.session?.access_token },
      });

      if (serverRes.ok && serverRes.adminToken) {
        writeStoredAdminToken(serverRes.adminToken);
        setAdminToken(serverRes.adminToken);
        setAdminSessionActive(true);
        toast.success("Bienvenue dans l'administration SalubApp");
      } else {
        setLoginError(
          "Compte connecté, mais le rôle administrateur n'est pas configuré pour cet email dans Supabase. Utilisez plutôt le mot de passe administrateur ci-dessus."
        );
      }
    } catch (err) {
      setLoginError((err as Error).message || "Erreur de connexion.");
    } finally {
      setSigninBusy(false);
    }
  };

  const handleSignOut = async () => {
    writeStoredAdminToken(null);
    setAdminToken(null);
    setAdminSessionActive(false);
    setPassword("");
    setLoginError(null);
    await signOut();
    toast.info("Déconnexion réussie");
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

  // VUE DE CONNEXION (si non autorisé)
  if (!isAuthorized) {
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
            {/* Formulaire principal : Mot de passe administrateur */}
            <form onSubmit={handleAdminPasswordLogin} className="space-y-4">
              <div>
                <Label htmlFor="adminPassword" className="text-xs font-semibold">
                  Mot de passe administrateur
                </Label>
                <div className="relative mt-1.5">
                  <Input
                    id="adminPassword"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setLoginError(null);
                    }}
                    placeholder="Entrez le mot de passe administrateur"
                    required
                    autoFocus
                    autoComplete="current-password"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                    tabIndex={-1}
                    aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {loginError && (
                <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-xs text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                  <div className="flex items-start gap-1.5 font-bold">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                    <span>{loginError}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between border-t border-red-200/60 pt-2 dark:border-red-900/60">
                    <span className="text-[11px] text-muted-foreground">Mot de passe par défaut :</span>
                    <button
                      type="button"
                      onClick={() => {
                        setPassword("SALUBAPP-ADMIN-2026");
                        setLoginError(null);
                      }}
                      className="font-mono text-[11px] font-bold text-red-700 underline hover:text-red-900 dark:text-red-300"
                    >
                      SALUBAPP-ADMIN-2026
                    </button>
                  </div>
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
                    <Lock className="h-4 w-4" /> Accéder à l'administration
                  </>
                )}
              </Button>

              <div className="rounded-lg bg-emerald-50/70 p-2.5 text-center text-xs text-emerald-900 border border-emerald-200/60 dark:bg-emerald-950/30 dark:border-emerald-900 dark:text-emerald-300">
                <span className="text-muted-foreground">Mot de passe officiel : </span>
                <button
                  type="button"
                  onClick={() => {
                    setPassword("SALUBAPP-ADMIN-2026");
                    setLoginError(null);
                  }}
                  className="inline-flex items-center gap-1 font-mono font-bold text-emerald-800 underline hover:text-emerald-950 dark:text-emerald-300 cursor-pointer"
                >
                  <Sparkles className="h-3 w-3 text-emerald-600" /> SALUBAPP-ADMIN-2026
                </button>
              </div>
            </form>

            {/* Accordéon optionnel : Connexion Supabase par email */}
            <div className="mt-6 border-t pt-4 text-center">
              <button
                type="button"
                onClick={() => setShowEmailLogin((v) => !v)}
                className="text-xs text-muted-foreground underline hover:text-foreground cursor-pointer"
              >
                {showEmailLogin
                  ? "Masquer la connexion par email"
                  : "Connexion alternative avec compte email Supabase"}
              </button>

              {showEmailLogin && (
                <form onSubmit={handleEmailLogin} className="mt-4 space-y-3 text-left">
                  <div>
                    <Label htmlFor="emailInput" className="text-xs font-semibold">
                      Email
                    </Label>
                    <Input
                      id="emailInput"
                      type="email"
                      value={emailInput}
                      onChange={(e) => setEmailInput(e.target.value)}
                      placeholder="admin@salubapp.ci"
                      required
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="emailPasswordInput" className="text-xs font-semibold">
                      Mot de passe de compte
                    </Label>
                    <Input
                      id="emailPasswordInput"
                      type="password"
                      value={emailPasswordInput}
                      onChange={(e) => setEmailPasswordInput(e.target.value)}
                      placeholder="••••••••••••"
                      required
                      className="mt-1"
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={signinBusy}
                    variant="outline"
                    className="w-full text-xs"
                    size="sm"
                  >
                    Se connecter avec cet email
                  </Button>
                </form>
              )}
            </div>

            <p className="mt-6 text-center text-xs text-muted-foreground">
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

  // VUE DU TABLEAU DE BORD ADMINISTRATEUR (autorisé)
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <AdminHeader onSignOut={handleSignOut} />
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
