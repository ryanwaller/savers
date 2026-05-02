import sharp from "sharp";

const IMAGE_FETCH_TIMEOUT_MS = 10000;
const CANVAS_WIDTH = 1280;
const CANVAS_HEIGHT = 800;
const MAX_INSET_WIDTH = 1000;
const MAX_INSET_HEIGHT = 600;
const BACKGROUND: [number, number, number] = [248, 249, 250]; // #F8F9FA

const USER_AGENT =
  "Mozilla/5.0 (compatible; Savers/1.0; +https://savers-production.up.railway.app)";

/**
 * Fetch a product image URL, resize to fit within max bounds, and composite
 * centered on a light-grey 1280x800 canvas. Preserves aspect ratio.
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

  // Validate image is not blank/white/tiny
  const rawMeta = await sharp(imgBuffer).metadata();
  if ((rawMeta.width || 0) < 100 || (rawMeta.height || 0) < 100) {
    throw new Error(
      `Product image too small: ${rawMeta.width}x${rawMeta.height}`,
    );
  }

  // Get dimensions after resize to compute exact centering
  const resized = sharp(imgBuffer).resize(MAX_INSET_WIDTH, MAX_INSET_HEIGHT, {
    fit: "inside",
    withoutEnlargement: true,
  });
  const metadata = await resized.metadata();
  const inset = await resized.jpeg({ quality: 90 }).toBuffer();

  const iw = metadata.width!;
  const ih = metadata.height!;
  const left = Math.round((CANVAS_WIDTH - iw) / 2);
  const top = Math.round((CANVAS_HEIGHT - ih) / 2);

  const result = await sharp({
    create: {
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      channels: 3,
      background: { r: BACKGROUND[0], g: BACKGROUND[1], b: BACKGROUND[2] },
    },
  })
    .composite([{ input: inset, left, top }])
    .jpeg({ quality: 90, progressive: true })
    .toBuffer();

  if (result.length < 1024) throw new Error("Processed product image too small");

  return result;
}
