import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { CATEGORIES, type Category } from "@/lib/categories";
import { toast } from "sonner";
import { Camera, MapPin, Loader2, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/signaler")({
  head: () => ({ meta: [{ title: "Nouveau signalement — SalubApp" }] }),
  component: SignalerPage,
});

function SignalerPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [category, setCategory] = useState<Category | null>(null);
  const [description, setDescription] = useState("");
  const [ville, setVille] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geoState, setGeoState] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/login" });
  }, [user, authLoading, navigate]);

  const askLocation = () => {
    if (!navigator.geolocation) { toast.error("Géolocalisation non disponible"); setGeoState("error"); return; }
    setGeoState("loading");
    navigator.geolocation.getCurrentPosition(
      (pos) => { setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setGeoState("ok"); },
      (err) => { setGeoState("error"); toast.error("Position impossible", { description: err.message }); },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    );
  };

  useEffect(() => { askLocation(); /* eslint-disable-next-line */ }, []);

  const handlePhoto = (file: File | null) => {
    setPhoto(file);
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoPreview(file ? URL.createObjectURL(file) : null);
  };

  const submit = async () => {
    if (!user) return;
    if (!category) { toast.error("Choisissez une catégorie"); return; }
    if (description.trim().length < 5) { toast.error("Décrivez le problème en quelques mots"); return; }
    if (!coords) { toast.error("Position GPS requise"); return; }

    setSubmitting(true);
    try {
      let photo_url: string | null = null;
      if (photo) {
        const ext = (photo.name.split(".").pop() || "jpg").toLowerCase();
        const path = `${user.id}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("report-photos").upload(path, photo, {
          cacheControl: "3600", contentType: photo.type || "image/jpeg",
        });
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from("report-photos").getPublicUrl(path);
        photo_url = pub.publicUrl;
      }
      const { error } = await supabase.from("reports").insert({
        user_id: user.id,
        category,
        description: description.trim(),
        photo_url,
        latitude: coords.lat,
        longitude: coords.lng,
        ville: ville.trim() || null,
      });
      if (error) throw error;
      toast.success("Merci ! Signalement enregistré.");
      navigate({ to: "/" });
    } catch (e) {
      toast.error("Erreur d'enregistrement", { description: (e as Error).message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-xl px-4 py-6 pb-24">
        <Link to="/" className="mb-4 inline-block text-sm text-muted-foreground">← Retour au fil</Link>
        <h1 className="mb-1 text-2xl font-bold">Nouveau signalement</h1>
        <p className="mb-6 text-sm text-muted-foreground">Remplissez en moins d'une minute. Photo et position aident énormément.</p>

        <div className="space-y-5">
          <Card className="p-4">
            <Label className="mb-3 block">Type de problème</Label>
            <div className="grid grid-cols-2 gap-2">
              {CATEGORIES.map((c) => (
                <button key={c.value} type="button" onClick={() => setCategory(c.value)}
                  className={`flex flex-col items-start gap-1 rounded-lg border-2 p-3 text-left text-sm transition ${
                    category === c.value ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"
                  }`}>
                  <span className="text-2xl">{c.emoji}</span>
                  <span className="font-medium leading-tight">{c.label}</span>
                </button>
              ))}
            </div>
          </Card>

          <Card className="p-4">
            <Label htmlFor="desc">Description</Label>
            <Textarea id="desc" value={description} maxLength={1000}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex : tas d'ordures depuis 3 jours devant l'école..."
              className="mt-1.5 min-h-24" />
            <div className="mt-1 text-right text-xs text-muted-foreground">{description.length}/1000</div>
          </Card>

          <Card className="p-4">
            <Label htmlFor="ville">Ville / quartier (optionnel)</Label>
            <Input id="ville" value={ville} onChange={(e) => setVille(e.target.value)}
              placeholder="Ex : Cocody, Abidjan" className="mt-1.5" maxLength={100} />
          </Card>

          <Card className="p-4">
            <Label className="mb-2 block">Photo (recommandé)</Label>
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-muted/30 px-4 py-6 text-sm text-muted-foreground hover:border-primary/50">
              <Camera className="h-5 w-5" />
              {photo ? "Changer la photo" : "Prendre / choisir une photo"}
              <input type="file" accept="image/*" capture="environment" className="hidden"
                onChange={(e) => handlePhoto(e.target.files?.[0] ?? null)} />
            </label>
            {photoPreview && (
              <img src={photoPreview} alt="Aperçu" className="mt-3 max-h-60 w-full rounded-lg object-cover" />
            )}
          </Card>

          <Card className="p-4">
            <Label className="mb-2 block">Position GPS</Label>
            {geoState === "loading" && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Localisation en cours…
              </div>
            )}
            {geoState === "ok" && coords && (
              <div className="flex items-center gap-2 text-sm text-emerald-700">
                <CheckCircle2 className="h-4 w-4" />
                Position acquise ({coords.lat.toFixed(4)}, {coords.lng.toFixed(4)})
              </div>
            )}
            {geoState === "error" && (
              <Button type="button" variant="outline" size="sm" onClick={askLocation} className="gap-1">
                <MapPin className="h-4 w-4" /> Réessayer la localisation
              </Button>
            )}
          </Card>

          <Button onClick={submit} disabled={submitting || geoState !== "ok"} size="lg" className="w-full">
            {submitting ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Envoi…</>) : "Envoyer le signalement"}
          </Button>
        </div>
      </main>
    </div>
  );
}