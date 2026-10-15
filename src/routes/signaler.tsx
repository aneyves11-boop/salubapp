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
import { Camera, MapPin, Loader2, CheckCircle2, Sparkles, ShieldCheck, ImageIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { blurFacesInImage, manualBlurAtCoords, blurBoxesOnImage } from "@/lib/face-blur";
import { isInAbidjan } from "@/lib/abidjan";
import { classifyImageServerFn } from "@/lib/classify-image-fn";

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
  const [analyzing, setAnalyzing] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<{ category: Category; confidence: number } | null>(null);
  const [blurring, setBlurring] = useState(false);
  const [facesBlurred, setFacesBlurred] = useState<number | null>(null);
  const [imageRejected, setImageRejected] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/login" });
  }, [user, authLoading, navigate]);

  const askLocation = () => {
    if (!navigator.geolocation) { toast.error("Géolocalisation non disponible"); setGeoState("error"); return; }
    setGeoState("loading");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        if (!isInAbidjan(lat, lng)) {
          setCoords(null);
          setGeoState("error");
          toast.error("Hors zone", { description: "SalubApp est limité à Abidjan. Votre position actuelle est en dehors du périmètre couvert." });
          return;
        }
        setCoords({ lat, lng });
        setGeoState("ok");
      },
      (err) => { setGeoState("error"); toast.error("Position impossible", { description: err.message }); },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    );
  };

  useEffect(() => { askLocation(); /* eslint-disable-next-line */ }, []);

  const handlePhoto = async (file: File | null) => {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setAiSuggestion(null);
    setFacesBlurred(null);
    if (!file) { setPhoto(null); setPhotoPreview(null); return; }
    setImageRejected(null);
    setBlurring(true);
    try {
      const { blob, facesDetected } = await blurFacesInImage(file);
      const safeFile = new File([blob], file.name.replace(/\.\w+$/, "") + "-anon.jpg", { type: "image/jpeg" });
      setPhoto(safeFile);
      setPhotoPreview(URL.createObjectURL(safeFile));
      if (facesDetected > 0) {
        setFacesBlurred(facesDetected);
        toast.success(`${facesDetected} visage${facesDetected > 1 ? "s" : ""} flouté${facesDetected > 1 ? "s" : ""} pour préserver la vie privée.`);
      }
      void analyzePhoto(safeFile, facesDetected);
    } catch (e) {
      toast.error("Traitement de l'image impossible", { description: (e as Error).message });
      setPhoto(file);
      setPhotoPreview(URL.createObjectURL(file));
      void analyzePhoto(file, 0);
    } finally {
      setBlurring(false);
    }
  };

  const handlePhotoClick = async (e: React.MouseEvent<HTMLImageElement>) => {
    if (!photo) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    setBlurring(true);
    try {
      const blurred = await manualBlurAtCoords(photo, x, y);
      if (photoPreview) URL.revokeObjectURL(photoPreview);
      setPhoto(blurred);
      setPhotoPreview(URL.createObjectURL(blurred));
      setFacesBlurred((prev) => (prev ? prev + 1 : 1));
      toast.success("Zone floutée avec succès !");
    } catch {
      toast.error("Impossible de flouter cette zone");
    } finally {
      setBlurring(false);
    }
  };

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(",")[1] ?? "");
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

  const analyzePhoto = async (file: File, initialFaces = 0) => {
    setAnalyzing(true);
    try {
      const imageBase64 = await fileToBase64(file);
      const result = await classifyImageServerFn({
        data: { imageBase64, mimeType: file.type || "image/jpeg" },
      });

      let currentFile = file;
      let totalFaces = initialFaces;

      // 1. Floutage 100% AUTOMATIQUE par l'IA : couvre tous les visages, profils, casquettes ou personnes au loin
      if (result.faces && result.faces.length > 0) {
        try {
          const autoBlurred = await blurBoxesOnImage(currentFile, result.faces);
          if (photoPreview) URL.revokeObjectURL(photoPreview);
          currentFile = autoBlurred;
          setPhoto(autoBlurred);
          setPhotoPreview(URL.createObjectURL(autoBlurred));
          totalFaces = Math.max(initialFaces, result.faces.length);
          setFacesBlurred(totalFaces);
          toast.success(
            `${result.faces.length} visage${result.faces.length > 1 ? "s" : ""} flouté${result.faces.length > 1 ? "s" : ""} automatiquement par l'IA !`
          );
        } catch (blurErr) {
          console.warn("Échec du floutage automatique IA :", blurErr);
        }
      } else {
        setFacesBlurred(totalFaces);
      }

      if (result.error) {
        toast.error("Information IA", { description: result.error });
        if (!result.category) return;
      }

      if (result.is_relevant === false) {
        const reason =
          result.reason ||
          "Cette image ne semble pas montrer un problème d'insalubrité urbaine ou de voirie.";
        setImageRejected(reason);
        setPhoto(null);
        if (photoPreview) URL.revokeObjectURL(photoPreview);
        setPhotoPreview(null);
        setAiSuggestion(null);
        toast.error("Image refusée par l'IA", {
          description: reason,
          duration: 6000,
        });
        return;
      }

      if (result.category) {
        setAiSuggestion({
          category: result.category,
          confidence: result.confidence ?? 0.9,
        });
        setCategory((prev) => prev ?? result.category!);
      }

      if (result.description) {
        setDescription((prev) =>
          prev.trim().length === 0 ? result.description! : prev
        );
      }

      toast.success("Analyse IA terminée", {
        description: "Vérifiez et ajustez si besoin.",
      });
    } catch (e) {
      toast.error("Analyse IA impossible", {
        description: (e as Error).message,
      });
      setFacesBlurred((prev) => prev ?? initialFaces);
    } finally {
      setAnalyzing(false);
    }
  };

  const submit = async () => {
    if (!user) return;
    if (!category) { toast.error("Choisissez une catégorie"); return; }
    if (description.trim().length < 5) { toast.error("Décrivez le problème en quelques mots"); return; }
    if (!coords) { toast.error("Position GPS requise"); return; }
    if (!isInAbidjan(coords.lat, coords.lng)) {
      toast.error("Hors zone Abidjan", { description: "Seuls les signalements dans la zone d'Abidjan sont acceptés." });
      return;
    }
    if (imageRejected) {
      toast.error("Image non valide", { description: "Veuillez fournir une photo en lien avec l'insalubrité urbaine." });
      return;
    }

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
            {aiSuggestion && (
              <div className="mb-3 flex items-center gap-2 rounded-md bg-primary/10 px-3 py-2 text-xs">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                <span className="text-muted-foreground">Suggestion IA :</span>
                <Badge variant="secondary">{CATEGORIES.find((c) => c.value === aiSuggestion.category)?.label}</Badge>
                <span className="ml-auto text-muted-foreground">{Math.round(aiSuggestion.confidence * 100)}% sûr</span>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              {CATEGORIES.map((c) => (
                <button key={c.value} type="button" onClick={() => setCategory(c.value)}
                  className={`group flex flex-col gap-2 overflow-hidden rounded-lg border-2 p-0 text-left text-sm transition ${
                    category === c.value ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"
                  }`}>
                  <img src={c.image} alt="" loading="lazy" className="h-20 w-full object-cover" />
                  <span className="px-3 pb-2 text-xs font-medium leading-tight">{c.label}</span>
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
            <div className="grid grid-cols-2 gap-2">
              <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-border bg-muted/30 px-4 py-5 text-sm text-muted-foreground hover:border-primary/50">
                <Camera className="h-5 w-5" />
                <span>Prendre une photo</span>
                <input type="file" accept="image/*" capture="environment" className="hidden"
                  onChange={(e) => handlePhoto(e.target.files?.[0] ?? null)} />
              </label>
              <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-border bg-muted/30 px-4 py-5 text-sm text-muted-foreground hover:border-primary/50">
                <ImageIcon className="h-5 w-5" />
                <span>Importer depuis la galerie</span>
                <input type="file" accept="image/*" className="hidden"
                  onChange={(e) => handlePhoto(e.target.files?.[0] ?? null)} />
              </label>
            </div>
            <p className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
              <ShieldCheck className="h-3 w-3" /> Les visages sont automatiquement floutés sur votre appareil avant l'envoi.
            </p>
            {(blurring || analyzing) && (
              <div className="mt-2 flex items-center gap-2 text-xs font-medium text-primary">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Analyse IA & floutage automatique des visages en cours…
              </div>
            )}
            {facesBlurred !== null && !blurring && !analyzing && (
              <div className="mt-2 flex items-center gap-1.5 text-xs">
                {facesBlurred === 0 ? (
                  <span className="text-muted-foreground">Aucun visage détecté dans cette photo.</span>
                ) : (
                  <span className="font-medium text-emerald-700">
                    🛡️ {facesBlurred} visage{facesBlurred > 1 ? "s" : ""} flouté{facesBlurred > 1 ? "s" : ""} automatiquement pour préserver la vie privée.
                  </span>
                )}
              </div>
            )}
            {imageRejected && (
              <div className="mt-2 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
                <strong>Image refusée :</strong> {imageRejected}
                <div className="mt-1 text-[11px]">SalubApp n'accepte que les photos liées à la salubrité urbaine, la voirie ou les chantiers.</div>
              </div>
            )}
            {photoPreview && (
              <div className="relative mt-3">
                <img
                  src={photoPreview}
                  alt="Aperçu (touchez pour flouter)"
                  onClick={handlePhotoClick}
                  className="max-h-60 w-full cursor-crosshair rounded-lg object-cover ring-1 ring-border hover:ring-primary"
                />
                <p className="mt-1.5 text-center text-[11px] text-muted-foreground">
                  👆 <strong>Astuce :</strong> Touchez directement la photo pour flouter manuellement un visage ou une zone.
                </p>
              </div>
            )}
            {photo && (
              <div className="mt-3 flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  {analyzing
                    ? "Analyse de la photo par IA en cours…"
                    : aiSuggestion
                    ? "Photo analysée — la catégorie a été pré-remplie."
                    : "L'IA peut classer automatiquement votre photo."}
                </p>
                <Button type="button" variant="outline" size="sm" disabled={analyzing} onClick={() => photo && analyzePhoto(photo)} className="gap-1">
                  {analyzing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  {analyzing ? "Analyse…" : aiSuggestion ? "Re-analyser" : "Analyser avec l'IA"}
                </Button>
              </div>
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
              <div className="space-y-2">
                <p className="text-xs text-destructive">
                  Position non disponible ou hors de la zone d'Abidjan. SalubApp ne couvre que la zone du Grand Abidjan.
                </p>
                <Button type="button" variant="outline" size="sm" onClick={askLocation} className="gap-1">
                  <MapPin className="h-4 w-4" /> Réessayer la localisation
                </Button>
              </div>
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