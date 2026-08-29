export type CoverCrop = { sx: number; sy: number; sw: number; sh: number };
export type RelativeRect = { x: number; y: number; w: number; h: number };

type OcrWorker = {
  recognize: (image: HTMLCanvasElement | HTMLImageElement | ImageBitmap) => Promise<{ data: { text: string } }>;
  setParameters: (params: Record<string, string>) => Promise<void>;
  terminate: () => Promise<void>;
};

let worker: OcrWorker | null = null;
let starting: Promise<OcrWorker> | null = null;
let generation = 0;

/**
 * Map a rectangle on an object-fit:cover video element back onto the source frame.
 */
export function coverCropSource(
  srcW: number,
  srcH: number,
  elW: number,
  elH: number,
  rel: RelativeRect,
): CoverCrop {
  if (srcW <= 0 || srcH <= 0 || elW <= 0 || elH <= 0) {
    return { sx: 0, sy: 0, sw: Math.max(0, srcW), sh: Math.max(0, srcH) };
  }
  const scale = Math.max(elW / srcW, elH / srcH);
  const drawnW = srcW * scale;
  const drawnH = srcH * scale;
  const offX = (drawnW - elW) / 2;
  const offY = (drawnH - elH) / 2;
  const sx = (rel.x * elW + offX) / scale;
  const sy = (rel.y * elH + offY) / scale;
  const sw = (rel.w * elW) / scale;
  const sh = (rel.h * elH) / scale;
  const clampedX = Math.max(0, Math.min(srcW, sx));
  const clampedY = Math.max(0, Math.min(srcH, sy));
  return {
    sx: clampedX,
    sy: clampedY,
    sw: Math.max(1, Math.min(srcW - clampedX, sw)),
    sh: Math.max(1, Math.min(srcH - clampedY, sh)),
  };
}

export function relativeRectFromElements(videoEl: Element, frameEl: Element): RelativeRect {
  const v = videoEl.getBoundingClientRect();
  const f = frameEl.getBoundingClientRect();
  if (v.width <= 0 || v.height <= 0) return { x: 0.19, y: 0.12, w: 0.62, h: 0.76 };
  return {
    x: (f.left - v.left) / v.width,
    y: (f.top - v.top) / v.height,
    w: f.width / v.width,
    h: f.height / v.height,
  };
}

export function captureCardFrame(video: HTMLVideoElement, frameEl: HTMLElement): HTMLCanvasElement {
  const rel = relativeRectFromElements(video, frameEl);
  const crop = coverCropSource(video.videoWidth, video.videoHeight, video.clientWidth, video.clientHeight, rel);
  const canvas = document.createElement("canvas");
  const targetW = 720;
  const ratio = crop.sh / Math.max(crop.sw, 1);
  canvas.width = targetW;
  canvas.height = Math.max(1, Math.round(targetW * ratio));
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.filter = "grayscale(1) contrast(1.35) brightness(1.08)";
  ctx.drawImage(video, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export async function getOcrWorker(): Promise<OcrWorker> {
  if (worker) return worker;
  if (starting) return starting;
  const my = ++generation;
  starting = (async () => {
    const tesseract = await import("tesseract.js");
    const w = (await tesseract.createWorker("eng", 1, {
      logger: () => undefined,
      workerPath: "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js",
      corePath: "https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1",
      langPath: "https://tessdata.projectnaptha.com/4.0.0",
    })) as unknown as OcrWorker;
    await w.setParameters({
      tessedit_pageseg_mode: String(tesseract.PSM.SPARSE_TEXT),
    });
    if (my !== generation) {
      await w.terminate();
      throw new Error("OCR worker cancelled");
    }
    worker = w;
    return w;
  })();
  try {
    return await starting;
  } finally {
    starting = null;
  }
}

export async function readCardImage(
  image: HTMLCanvasElement | HTMLImageElement | ImageBitmap,
): Promise<string> {
  const w = await getOcrWorker();
  const res = await w.recognize(image);
  return (res.data.text || "").trim();
}

export async function stopOcrWorker(): Promise<void> {
  generation += 1;
  const pending = starting;
  const current = worker;
  worker = null;
  starting = null;
  if (pending) {
    try {
      const started = await pending;
      await started.terminate();
    } catch {
      /* ignore */
    }
    return;
  }
  if (current) {
    try {
      await current.terminate();
    } catch {
      /* ignore */
    }
  }
}
