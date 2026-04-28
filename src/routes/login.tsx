import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { MapPin, Phone, KeyRound, ArrowLeft, Mail, UserCircle2 } from "lucide-react";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Connexion — SalubApp" }, { name: "description", content: "Connectez-vous à SalubApp." }] }),
  component: LoginPage,
});

function normalizePhone(raw: string): string {
  const cleaned = raw.replace(/[^\d+]/g, "");
  if (cleaned.startsWith("+")) return cleaned;
  if (cleaned.startsWith("00")) return "+" + cleaned.slice(2);
  return "+" + cleaned;
}

function LoginPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);

  // Email
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailMode, setEmailMode] = useState<"signin" | "signup">("signin");

  // Phone
  const [phoneStep, setPhoneStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");

  useEffect(() => { if (user) navigate({ to: "/" }); }, [user, navigate]);

  const signInGoogle = async () => {
    setLoading(true);
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (result.error) {
      setLoading(false);
      toast.error("Connexion Google impossible", { description: result.error.message });
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/" });
  };

  const submitEmail = async () => {
    if (!email || password.length < 6) { toast.error("Email + mot de passe (6 caractères min) requis"); return; }
    setLoading(true);
    const fn = emailMode === "signup"
      ? supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } })
      : supabase.auth.signInWithPassword({ email, password });
    const { error } = await fn;
    setLoading(false);
    if (error) { toast.error(emailMode === "signup" ? "Inscription impossible" : "Connexion impossible", { description: error.message }); return; }
    toast.success(emailMode === "signup" ? "Compte créé !" : "Bienvenue !");
    navigate({ to: "/" });
  };

  const sendCode = async () => {
    const p = normalizePhone(phone);
    if (p.length < 9) { toast.error("Numéro invalide"); return; }
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({ phone: p });
    setLoading(false);
    if (error) {
      toast.error("SMS indisponible", { description: error.message + " — Essayez Google ou Email." });
      return;
    }
    toast.success("Code envoyé par SMS");
    setPhoneStep("otp");
  };

  const verifyPhone = async () => {
    if (code.length < 4) { toast.error("Code trop court"); return; }
    setLoading(true);
    const { error } = await supabase.auth.verifyOtp({ phone: normalizePhone(phone), token: code, type: "sms" });
    setLoading(false);
    if (error) { toast.error("Code incorrect", { description: error.message }); return; }
    toast.success("Bienvenue !");
    navigate({ to: "/" });
  };

  const signInAnonymous = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInAnonymously();
    setLoading(false);
    if (error) { toast.error("Mode invité indisponible", { description: error.message }); return; }
    toast.success("Connecté en mode invité");
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
          <h1 className="text-2xl font-bold">Bienvenue sur SalubApp</h1>
          <p className="mt-1 text-sm text-muted-foreground">Choisissez votre méthode de connexion.</p>
        </div>

        <Card className="p-5 shadow-lg">
          {/* Google : bouton principal */}
          <Button onClick={signInGoogle} disabled={loading} variant="outline" className="w-full" size="lg">
            <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            Continuer avec Google
          </Button>

          <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" />OU<div className="h-px flex-1 bg-border" />
          </div>

          <Tabs defaultValue="email">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="email"><Mail className="mr-1 h-3.5 w-3.5" />Email</TabsTrigger>
              <TabsTrigger value="phone"><Phone className="mr-1 h-3.5 w-3.5" />SMS</TabsTrigger>
              <TabsTrigger value="anon"><UserCircle2 className="mr-1 h-3.5 w-3.5" />Invité</TabsTrigger>
            </TabsList>

            <TabsContent value="email" className="space-y-3 pt-4">
              <div>
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" autoComplete="email" placeholder="vous@exemple.com" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1.5" />
              </div>
              <div>
                <Label htmlFor="pwd">Mot de passe</Label>
                <Input id="pwd" type="password" autoComplete={emailMode === "signup" ? "new-password" : "current-password"} placeholder="••••••" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1.5" />
              </div>
              <Button onClick={submitEmail} disabled={loading} className="w-full" size="lg">
                {loading ? "..." : emailMode === "signup" ? "Créer mon compte" : "Se connecter"}
              </Button>
              <button type="button" onClick={() => setEmailMode((m) => m === "signin" ? "signup" : "signin")} className="w-full text-center text-xs text-muted-foreground hover:text-foreground">
                {emailMode === "signin" ? "Pas de compte ? Créer un compte" : "Déjà un compte ? Se connecter"}
              </button>
            </TabsContent>

            <TabsContent value="phone" className="space-y-3 pt-4">
              {phoneStep === "phone" ? (
                <>
                  <div>
                    <Label htmlFor="phone">Numéro de téléphone</Label>
                    <div className="relative mt-1.5">
                      <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input id="phone" type="tel" inputMode="tel" placeholder="+225 07 12 34 56 78" value={phone} onChange={(e) => setPhone(e.target.value)} className="pl-9" />
                    </div>
                    <p className="mt-1.5 text-xs text-muted-foreground">Format international (+225, +221, +237…). Si le SMS échoue, utilisez Email ou Google.</p>
                  </div>
                  <Button onClick={sendCode} disabled={loading} className="w-full" size="lg">
                    {loading ? "Envoi..." : "Recevoir le code"}
                  </Button>
                </>
              ) : (
                <>
                  <div>
                    <Label htmlFor="otp">Code reçu par SMS</Label>
                    <div className="relative mt-1.5">
                      <KeyRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input id="otp" type="text" inputMode="numeric" autoComplete="one-time-code" placeholder="123456" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} maxLength={6} className="pl-9 text-center text-2xl tracking-widest" />
                    </div>
                    <p className="mt-1.5 text-xs text-muted-foreground">Envoyé au {normalizePhone(phone)}</p>
                  </div>
                  <Button onClick={verifyPhone} disabled={loading} className="w-full" size="lg">
                    {loading ? "Vérification..." : "Valider"}
                  </Button>
                  <Button variant="ghost" onClick={() => setPhoneStep("phone")} className="w-full" size="sm">Modifier le numéro</Button>
                </>
              )}
            </TabsContent>

            <TabsContent value="anon" className="space-y-3 pt-4">
              <p className="text-sm text-muted-foreground">
                Connectez-vous sans inscription pour signaler rapidement. Vous pourrez créer un vrai compte plus tard.
              </p>
              <Button onClick={signInAnonymous} disabled={loading} className="w-full" size="lg" variant="secondary">
                <UserCircle2 className="mr-2 h-4 w-4" />
                {loading ? "..." : "Continuer en invité"}
              </Button>
            </TabsContent>
          </Tabs>
        </Card>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          En vous connectant, vous acceptez de signaler des informations véridiques.
        </p>
      </div>
    </div>
  );
}
