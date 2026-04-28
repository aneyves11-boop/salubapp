// Détection + floutage de visages côté client via MediaPipe.
// Aucune image n'est envoyée à un serveur tant qu'elle n'est pas floutée.
import { FaceDetector, FilesetResolver } from "@mediapipe/tasks-vision";

let detectorPromise: Promise<FaceDetector> | null = null;

async function getDetector(): Promise<FaceDetector> {
  if (!detectorPromise) {
    detectorPromise = (async () => {
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm"
      );
      return FaceDetector.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite",
          delegate: "GPU",
        },
        runningMode: "IMAGE",
        minDetectionConfidence: 0.5,
      });
    })();
  }
  return detectorPromise;
}

export interface BlurResult {
  blob: Blob;
  facesDetected: number;
  width: number;
  height: number;
}

/** Détecte les visages et retourne une nouvelle image avec floutage appliqué. */
export async function blurFacesInImage(file: File): Promise<BlurResult> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0);

  let facesDetected = 0;
  try {
    const detector = await getDetector();
    const result = detector.detect(canvas);
    facesDetected = result.detections.length;

    for (const det of result.detections) {
      const bb = det.boundingBox;
      if (!bb) continue;
      // Élargit légèrement pour bien couvrir tête + cheveux
      const pad = 0.25;
      const x = Math.max(0, bb.originX - bb.width * pad);
      const y = Math.max(0, bb.originY - bb.height * pad);
      const w = Math.min(canvas.width - x, bb.width * (1 + 2 * pad));
      const h = Math.min(canvas.height - y, bb.height * (1 + 2 * pad));

      // Floutage : on extrait la zone, on la dessine très réduite puis ré-agrandie
      const tmp = document.createElement("canvas");
      const scale = 0.05;
      tmp.width = Math.max(1, Math.floor(w * scale));
      tmp.height = Math.max(1, Math.floor(h * scale));
      const tctx = tmp.getContext("2d")!;
      tctx.drawImage(canvas, x, y, w, h, 0, 0, tmp.width, tmp.height);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(tmp, 0, 0, tmp.width, tmp.height, x, y, w, h);
    }
  } catch (e) {
    console.warn("Face blur failed, uploading original:", e);
  }

  const blob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/jpeg", 0.85)
  );
  bitmap.close();
  return { blob, facesDetected, width: canvas.width, height: canvas.height };
}
