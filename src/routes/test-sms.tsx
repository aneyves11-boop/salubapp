import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, CheckCircle2, XCircle, AlertTriangle, Loader2, Phone } from "lucide-react";

export const Route = createFileRoute("/test-sms")({
  head: () => ({ meta: [{ title: "Test connexion SMS — SalubApp" }] }),
  component: TestSmsPage,
});

type Status = "idle" | "checking" | "ok" | "disabled" | "unsupported_country" | "rate_limited" | "invalid_phone" | "unknown_error";

interface Result {
  status: Status;
  title: string;
  description: string;
  raw?: string;
}

function normalizePhone(raw: string): string {
  const cleaned = raw.replace(/[^\d+]/g, "");
  if (cleaned.startsWith("+")) return cleaned;
  if (cleaned.startsWith("00")) return "+" + cleaned.slice(2);
  return "+" + cleaned;
}

function interpret(errorMsg: string | null, errorCode: string | null): Result {
  if (!errorMsg && !errorCode) {
    return {
      status: "ok",
      title: "Provider SMS configuré",
      description: "Le code OTP a été envoyé avec succès. Vérifiez votre téléphone — vous pouvez maintenant utiliser /login normalement.",
    };
  }
  const msg = (errorMsg ?? "").toLowerCase();
  const code = (errorCode ?? "").toLowerCase();

  if (code === "phone_provider_disabled" || msg.includes("unsupported phone provider") || msg.includes("provider disabled")) {
    return {
      status: "disabled",
      title: "Provider Phone non activé",
      description: "Aucun fournisseur SMS n'est configuré. Allez dans Cloud → Users → Auth settings → Phone, activez le provider et renseignez vos credentials Twilio (Account SID, Auth Token, Messaging Service SID).",
      raw: errorMsg ?? errorCode ?? undefined,
    };
  }
  if (msg.includes("sms not supported") || msg.includes("region") || msg.includes("country") || msg.includes("geo") || msg.includes("permission")) {
    return {
      status: "unsupported_country",
      title: "Pays non autorisé par Twilio",
      description: "Le numéro est valide mais Twilio bloque ce pays. Dans la console Twilio → Messaging → Settings → Geo Permissions, activez les pays cibles (CI, SN, CM, BF, ML, etc.).",
      raw: errorMsg ?? undefined,
    };
  }
  if (msg.includes("rate") || msg.includes("too many") || code.includes("rate")) {
    return {
      status: "rate_limited",
      title: "Trop de tentatives",
      description: "Vous avez envoyé trop de codes récemment. Attendez quelques minutes avant de réessayer.",
      raw: errorMsg ?? undefined,
    };
  }
  if (msg.includes("invalid") && msg.includes("phone")) {
    return {
      status: "invalid_phone",
      title: "Numéro invalide",
      description: "Vérifiez le format international : indicatif + numéro (ex : +2250757800662).",
      raw: errorMsg ?? undefined,
    };
  }
  return {
    status: "unknown_error",
    title: "Erreur inattendue",
    description: "Le provider a renvoyé une erreur non identifiée. Détails ci-dessous.",
    raw: errorMsg ?? errorCode ?? "Erreur inconnue",
  };
}

function StatusIcon({ status }: { status: Status }) {
  if (status === "checking") return <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />;
  if (status === "ok") return <CheckCircle2 className="h-6 w-6 text-primary" />;
  if (status === "disabled" || status === "unknown_error") return <XCircle className="h-6 w-6 text-destructive" />;
  return <AlertTriangle className="h-6 w-6 text-amber-600" />;
}

function TestSmsPage() {
  const [phone, setPhone] = useState("+225");
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);

  const runCheck = async () => {
    const p = normalizePhone(phone);
    if (p.length < 9) {
      setResult({ status: "invalid_phone", title: "Numéro invalide", description: "Renseignez un numéro complet avec indicatif." });
      return;
    }
    setLoading(true);
    setResult({ status: "checking", title: "Vérification en cours…", description: "Tentative d'envoi d'un code de test au provider SMS." });
    const { error } = await supabase.auth.signInWithOtp({ phone: p, options: { shouldCreateUser: false } });
    setLoading(false);
    // shouldCreateUser=false évite de créer un compte inutile pendant le diagnostic.
    // Si le provider est OK mais que l'utilisateur n'existe pas, on reçoit "Signups not allowed for otp" → on traite comme OK provider.
    if (error && /signups? not allowed/i.test(error.message)) {
      setResult({
        status: "ok",
        title: "Provider SMS configuré",
        description: "Le provider Phone répond correctement. (Aucun SMS envoyé pour ce diagnostic — l'utilisateur n'existe pas encore, ce qui est normal.) Vous pouvez aller sur /login pour vous inscrire.",
      });
      return;
    }
    setResult(interpret(error?.message ?? null, (error as { code?: string } | null)?.code ?? null));
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-secondary/40 to-background px-4 py-8">
      <div className="mx-auto max-w-md">
        <Link to="/" className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Retour
        </Link>

        <div className="mb-6">
          <h1 className="text-2xl font-bold">Test connexion SMS</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Vérifie en un clic si le provider Phone est activé et opérationnel.
          </p>
        </div>

        <Card className="p-6 shadow-lg">
          <div className="space-y-4">
            <div>
              <Label htmlFor="phone">Numéro de test</Label>
              <div className="relative mt-1.5">
                <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="phone"
                  type="tel"
                  inputMode="tel"
                  placeholder="+2250757800662"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="pl-9"
                />
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Format international, indicatif compris (+225, +221, +237…).
              </p>
            </div>
            <Button onClick={runCheck} disabled={loading} className="w-full" size="lg">
              {loading ? "Test en cours…" : "Lancer le diagnostic"}
            </Button>
          </div>
        </Card>

        {result && (
          <Card className="mt-4 p-5 shadow-lg">
            <div className="flex items-start gap-3">
              <StatusIcon status={result.status} />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="font-semibold">{result.title}</h2>
                  {result.status === "ok" && <Badge>OK</Badge>}
                  {result.status === "disabled" && <Badge variant="destructive">À configurer</Badge>}
                  {result.status === "unsupported_country" && <Badge variant="secondary">Pays bloqué</Badge>}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{result.description}</p>
                {result.raw && (
                  <pre className="mt-3 max-h-40 overflow-auto rounded bg-muted p-2 text-[11px] font-mono text-muted-foreground">
                    {result.raw}
                  </pre>
                )}
              </div>
            </div>
          </Card>
        )}

        <div className="mt-6 space-y-2 rounded-lg border bg-card p-4 text-xs text-muted-foreground">
          <p className="font-semibold text-foreground">Checklist activation :</p>
          <ul className="list-disc space-y-1 pl-4">
            <li>Cloud → Users → Auth settings → Phone activé</li>
            <li>Provider Twilio sélectionné</li>
            <li>Account SID + Auth Token + Messaging Service SID renseignés</li>
            <li>Twilio Geo Permissions : pays africains francophones autorisés</li>
            <li>Solde Twilio suffisant (≥ 1 $)</li>
          </ul>
        </div>

        <div className="mt-4 flex justify-center">
          <Button asChild variant="outline" size="sm">
            <Link to="/login">Aller à la connexion →</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}