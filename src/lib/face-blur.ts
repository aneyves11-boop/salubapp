// Détection + floutage de visages côté client via MediaPipe et API native.
// Aucune image n'est envoyée à un serveur tant qu'elle n'est pas floutée.
import { FaceDetector, FilesetResolver } from "@mediapipe/tasks-vision";

let detectorPromise: Promise<FaceDetector> | null = null;

async function getDetector(): Promise<FaceDetector> {
  if (!detectorPromise) {
    detectorPromise = (async () => {
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm"
      );

      // Tente d'abord avec le GPU, bascule sur CPU si non supporté
      try {
        return await FaceDetector.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite",
            delegate: "GPU",
          },
          runningMode: "IMAGE",
          minDetectionConfidence: 0.1,
          minSuppressionThreshold: 0.2,
        });
      } catch (gpuErr) {
        console.warn("GPU delegate non disponible, bascule sur CPU:", gpuErr);
        return await FaceDetector.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite",
            delegate: "CPU",
          },
          runningMode: "IMAGE",
          minDetectionConfidence: 0.1,
          minSuppressionThreshold: 0.2,
        });
      }
    })().catch((err) => {
      detectorPromise = null;
      throw err;
    });
  }
  return detectorPromise;
}

export interface BlurResult {
  blob: Blob;
  facesDetected: number;
  width: number;
  height: number;
}

type Box = { x: number; y: number; w: number; h: number };

function applyBlurToCanvas(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, box: Box) {
  const pad = 0.4;
  const x = Math.max(0, box.x - box.w * pad);
  const y = Math.max(0, box.y - box.h * pad);
  const w = Math.min(canvas.width - x, box.w * (1 + 2 * pad));
  const h = Math.min(canvas.height - y, box.h * (1 + 2 * pad));

  const tmp = document.createElement("canvas");
  const scale = 0.035;
  tmp.width = Math.max(1, Math.floor(w * scale));
  tmp.height = Math.max(1, Math.floor(h * scale));
  const tctx = tmp.getContext("2d")!;
  tctx.drawImage(canvas, x, y, w, h, 0, 0, tmp.width, tmp.height);

  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(tmp, 0, 0, tmp.width, tmp.height, x, y, w, h);
}

/** Détecte les visages et retourne une nouvelle image avec floutage appliqué. */
export async function blurFacesInImage(file: File): Promise<BlurResult> {
  const bitmap = await createImageBitmap(file);

  const MAX_DIM = 1920;
  let targetWidth = bitmap.width;
  let targetHeight = bitmap.height;

  if (targetWidth > MAX_DIM || targetHeight > MAX_DIM) {
    if (targetWidth > targetHeight) {
      targetHeight = Math.round((targetHeight * MAX_DIM) / targetWidth);
      targetWidth = MAX_DIM;
    } else {
      targetWidth = Math.round((targetWidth * MAX_DIM) / targetHeight);
      targetHeight = MAX_DIM;
    }
  }

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);

  const boxes: Box[] = [];

  // 1. Détection matérielle native (Chrome / Android Shape Detection API)
  if (typeof window !== "undefined" && "FaceDetector" in window) {
    try {
      const NativeDetector = (window as any).FaceDetector;
      const native = new NativeDetector({ fastMode: false, maxDetectedFaces: 10 });
      const detected = await native.detect(canvas);
      if (detected && detected.length > 0) {
        for (const f of detected) {
          const bb = f.boundingBox;
          if (bb) boxes.push({ x: bb.x, y: bb.y, w: bb.width, h: bb.height });
        }
      }
    } catch (e) {
      console.warn("Native FaceDetector failed:", e);
    }
  }

  // 2. Détection MediaPipe BlazeFace (avec seuil ultra-sensible 0.1)
  try {
    const detector = await getDetector();
    const result = detector.detect(canvas);
    for (const det of result.detections) {
      const bb = det.boundingBox;
      if (bb) {
        // Évite les doublons avec le détecteur natif
        const already = boxes.some(
          (b) => Math.abs(b.x - bb.originX) < 50 && Math.abs(b.y - bb.originY) < 50
        );
        if (!already) {
          boxes.push({ x: bb.originX, y: bb.originY, w: bb.width, h: bb.height });
        }
      }
    }
  } catch (e) {
    console.warn("MediaPipe detect failed:", e);
  }

  // Applique le flou sur chaque visage trouvé
  for (const box of boxes) {
    applyBlurToCanvas(ctx, canvas, box);
  }

  const blob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/jpeg", 0.85)
  );
  bitmap.close();
  return { blob, facesDetected: boxes.length, width: canvas.width, height: canvas.height };
}

/** Floute manuellement une zone circulaire/carrée désignée par un tap sur l'image */
export async function manualBlurAtCoords(
  file: File,
  normX: number,
  normY: number,
  normRadius: number = 0.12
): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0);

  const centerX = normX * canvas.width;
  const centerY = normY * canvas.height;
  const radius = normRadius * Math.min(canvas.width, canvas.height);

  const box: Box = {
    x: Math.max(0, centerX - radius),
    y: Math.max(0, centerY - radius),
    w: radius * 2,
    h: radius * 2,
  };

  applyBlurToCanvas(ctx, canvas, box);

  const blob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/jpeg", 0.85)
  );
  bitmap.close();

  return new File([blob], file.name, { type: "image/jpeg" });
}
