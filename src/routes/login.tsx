import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { MapPin, Phone, KeyRound, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Connexion — SalubApp" }, { name: "description", content: "Connectez-vous à SalubApp avec votre numéro de téléphone." }] }),
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
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (user) navigate({ to: "/" }); }, [user, navigate]);

  const sendCode = async () => {
    const p = normalizePhone(phone);
    if (p.length < 9) { toast.error("Numéro invalide"); return; }
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({ phone: p });
    setLoading(false);
    if (error) {
      toast.error("Impossible d'envoyer le code", { description: error.message });
      return;
    }
    toast.success("Code envoyé par SMS");
    setStep("otp");
  };

  const verify = async () => {
    if (code.length < 4) { toast.error("Code trop court"); return; }
    setLoading(true);
    const { error } = await supabase.auth.verifyOtp({ phone: normalizePhone(phone), token: code, type: "sms" });
    setLoading(false);
    if (error) { toast.error("Code incorrect", { description: error.message }); return; }
    toast.success("Bienvenue !");
    navigate({ to: "/" });
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-secondary/40 to-background px-4 py-8">
      <div className="mx-auto max-w-md">
        <Link to="/" className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Retour
        </Link>
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg">
            <MapPin className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold">Bienvenue sur SalubApp</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Connectez-vous avec votre numéro de téléphone pour signaler.
          </p>
        </div>

        <Card className="p-6 shadow-lg">
          {step === "phone" ? (
            <div className="space-y-4">
              <div>
                <Label htmlFor="phone">Numéro de téléphone</Label>
                <div className="relative mt-1.5">
                  <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="+225 07 12 34 56 78"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Indiquez l'indicatif de votre pays (ex : +225, +221, +237).
                </p>
              </div>
              <Button onClick={sendCode} disabled={loading} className="w-full" size="lg">
                {loading ? "Envoi..." : "Recevoir le code par SMS"}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <Label htmlFor="otp">Code reçu par SMS</Label>
                <div className="relative mt-1.5">
                  <KeyRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="otp"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="123456"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    maxLength={6}
                    className="pl-9 text-center text-2xl tracking-widest"
                  />
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">Envoyé au {normalizePhone(phone)}</p>
              </div>
              <Button onClick={verify} disabled={loading} className="w-full" size="lg">
                {loading ? "Vérification..." : "Valider et se connecter"}
              </Button>
              <Button variant="ghost" onClick={() => setStep("phone")} className="w-full" size="sm">
                Modifier le numéro
              </Button>
            </div>
          )}
        </Card>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          En vous connectant, vous acceptez de signaler des informations véridiques.
        </p>
      </div>
    </div>
  );
}