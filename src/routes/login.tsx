import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { MapPin, ArrowLeft, UserCircle2, ShieldCheck, Lock } from "lucide-react";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [
    { title: "Mode anonyme — SalubApp" },
    { name: "description", content: "Signalez en toute confidentialité, sans inscription." },
  ]}),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (user) navigate({ to: "/" }); }, [user, navigate]);

  const signInAnonymous = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInAnonymously();
    setLoading(false);
    if (error) { toast.error("Mode anonyme indisponible", { description: error.message }); return; }
    toast.success("Vous êtes en mode anonyme");
    navigate({ to: "/" });
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-secondary/40 to-background px-4 py-8">
      <div className="mx-auto max-w-md">
        <Link to="/" className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Retour
        </Link>
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg">
            <MapPin className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold">Signalez en toute confidentialité</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Aucune inscription, aucun email, aucun numéro de téléphone n'est demandé.
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
              Vos visages sont automatiquement floutés sur vos photos.
            </li>
            <li className="flex items-start gap-2">
              <Lock className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              Aucun nom, email ou téléphone n'est associé à votre signalement.
            </li>
            <li className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              Vos coordonnées GPS exactes ne sont jamais affichées publiquement.
            </li>
          </ul>

          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <strong>Inscriptions suspendues</strong> — pour préserver la confidentialité,
            la création de comptes (email, SMS, Google) est temporairement désactivée.
            Le mode anonyme suffit pour signaler, voter et commenter.
          </div>
        </Card>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          En continuant, vous acceptez notre{" "}
          <Link to="/confidentialite" className="underline hover:text-foreground">politique de confidentialité</Link>.
        </p>
      </div>
    </div>
  );
}
