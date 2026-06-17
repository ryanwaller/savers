import "server-only";

import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { describeImage } from "@/lib/image-ai";

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
  created_at: string;
}

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
      title: titleFromFilename(fileName),
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
    .select("id, user_id, title, preview_path, width, height, file_kind, processing_status, created_at")
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
    } else {
      void enrichImageWithAi(imageId, userId, previewBuffer);
    }
  }

  return data as UploadedImageRow;
}

async function enrichImageWithAi(
  imageId: string,
  userId: string,
  previewBuffer: Buffer,
): Promise<void> {
  try {
    const enrichment = await describeImage(previewBuffer, "image/jpeg");
    if (!enrichment) {
      // AI not configured, timed out, or returned bad data. Mark the
      // attempt so we don't keep retrying on every grid refresh.
      const supabaseAdmin = getSupabaseAdmin();
      await supabaseAdmin
        .schema("savers")
        .from("images")
        .update({ ai_failed_at: new Date().toISOString() })
        .eq("id", imageId)
        .eq("user_id", userId);
      return;
    }

    const supabaseAdmin = getSupabaseAdmin();
    const patch: Record<string, unknown> = {
      ai_processed_at: new Date().toISOString(),
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
  }
}

export function isAcceptedMime(contentType: string): boolean {
  return ACCEPTED_MIME_TYPES.has(contentType) || contentType.startsWith("image/");
}

export const HARD_CAP_MB = HARD_CAP_BYTES / 1024 / 1024;
export const SOFT_WARN_MB = 3;
