import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { AppHeader } from "@/components/AppHeader";
import { AppFooter } from "@/components/AppFooter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Star, Send, MessageSquareHeart, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/avis")({
  head: () => ({ meta: [
    { title: "Donner mon avis — SalubApp" },
    { name: "description", content: "Notez l'application et partagez vos suggestions. Votre avis n'est visible que par l'équipe SalubApp." },
  ]}),
  component: AvisPage,
});

function AvisPage() {
  const { user } = useAuth();
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rating === 0 && !message.trim()) {
      toast.info("Donnez une note ou écrivez un message");
      return;
    }
    setBusy(true);
    const { error } = await (supabase as any).from("app_feedback").insert({
      user_id: user?.id ?? null,
      rating: rating || null,
      message: message.trim() || null,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setDone(true);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <AppHeader />
      <main className="mx-auto w-full max-w-xl flex-1 px-4 py-8">
        <Link to="/" className="mb-4 inline-block text-sm text-muted-foreground hover:text-foreground">← Retour</Link>

        <header className="mb-6">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <MessageSquareHeart className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold">Donnez votre avis</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Aidez-nous à améliorer SalubApp. Votre avis n'est visible que par l'équipe ; il n'apparaît pas sur le site public.
          </p>
        </header>

        {done ? (
          <Card className="p-6 text-center">
            <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-emerald-600" />
            <h2 className="text-lg font-semibold">Merci !</h2>
            <p className="mt-2 text-sm text-muted-foreground">Votre avis a bien été transmis à l'équipe.</p>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
              <Button asChild variant="outline"><Link to="/">Retour à l'accueil</Link></Button>
              <Button onClick={() => { setDone(false); setRating(0); setMessage(""); }}>Envoyer un autre avis</Button>
            </div>
          </Card>
        ) : (
          <Card className="p-6">
            <form onSubmit={submit} className="space-y-5">
              <div>
                <label className="mb-2 block text-sm font-medium">Note</label>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} type="button"
                      onMouseEnter={() => setHover(n)}
                      onMouseLeave={() => setHover(0)}
                      onClick={() => setRating(n)}
                      aria-label={`${n} étoile${n > 1 ? "s" : ""}`}
                      className="p-1 transition-transform hover:scale-110">
                      <Star className={`h-8 w-8 ${(hover || rating) >= n ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`} />
                    </button>
                  ))}
                  {rating > 0 && <span className="ml-2 text-sm text-muted-foreground">{rating}/5</span>}
                </div>
              </div>

              <div>
                <label htmlFor="msg" className="mb-2 block text-sm font-medium">Message (facultatif)</label>
                <Textarea id="msg" value={message} onChange={(e) => setMessage(e.target.value)}
                  placeholder="Suggestions, bugs rencontrés, ce que vous appréciez…" maxLength={2000} rows={5} />
                <p className="mt-1 text-right text-xs text-muted-foreground">{message.length} / 2000</p>
              </div>

              <Button type="submit" disabled={busy} className="w-full gap-2">
                <Send className="h-4 w-4" /> {busy ? "Envoi…" : "Envoyer mon avis"}
              </Button>
            </form>
          </Card>
        )}
      </main>
      <AppFooter />
    </div>
  );
}
