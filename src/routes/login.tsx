import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { MapPin, ArrowLeft, UserCircle2, ShieldCheck, Lock, Building2, CheckCircle2 } from "lucide-react";

const STRUCTURE_TYPES = [
  { value: "Mairie / Collectivité", label: "🏛️ Mairie / Collectivité locale" },
  { value: "ONG / Association", label: "🌱 ONG / Association citoyenne" },
  { value: "Opérateur de salubrité", label: "🚛 Opérateur technique / Service de salubrité" },
  { value: "Entreprise / RSE", label: "🏢 Entreprise privée / Programme RSE" },
  { value: "Autre structure", label: "🤝 Autre structure ou institution" },
] as const;

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [
    { title: "Accès Citoyen & Inscription Structure — SalubApp" },
    { name: "description", content: "Signalez en mode 100 % anonyme ou inscrivez votre structure (Mairie, ONG, Association) pour accéder aux données de salubrité." },
  ]}),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { user, isAutorite, setStructureProfile } = useAuth();
  const [loading, setLoading] = useState(false);

  const [activeTab, setActiveTab] = useState<"citoyen" | "structure">("structure");

  // État du formulaire Structure (Inscription / Connexion)
  const [authMode, setAuthMode] = useState<"register" | "login">("register");
  const [structureName, setStructureName] = useState("");
  const [structureType, setStructureType] = useState<string>(STRUCTURE_TYPES[0].value);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("mode") === "structure") {
        setActiveTab("structure");
        return;
      }
      // Si l'utilisateur n'est pas encore connecté du tout et n'a pas demandé ?mode=structure, on affiche l'onglet citoyen par défaut
      if (!user) {
        setActiveTab("citoyen");
      }
    }
  }, [user]);

  useEffect(() => {
    if (user && isAutorite) {
      navigate({ to: "/dashboard" });
    }
  }, [user, isAutorite, navigate]);

  const signInAnonymous = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInAnonymously();
    setLoading(false);
    if (error) { toast.error("Mode anonyme indisponible", { description: error.message }); return; }
    toast.success("Vous êtes connecté en mode citoyen anonyme");
    navigate({ to: "/" });
  };

  const handleStructureSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (authMode === "register" && structureName.trim().length < 2) {
      toast.error("Veuillez indiquer le nom de votre structure (ex: Mairie de Yopougon, ONG Ivoire Propre)");
      return;
    }
    if (!email.trim() || password.length < 6) {
      toast.error("Veuillez saisir un email valide et un mot de passe d'au moins 6 caractères");
      return;
    }

    setLoading(true);
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
        // 1. Tentative d'inscription email/mot de passe avec métadonnées de la structure
        const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: metadata },
        });

        // Si la session n'est pas immédiatement active (ex: confirmation email requise ou inscriptions email désactivées sur Supabase),
        // on garantit l'accès immédiat en attachant le profil de structure à une session authentifiée.
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
          description: `Votre espace (${chosenType}) est activé. Vous avez accès à toutes les données de signalements.`,
        });
        navigate({ to: "/dashboard" });
      } else {
        // Connexion d'une structure existante
        const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (signInErr || !signInData.session) {
          // Fallback si le compte avait été créé en session directe
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
        navigate({ to: "/dashboard" });
      }
    } catch (err) {
      toast.error("Erreur lors de l'accès structure", {
        description: (err as Error).message,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-secondary/40 to-background px-4 py-8">
      <div className="mx-auto max-w-md">
        <Link to="/" className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Retour à l'accueil
        </Link>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "citoyen" | "structure")} className="w-full">
          <TabsList className="mb-6 grid w-full grid-cols-2">
            <TabsTrigger value="citoyen" className="gap-1.5 text-xs sm:text-sm">
              <UserCircle2 className="h-4 w-4" /> Citoyen (Anonyme)
            </TabsTrigger>
            <TabsTrigger value="structure" className="gap-1.5 text-xs sm:text-sm">
              <Building2 className="h-4 w-4" /> Espace Structure
            </TabsTrigger>
          </TabsList>

          {/* ONGLET 1 : CITOYEN ANONYME */}
          <TabsContent value="citoyen">
            <div className="mb-6 flex flex-col items-center text-center">
              <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg">
                <MapPin className="h-7 w-7" />
              </div>
              <h1 className="text-2xl font-bold">Signalez en toute confidentialité</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Aucune inscription, aucun email, aucun numéro de téléphone n'est demandé aux citoyens.
              </p>
            </div>

            <Card className="space-y-4 p-6 shadow-lg">
              <Button onClick={signInAnonymous} disabled={loading} className="w-full" size="lg">
                <UserCircle2 className="mr-2 h-5 w-5" />
                {loading ? "Connexion…" : "Continuer en mode anonyme"}
              </Button>

              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  Les visages sont automatiquement floutés par l'IA sur vos photos.
                </li>
                <li className="flex items-start gap-2">
                  <Lock className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  Aucun nom, email ou téléphone n'est associé à votre signalement.
                </li>
                <li className="flex items-start gap-2">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  Vos coordonnées GPS exactes ne sont jamais affichées aux visiteurs anonymes.
                </li>
              </ul>
            </Card>
          </TabsContent>

          {/* ONGLET 2 : INSCRIPTION / CONNEXION STRUCTURE (MAIRIES, ONG, ETC.) */}
          <TabsContent value="structure">
            <div className="mb-5 flex flex-col items-center text-center">
              <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-700 text-white shadow-lg">
                <Building2 className="h-7 w-7" />
              </div>
              <h1 className="text-2xl font-bold">Portail des Structures</h1>
              <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
                Mairies, ONG, Associations et Opérateurs : inscrivez votre structure pour accéder à l'ensemble des données de signalements et de déchets.
              </p>
            </div>

            <Card className="p-6 shadow-lg">
              <div className="mb-5 flex rounded-lg bg-muted p-1 text-xs font-medium">
                <button
                  type="button"
                  onClick={() => setAuthMode("register")}
                  className={`flex-1 rounded-md py-1.5 transition ${
                    authMode === "register" ? "bg-background shadow-sm font-semibold text-foreground" : "text-muted-foreground"
                  }`}
                >
                  Inscrire ma structure
                </button>
                <button
                  type="button"
                  onClick={() => setAuthMode("login")}
                  className={`flex-1 rounded-md py-1.5 transition ${
                    authMode === "login" ? "bg-background shadow-sm font-semibold text-foreground" : "text-muted-foreground"
                  }`}
                >
                  Déjà inscrit (Connexion)
                </button>
              </div>

              <form onSubmit={handleStructureSubmit} className="space-y-4">
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
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    <span>
                      <strong>Accès complet unifié :</strong> Peu importe le type de structure choisi (Mairie, ONG, Association…), vous accédez immédiatement à l'ensemble des données de déchets et de signalements sur la plateforme.
                    </span>
                  </div>
                </div>

                <Button type="submit" disabled={loading} className="w-full" size="lg">
                  <Building2 className="mr-2 h-5 w-5" />
                  {loading
                    ? "Ouverture de votre espace…"
                    : authMode === "register"
                    ? "Valider l'inscription & Accéder aux données"
                    : "Se connecter au tableau de bord"}
                </Button>
              </form>
            </Card>
          </TabsContent>
        </Tabs>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          En continuant, vous acceptez notre{" "}
          <Link to="/confidentialite" className="underline hover:text-foreground">politique de confidentialité</Link>.
        </p>
      </div>
    </div>
  );
}

