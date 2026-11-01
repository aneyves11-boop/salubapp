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
import { ABIDJAN_COMMUNES, type AbidjanCommune } from "@/lib/abidjan";
import {
  generateStructureAccessCodeServerFn,
  verifyAdminSessionServerFn,
  getStructureSubscriptionsServerFn,
  reactivateSubscriptionServerFn,
  toggleSuspendSubscriptionServerFn,
  updateStructureFeeServerFn,
  addStructureSubscriptionServerFn,
  adminDeleteReportServerFn,
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
  Search,
  X,
  TrendingUp,
  DollarSign,
  Calendar,
  RefreshCw,
  Copy,
  BarChart3,
  CheckCircle,
  PauseCircle,
  Clock,
  Sparkles,
  ArrowUpDown,
} from "lucide-react";
import { toast } from "sonner";

type Report = Database["public"]["Tables"]["reports"]["Row"];
type VerifStatus = "en_attente" | "valide" | "rejete" | "douteux";
type PendingComment = { id: string; report_id: string; content: string; created_at: string; approved: boolean };
type Feedback = { id: string; rating: number | null; message: string | null; created_at: string };

export type StructureSubscription = {
  id: string;
  code: string;
  name: string;
  type: string;
  commune: AbidjanCommune | null;
  monthlyFee: number;
  createdAt: string;
  expiresAt: string;
  status: "active" | "expired" | "suspended";
  contactEmail?: string;
  contactPhone?: string;
  lastPaymentDate?: string;
  notes?: string;
};

type GeneratedInviteItem = {
  code: string;
  communeLabel: string;
  note: string;
  createdAt: string;
};

const GENERATED_CODES_STORAGE_KEY = "salubapp_admin_generated_codes_v1";
const SUBSCRIPTIONS_STORAGE_KEY = "salubapp_admin_subscriptions_v2";

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

function formatFCFA(val: number): string {
  return new Intl.NumberFormat("fr-FR").format(val) + " FCFA";
}

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

  // Vérifier si un token admin signé est déjà actif
  const [adminSessionActive, setAdminSessionActive] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return Boolean(readStoredAdminToken());
  });

  const isAuthorized = isAdmin || adminSessionActive;

  // Données
  const [reports, setReports] = useState<Report[] | null>(null);
  const [filter, setFilter] = useState<VerifStatus | "all">("en_attente");
  const [section, setSection] = useState<
    "reports" | "subscriptions" | "analytics" | "codes" | "contacts" | "comments" | "feedback"
  >("reports");
  const [comments, setComments] = useState<PendingComment[] | null>(null);
  const [feedback, setFeedback] = useState<Feedback[] | null>(null);

  // Recherche & Filtres rapides pour les signalements
  const [searchQuery, setSearchQuery] = useState("");
  const [communeFilter, setCommuneFilter] = useState<string>("all");
  const [periodFilter, setPeriodFilter] = useState<"all" | "24h" | "7d" | "30d">("all");
  const [deletingReportId, setDeletingReportId] = useState<string | null>(null);

  // Structures & Abonnements
  const [subscriptions, setSubscriptions] = useState<StructureSubscription[] | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem(SUBSCRIPTIONS_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as StructureSubscription[]) : null;
    } catch {
      return null;
    }
  });
  const [subFilter, setSubFilter] = useState<"all" | "active" | "expired" | "suspended">("all");
  const [subSearch, setSubSearch] = useState("");
  const [busySubAction, setBusySubAction] = useState<string | null>(null);

  // Formulaire d'authentification (Double mode)
  const [loginMode, setLoginMode] = useState<"supabase" | "master">("supabase");
  const [emailInput, setEmailInput] = useState("");
  const [emailPasswordInput, setEmailPasswordInput] = useState("");
  const [masterKeyInput, setMasterKeyInput] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [signinBusy, setSigninBusy] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Générateur de codes d'accès structures
  const [targetCommune, setTargetCommune] = useState<string>("all");
  const [recipientNote, setRecipientNote] = useState("");
  const [monthlyFeeInput, setMonthlyFeeInput] = useState<number>(250000);
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

  const loadSubscriptions = async () => {
    try {
      const res = await getStructureSubscriptionsServerFn({
        data: {
          adminToken: readStoredAdminToken() || undefined,
          accessToken: session?.access_token || undefined,
        },
      });
      if (res.ok && res.subscriptions) {
        setSubscriptions(res.subscriptions);
        if (typeof window !== "undefined") {
          localStorage.setItem(SUBSCRIPTIONS_STORAGE_KEY, JSON.stringify(res.subscriptions));
        }
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (isAuthorized) {
      load();
      loadComments();
      loadFeedback();
      loadSubscriptions();
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

  // Connexion avec compte Supabase (Email + Mot de passe)
  const handleSupabaseAccountLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSigninBusy(true);
    setLoginError(null);

    const cleanEmail = emailInput.trim();
    if (!cleanEmail || !emailPasswordInput) {
      setSigninBusy(false);
      setLoginError("Veuillez renseigner votre email et mot de passe administrateur.");
      return;
    }

    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password: emailPasswordInput,
      });

      if (authError || !authData.user) {
        setSigninBusy(false);
        setLoginError(authError?.message || "Identifiants Supabase incorrects.");
        return;
      }

      // Valider la session côté serveur
      const serverRes = await verifyAdminSessionServerFn({
        data: {
          accessToken: authData.session?.access_token,
          email: authData.user.email,
        },
      });

      if (serverRes.ok && serverRes.adminToken) {
        writeStoredAdminToken(serverRes.adminToken);
        setAdminToken(serverRes.adminToken);
        setAdminSessionActive(true);
        toast.success(`Bienvenue administrateur (${authData.user.email}) !`);
        return;
      }

      // Si le serveur a validé le compte
      setAdminSessionActive(true);
      toast.success("Connexion réussie !");
    } catch (err) {
      setLoginError((err as Error).message || "Erreur de connexion.");
    } finally {
      setSigninBusy(false);
    }
  };

  // Connexion via Clé Maître d'Administration
  const handleMasterKeyLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSigninBusy(true);
    setLoginError(null);

    const cleanKey = masterKeyInput.trim();
    if (!cleanKey) {
      setSigninBusy(false);
      setLoginError("Veuillez saisir votre clé d'administration.");
      return;
    }

    try {
      if (!session?.user) {
        await supabase.auth.signInAnonymously().catch(() => {});
      }

      const res = await verifyAdminSessionServerFn({
        data: { adminKey: cleanKey },
      });

      if (res.ok && res.adminToken) {
        writeStoredAdminToken(res.adminToken);
        setAdminToken(res.adminToken);
        setAdminSessionActive(true);
        toast.success("Bienvenue dans l'espace administration SalubApp");
        return;
      }

      setLoginError(res.error || "Clé d'administration incorrecte.");
    } catch (err) {
      setLoginError((err as Error).message || "Erreur de validation de la clé.");
    } finally {
      setSigninBusy(false);
    }
  };

  const handleSignOut = async () => {
    writeStoredAdminToken(null);
    setAdminToken(null);
    setAdminSessionActive(false);
    setEmailPasswordInput("");
    setMasterKeyInput("");
    setLoginError(null);
    await signOut();
    toast.info("Déconnexion réussie");
  };

  // Suppression d'urgence rapide d'un signalement (ex: erreur d'un habitant)
  const handleDeleteReport = async (reportId: string, desc: string) => {
    if (!confirm(`Supprimer définitivement ce signalement ?\n\n"${desc.slice(0, 80)}..."\n\nCette action est immédiate et effacera la photo et la position GPS.`)) {
      return;
    }

    setDeletingReportId(reportId);
    try {
      const res = await adminDeleteReportServerFn({
        data: {
          reportId,
          adminToken: readStoredAdminToken() || undefined,
          accessToken: session?.access_token || undefined,
        },
      });

      if (res.ok) {
        toast.success("Signalement supprimé définitivement");
        setReports((prev) => (prev ? prev.filter((r) => r.id !== reportId) : []));
      } else {
        // Fallback Supabase client
        const { error } = await supabase.from("reports").delete().eq("id", reportId);
        if (error) {
          toast.error("Impossible de supprimer", { description: error.message });
        } else {
          toast.success("Signalement supprimé");
          setReports((prev) => (prev ? prev.filter((r) => r.id !== reportId) : []));
        }
      }
    } catch (err) {
      toast.error("Erreur serveur", { description: (err as Error).message });
    } finally {
      setDeletingReportId(null);
    }
  };

  // Réactivation d'abonnement (+1 mois / 31 jours)
  const handleReactivateSubscription = async (code: string, structureName: string) => {
    setBusySubAction(code);
    try {
      const res = await reactivateSubscriptionServerFn({
        data: {
          code,
          additionalDays: 31,
          adminToken: readStoredAdminToken() || undefined,
          accessToken: session?.access_token || undefined,
        },
      });

      if (res.ok && res.subscription) {
        const next = (subscriptions ?? []).map((s) =>
          s.code === code ? res.subscription! : s
        );
        setSubscriptions(next);
        if (typeof window !== "undefined") {
          localStorage.setItem(SUBSCRIPTIONS_STORAGE_KEY, JSON.stringify(next));
        }
        const expDate = new Date(res.subscription.expiresAt).toLocaleDateString("fr-FR");
        toast.success(`Abonnement réactivé pour ${structureName}`, {
          description: `Validité prolongée jusqu'au ${expDate}. Le même code d'accès est actif.`,
        });
      } else {
        toast.error("Erreur lors de la réactivation", { description: res.error });
      }
    } catch (err) {
      toast.error("Erreur serveur", { description: (err as Error).message });
    } finally {
      setBusySubAction(null);
    }
  };

  // Suspension manuelle d'un abonnement
  const handleToggleSuspendSubscription = async (code: string, structureName: string) => {
    setBusySubAction(code);
    try {
      const res = await toggleSuspendSubscriptionServerFn({
        data: {
          code,
          adminToken: readStoredAdminToken() || undefined,
          accessToken: session?.access_token || undefined,
        },
      });

      if (res.ok && res.subscription) {
        const next = (subscriptions ?? []).map((s) =>
          s.code === code ? res.subscription! : s
        );
        setSubscriptions(next);
        if (typeof window !== "undefined") {
          localStorage.setItem(SUBSCRIPTIONS_STORAGE_KEY, JSON.stringify(next));
        }
        toast.info(
          res.subscription.status === "suspended"
            ? `Abonnement suspendu pour ${structureName}`
            : `Abonnement réactivé pour ${structureName}`
        );
      } else {
        toast.error("Erreur", { description: res.error });
      }
    } catch (err) {
      toast.error("Erreur serveur", { description: (err as Error).message });
    } finally {
      setBusySubAction(null);
    }
  };

  // Modification du tarif mensuel
  const handleEditFee = async (code: string, currentFee: number) => {
    const val = prompt(`Nouveau tarif mensuel pour ${code} (en FCFA) :`, currentFee.toString());
    if (!val || isNaN(Number(val))) return;
    const newFee = Number(val);

    try {
      const res = await updateStructureFeeServerFn({
        data: {
          code,
          monthlyFee: newFee,
          adminToken: readStoredAdminToken() || undefined,
          accessToken: session?.access_token || undefined,
        },
      });

      if (res.ok && res.subscription) {
        const next = (subscriptions ?? []).map((s) =>
          s.code === code ? res.subscription! : s
        );
        setSubscriptions(next);
        toast.success(`Tarif mis à jour : ${formatFCFA(newFee)} / mois`);
      }
    } catch (err) {
      toast.error("Erreur", { description: (err as Error).message });
    }
  };

  // Génération de code et création d'abonnement
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

      const structName = recipientNote.trim() || (res.commune ? `Mairie de ${res.commune}` : "Structure Partenaire");
      const item: GeneratedInviteItem = {
        code: res.code,
        communeLabel: res.commune ? `Commune de ${res.commune}` : "Grand Abidjan (au choix)",
        note: structName,
        createdAt: new Date().toISOString(),
      };

      const next = [item, ...generatedList].slice(0, 50);
      setGeneratedList(next);
      if (typeof window !== "undefined") {
        localStorage.setItem(GENERATED_CODES_STORAGE_KEY, JSON.stringify(next));
      }

      // Ajouter également à la liste des abonnements
      await addStructureSubscriptionServerFn({
        data: {
          code: res.code,
          name: structName,
          commune: res.commune || null,
          monthlyFee: monthlyFeeInput,
          adminToken,
          accessToken,
        },
      }).then(() => loadSubscriptions());

      setRecipientNote("");

      if (navigator.clipboard) {
        await navigator.clipboard.writeText(res.code).catch(() => {});
      }

      toast.success(`Nouveau code généré : ${res.code}`, {
        description: `Structure « ${structName} » abonnée avec succès pour 1 mois (${formatFCFA(monthlyFeeInput)}/mois).`,
      });
    } catch (err) {
      toast.error("Erreur serveur", { description: (err as Error).message });
    } finally {
      setGeneratingCode(false);
    }
  };

  // Statistiques signalements
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

  // Filtrage combiné recherche rapide des signalements
  const filteredReports = useMemo(() => {
    const searchNormalized = searchQuery.trim().toLowerCase();
    const now = Date.now();

    return (reports ?? []).filter((r) => {
      // 1. Statut
      if (filter !== "all" && r.verified_status !== filter) return false;

      // 2. Commune
      if (communeFilter !== "all") {
        const cLower = communeFilter.toLowerCase();
        const rVille = (r.ville || "").toLowerCase();
        const rDesc = (r.description || "").toLowerCase();
        if (!rVille.includes(cLower) && !rDesc.includes(cLower)) {
          return false;
        }
      }

      // 3. Période
      if (periodFilter !== "all") {
        const createdMs = new Date(r.created_at).getTime();
        const ageHours = (now - createdMs) / 3600000;
        if (periodFilter === "24h" && ageHours > 24) return false;
        if (periodFilter === "7d" && ageHours > 7 * 24) return false;
        if (periodFilter === "30d" && ageHours > 30 * 24) return false;
      }

      // 4. Recherche par mot-clé (description, quartier, id, catégorie)
      if (searchNormalized) {
        const idMatch = r.id.toLowerCase().includes(searchNormalized.replace("#", ""));
        const descMatch = (r.description || "").toLowerCase().includes(searchNormalized);
        const villeMatch = (r.ville || "").toLowerCase().includes(searchNormalized);
        const catMatch = (r.category || "").toLowerCase().includes(searchNormalized);
        if (!idMatch && !descMatch && !villeMatch && !catMatch) {
          return false;
        }
      }

      return true;
    });
  }, [reports, filter, communeFilter, periodFilter, searchQuery]);

  // Filtrage des abonnements
  const filteredSubscriptions = useMemo(() => {
    const list = subscriptions ?? [];
    const searchNorm = subSearch.trim().toLowerCase();
    const now = Date.now();

    return list.filter((s) => {
      const isPastDue = now > new Date(s.expiresAt).getTime();
      const effectiveStatus = s.status === "suspended" ? "suspended" : isPastDue ? "expired" : "active";

      if (subFilter !== "all" && effectiveStatus !== subFilter) return false;

      if (searchNorm) {
        const nameMatch = s.name.toLowerCase().includes(searchNorm);
        const codeMatch = s.code.toLowerCase().includes(searchNorm);
        const commMatch = (s.commune || "").toLowerCase().includes(searchNorm);
        if (!nameMatch && !codeMatch && !commMatch) return false;
      }
      return true;
    });
  }, [subscriptions, subFilter, subSearch]);

  // Analyses de rentabilité & KPI financiers
  const analytics = useMemo(() => {
    const list = subscriptions ?? [];
    const now = Date.now();
    const totalContractedMonthly = list.reduce((acc, s) => acc + s.monthlyFee, 0);

    const activeSubs = list.filter(
      (s) => s.status === "active" && new Date(s.expiresAt).getTime() >= now
    );
    const expiredSubs = list.filter(
      (s) => s.status === "expired" || new Date(s.expiresAt).getTime() < now || s.status === "suspended"
    );

    const activeRevenue = activeSubs.reduce((acc, s) => acc + s.monthlyFee, 0);
    const pendingRevenue = expiredSubs.reduce((acc, s) => acc + s.monthlyFee, 0);
    const recoveryRate = totalContractedMonthly > 0 ? Math.round((activeRevenue / totalContractedMonthly) * 100) : 0;

    // Répartition de la rentabilité par commune
    const communeBreakdown = ABIDJAN_COMMUNES.map((commune) => {
      const communeSubs = list.filter(
        (s) => (s.commune || "").toLowerCase() === commune.toLowerCase()
      );
      const feeTotal = communeSubs.reduce((acc, s) => acc + s.monthlyFee, 0);
      const isActive = communeSubs.some(
        (s) => s.status === "active" && new Date(s.expiresAt).getTime() >= now
      );

      // Calcul des signalements municipaux traités
      const communeReports = (reports ?? []).filter((r) =>
        (r.ville || "").toLowerCase().includes(commune.toLowerCase())
      );
      const resolvedCount = communeReports.filter((r) => r.verified_status === "valide").length;

      return {
        commune,
        subscribed: communeSubs.length > 0,
        subCount: communeSubs.length,
        feeTotal,
        isActive,
        resolvedCount,
        totalReports: communeReports.length,
        resolutionRate: communeReports.length > 0 ? Math.round((resolvedCount / communeReports.length) * 100) : 0,
      };
    })
      .filter((c) => c.subscribed || c.totalReports > 0)
      .sort((a, b) => b.feeTotal - a.feeTotal);

    return {
      totalContractedMonthly,
      activeRevenue,
      pendingRevenue,
      recoveryRate,
      activeCount: activeSubs.length,
      expiredCount: expiredSubs.length,
      communeBreakdown,
    };
  }, [subscriptions, reports]);

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
          <div className="mb-5 flex flex-col items-center justify-center text-center">
            <img
              src="/logo-salubapp.png"
              alt="Logo SalubApp"
              className="h-16 w-16 rounded-2xl object-cover shadow-md ring-1 ring-emerald-600/20"
            />
            <h1 className="mt-3 text-2xl font-bold tracking-tight text-foreground">
              Administration SalubApp
            </h1>
            <p className="mt-1 text-xs text-muted-foreground">
              Portail de gestion, abonnements municipaux & modération
            </p>
          </div>

          <Card className="p-6 shadow-sm border-slate-200 dark:border-slate-800">
            {/* Sélecteur de méthode de connexion */}
            <Tabs
              value={loginMode}
              onValueChange={(v) => {
                setLoginMode(v as typeof loginMode);
                setLoginError(null);
              }}
              className="mb-4"
            >
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="supabase" className="text-xs">
                  📧 Compte Supabase
                </TabsTrigger>
                <TabsTrigger value="master" className="text-xs">
                  🔑 Clé Maître Admin
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {loginError && (
              <div className="mb-4 rounded-lg border border-red-300 bg-red-50 p-3 text-xs text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                <div className="flex items-start gap-1.5 font-semibold">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                  <span>{loginError}</span>
                </div>
              </div>
            )}

            {/* Mode 1 : Connexion avec Compte Supabase (Email + Mot de passe) */}
            {loginMode === "supabase" && (
              <form onSubmit={handleSupabaseAccountLogin} className="space-y-4">
                <div>
                  <Label htmlFor="supabaseEmail" className="text-xs font-semibold">
                    Email administrateur Supabase
                  </Label>
                  <Input
                    id="supabaseEmail"
                    type="email"
                    value={emailInput}
                    onChange={(e) => {
                      setEmailInput(e.target.value);
                      setLoginError(null);
                    }}
                    placeholder="votre-email@admin.ci"
                    required
                    autoFocus
                    autoComplete="email"
                    className="mt-1.5"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="supabasePassword" className="text-xs font-semibold">
                      Mot de passe du compte
                    </Label>
                  </div>
                  <div className="relative mt-1.5">
                    <Input
                      id="supabasePassword"
                      type={showPassword ? "text" : "password"}
                      value={emailPasswordInput}
                      onChange={(e) => {
                        setEmailPasswordInput(e.target.value);
                        setLoginError(null);
                      }}
                      placeholder="••••••••••••"
                      required
                      autoComplete="current-password"
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                      tabIndex={-1}
                      aria-label="Afficher/masquer le mot de passe"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

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
                      <Lock className="h-4 w-4" /> Se connecter avec mon compte
                    </>
                  )}
                </Button>
              </form>
            )}

            {/* Mode 2 : Connexion par Clé Maître / Mot de passe direct */}
            {loginMode === "master" && (
              <form onSubmit={handleMasterKeyLogin} className="space-y-4">
                <div>
                  <Label htmlFor="masterKey" className="text-xs font-semibold">
                    Clé secrète Administrateur
                  </Label>
                  <div className="relative mt-1.5">
                    <Input
                      id="masterKey"
                      type={showPassword ? "text" : "password"}
                      value={masterKeyInput}
                      onChange={(e) => {
                        setMasterKeyInput(e.target.value);
                        setLoginError(null);
                      }}
                      placeholder="Entrez votre clé secrète administrateur"
                      required
                      autoFocus
                      className="pr-10 font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                      tabIndex={-1}
                      aria-label="Afficher/masquer la clé"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={signinBusy}
                  className="w-full gap-2 bg-emerald-700 hover:bg-emerald-800"
                  size="lg"
                >
                  {signinBusy ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Vérification…
                    </>
                  ) : (
                    <>
                      <Lock className="h-4 w-4" /> Accéder via la Clé Maître
                    </>
                  )}
                </Button>
              </form>
            )}

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
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold">
              <ShieldCheck className="h-6 w-6 text-primary" /> Administration SalubApp
            </h1>
            <p className="text-xs text-muted-foreground">
              Pilotage des abonnements municipaux, rentabilité des communes, recherche et modération.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="border-emerald-600/40 text-emerald-700 dark:text-emerald-400">
              🟢 Session Administrateur Active
            </Badge>
          </div>
        </div>

        <Tabs value={section} onValueChange={(v) => setSection(v as typeof section)} className="mb-6">
          <TabsList className="flex-wrap h-auto gap-1 p-1 bg-muted/60">
            <TabsTrigger value="reports" className="gap-1.5 text-xs py-2">
              <Search className="h-3.5 w-3.5" />
              Signalements ({stats.total})
            </TabsTrigger>
            <TabsTrigger value="subscriptions" className="gap-1.5 text-xs py-2">
              <Building2 className="h-3.5 w-3.5" />
              Structures Abonnées ({subscriptions?.length ?? 0})
            </TabsTrigger>
            <TabsTrigger value="analytics" className="gap-1.5 text-xs py-2">
              <BarChart3 className="h-3.5 w-3.5" />
              Rentabilité & Analyses
            </TabsTrigger>
            <TabsTrigger value="codes" className="gap-1.5 text-xs py-2">
              <PlusCircle className="h-3.5 w-3.5" />
              Nouveau Code
            </TabsTrigger>
            <TabsTrigger value="contacts" className="gap-1.5 text-xs py-2">
              <Mail className="h-3.5 w-3.5" />
              Contacts{contactMessages.length > 0 ? ` (${contactMessages.length})` : ""}
            </TabsTrigger>
            <TabsTrigger value="comments" className="gap-1.5 text-xs py-2">
              <MessageSquare className="h-3.5 w-3.5" />
              Commentaires{pendingCount > 0 ? ` (${pendingCount})` : ""}
            </TabsTrigger>
            <TabsTrigger value="feedback" className="gap-1.5 text-xs py-2">
              <Star className="h-3.5 w-3.5" />
              Avis App{appReviews.length > 0 ? ` (${appReviews.length})` : ""}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* 1. SECTION SIGNALEMENTS AVEC OUTIL DE RECHERCHE RAPIDE & SUPPRESSION IMMÉDIATE */}
        {section === "reports" && (
          <div className="space-y-4">
            {/* KPI Signalements */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <StatCard label="Total signalements" value={stats.total} />
              <StatCard label="À vérifier" value={stats.en_attente} accent />
              <StatCard label="Douteux" value={stats.douteux} warn />
              <StatCard label="Validés" value={stats.valide} success />
              <StatCard label="Rejetés" value={stats.rejete} danger />
            </div>

            {/* Outil de recherche rapide & filtres avancés */}
            <Card className="p-4 border-emerald-200/60 bg-emerald-50/30 dark:bg-card dark:border-slate-800">
              <div className="mb-3 flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <Search className="h-4 w-4 text-emerald-700" />
                  Outil de recherche rapide & retrait de signalement
                </span>
                {(searchQuery || communeFilter !== "all" || periodFilter !== "all" || filter !== "all") && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-muted-foreground gap-1"
                    onClick={() => {
                      setSearchQuery("");
                      setCommuneFilter("all");
                      setPeriodFilter("all");
                      setFilter("all");
                    }}
                  >
                    <X className="h-3 w-3" /> Réinitialiser les filtres
                  </Button>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-[1fr_180px_150px]">
                {/* Barre de recherche par mot-clé */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Recherche par mot-clé, rue, quartier, #ID signalement..."
                    className="pl-9 pr-8 bg-white dark:bg-card text-xs h-9"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {/* Filtre par commune */}
                <Select value={communeFilter} onValueChange={setCommuneFilter}>
                  <SelectTrigger className="h-9 text-xs bg-white dark:bg-card">
                    <SelectValue placeholder="Toutes les communes" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">🌍 Toutes les communes</SelectItem>
                    {ABIDJAN_COMMUNES.map((c) => (
                      <SelectItem key={c} value={c}>
                        📍 {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Filtre par période */}
                <Select value={periodFilter} onValueChange={(v) => setPeriodFilter(v as typeof periodFilter)}>
                  <SelectTrigger className="h-9 text-xs bg-white dark:bg-card">
                    <SelectValue placeholder="Toutes les dates" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">📅 Toutes dates</SelectItem>
                    <SelectItem value="24h">Moins de 24 heures</SelectItem>
                    <SelectItem value="7d">7 derniers jours</SelectItem>
                    <SelectItem value="30d">30 derniers jours</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Filtres de statut rapides */}
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3 border-emerald-200/40 text-xs">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-muted-foreground mr-1 text-[11px]">Statut :</span>
                  <button
                    type="button"
                    onClick={() => setFilter("all")}
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition ${
                      filter === "all" ? "bg-emerald-700 text-white" : "bg-muted hover:bg-muted/80"
                    }`}
                  >
                    Tous ({stats.total})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilter("en_attente")}
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition ${
                      filter === "en_attente" ? "bg-amber-600 text-white" : "bg-muted hover:bg-muted/80"
                    }`}
                  >
                    À vérifier ({stats.en_attente})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilter("valide")}
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition ${
                      filter === "valide" ? "bg-emerald-600 text-white" : "bg-muted hover:bg-muted/80"
                    }`}
                  >
                    Validés ({stats.valide})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilter("rejete")}
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition ${
                      filter === "rejete" ? "bg-red-600 text-white" : "bg-muted hover:bg-muted/80"
                    }`}
                  >
                    Rejetés ({stats.rejete})
                  </button>
                </div>

                <span className="font-semibold text-emerald-800 dark:text-emerald-300 text-xs">
                  {filteredReports.length} signalement(s) correspondant(s)
                </span>
              </div>
            </Card>

            {/* Liste des signalements filtrés */}
            <div className="space-y-3">
              {filteredReports.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground border rounded-lg bg-card">
                  <AlertTriangle className="mx-auto mb-2 h-8 w-8 text-amber-500 opacity-80" />
                  <p className="font-semibold text-sm text-foreground">Aucun signalement trouvé</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Modifiez vos critères de recherche ou réinitialisez les filtres.
                  </p>
                </div>
              ) : (
                filteredReports.map((r) => {
                  const v = VERIF_LABEL[r.verified_status as VerifStatus];
                  const Icon = v.icon;
                  const isDeleting = deletingReportId === r.id;

                  return (
                    <Card key={r.id} className="p-4 transition hover:border-slate-300">
                      <div className="flex flex-wrap items-start gap-4">
                        {r.photo_url ? (
                          <img
                            src={r.photo_url}
                            alt=""
                            className="h-28 w-28 shrink-0 rounded-lg object-cover ring-1 ring-border"
                          />
                        ) : (
                          <div className="flex h-28 w-28 shrink-0 items-center justify-center rounded-lg bg-muted text-xs text-muted-foreground">
                            Sans photo
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-sm">{categoryLabel(r.category)}</span>
                            <Badge className={v.color}>
                              <Icon className="mr-1 h-3 w-3" />
                              {v.label}
                            </Badge>

                            {/* ID du signalement pour recherche d'urgence */}
                            <button
                              type="button"
                              onClick={() => copyText(r.id, "ID Signalement")}
                              className="font-mono text-[11px] text-muted-foreground hover:text-foreground bg-muted/60 px-1.5 py-0.5 rounded cursor-pointer"
                              title="Cliquer pour copier l'ID complet"
                            >
                              #{r.id.slice(0, 8)}
                            </button>

                            <span className="ml-auto text-xs text-muted-foreground">
                              {new Date(r.created_at).toLocaleString("fr-FR")}
                            </span>
                          </div>

                          <p className="mt-2 text-sm leading-relaxed">{r.description}</p>

                          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                            {r.ville && (
                              <span className="flex items-center gap-1 font-medium text-foreground">
                                <MapPin className="h-3.5 w-3.5 text-primary" />
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
                              className="underline text-[11px]"
                              target="_blank"
                              rel="noreferrer"
                              href={`https://www.openstreetmap.org/?mlat=${r.latitude}&mlon=${r.longitude}#map=18/${r.latitude}/${r.longitude}`}
                            >
                              GPS : {r.latitude.toFixed(4)}, {r.longitude.toFixed(4)}
                            </a>
                          </div>

                          <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-2.5">
                            <Button
                              size="sm"
                              variant="default"
                              className="h-8 gap-1 bg-emerald-600 hover:bg-emerald-700 text-xs"
                              onClick={() => setVerification(r.id, "valide")}
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" /> Valider
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              className="h-8 gap-1 text-xs"
                              onClick={() => setVerification(r.id, "rejete")}
                            >
                              <XCircle className="h-3.5 w-3.5" /> Rejeter
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 text-xs"
                              onClick={() => setVerification(r.id, "en_attente")}
                            >
                              Réinitialiser
                            </Button>

                            {/* BOUTON SUPPRESSION D'URGENCE (Erreur citoyenne) */}
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={isDeleting}
                              className="ml-auto h-8 gap-1 text-xs text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/40"
                              onClick={() => handleDeleteReport(r.id, r.description)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              {isDeleting ? "Suppression…" : "Supprimer ce signalement"}
                            </Button>
                          </div>
                        </div>
                      </div>
                    </Card>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* 2. SECTION STRUCTURES & ABONNEMENTS MENSUELS */}
        {section === "subscriptions" && (
          <div className="space-y-4">
            {/* KPI Abonnements */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard label="Structures abonnées" value={subscriptions?.length ?? 0} />
              <StatCard label="Abonnements actifs" value={analytics.activeCount} success />
              <StatCard label="Abonnements expirés" value={analytics.expiredCount} danger />
              <StatCard label="Recouvrement mensuel" value={analytics.recoveryRate} accent />
            </div>

            {/* Filtres abonnements */}
            <Card className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="text-muted-foreground mr-1">Statut :</span>
                  <button
                    type="button"
                    onClick={() => setSubFilter("all")}
                    className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                      subFilter === "all" ? "bg-slate-900 text-white dark:bg-white dark:text-black" : "bg-muted"
                    }`}
                  >
                    Toutes ({subscriptions?.length ?? 0})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSubFilter("active")}
                    className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                      subFilter === "active" ? "bg-emerald-600 text-white" : "bg-muted"
                    }`}
                  >
                    Actifs ({analytics.activeCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSubFilter("expired")}
                    className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                      subFilter === "expired" ? "bg-red-600 text-white" : "bg-muted"
                    }`}
                  >
                    Expirés / En attente ({analytics.expiredCount})
                  </button>
                </div>

                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    type="text"
                    value={subSearch}
                    onChange={(e) => setSubSearch(e.target.value)}
                    placeholder="Filtrer structure ou code..."
                    className="pl-8 text-xs h-8"
                  />
                </div>
              </div>
            </Card>

            {/* Répertoire des structures abonnées */}
            <div className="space-y-3">
              {filteredSubscriptions.map((sub) => {
                const now = Date.now();
                const expMs = new Date(sub.expiresAt).getTime();
                const isExpired = expMs < now;
                const daysDiff = Math.ceil((expMs - now) / 86400000);
                const isSuspended = sub.status === "suspended";
                const isBusy = busySubAction === sub.code;

                const inviteMsg = `Bonjour, voici vos accès officiels SalubApp pour ${sub.name} :\n\n🔑 Code d'accréditation : ${sub.code}\n📅 Période de validité : Jusqu'au ${new Date(sub.expiresAt).toLocaleDateString("fr-FR")}\n💳 Abonnement : ${formatFCFA(sub.monthlyFee)} / mois (${isExpired ? "En attente de paiement" : "Actif"})\n🌐 Portail des Structures : ${window.location.origin}/dashboard`;

                return (
                  <Card key={sub.id + sub.code} className={`p-4 border ${isExpired ? "border-red-200 bg-red-50/20" : "border-emerald-200/80"}`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-base text-foreground">{sub.name}</span>
                          {sub.commune && (
                            <Badge variant="outline" className="text-xs">
                              📍 {sub.commune}
                            </Badge>
                          )}
                          <Badge variant="secondary" className="text-[10px]">
                            {sub.type}
                          </Badge>

                          {/* Badge de statut d'abonnement */}
                          {isSuspended ? (
                            <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                              <PauseCircle className="mr-1 h-3 w-3" /> Suspendu
                            </Badge>
                          ) : isExpired ? (
                            <Badge className="bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300">
                              <Clock className="mr-1 h-3 w-3" /> Expiré ({Math.abs(daysDiff)} j. de retard)
                            </Badge>
                          ) : (
                            <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                              <CheckCircle className="mr-1 h-3 w-3" /> Actif ({daysDiff} j. restants)
                            </Badge>
                          )}
                        </div>

                        <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1 font-mono font-bold text-emerald-800 dark:text-emerald-300 text-sm">
                            🔑 {sub.code}
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5" />
                            Échéance : <strong>{new Date(sub.expiresAt).toLocaleDateString("fr-FR")}</strong>
                          </span>
                          <span className="flex items-center gap-1 font-semibold text-foreground">
                            <DollarSign className="h-3.5 w-3.5 text-emerald-700" />
                            {formatFCFA(sub.monthlyFee)} / mois
                          </span>
                        </div>

                        {sub.notes && (
                          <p className="mt-1.5 text-xs text-muted-foreground italic">
                            Mémo : {sub.notes}
                          </p>
                        )}
                      </div>

                      {/* Actions d'abonnement */}
                      <div className="flex flex-wrap items-center gap-2">
                        {/* Bouton de réactivation / prolongation de 1 mois */}
                        <Button
                          size="sm"
                          disabled={isBusy}
                          className="bg-emerald-700 hover:bg-emerald-800 gap-1.5 text-xs"
                          onClick={() => handleReactivateSubscription(sub.code, sub.name)}
                          title="Réactiver le code pour 31 jours supplémentaires après paiement du client"
                        >
                          <RefreshCw className={`h-3.5 w-3.5 ${isBusy ? "animate-spin" : ""}`} />
                          Réactiver (+1 mois)
                        </Button>

                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isBusy}
                          className="text-xs"
                          onClick={() => handleToggleSuspendSubscription(sub.code, sub.name)}
                        >
                          {isSuspended ? "Débloquer" : "Suspendre"}
                        </Button>

                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-xs text-muted-foreground"
                          onClick={() => handleEditFee(sub.code, sub.monthlyFee)}
                        >
                          Modifier tarif
                        </Button>

                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs gap-1"
                          onClick={() => copyText(inviteMsg, "Message d'accès")}
                        >
                          <Copy className="h-3 w-3" /> Invitation
                        </Button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* 3. SECTION ANALYSES & RENTABILITÉ PAR MAIRIE */}
        {section === "analytics" && (
          <div className="space-y-6">
            {/* KPI Financiers */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Card className="p-4 bg-emerald-50/50 border-emerald-200 dark:bg-card">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Chiffre d'Affaires Mensuel</div>
                <div className="mt-1 text-2xl font-bold text-emerald-800 dark:text-emerald-300">
                  {formatFCFA(analytics.totalContractedMonthly)}
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">Souscrit sur l'ensemble des structures</div>
              </Card>

              <Card className="p-4 bg-emerald-50/70 border-emerald-300 dark:bg-card">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Revenus Actifs Recouvrés</div>
                <div className="mt-1 text-2xl font-bold text-emerald-700">
                  {formatFCFA(analytics.activeRevenue)}
                </div>
                <div className="mt-1 text-[11px] text-emerald-800 dark:text-emerald-300">
                  {analytics.activeCount} structure(s) à jour de paiement
                </div>
              </Card>

              <Card className="p-4 bg-red-50/50 border-red-200 dark:bg-card">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Montants Échus / En Attente</div>
                <div className="mt-1 text-2xl font-bold text-red-700">
                  {formatFCFA(analytics.pendingRevenue)}
                </div>
                <div className="mt-1 text-[11px] text-red-800 dark:text-red-300">
                  {analytics.expiredCount} structure(s) expirée(s)
                </div>
              </Card>

              <Card className="p-4 border-slate-200 dark:bg-card">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Taux de Rentabilité / Recouvrement</div>
                <div className="mt-1 text-2xl font-bold text-foreground">
                  {analytics.recoveryRate}%
                </div>
                <div className="mt-2 h-2 w-full rounded-full bg-slate-100 overflow-hidden dark:bg-slate-800">
                  <div
                    className="h-full bg-emerald-600 rounded-full"
                    style={{ width: `${analytics.recoveryRate}%` }}
                  />
                </div>
              </Card>
            </div>

            {/* Graphes et Analyse de Rentabilité par Commune */}
            <Card className="p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b pb-3">
                <div>
                  <h2 className="text-base font-bold flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-emerald-700" />
                    Rentabilité & Efficacité par Mairie / Commune
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Comparatif entre le montant des abonnements et le taux de résolution des signalements par commune.
                  </p>
                </div>
                <span className="text-xs text-muted-foreground font-mono">
                  {analytics.communeBreakdown.length} commune(s) actives
                </span>
              </div>

              <div className="space-y-4">
                {analytics.communeBreakdown.map((item) => {
                  const percentOfTotal =
                    analytics.totalContractedMonthly > 0
                      ? Math.round((item.feeTotal / analytics.totalContractedMonthly) * 100)
                      : 0;

                  return (
                    <div
                      key={item.commune}
                      className="rounded-lg border bg-card/60 p-3.5 transition hover:bg-muted/30"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-foreground">📍 Mairie de {item.commune}</span>
                          {item.subscribed ? (
                            item.isActive ? (
                              <Badge className="bg-emerald-100 text-emerald-800 text-[10px]">
                                Abonnement Actif
                              </Badge>
                            ) : (
                              <Badge className="bg-red-100 text-red-800 text-[10px]">
                                Paiement en attente
                              </Badge>
                            )
                          ) : (
                            <Badge variant="outline" className="text-[10px] text-muted-foreground">
                              Non abonnée
                            </Badge>
                          )}
                        </div>

                        <div className="text-right">
                          <span className="font-bold text-sm text-emerald-800 dark:text-emerald-300">
                            {formatFCFA(item.feeTotal)} / mois
                          </span>
                          <span className="text-[11px] text-muted-foreground ml-2">
                            ({percentOfTotal}% du CA)
                          </span>
                        </div>
                      </div>

                      {/* Barre visuelle de proportion financière */}
                      <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden dark:bg-slate-800 mb-2.5">
                        <div
                          className={`h-full rounded-full ${item.isActive ? "bg-emerald-600" : "bg-red-400"}`}
                          style={{ width: `${Math.max(5, percentOfTotal)}%` }}
                        />
                      </div>

                      {/* Métriques d'impact environnemental de la mairie */}
                      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground border-t pt-2 border-border/50">
                        <span>
                          Signalements enregistrés : <strong className="text-foreground">{item.totalReports}</strong>
                        </span>
                        <span>
                          Signalements résolus / validés :{" "}
                          <strong className="text-emerald-700">{item.resolvedCount}</strong> ({item.resolutionRate}%)
                        </span>
                        <span>
                          Structures actives : <strong className="text-foreground">{item.subCount}</strong>
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
        )}

        {/* 4. SECTION GÉNÉRATION DE CODES D'ACCÈS */}
        {section === "codes" && (
          <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
            <Card className="p-5 border-emerald-200 shadow-sm">
              <div className="mb-3 flex items-center gap-2 text-base font-bold">
                <Lock className="h-4 w-4 text-emerald-700" />
                Générer et Abonner une Nouvelle Structure
              </div>
              <p className="mb-4 text-xs text-muted-foreground">
                Génère instantanément un code d'accréditation officiel et crée son abonnement mensuel actif pour 1 mois.
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
                      <SelectItem value="all">🌍 Grand Abidjan / ONG (Commune au choix)</SelectItem>
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
                    Nom de la structure (ex: Mairie d'Abobo)
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

                <div>
                  <Label htmlFor="monthlyFee" className="text-xs font-semibold">
                    Tarif mensuel de l'abonnement (FCFA)
                  </Label>
                  <Input
                    id="monthlyFee"
                    type="number"
                    step={10000}
                    value={monthlyFeeInput}
                    onChange={(e) => setMonthlyFeeInput(Number(e.target.value))}
                    className="mt-1.5"
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Valable 1 mois renouvelable dès réception du paiement.
                  </p>
                </div>

                <Button
                  type="submit"
                  disabled={generatingCode}
                  className="w-full gap-1.5 bg-emerald-700 hover:bg-emerald-800"
                >
                  <PlusCircle className="h-4 w-4" />
                  {generatingCode ? "Signature du code…" : "Générer et Activer l'Abonnement"}
                </Button>
              </form>
            </Card>

            <Card className="p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-base font-bold">Codes d'accès récents</h2>
                <span className="text-xs text-muted-foreground">Actifs immédiatement</span>
              </div>

              {generatedList.length === 0 ? (
                <p className="py-10 text-center text-xs text-muted-foreground">
                  Aucun code généré depuis cet appareil. Utilisez le formulaire pour créer un code d'accès pour une Mairie.
                </p>
              ) : (
                <div className="space-y-3">
                  {generatedList.map((item) => {
                    const inviteMsg = `Bonjour, voici le code d'accréditation officiel SalubApp pour ${item.note} :\n\n🔑 Code : ${item.code}\n🌐 Portail des Structures : ${window.location.origin}/dashboard`;
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
                            onClick={() => copyText(inviteMsg, "Invitation WhatsApp")}
                          >
                            Copier l'invitation
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

        {/* 5. SECTION CONTACTS */}
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
                <p className="whitespace-pre-wrap text-sm leading-relaxed">
                  {(f.message || "").replace(/^\[CONTACT\]\n?/, "")}
                </p>
                <div className="mt-3 flex justify-end">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="gap-1 text-red-600 hover:text-red-700 text-xs"
                    onClick={() => deleteFeedback(f.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Supprimer
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* 6. SECTION COMMENTAIRES */}
        {section === "comments" && (
          <div className="space-y-3">
            {comments === null && <p className="text-sm text-muted-foreground">Chargement…</p>}
            {comments && comments.length === 0 && (
              <p className="py-10 text-center text-muted-foreground">Aucun commentaire citoyen en attente.</p>
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
                <p className="mt-1 text-[10px] text-muted-foreground font-mono">
                  Signalement #{c.report_id.slice(0, 8)}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {!c.approved && (
                    <Button
                      size="sm"
                      className="gap-1 bg-emerald-600 hover:bg-emerald-700 text-xs"
                      onClick={() => approveComment(c.id)}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" /> Approuver
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto gap-1 text-red-600 hover:text-red-700 text-xs"
                    onClick={() => deleteComment(c.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Supprimer
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* 7. SECTION AVIS APP */}
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
                    className="gap-1 text-red-600 hover:text-red-700 text-xs"
                    onClick={() => deleteFeedback(f.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Supprimer
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
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </Card>
  );
}
