import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, lazy, Suspense } from "react";
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
import {
  Camera,
  MapPin,
  Loader2,
  CheckCircle2,
  Sparkles,
  ShieldCheck,
  ImageIcon,
  AlertTriangle,
  ThumbsUp,
  Search,
  Map as MapIcon,
  Navigation,
  X,
  Info,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { manualBlurAtCoords, blurBoxesOnImage } from "@/lib/face-blur";
import {
  isInAbidjan,
  calculateDistanceMeters,
  formatDistance,
  detectCommuneFromCoords,
} from "@/lib/abidjan";
import { extractExifGps } from "@/lib/exif-gps";
import {
  searchAbidjanAddresses,
  searchLocalAbidjanPlaces,
  type GeocodedPlace,
} from "@/lib/geocoding";
import { classifyImageServerFn, compareDuplicateImagesServerFn } from "@/lib/classify-image-fn";
import { fetchSyncedStatuses } from "@/lib/status-sync";

const LocationPickerMap = lazy(() =>
  import("@/components/LocationPickerMap").then((m) => ({ default: m.LocationPickerMap }))
);

type NearbyDuplicate = {
  id: string;
  category: Category;
  description: string;
  photo_url: string | null;
  distance: number;
  votes_count: number;
  similarity_reason?: string;
};

type LocationSource = "gps" | "photo" | "address" | "map";

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

  // États de localisation (GPS direct, EXIF photo, Adresse saisie ou Carte interactive)
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geoState, setGeoState] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [locationSource, setLocationSource] = useState<LocationSource | null>(null);
  const [locationInputMode, setLocationInputMode] = useState<"address" | "map">("address");
  const [exifCapturedAt, setExifCapturedAt] = useState<string | null>(null);
  const [photoMissingExif, setPhotoMissingExif] = useState(false);

  // Recherche d'adresse (Option 2 par défaut)
  const [addressQuery, setAddressQuery] = useState("");
  const [addressResults, setAddressResults] = useState<GeocodedPlace[]>(() =>
    searchLocalAbidjanPlaces("")
  );
  const [searchingAddress, setSearchingAddress] = useState(false);
  const [addressFocused, setAddressFocused] = useState(false);
  const [selectedPlaceLabel, setSelectedPlaceLabel] = useState<string | null>(null);

  // Empêche le GPS automatique au chargement d'écraser le GPS d'une photo ou une adresse déjà choisie
  const locationLockRef = useRef<LocationSource | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<{ category: Category; confidence: number } | null>(null);
  const [blurring, setBlurring] = useState(false);
  const [facesBlurred, setFacesBlurred] = useState<number | null>(null);
  const [imageRejected, setImageRejected] = useState<string | null>(null);
  const [nearbyDuplicate, setNearbyDuplicate] = useState<NearbyDuplicate | null>(null);
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);
  const [duplicateIgnored, setDuplicateIgnored] = useState(false);
  const [confirmingDuplicate, setConfirmingDuplicate] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/login" });
  }, [user, authLoading, navigate]);

  // Recherche dynamique d'adresses et de quartiers dans le Grand Abidjan
  useEffect(() => {
    const q = addressQuery.trim();
    if (!q) {
      setAddressResults(searchLocalAbidjanPlaces(""));
      setSearchingAddress(false);
      return;
    }

    // Affichage immédiat des correspondances locales
    setAddressResults(searchLocalAbidjanPlaces(q));

    if (q.length < 2) return;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearchingAddress(true);
      try {
        const merged = await searchAbidjanAddresses(q, controller.signal);
        if (!controller.signal.aborted) {
          setAddressResults(merged);
        }
      } finally {
        if (!controller.signal.aborted) {
          setSearchingAddress(false);
        }
      }
    }, 280);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [addressQuery]);

  // Détection intelligente de doublons : Proximité GPS + Similitude visuelle de l'image par l'IA
  useEffect(() => {
    if (!coords || !category || !photo || duplicateIgnored) {
      if (!photo) setNearbyDuplicate(null);
      return;
    }

    let isMounted = true;
    (async () => {
      setCheckingDuplicate(true);
      try {
        const [{ data }, syncedStatuses] = await Promise.all([
          supabase
            .from("reports")
            .select("id, category, description, photo_url, latitude, longitude, votes_count, status")
            .eq("category", category)
            .neq("status", "resolu")
            .not("photo_url", "is", null)
            .limit(30),
          fetchSyncedStatuses(),
        ]);

        if (!data || data.length === 0 || !isMounted) {
          if (isMounted) setNearbyDuplicate(null);
          return;
        }

        const nearbyCandidates = data
          .filter((rep) => {
            const effectiveStatus = syncedStatuses[rep.id]?.status ?? rep.status;
            return (
              effectiveStatus !== "resolu" &&
              effectiveStatus !== "rejete" &&
              rep.latitude &&
              rep.longitude &&
              rep.photo_url
            );
          })
          .map((rep) => ({
            id: rep.id,
            category: rep.category as Category,
            description: rep.description,
            photo_url: rep.photo_url as string,
            distance: Math.round(
              calculateDistanceMeters(coords.lat, coords.lng, rep.latitude!, rep.longitude!)
            ),
            votes_count: rep.votes_count,
          }))
          .filter((rep) => rep.distance <= 150)
          .sort((a, b) => a.distance - b.distance)
          .slice(0, 3);

        if (nearbyCandidates.length === 0 || !isMounted) {
          if (isMounted) setNearbyDuplicate(null);
          return;
        }

        const newImageBase64 = await fileToBase64(photo);
        const comparison = await compareDuplicateImagesServerFn({
          data: {
            newImageBase64,
            newMimeType: photo.type || "image/jpeg",
            candidates: nearbyCandidates,
          },
        });

        if (!isMounted) return;

        if (comparison.is_duplicate && comparison.matched_report_id) {
          const matched = nearbyCandidates.find((c) => c.id === comparison.matched_report_id);
          if (matched) {
            setNearbyDuplicate({
              ...matched,
              similarity_reason: comparison.similarity_reason,
            });
          } else {
            setNearbyDuplicate(null);
          }
        } else {
          setNearbyDuplicate(null);
        }
      } catch (err) {
        console.warn("Erreur vérification doublons :", err);
      } finally {
        if (isMounted) setCheckingDuplicate(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [coords?.lat, coords?.lng, category, photo, duplicateIgnored]);

  const confirmDuplicate = async () => {
    if (!user || !nearbyDuplicate) return;
    setConfirmingDuplicate(true);
    try {
      const { error } = await supabase.from("report_votes").insert({
        report_id: nearbyDuplicate.id,
        user_id: user.id,
      });
      if (error && !error.message.includes("duplicate")) throw error;
      toast.success(
        "Merci ! Votre confirmation (+1) a été ajoutée au signalement existant.",
        { description: "La mairie verra que plusieurs citoyens sont impactés." }
      );
      navigate({ to: "/" });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setConfirmingDuplicate(false);
    }
  };

  const askLocation = (isInitialAuto = false) => {
    if (!isInitialAuto) {
      locationLockRef.current = null;
    }
    if (!navigator.geolocation) {
      if (!locationLockRef.current) setGeoState("error");
      if (!isInitialAuto) toast.error("Géolocalisation non disponible sur cet appareil");
      return;
    }
    if (!locationLockRef.current) {
      setGeoState("loading");
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        // Si l'utilisateur a entre-temps chargé une photo avec EXIF ou choisi une adresse/carte, on la préserve
        if (isInitialAuto && locationLockRef.current) return;

        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        if (!isInAbidjan(lat, lng)) {
          if (!locationLockRef.current) {
            setCoords(null);
            setGeoState("error");
          }
          if (!isInitialAuto) {
            toast.error("Hors zone Abidjan", {
              description:
                "Votre position actuelle est hors du Grand Abidjan. Saisissez l'adresse du problème ou indiquez-la sur la carte.",
            });
          }
          return;
        }
        setCoords({ lat, lng });
        setGeoState("ok");
        setLocationSource("gps");
        setSelectedPlaceLabel(null);
        const detectedCommune = detectCommuneFromCoords(lat, lng);
        if (detectedCommune) {
          setVille((prev) => (!isInitialAuto || prev.trim().length === 0 ? detectedCommune : prev));
        }
        if (!isInitialAuto) {
          toast.success("Position GPS actuelle activée", {
            description: detectedCommune ? `Commune détectée : ${detectedCommune}` : undefined,
          });
        }
      },
      (err) => {
        if (isInitialAuto && locationLockRef.current) return;
        setGeoState("error");
        if (!isInitialAuto) {
          toast.error("Position GPS indisponible", {
            description: `${err.message}. Vous pouvez saisir l'adresse ou utiliser la carte ci-dessous.`,
          });
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    );
  };

  useEffect(() => {
    askLocation(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectAddressPlace = (place: GeocodedPlace) => {
    locationLockRef.current = "address";
    setCoords({ lat: place.lat, lng: place.lng });
    setGeoState("ok");
    setLocationSource("address");
    setSelectedPlaceLabel(place.label);
    setAddressQuery(place.label);
    setAddressFocused(false);
    const detected = place.commune ?? detectCommuneFromCoords(place.lat, place.lng);
    setVille(detected && !place.label.toLowerCase().includes(detected.toLowerCase())
      ? `${detected} — ${place.label}`
      : place.label);
    toast.success("Lieu enregistré", {
      description: `${place.label}${detected ? ` (${detected})` : ""}`,
    });
  };

  const handleManualAddressSubmit = async () => {
    const q = addressQuery.trim();
    if (!q) {
      toast.error("Entrez un quartier, une commune ou un repère (ex: Yopougon Siporex)");
      return;
    }
    setSearchingAddress(true);
    try {
      const results = await searchAbidjanAddresses(q);
      setAddressResults(results);
      if (results.length > 0) {
        selectAddressPlace(results[0]);
      } else {
        toast.error("Adresse introuvable dans le Grand Abidjan", {
          description: "Essayez un quartier connu ou cliquez sur « Indiquer à travers une carte ».",
        });
      }
    } finally {
      setSearchingAddress(false);
    }
  };

  const handlePhoto = async (file: File | null) => {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setAiSuggestion(null);
    setFacesBlurred(null);
    setExifCapturedAt(null);
    setPhotoMissingExif(false);
    if (!file) {
      setPhoto(null);
      setPhotoPreview(null);
      return;
    }
    setImageRejected(null);

    // 1. Lecture immédiate des métadonnées EXIF GPS contenues dans la photo originale
    // (avant tout passage par un canvas qui purge les métadonnées EXIF)
    const exif = await extractExifGps(file);
    if (exif) {
      if (isInAbidjan(exif.lat, exif.lng)) {
        locationLockRef.current = "photo";
        setCoords({ lat: exif.lat, lng: exif.lng });
        setGeoState("ok");
        setLocationSource("photo");
        setExifCapturedAt(exif.capturedAt ?? null);
        setSelectedPlaceLabel(null);
        const detectedCommune = detectCommuneFromCoords(exif.lat, exif.lng);
        if (detectedCommune) {
          setVille(detectedCommune);
        }
        toast.success("📍 Localisation extraite de la photo !", {
          description: detectedCommune
            ? `Lieu où la photo a été prise : ${detectedCommune}`
            : "Les coordonnées GPS enregistrées dans la photo ont été récupérées.",
        });
      } else {
        setPhotoMissingExif(true);
        toast.error("GPS de la photo hors Abidjan", {
          description:
            "Les coordonnées intégrées à cette photo sont hors du Grand Abidjan. Précisez l'adresse ci-dessous si besoin.",
        });
      }
    } else {
      // Aucune variable GPS trouvée dans l'image : on invite l'utilisateur à vérifier / saisir l'adresse s'il n'est plus sur place
      setPhotoMissingExif(true);
    }

    // 2. Affichage et analyse IA + floutage automatique des visages
    setPhoto(file);
    setPhotoPreview(URL.createObjectURL(file));
    void analyzePhoto(file);
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

  const analyzePhoto = async (file: File) => {
    setAnalyzing(true);
    try {
      const imageBase64 = await fileToBase64(file);
      const result = await classifyImageServerFn({
        data: { imageBase64, mimeType: file.type || "image/jpeg" },
      });

      if (result.faces && result.faces.length > 0) {
        try {
          const autoBlurred = await blurBoxesOnImage(file, result.faces);
          if (photoPreview) URL.revokeObjectURL(photoPreview);
          setPhoto(autoBlurred);
          setPhotoPreview(URL.createObjectURL(autoBlurred));
          setFacesBlurred(result.faces.length);
          toast.success(
            `${result.faces.length} visage${result.faces.length > 1 ? "s" : ""} flouté${result.faces.length > 1 ? "s" : ""} automatiquement par l'IA !`
          );
        } catch (blurErr) {
          console.warn("Échec du floutage automatique IA :", blurErr);
        }
      } else {
        setFacesBlurred(0);
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
      setFacesBlurred((prev) => prev ?? 0);
    } finally {
      setAnalyzing(false);
    }
  };

  const submit = async () => {
    if (!user) return;
    if (!category) {
      toast.error("Choisissez une catégorie");
      return;
    }
    if (description.trim().length < 5) {
      toast.error("Décrivez le problème en quelques mots");
      return;
    }
    if (!coords) {
      toast.error("Localisation requise", {
        description: "Saisissez l'adresse du lieu ou indiquez-le sur la carte.",
      });
      return;
    }
    if (!isInAbidjan(coords.lat, coords.lng)) {
      toast.error("Hors zone Abidjan", {
        description: "Seuls les signalements dans la zone d'Abidjan sont acceptés.",
      });
      return;
    }
    if (imageRejected) {
      toast.error("Image non valide", {
        description: "Veuillez fournir une photo en lien avec l'insalubrité urbaine.",
      });
      return;
    }

    setSubmitting(true);
    try {
      let photo_url: string | null = null;
      if (photo) {
        const ext = (photo.name.split(".").pop() || "jpg").toLowerCase();
        const path = `${user.id}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("report-photos").upload(path, photo, {
          cacheControl: "3600",
          contentType: photo.type || "image/jpeg",
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
        ville: ville.trim() || detectCommuneFromCoords(coords.lat, coords.lng) || null,
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

  const detectedCommuneLabel = coords ? detectCommuneFromCoords(coords.lat, coords.lng) : null;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-xl px-4 py-6 pb-24">
        <Link to="/" className="mb-4 inline-block text-sm text-muted-foreground">
          ← Retour au fil
        </Link>
        <h1 className="mb-1 text-2xl font-bold">Nouveau signalement</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Remplissez en moins d'une minute. Vous pouvez aussi importer une photo prise plus tôt hors connexion.
        </p>

        <div className="space-y-5">
          <Card className="p-4">
            <Label className="mb-3 block">Type de problème</Label>
            {aiSuggestion && (
              <div className="mb-3 flex items-center gap-2 rounded-md bg-primary/10 px-3 py-2 text-xs">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                <span className="text-muted-foreground">Suggestion IA :</span>
                <Badge variant="secondary">
                  {CATEGORIES.find((c) => c.value === aiSuggestion.category)?.label}
                </Badge>
                <span className="ml-auto text-muted-foreground">
                  {Math.round(aiSuggestion.confidence * 100)}% sûr
                </span>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              {CATEGORIES.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setCategory(c.value)}
                  className={`group flex flex-col gap-2 overflow-hidden rounded-lg border-2 p-0 text-left text-sm transition ${
                    category === c.value
                      ? "border-primary bg-primary/10"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  <img src={c.image} alt="" loading="lazy" className="h-20 w-full object-cover" />
                  <span className="px-3 pb-2 text-xs font-medium leading-tight">{c.label}</span>
                </button>
              ))}
            </div>
          </Card>

          {checkingDuplicate && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-300/60 bg-amber-50/50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
              <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
              <span>
                L'IA compare votre photo avec les signalements proches pour vérifier s'il s'agit du même endroit…
              </span>
            </div>
          )}

          {nearbyDuplicate && (
            <Card className="border-2 border-amber-400 bg-amber-50/90 p-4 shadow-sm dark:border-amber-700 dark:bg-amber-950/50">
              <div className="flex items-start gap-3">
                <div className="rounded-full bg-amber-200 p-2 text-amber-800 dark:bg-amber-900 dark:text-amber-200 shrink-0">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div className="flex-1 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-bold text-amber-950 dark:text-amber-100 text-sm">
                      Doublon détecté par l'IA (même lieu & similitude visuelle) !
                    </h3>
                    <Badge
                      variant="outline"
                      className="border-amber-400 text-amber-800 dark:text-amber-200 shrink-0"
                    >
                      {formatDistance(nearbyDuplicate.distance)}
                    </Badge>
                  </div>
                  {nearbyDuplicate.similarity_reason && (
                    <div className="flex items-start gap-1.5 rounded bg-amber-100/80 px-2.5 py-1.5 text-[11px] font-medium text-amber-900 dark:bg-amber-900/50 dark:text-amber-100">
                      <Sparkles className="h-3.5 w-3.5 shrink-0 text-amber-700 mt-0.5" />
                      <span>
                        <strong>Analyse visuelle IA :</strong> {nearbyDuplicate.similarity_reason}
                      </span>
                    </div>
                  )}
                  <p className="text-amber-900 dark:text-amber-200 font-medium">
                    Signalement existant : « {nearbyDuplicate.description} »
                  </p>
                  {nearbyDuplicate.photo_url && (
                    <img
                      src={nearbyDuplicate.photo_url}
                      alt="Photo existante"
                      className="my-2 h-24 w-40 rounded-md object-cover border"
                    />
                  )}
                  <p className="text-[11px] text-amber-800/90 dark:text-amber-300">
                    L'IA a reconnu les mêmes repères visuels et la même localisation. Cliquez sur{" "}
                    <strong>« Confirmer ce problème (+1) »</strong> pour appuyer ce signalement auprès de la mairie
                    plutôt que de créer un doublon.
                  </p>
                  <div className="flex flex-wrap items-center gap-2 pt-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={confirmingDuplicate}
                      onClick={confirmDuplicate}
                      className="gap-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                    >
                      {confirmingDuplicate ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <ThumbsUp className="h-3.5 w-3.5" />
                      )}
                      Confirmer ce problème (+1)
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setNearbyDuplicate(null);
                        setDuplicateIgnored(true);
                      }}
                      className="border-amber-300 bg-white/60 text-xs hover:bg-white dark:bg-black/30"
                    >
                      C'est un autre endroit, continuer
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          )}

          <Card className="p-4">
            <Label className="mb-2 block">Photo (recommandé)</Label>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-border bg-muted/30 px-4 py-5 text-sm text-muted-foreground hover:border-primary/50">
                <Camera className="h-5 w-5" />
                <span>Prendre une photo</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => handlePhoto(e.target.files?.[0] ?? null)}
                />
              </label>
              <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-border bg-muted/30 px-4 py-5 text-sm text-muted-foreground hover:border-primary/50">
                <ImageIcon className="h-5 w-5" />
                <span>Importer depuis la galerie</span>
                <input
                  type="file"
                  accept="image/*,.jpg,.jpeg,.heic,.webp"
                  className="hidden"
                  onChange={(e) => handlePhoto(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>
            <p className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
              <ShieldCheck className="h-3 w-3 shrink-0" /> Les visages sont automatiquement floutés avant l'envoi. Si
              la photo contient une position GPS, elle est récupérée automatiquement.
            </p>
            {locationSource === "photo" && coords && (
              <div className="mt-2 flex items-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-50/80 px-2.5 py-1.5 text-xs font-medium text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                <span>
                  Position GPS extraite de la photo
                  {detectedCommuneLabel ? ` (${detectedCommuneLabel})` : ""}
                  {exifCapturedAt ? ` · prise le ${exifCapturedAt}` : ""}
                </span>
              </div>
            )}
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
                    🛡️ {facesBlurred} visage{facesBlurred > 1 ? "s" : ""} flouté
                    {facesBlurred > 1 ? "s" : ""} automatiquement pour préserver la vie privée.
                  </span>
                )}
              </div>
            )}
            {imageRejected && (
              <div className="mt-2 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
                <strong>Image refusée :</strong> {imageRejected}
                <div className="mt-1 text-[11px]">
                  SalubApp n'accepte que les photos liées à la salubrité urbaine, la voirie ou les chantiers.
                </div>
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
                  👆 <strong>Astuce :</strong> Touchez directement la photo pour flouter manuellement un visage ou une
                  zone.
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
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={analyzing}
                  onClick={() => photo && analyzePhoto(photo)}
                  className="gap-1"
                >
                  {analyzing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  {analyzing ? "Analyse…" : aiSuggestion ? "Re-analyser" : "Analyser avec l'IA"}
                </Button>
              </div>
            )}
          </Card>

          <Card className="p-4">
            <Label htmlFor="desc">Description</Label>
            <Textarea
              id="desc"
              value={description}
              maxLength={1000}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex : tas d'ordures depuis 3 jours devant l'école..."
              className="mt-1.5 min-h-24"
            />
            <div className="mt-1 text-right text-xs text-muted-foreground">{description.length}/1000</div>
          </Card>

          {/* CARTE DE LOCALISATION : 1) EXIF Photo / GPS auto, 2) Champ d'adresse affiché d'emblée, et option Carte en bas */}
          <Card className="space-y-4 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label className="text-sm font-semibold">Localisation du problème</Label>
              {locationSource && coords && (
                <Badge variant="secondary" className="text-[11px]">
                  {locationSource === "photo" && "📸 Extraite de la photo"}
                  {locationSource === "address" && "🏠 Adresse saisie"}
                  {locationSource === "map" && "🗺️ Pointée sur la carte"}
                  {locationSource === "gps" && "📡 Position actuelle"}
                </Badge>
              )}
            </div>

            {/* État de la localisation active */}
            {geoState === "loading" && !coords && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Détection de la position en cours…
              </div>
            )}

            {coords && (
              <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50/70 p-2.5 text-xs text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">
                    {selectedPlaceLabel
                      ? selectedPlaceLabel
                      : detectedCommuneLabel
                      ? `Commune détectée : ${detectedCommuneLabel}`
                      : "Position enregistrée dans le Grand Abidjan"}
                  </div>
                  <div className="text-[11px] opacity-80">
                    GPS : {coords.lat.toFixed(4)}, {coords.lng.toFixed(4)}
                  </div>
                </div>
              </div>
            )}

            {photoMissingExif && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-300/70 bg-amber-50/70 p-2.5 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <span>
                  Cette photo ne contenait pas de variable GPS intégrée. Si vous n'êtes plus sur le lieu du problème,
                  entrez l'adresse ci-dessous ou indiquez-le via la carte.
                </span>
              </div>
            )}

            {/* MODE PAR DÉFAUT : Saisir directement l'adresse (sans imposer la carte d'emblée) */}
            {locationInputMode === "address" && (
              <div className="space-y-2">
                <Label htmlFor="address-search" className="text-xs text-muted-foreground">
                  Vous n'êtes plus sur place ou sans GPS ? Entrez l'adresse, le quartier ou un repère connu :
                </Label>
                <div className="relative">
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="address-search"
                        type="text"
                        value={addressQuery}
                        onFocus={() => setAddressFocused(true)}
                        onBlur={() => setTimeout(() => setAddressFocused(false), 200)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            void handleManualAddressSubmit();
                          }
                        }}
                        onChange={(e) => setAddressQuery(e.target.value)}
                        placeholder="Ex : Yopougon Siporex, Cocody Angré, Bingerville…"
                        className="pl-9 pr-8 text-xs sm:text-sm"
                      />
                      {addressQuery && (
                        <button
                          type="button"
                          onClick={() => setAddressQuery("")}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          aria-label="Effacer l'adresse"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={searchingAddress}
                      onClick={() => void handleManualAddressSubmit()}
                      className="shrink-0 h-9 px-3 text-xs font-semibold"
                    >
                      {searchingAddress ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Valider"}
                    </Button>
                  </div>

                  {/* Liste de suggestions d'adresses / quartiers d'Abidjan */}
                  {addressFocused && addressResults.length > 0 && (
                    <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-56 overflow-auto rounded-lg border bg-popover p-1 shadow-md">
                      <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {addressQuery.trim() ? "Lieux trouvés dans le Grand Abidjan" : "Quartiers & repères fréquents"}
                      </div>
                      {addressResults.map((place) => (
                        <button
                          key={place.id}
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            selectAddressPlace(place);
                          }}
                          className="flex w-full items-start gap-2 rounded-md px-2.5 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground"
                        >
                          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-medium">{place.label}</div>
                            <div className="truncate text-[10px] text-muted-foreground">{place.sublabel}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* MODE CARTE : Affiché uniquement si l'utilisateur choisit l'option carte en bas */}
            {locationInputMode === "map" && (
              <Suspense
                fallback={
                  <div className="flex h-64 items-center justify-center rounded-xl border bg-muted text-xs text-muted-foreground">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Chargement de la carte…
                  </div>
                }
              >
                <LocationPickerMap
                  coords={coords}
                  onSelectLocation={(lat, lng, commune) => {
                    locationLockRef.current = "map";
                    setCoords({ lat, lng });
                    setGeoState("ok");
                    setLocationSource("map");
                    setSelectedPlaceLabel(null);
                    if (commune) {
                      setVille((prev) => (prev.trim().length === 0 ? commune : prev));
                    }
                  }}
                />
              </Suspense>
            )}

            {/* Champ complémentaire optionnel pour préciser un repère exact aux équipes de la mairie */}
            <div>
              <Label htmlFor="ville" className="text-xs text-muted-foreground">
                Précision de repère pour la mairie (optionnel)
              </Label>
              <Input
                id="ville"
                value={ville}
                onChange={(e) => setVille(e.target.value)}
                placeholder="Ex : Derrière la pharmacie Siporex, près de l'école…"
                className="mt-1 text-xs sm:text-sm"
                maxLength={100}
              />
            </div>

            {/* BARRE D'OPTIONS EN BAS : Saisir l'adresse OU Indiquer à travers une carte (ou Position actuelle) */}
            <div className="border-t pt-3">
              <p className="mb-2 text-[11px] font-medium text-muted-foreground">
                Vous ne connaissez pas l'adresse exacte ? Choisissez comment indiquer le lieu :
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={locationInputMode === "address" ? "default" : "outline"}
                  onClick={() => setLocationInputMode("address")}
                  className="gap-1.5 text-xs"
                >
                  <Search className="h-3.5 w-3.5" />
                  Saisir l'adresse
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={locationInputMode === "map" ? "default" : "outline"}
                  onClick={() => setLocationInputMode("map")}
                  className="gap-1.5 text-xs"
                >
                  <MapIcon className="h-3.5 w-3.5" />
                  Indiquer à travers une carte
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => askLocation(false)}
                  className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  <Navigation className="h-3.5 w-3.5" />
                  Ma position actuelle
                </Button>
              </div>
            </div>
          </Card>

          <Button onClick={submit} disabled={submitting || !coords} size="lg" className="w-full">
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Envoi…
              </>
            ) : (
              "Envoyer le signalement"
            )}
          </Button>
        </div>
      </main>
    </div>
  );
}
