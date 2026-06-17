import "server-only";

import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { describeImage } from "@/lib/image-ai";
import { fetchPageContent } from "@/lib/page-content";
import { normalizeUrl } from "@/lib/normalizeUrl";
import { enqueueImagePreview } from "@/lib/image-preview-queue";

/**
 * Server-side image upload pipeline.
 *
 * Accepts a raw file buffer + metadata, validates, strips EXIF (for JPEG),
 * extracts dimensions, generates a web-friendly preview, writes both to
 * Supabase Storage, and inserts a row in `savers.images`.
 *
 * Decisions captured in 2026-06-17 conversation:
 *   • Soft warning at 3MB, hard reject at 20MB.
 *   • All image types accepted (JPEG, PNG, WebP, GIF, HEIC, SVG) plus PDF
 *     and EPS. PDF/EPS preview generation is deferred to the worker.
 *   • EXIF GPS stripped (in practice we strip the whole EXIF block on
 *     re-encode and surface the few fields we want — taken_at, camera —
 *     via dedicated DB columns).
 *   • Originals bucket is private; previews bucket is public-CDN.
 *   • Default title is the filename minus extension; AI may rewrite it
 *     later via the worker.
 */

const HARD_CAP_BYTES = 20 * 1024 * 1024; // 20 MB

const ORIGINALS_BUCKET = "image-originals";
const PREVIEWS_BUCKET = "image-previews";

// Longest-edge cap for the web preview. ~1600px is enough for retina at
// the largest grid size while staying under 500KB at q=82.
const PREVIEW_MAX_EDGE = 1600;
const PREVIEW_QUALITY = 82;

export type SourceKind = "upload" | "direct_url" | "page_url";
export type FileKind = "image" | "svg" | "pdf" | "eps";

const RASTER_MIME_PREFIXES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"];

const ACCEPTED_MIME_TYPES = new Set<string>([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "image/svg+xml",
  "application/pdf",
  "application/postscript",     // EPS often arrives as this
  "image/x-eps",
  "application/eps",
]);

export class ImageUploadError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "ImageUploadError";
    this.status = status;
  }
}

export interface ImageUploadInput {
  userId: string;
  fileName: string;
  contentType: string;
  body: Buffer;
  collectionId?: string | null;
  sourceKind?: SourceKind;
  sourceUrl?: string | null;
  awaitAi?: boolean;
  initialTitle?: string | null;
  initialDescription?: string | null;
}

export interface UploadedImageRow {
  id: string;
  user_id: string;
  title: string | null;
  preview_path: string | null;
  width: number | null;
  height: number | null;
  file_kind: FileKind;
  processing_status: string;
  ai_processed_at?: string | null;
  ai_failed_at?: string | null;
  created_at: string;
}

const IMAGE_ROW_SELECT =
  "id, user_id, title, preview_path, width, height, file_kind, processing_status, ai_processed_at, ai_failed_at, created_at";

function inferFileKind(contentType: string): FileKind {
  if (contentType === "application/pdf") return "pdf";
  if (contentType === "image/svg+xml") return "svg";
  if (contentType === "application/postscript" || contentType === "image/x-eps" || contentType === "application/eps") {
    return "eps";
  }
  return "image";
}

function extensionFor(contentType: string, fileName: string): string {
  // Prefer the filename extension if present and reasonable — preserves
  // case-sensitive distinctions (e.g. .heic vs .HEIC) and unambiguous
  // formats. Fall back to mime-derived extension.
  const fromName = fileName.match(/\.([a-zA-Z0-9]{1,6})$/)?.[1]?.toLowerCase();
  if (fromName) return fromName;
  switch (contentType) {
    case "image/jpeg": return "jpg";
    case "image/png":  return "png";
    case "image/webp": return "webp";
    case "image/gif":  return "gif";
    case "image/heic": return "heic";
    case "image/heif": return "heif";
    case "image/svg+xml": return "svg";
    case "application/pdf": return "pdf";
    case "application/postscript":
    case "image/x-eps":
    case "application/eps":
      return "eps";
    default: return "bin";
  }
}

function titleFromFilename(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, "");
  // Convert common separators to spaces, collapse runs of whitespace.
  return base.replace(/[._-]+/g, " ").replace(/\s+/g, " ").trim() || "Untitled";
}

function isPublicUrl(url: string): boolean {
  try {
    const parsed = new URL(normalizeUrl(url));
    const host = parsed.hostname.toLowerCase();

    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "[::1]" ||
      host === "0.0.0.0"
    ) {
      return false;
    }

    if (
      host.startsWith("10.") ||
      host.startsWith("192.168.") ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
    ) {
      return false;
    }

    if (
      host.endsWith(".local") ||
      host.endsWith(".internal") ||
      host.endsWith(".test") ||
      host.endsWith(".invalid") ||
      host.endsWith(".example") ||
      host === "metadata.google.internal" ||
      host === "169.254.169.254"
    ) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

function filenameFromUrl(url: string, fallback: string): string {
  try {
    const parsed = new URL(url);
    const last = parsed.pathname.split("/").filter(Boolean).pop();
    if (last) return decodeURIComponent(last);
  } catch {
    // ignore
  }
  return fallback;
}

async function fetchRemoteBinary(url: string): Promise<{
  body: Buffer;
  contentType: string;
  fileName: string;
}> {
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
      Accept:
        "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    throw new ImageUploadError(`Failed to fetch URL (${response.status})`, 502);
  }

  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim() || "application/octet-stream";
  const body = Buffer.from(await response.arrayBuffer());
  const fileName = filenameFromUrl(url, "remote-image");
  return { body, contentType, fileName };
}

/**
 * Strip EXIF and pull dimensions for raster images, leaving non-rasters
 * (PDF / EPS / SVG) untouched. Returns the bytes we should actually store
 * as the "original" along with the metadata we extracted.
 */
async function prepareRaster(body: Buffer, contentType: string) {
  const isRaster = RASTER_MIME_PREFIXES.includes(contentType);
  if (!isRaster) {
    return { storedOriginal: body, width: null as number | null, height: null as number | null };
  }

  try {
    const meta = await sharp(body, { failOn: "none" }).metadata();
    const width = meta.width ?? null;
    const height = meta.height ?? null;

    // For JPEG specifically, we re-encode without metadata to strip the
    // EXIF block (including GPS). Sharp's default does not preserve
    // metadata on output, so a roundtrip is enough.
    if (contentType === "image/jpeg") {
      const reencoded = await sharp(body, { failOn: "none" })
        .rotate()                              // bake EXIF orientation
        .jpeg({ quality: 95, mozjpeg: true })  // near-lossless
        .toBuffer();
      return { storedOriginal: reencoded, width, height };
    }

    return { storedOriginal: body, width, height };
  } catch (err) {
    // Sharp can't decode some HEIC builds and some malformed files. Fall
    // back to storing the original as-is and let the worker figure out
    // dimensions/preview later.
    console.warn(
      `[image-upload] sharp metadata read failed for ${contentType}, storing as-is: ${err instanceof Error ? err.message : String(err)}`,
    );
    return { storedOriginal: body, width: null, height: null };
  }
}

/**
 * Generate the web preview. Returns null for non-rasters; the worker will
 * fill those in later (Ghostscript for PDF/EPS, rasteriser for SVG).
 */
async function generateRasterPreview(body: Buffer, contentType: string): Promise<Buffer | null> {
  if (!RASTER_MIME_PREFIXES.includes(contentType)) return null;

  try {
    return await sharp(body, { failOn: "none" })
      .rotate()
      .resize(PREVIEW_MAX_EDGE, PREVIEW_MAX_EDGE, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: PREVIEW_QUALITY, mozjpeg: true })
      .toBuffer();
  } catch (err) {
    console.warn(
      `[image-upload] preview generation failed, deferring to worker: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

export async function processAndStoreImage(input: ImageUploadInput): Promise<UploadedImageRow> {
  const { userId, fileName, contentType, body } = input;

  if (!ACCEPTED_MIME_TYPES.has(contentType) && !contentType.startsWith("image/")) {
    throw new ImageUploadError(`Unsupported file type: ${contentType}`);
  }

  if (body.byteLength > HARD_CAP_BYTES) {
    throw new ImageUploadError("Too large");
  }

  const fileKind = inferFileKind(contentType);

  const { storedOriginal, width, height } = await prepareRaster(body, contentType);
  const previewBuffer = await generateRasterPreview(body, contentType);

  const supabaseAdmin = getSupabaseAdmin();
  const imageId = randomUUID();
  const originalExt = extensionFor(contentType, fileName);
  const originalPath = `${userId}/${imageId}.${originalExt}`;

  const { error: originalUploadError } = await supabaseAdmin.storage
    .from(ORIGINALS_BUCKET)
    .upload(originalPath, storedOriginal, {
      contentType,
      upsert: false,
      cacheControl: "31536000",
    });

  if (originalUploadError) {
    throw new ImageUploadError(
      `Failed to upload original: ${originalUploadError.message}`,
      500,
    );
  }

  let previewPath: string | null = null;
  if (previewBuffer) {
    previewPath = `${userId}/${imageId}.jpg`;
    const { error: previewUploadError } = await supabaseAdmin.storage
      .from(PREVIEWS_BUCKET)
      .upload(previewPath, previewBuffer, {
        contentType: "image/jpeg",
        upsert: false,
        cacheControl: "31536000",
      });

    if (previewUploadError) {
      // Don't fail the whole upload — the worker can retry preview gen.
      console.error(
        `[image-upload] preview upload failed: ${previewUploadError.message}`,
      );
      previewPath = null;
    }
  }

  const { data, error: insertError } = await supabaseAdmin
    .schema("savers")
    .from("images")
    .insert({
      id: imageId,
      user_id: userId,
      collection_id: input.collectionId ?? null,
      title: input.initialTitle?.trim() || titleFromFilename(fileName),
      description: input.initialDescription?.trim() || null,
      original_path: originalPath,
      preview_path: previewPath,
      original_filename: fileName,
      source_url: input.sourceUrl ?? null,
      source_kind: input.sourceKind ?? "upload",
      file_kind: fileKind,
      mime_type: contentType,
      original_size_bytes: storedOriginal.byteLength,
      preview_size_bytes: previewBuffer?.byteLength ?? null,
      width,
      height,
      processing_status: previewBuffer || fileKind !== "image" ? (previewBuffer ? "ready" : "pending") : "pending",
    })
    .select(IMAGE_ROW_SELECT)
    .single();

  if (insertError || !data) {
    // Best-effort cleanup of the uploaded objects so we don't leave
    // orphaned files in storage.
    void supabaseAdmin.storage.from(ORIGINALS_BUCKET).remove([originalPath]);
    if (previewPath) void supabaseAdmin.storage.from(PREVIEWS_BUCKET).remove([previewPath]);
    throw new ImageUploadError(
      `Failed to record image: ${insertError?.message ?? "unknown error"}`,
      500,
    );
  }

  // Fire-and-forget vision enrichment: ask the AI provider for a title,
  // description, and tags, then update the row. We don't await so the
  // upload API returns fast — the grid will pick up the enriched fields
  // on the next /api/images refresh.
  //
  // Only runs when we have a raster preview to send; PDFs and EPS files
  // get enriched later by the worker once it generates their preview.
  if (previewBuffer && fileKind === "image") {
    if (input.awaitAi) {
      await enrichImageWithAi(imageId, userId, previewBuffer);
      const { data: refreshed } = await supabaseAdmin
        .schema("savers")
        .from("images")
        .select(IMAGE_ROW_SELECT)
        .eq("id", imageId)
        .eq("user_id", userId)
        .maybeSingle();
      if (refreshed) {
        return refreshed as UploadedImageRow;
      }
    } else {
      void enrichImageWithAi(imageId, userId, previewBuffer);
    }
  }

  // For non-raster formats (PDF / EPS / SVG) the preview wasn't generated
  // synchronously above. Enqueue a worker job to rasterise the first page
  // (or render the SVG), upload the JPEG to the previews bucket, and
  // update the row.
  if (fileKind !== "image") {
    void enqueueImagePreview({
      imageId,
      userId,
      originalPath,
      fileKind,
      mimeType: contentType,
    }).catch((err) => {
      console.error(
        `[image-upload] failed to enqueue preview job for ${imageId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
  }

  return data as UploadedImageRow;
}

export async function processAndStoreRemoteImage(input: {
  userId: string;
  remoteUrl: string;
  collectionId?: string | null;
  awaitAi?: boolean;
}): Promise<UploadedImageRow> {
  const normalizedUrl = normalizeUrl(input.remoteUrl);
  if (!normalizedUrl || !isPublicUrl(normalizedUrl)) {
    throw new ImageUploadError("Invalid or non-public URL");
  }

  let assetUrl = normalizedUrl;
  let sourceKind: SourceKind = "direct_url";
  let initialTitle: string | null = null;
  let initialDescription: string | null = null;

  try {
    const head = await fetch(normalizedUrl, {
      method: "HEAD",
      redirect: "follow",
      signal: AbortSignal.timeout(8_000),
    });
    const hintedType = head.headers.get("content-type")?.split(";")[0]?.trim() || "";
    if (!hintedType.startsWith("image/") && !ACCEPTED_MIME_TYPES.has(hintedType)) {
      const page = await fetchPageContent(normalizedUrl);
      if (!page?.og_image) {
        throw new ImageUploadError("No image found on that page");
      }
      assetUrl = page.og_image;
      sourceKind = "page_url";
      initialTitle = page.title;
      initialDescription = page.description;
    }
  } catch (err) {
    if (err instanceof ImageUploadError) throw err;
    // If HEAD fails, fall back to full metadata/page detection below.
    const page = await fetchPageContent(normalizedUrl);
    if (page?.og_image) {
      assetUrl = page.og_image;
      sourceKind = "page_url";
      initialTitle = page.title;
      initialDescription = page.description;
    }
  }

  if (!isPublicUrl(assetUrl)) {
    throw new ImageUploadError("Resolved image URL is not public");
  }

  const { body, contentType, fileName } = await fetchRemoteBinary(assetUrl);
  return processAndStoreImage({
    userId: input.userId,
    fileName,
    contentType,
    body,
    collectionId: input.collectionId ?? null,
    sourceKind,
    sourceUrl: normalizedUrl,
    awaitAi: input.awaitAi,
    initialTitle,
    initialDescription,
  });
}

async function enrichImageWithAi(
  imageId: string,
  userId: string,
  previewBuffer: Buffer,
): Promise<void> {
  const supabaseAdmin = getSupabaseAdmin();
  try {
    const enrichment = await describeImage(previewBuffer, "image/jpeg");
    if (!enrichment) {
      // AI not configured, timed out, or returned bad data. Mark the
      // attempt so we don't keep retrying on every grid refresh.
      await supabaseAdmin
        .schema("savers")
        .from("images")
        .update({ ai_failed_at: new Date().toISOString() })
        .eq("id", imageId)
        .eq("user_id", userId);
      return;
    }

    const patch: Record<string, unknown> = {
      ai_processed_at: new Date().toISOString(),
      ai_failed_at: null,
    };
    if (enrichment.title) patch.title = enrichment.title;
    if (enrichment.description) patch.description = enrichment.description;
    if (enrichment.tags.length > 0) patch.tags = enrichment.tags;

    await supabaseAdmin
      .schema("savers")
      .from("images")
      .update(patch)
      .eq("id", imageId)
      .eq("user_id", userId);
  } catch (err) {
    console.error(
      `[image-upload] AI enrichment failed for ${imageId}: ${err instanceof Error ? err.message : String(err)}`,
    );
    await supabaseAdmin
      .schema("savers")
      .from("images")
      .update({ ai_failed_at: new Date().toISOString() })
      .eq("id", imageId)
      .eq("user_id", userId);
  }
}

export function isAcceptedMime(contentType: string): boolean {
  return ACCEPTED_MIME_TYPES.has(contentType) || contentType.startsWith("image/");
}

export const HARD_CAP_MB = HARD_CAP_BYTES / 1024 / 1024;
export const SOFT_WARN_MB = 3;
