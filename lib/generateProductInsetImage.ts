import sharp from "sharp";

const CANVAS_WIDTH = 1280;
const CANVAS_HEIGHT = 800;
const MAX_INSET_WIDTH = 1000;
const MAX_INSET_HEIGHT = 625;
const OUTER_BACKGROUND_HEX = "#F5F6F8";
const INNER_BACKGROUND_HEX = "#FFFFFF";
const INNER_PAD_X = 56;
const INNER_PAD_Y = 64;

const IMAGE_FETCH_TIMEOUT_MS = 10000;
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export interface InsetResult {
  buffer: Buffer;
  insetWidth: number;
  insetHeight: number;
  canvasWidth: number;
  canvasHeight: number;
}

async function normalizeInsetSource(imageBuffer: Buffer): Promise<Buffer> {
  const source = sharp(imageBuffer, { failOn: "none" }).rotate();

  try {
    const trimmedBuffer = await source
      .clone()
      .trim({ threshold: 20 })
      .toBuffer();

    const [originalMeta, trimmedMeta] = await Promise.all([
      source.clone().metadata(),
      sharp(trimmedBuffer).metadata(),
    ]);

    if (
      originalMeta.width &&
      originalMeta.height &&
      trimmedMeta.width &&
      trimmedMeta.height &&
      trimmedMeta.width >= 50 &&
      trimmedMeta.height >= 50 &&
      (trimmedMeta.width < originalMeta.width ||
        trimmedMeta.height < originalMeta.height)
    ) {
      return trimmedBuffer;
    }
  } catch {
    // Fall back to the original asset if trim fails on an odd format.
  }

  return source.toBuffer();
}

/**
 * Composite a product image centered on a light-grey 1280x800 canvas.
 * Accepts a raw buffer so both auto-fetched and user-uploaded images share
 * the exact same pipeline. Small images are scaled up to avoid tiny thumbnails.
 */
export async function generateProductInset(
  imageBuffer: Buffer,
): Promise<InsetResult> {
  const normalizedBuffer = await normalizeInsetSource(imageBuffer);

  // 1. Validate input dimensions
  const inputMeta = await sharp(normalizedBuffer).metadata();
  if (!inputMeta.width || !inputMeta.height) {
    throw new Error("Invalid image: unable to read dimensions");
  }
  if (inputMeta.width < 50 || inputMeta.height < 50) {
    throw new Error(
      `Image too small: ${inputMeta.width}x${inputMeta.height}`,
    );
  }

  const contentMaxWidth = MAX_INSET_WIDTH - INNER_PAD_X * 2;
  const contentMaxHeight = MAX_INSET_HEIGHT - INNER_PAD_Y * 2;

  // 2. Resize the product so it sits inside a white stage with consistent
  // breathing room around the image itself.
  const resizedBuffer = await sharp(normalizedBuffer)
    .ensureAlpha()
    .resize(contentMaxWidth, contentMaxHeight, {
      fit: "inside",
      withoutEnlargement: false,
    })
    .png()
    .toBuffer();

  // 3. Get EXACT dimensions from the resized output
  const { width: finalW, height: finalH } = await sharp(
    resizedBuffer,
  ).metadata();
  if (!finalW || !finalH) throw new Error("Resize failed: metadata missing");

  const stageWidth = finalW + INNER_PAD_X * 2;
  const stageHeight = finalH + INNER_PAD_Y * 2;

  const stageBuffer = await sharp({
    create: {
      width: stageWidth,
      height: stageHeight,
      channels: 3,
      background: INNER_BACKGROUND_HEX,
    },
  })
    .composite([
      {
        input: resizedBuffer,
        left: INNER_PAD_X,
        top: INNER_PAD_Y,
        blend: "over",
      },
    ])
    .png()
    .toBuffer();

  // 4. Precise center coordinates for the white stage on the shared field.
  const left = Math.round((CANVAS_WIDTH - stageWidth) / 2);
  const top = Math.round((CANVAS_HEIGHT - stageHeight) / 2);

  // 5. Composite the white stage onto the shared very-light grey canvas.
  const result = await sharp({
    create: {
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      channels: 3,
      background: OUTER_BACKGROUND_HEX,
    },
  })
    .composite([{ input: stageBuffer, left, top, blend: "over" }])
    .jpeg({ quality: 90, progressive: true })
    .toBuffer();

  if (result.length < 1024) throw new Error("Processed image too small");

  return {
    buffer: result,
    insetWidth: stageWidth,
    insetHeight: stageHeight,
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
  pageUrl?: string,
): Promise<Buffer> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const headers: Record<string, string> = {
        "User-Agent": USER_AGENT,
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      };
      if (pageUrl) {
        headers.Referer = pageUrl;
      }

      const res = await fetch(productImageUrl, {
        headers,
        signal: AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS),
      });

      if (!res.ok)
        throw new Error(`Product image fetch failed: HTTP ${res.status}`);

      const imgBuffer = Buffer.from(await res.arrayBuffer());
      const { buffer } = await generateProductInset(imgBuffer);
      return buffer;
    } catch (err) {
      lastError = err;
      if (attempt < 2) {
        console.log(
          JSON.stringify({
            event: "product_inset_fetch_retry",
            url: productImageUrl,
            attempt,
            error: err instanceof Error ? err.message : String(err),
          }),
        );
        // Small backoff before retry
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
  }

  throw lastError;
}
