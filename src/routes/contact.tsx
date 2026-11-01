import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { AppHeader } from "@/components/AppHeader";
import { AppFooter } from "@/components/AppFooter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Mail, Send, CheckCircle2, Building2, Sparkles, MapPin } from "lucide-react";
import { toast } from "sonner";

const CONTACT_PROFILES = [
  { value: "Mairie / Collectivité", label: "🏛️ Mairie / Collectivité locale (Demande d'accès)" },
  { value: "ONG / Association", label: "🌱 ONG / Association citoyenne" },
  { value: "Opérateur / Concessionnaire", label: "🚛 Opérateur de salubrité / Concessionnaire" },
  { value: "Entreprise / Sponsor RSE", label: "🏢 Entreprise privée / Partenariat RSE" },
  { value: "Citoyen / Presse / Autre", label: "👤 Citoyen, Presse ou Autre demande" },
] as const;

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Nous contacter — SalubApp" },
      {
        name: "description",
        content:
          "Contactez l'équipe SalubApp pour demander un code d'accès structure (Mairie, ONG, Opérateur), nouer un partenariat ou poser une question sur SalubApp.",
      },
    ],
  }),
  component: ContactPage,
});

function ContactPage() {
  const { user } = useAuth();
  const [profileType, setProfileType] = useState<string>(CONTACT_PROFILES[0].value);
  const [senderName, setSenderName] = useState("");
  const [contactCoord, setContactCoord] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!senderName.trim() || !contactCoord.trim() || !body.trim()) {
      toast.error("Veuillez remplir votre nom/structure, un moyen de contact et votre message.");
      return;
    }

    const formattedPayload = [
      `[CONTACT]`,
      `Profil: ${profileType}`,
      `Nom / Structure: ${senderName.trim()}`,
      `Email / Téléphone: ${contactCoord.trim()}`,
      subject.trim() ? `Objet: ${subject.trim()}` : null,
      `---`,
      body.trim(),
    ]
      .filter(Boolean)
      .join("\n")
      .slice(0, 1990);

    setBusy(true);
    const { error } = await (supabase as any).from("app_feedback").insert({
      user_id: user?.id ?? null,
      rating: null,
      message: formattedPayload,
    });
    setBusy(false);

    if (error) {
      toast.error("Impossible d'envoyer le message", { description: error.message });
      return;
    }

    setSent(true);
    toast.success("Votre message a bien été transmis à l'équipe SalubApp !");
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <AppHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        <Link
          to="/"
          className="mb-4 inline-block text-sm text-muted-foreground hover:text-foreground"
        >
          ← Retour à l'accueil
        </Link>

        <header className="mb-6">
          <div className="mb-3 flex items-center gap-3">
            <img
              src="/logo-salubapp.png"
              alt="Logo SalubApp"
              className="h-12 w-12 rounded-2xl object-cover shadow-md"
            />
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
              <Sparkles className="h-3.5 w-3.5" /> Support officiel
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold">Nous contacter</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            SalubApp accompagne les communes, les opérateurs et les citoyens vers des villes plus propres.
          </p>
        </header>

        <div className="mb-6 grid gap-3 sm:grid-cols-2">
          <Card className="border-emerald-200 bg-emerald-50/50 p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
            <div className="flex items-start gap-2.5">
              <Building2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
              <div className="text-xs">
                <div className="font-bold text-emerald-950 dark:text-emerald-200">
                  Mairies, ONG & Opérateurs
                </div>
                <p className="mt-1 text-emerald-900/80 dark:text-emerald-300/80">
                  Demandez votre <strong>Code d'accès Partenaire</strong> officiel pour piloter les interventions sur votre commune via le{" "}
                  <Link to="/dashboard" className="font-semibold underline">
                    Portail des Structures
                  </Link>
                  .
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-start gap-2.5">
              <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div className="text-xs">
                <div className="font-bold text-foreground">Équipe SalubApp</div>
                <p className="mt-1 text-muted-foreground">
                  Grand Abidjan, Côte d'Ivoire — Partenariats institutionnels, accompagnement des communes, API urbaine et support technique.
                </p>
              </div>
            </div>
          </Card>
        </div>

        {sent ? (
          <Card className="p-8 text-center shadow-sm">
            <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-emerald-600" />
            <h2 className="text-xl font-bold">Message envoyé avec succès !</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Merci pour votre message. Notre équipe vous recontactera rapidement via les coordonnées indiquées ({contactCoord}).
            </p>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
              <Button asChild variant="outline">
                <Link to="/">Retour à l'accueil</Link>
              </Button>
              <Button
                onClick={() => {
                  setSent(false);
                  setSubject("");
                  setBody("");
                }}
              >
                Envoyer un autre message
              </Button>
            </div>
          </Card>
        ) : (
          <Card className="p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-2 text-base font-semibold">
              <Mail className="h-4 w-4 text-emerald-600" />
              Écrire à l'équipe SalubApp
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="profileType" className="text-xs font-semibold">
                  Vous nous contactez en tant que *
                </Label>
                <Select value={profileType} onValueChange={setProfileType}>
                  <SelectTrigger id="profileType" className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONTACT_PROFILES.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="senderName" className="text-xs font-semibold">
                    Votre nom ou structure *
                  </Label>
                  <Input
                    id="senderName"
                    type="text"
                    required
                    maxLength={120}
                    value={senderName}
                    onChange={(e) => setSenderName(e.target.value)}
                    placeholder="Ex: Mairie d'Abobo / M. Kouassi"
                    className="mt-1.5"
                  />
                </div>

                <div>
                  <Label htmlFor="contactCoord" className="text-xs font-semibold">
                    Email ou Téléphone / WhatsApp *
                  </Label>
                  <Input
                    id="contactCoord"
                    type="text"
                    required
                    maxLength={140}
                    value={contactCoord}
                    onChange={(e) => setContactCoord(e.target.value)}
                    placeholder="Ex: +225 07… ou contact@mairie.ci"
                    className="mt-1.5"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="subject" className="text-xs font-semibold">
                  Objet de la demande
                </Label>
                <Input
                  id="subject"
                  type="text"
                  maxLength={150}
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Ex: Demande de code d'accréditation structure / Partenariat RSE…"
                  className="mt-1.5"
                />
              </div>

              <div>
                <Label htmlFor="body" className="text-xs font-semibold">
                  Votre message *
                </Label>
                <Textarea
                  id="body"
                  required
                  rows={5}
                  maxLength={1400}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Précisez votre commune, votre besoin ou votre proposition…"
                  className="mt-1.5"
                />
                <p className="mt-1 text-right text-[11px] text-muted-foreground">
                  {body.length} / 1400
                </p>
              </div>

              <Button
                type="submit"
                disabled={busy}
                className="w-full gap-2 bg-emerald-700 hover:bg-emerald-800"
                size="lg"
              >
                <Send className="h-4 w-4" />
                {busy ? "Envoi en cours…" : "Envoyer le message"}
              </Button>
            </form>
          </Card>
        )}
      </main>
      <AppFooter />
    </div>
  );
}
