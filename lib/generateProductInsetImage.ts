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

type BackgroundKind = "whiteish" | "transparent" | "composed";

interface NormalizedInsetSource {
  buffer: Buffer;
  backgroundKind: BackgroundKind;
}

async function detectBackgroundKind(imageBuffer: Buffer): Promise<BackgroundKind> {
  const { data, info } = await sharp(imageBuffer)
    .rotate()
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const sampleEdge = Math.max(
    8,
    Math.min(24, Math.floor(Math.min(info.width, info.height) * 0.04)),
  );

  let whiteishCorners = 0;
  let transparentCorners = 0;

  const corners: Array<[number, number]> = [
    [0, 0],
    [Math.max(0, info.width - sampleEdge), 0],
    [0, Math.max(0, info.height - sampleEdge)],
    [Math.max(0, info.width - sampleEdge), Math.max(0, info.height - sampleEdge)],
  ];

  for (const [startX, startY] of corners) {
    let rSum = 0;
    let gSum = 0;
    let bSum = 0;
    let aSum = 0;
    let count = 0;

    for (let y = startY; y < Math.min(info.height, startY + sampleEdge); y += 1) {
      for (let x = startX; x < Math.min(info.width, startX + sampleEdge); x += 1) {
        const idx = (y * info.width + x) * info.channels;
        rSum += data[idx] ?? 0;
        gSum += data[idx + 1] ?? 0;
        bSum += data[idx + 2] ?? 0;
        aSum += data[idx + 3] ?? 255;
        count += 1;
      }
    }

    if (!count) continue;

    const r = rSum / count;
    const g = gSum / count;
    const b = bSum / count;
    const a = aSum / count;

    if (a < 8) {
      transparentCorners += 1;
      continue;
    }

    const channelSpread = Math.max(r, g, b) - Math.min(r, g, b);
    if (a > 245 && r > 244 && g > 244 && b > 244 && channelSpread < 6) {
      whiteishCorners += 1;
    }
  }

  if (transparentCorners >= 3) return "transparent";
  if (whiteishCorners >= 4) return "whiteish";
  return "composed";
}

async function normalizeInsetSource(
  imageBuffer: Buffer,
): Promise<NormalizedInsetSource> {
  const source = sharp(imageBuffer, { failOn: "none" }).rotate();
  const backgroundKind = await detectBackgroundKind(imageBuffer);

  if (backgroundKind === "composed") {
    return { buffer: await source.toBuffer(), backgroundKind };
  }

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
      return { buffer: trimmedBuffer, backgroundKind };
    }
  } catch {
    // Fall back to the original asset if trim fails on an odd format.
  }

  return { buffer: await source.toBuffer(), backgroundKind };
}

/**
 * Composite a product image centered on a light-grey 1280x800 canvas.
 * Accepts a raw buffer so both auto-fetched and user-uploaded images share
 * the exact same pipeline. Small images are scaled up to avoid tiny thumbnails.
 */
export async function generateProductInset(
  imageBuffer: Buffer,
): Promise<InsetResult> {
  const normalized = await normalizeInsetSource(imageBuffer);
  const normalizedBuffer = normalized.buffer;

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

  const aspectRatio = inputMeta.width / inputMeta.height;
  const isWideAsset = aspectRatio > 1.18;
  const widthScale = isWideAsset ? 0.9 : 1;
  const heightScale = isWideAsset ? 0.9 : 1;

  const contentMaxWidth = Math.round(
    (MAX_INSET_WIDTH - INNER_PAD_X * 2) * widthScale,
  );
  const contentMaxHeight = Math.round(
    (MAX_INSET_HEIGHT - INNER_PAD_Y * 2) * heightScale,
  );

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

  const useWhiteStage = normalized.backgroundKind !== "composed";
  const stageWidth = useWhiteStage ? finalW + INNER_PAD_X * 2 : finalW;
  const stageHeight = useWhiteStage ? finalH + INNER_PAD_Y * 2 : finalH;

  const stageBuffer = useWhiteStage
    ? await sharp({
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
        .toBuffer()
    : resizedBuffer;

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
