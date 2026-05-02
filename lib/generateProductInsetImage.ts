import sharp from "sharp";

const CANVAS_WIDTH = 1280;
const CANVAS_HEIGHT = 800;
const MAX_INSET_WIDTH = 1000;
const MAX_INSET_HEIGHT = 600;
const BACKGROUND_HEX = "#F8F9FA";

const IMAGE_FETCH_TIMEOUT_MS = 10000;
const USER_AGENT =
  "Mozilla/5.0 (compatible; Savers/1.0; +https://savers-production.up.railway.app)";

export interface InsetResult {
  buffer: Buffer;
  insetWidth: number;
  insetHeight: number;
  canvasWidth: number;
  canvasHeight: number;
}

/**
 * Composite a product image centered on a light-grey 1280x800 canvas.
 * Accepts a raw buffer so both auto-fetched and user-uploaded images share
 * the exact same pipeline. Small images are scaled up to avoid tiny thumbnails.
 */
export async function generateProductInset(
  imageBuffer: Buffer,
): Promise<InsetResult> {
  // 1. Validate input dimensions
  const inputMeta = await sharp(imageBuffer).metadata();
  if (!inputMeta.width || !inputMeta.height) {
    throw new Error("Invalid image: unable to read dimensions");
  }
  if (inputMeta.width < 50 || inputMeta.height < 50) {
    throw new Error(
      `Image too small: ${inputMeta.width}x${inputMeta.height}`,
    );
  }

  // 2. Single-pass resize → JPEG (allow small images to scale up)
  const resizedBuffer = await sharp(imageBuffer)
    .resize(MAX_INSET_WIDTH, MAX_INSET_HEIGHT, {
      fit: "inside",
      withoutEnlargement: false,
    })
    .jpeg({ quality: 90, progressive: true, mozjpeg: true })
    .toBuffer();

  // 3. Get EXACT dimensions from the resized output
  const { width: finalW, height: finalH } = await sharp(
    resizedBuffer,
  ).metadata();
  if (!finalW || !finalH) throw new Error("Resize failed: metadata missing");

  // 4. Precise center coordinates
  const left = Math.round((CANVAS_WIDTH - finalW) / 2);
  const top = Math.round((CANVAS_HEIGHT - finalH) / 2);

  // 5. Composite onto background canvas
  const result = await sharp({
    create: {
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      channels: 3,
      background: BACKGROUND_HEX,
    },
  })
    .composite([{ input: resizedBuffer, left, top, blend: "over" }])
    .jpeg({ quality: 90, progressive: true })
    .toBuffer();

  if (result.length < 1024) throw new Error("Processed image too small");

  return {
    buffer: result,
    insetWidth: finalW,
    insetHeight: finalH,
    canvasWidth: CANVAS_WIDTH,
    canvasHeight: CANVAS_HEIGHT,
  };
}

/**
 * Fetch a product image URL and run it through the unified inset pipeline.
 * Used by the screenshot worker for auto-generated shopping previews.
 */
export async function generateProductInsetImage(
  productImageUrl: string,
): Promise<Buffer> {
  const res = await fetch(productImageUrl, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS),
  });

  if (!res.ok)
    throw new Error(`Product image fetch failed: HTTP ${res.status}`);

  const imgBuffer = Buffer.from(await res.arrayBuffer());
  const { buffer } = await generateProductInset(imgBuffer);
  return buffer;
}
