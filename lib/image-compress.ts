// Client-only helpers for shrinking user-dropped images before we send
// them to the custom-preview API. Supabase Storage has a bucket-level
// file-size cap, and phones routinely produce 6–12 MB screenshots, so
// we resize + re-encode anything that's too large (or too tall-and-wide
// to be a useful thumbnail) before upload.

const MAX_WIDTH = 1600;
const TARGET_MAX_BYTES = 2 * 1024 * 1024; // aim for < 2 MB
const HARD_MAX_BYTES = 8 * 1024 * 1024; // never send more than this
const MIN_QUALITY = 0.55;

type LoadedImage = {
  width: number;
  height: number;
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
  close?: () => void;
};

async function loadImage(file: File): Promise<LoadedImage> {
  // Prefer createImageBitmap — it's async, off-main-thread on most browsers,
  // and handles EXIF orientation automatically.
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return {
        width: bitmap.width,
        height: bitmap.height,
        draw: (ctx, w, h) => ctx.drawImage(bitmap, 0, 0, w, h),
        close: () => bitmap.close(),
      };
    } catch {
      // Fall through to HTMLImageElement path
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Failed to load image"));
      el.src = url;
    });
    return {
      width: img.naturalWidth,
      height: img.naturalHeight,
      draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h),
      close: () => URL.revokeObjectURL(url),
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), type, quality));
}

export async function compressImageForPreview(file: File): Promise<File> {
  // Skip work if the file is already small and we can't tell the dimensions
  // without decoding — but we still want to re-encode HEIC/HEIF since Supabase
  // can't serve those directly. If decode fails, fall back to the original.
  const looksHeic = /\.(heic|heif)$/i.test(file.name) || /^image\/heic|^image\/heif/i.test(file.type);
  if (file.size <= TARGET_MAX_BYTES && !looksHeic) {
    return file;
  }

  let loaded: LoadedImage;
  try {
    loaded = await loadImage(file);
  } catch {
    // Can't decode — let the server reject it with a real error.
    return file;
  }

  try {
    const scale = Math.min(1, MAX_WIDTH / loaded.width);
    const targetW = Math.max(1, Math.round(loaded.width * scale));
    const targetH = Math.max(1, Math.round(loaded.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;

    const ctx = canvas.getContext("2d");
    if (!ctx) return file;

    loaded.draw(ctx, targetW, targetH);

    // Walk quality down until we hit the target, but never below MIN_QUALITY.
    let quality = 0.85;
    let blob: Blob | null = null;

    while (quality >= MIN_QUALITY) {
      blob = await canvasToBlob(canvas, "image/jpeg", quality);
      if (!blob) break;
      if (blob.size <= TARGET_MAX_BYTES) break;
      quality -= 0.1;
    }

    if (!blob) return file;

    // If even the min-quality JPEG is above the hard cap, give up and upload
    // the original — the server-side 10 MB cap + Supabase bucket limit will
    // produce a clearer error than silently corrupting a massive file.
    if (blob.size > HARD_MAX_BYTES) return file;

    const baseName = file.name.replace(/\.[^.]+$/, "") || "upload";
    return new File([blob], `${baseName}.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } finally {
    loaded.close?.();
  }
}
