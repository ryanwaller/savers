/**
 * Image preview worker.
 *
 * Run with: npx tsx workers/image-preview-worker.ts
 * Deploy as a separate Railway service from the same repo (reuse
 * Dockerfile.worker — make sure Ghostscript is in apt-get installs).
 *
 * Processes jobs from the "image-previews" BullMQ queue. Each job
 * targets one PDF / EPS / SVG image that landed in the originals bucket
 * without a preview. The worker:
 *   1. downloads the original from image-originals
 *   2. rasterises the first page (PDF/EPS via Ghostscript, SVG via sharp)
 *   3. uploads the resulting JPEG to image-previews
 *   4. updates the savers.images row with preview_path and dimensions
 *
 * Failures stamp processing_error so the user can see what went wrong
 * via SQL / the edit panel.
 */

import { Worker, type Job } from "bullmq";
import { createClient } from "@supabase/supabase-js";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { createRedisConnection } from "@/lib/redis";
import {
  IMAGE_PREVIEW_QUEUE_NAME,
  type ImagePreviewJobData,
} from "@/lib/image-preview-queue";

const PREVIEW_MAX_EDGE = 1600;
const PREVIEW_QUALITY = 82;
const ORIGINALS_BUCKET = "image-originals";
const PREVIEWS_BUCKET = "image-previews";

const WORKER_NAME = process.env.WORKER_NAME || `image-preview-worker-${process.pid}`;

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    db: { schema: "savers" },
  });
}

/**
 * Rasterise the first page of a PDF/EPS file via Ghostscript. The output
 * resolution is 150 DPI which gives ~1500–2000px on the longest edge for
 * letter/A4 pages — comfortable retina at the grid card size.
 */
async function rasterizeViaGhostscript(
  inputBuffer: Buffer,
  inputExt: string,
): Promise<Buffer> {
  const tmpDir = await fs.mkdtemp(join(tmpdir(), "savers-img-"));
  const inputPath = join(tmpDir, `in.${inputExt}`);
  const outputPath = join(tmpDir, "out.jpg");

  try {
    await fs.writeFile(inputPath, inputBuffer);

    await new Promise<void>((resolve, reject) => {
      const args = [
        "-dNOPAUSE",
        "-dBATCH",
        "-dQUIET",
        "-dSAFER",
        "-sDEVICE=jpeg",
        "-r150",
        "-dJPEGQ=82",
        "-dFirstPage=1",
        "-dLastPage=1",
        `-sOutputFile=${outputPath}`,
        inputPath,
      ];
      const child = spawn("gs", args, { stdio: ["ignore", "pipe", "pipe"] });
      let stderr = "";
      child.stderr.on("data", (d) => { stderr += d.toString(); });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`ghostscript exited ${code}: ${stderr.slice(0, 300)}`));
      });
    });

    const out = await fs.readFile(outputPath);
    return out;
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Rasterise an SVG via sharp. sharp's librsvg-based loader handles most
 * SVGs cleanly; complex ones with embedded fonts may need a different
 * approach (Puppeteer) but that's a follow-up.
 */
async function rasterizeSvg(inputBuffer: Buffer): Promise<Buffer> {
  return sharp(inputBuffer, { density: 300 })
    .resize(PREVIEW_MAX_EDGE, PREVIEW_MAX_EDGE, { fit: "inside", withoutEnlargement: false })
    .jpeg({ quality: PREVIEW_QUALITY, mozjpeg: true })
    .toBuffer();
}

async function downsizeAndEncode(rasterBuffer: Buffer): Promise<{ buffer: Buffer; width: number; height: number }> {
  const pipeline = sharp(rasterBuffer, { failOn: "none" }).rotate();
  const meta = await pipeline.metadata();
  const buffer = await pipeline
    .resize(PREVIEW_MAX_EDGE, PREVIEW_MAX_EDGE, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: PREVIEW_QUALITY, mozjpeg: true })
    .toBuffer();
  return {
    buffer,
    width: meta.width ?? 0,
    height: meta.height ?? 0,
  };
}

async function processJob(job: Job<ImagePreviewJobData>): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { imageId, userId, originalPath, fileKind, mimeType } = job.data;

  console.log(`[${WORKER_NAME}] start ${imageId} kind=${fileKind} path=${originalPath}`);

  // Mark as processing so the UI can show a spinner if it wants.
  await supabase
    .from("images")
    .update({ processing_status: "processing", processing_error: null })
    .eq("id", imageId)
    .eq("user_id", userId);

  try {
    // Download the original from storage.
    const { data: file, error: dlErr } = await supabase.storage
      .from(ORIGINALS_BUCKET)
      .download(originalPath);
    if (dlErr || !file) {
      throw new Error(`download failed: ${dlErr?.message || "unknown"}`);
    }
    const originalBuf = Buffer.from(await file.arrayBuffer());

    // Pick the rasteriser.
    let rasterBuffer: Buffer;
    if (fileKind === "pdf") {
      rasterBuffer = await rasterizeViaGhostscript(originalBuf, "pdf");
    } else if (fileKind === "eps") {
      rasterBuffer = await rasterizeViaGhostscript(originalBuf, "eps");
    } else if (fileKind === "svg") {
      rasterBuffer = await rasterizeSvg(originalBuf);
    } else {
      throw new Error(`unsupported file_kind for worker: ${fileKind}`);
    }

    const { buffer: previewBuffer, width, height } = await downsizeAndEncode(rasterBuffer);

    // Upload to previews bucket. Path format mirrors the upload route:
    // <user_id>/<image_id>.jpg. Using upsert in case a previous attempt
    // already wrote a partial file.
    const previewPath = `${userId}/${imageId}.jpg`;
    const { error: upErr } = await supabase.storage
      .from(PREVIEWS_BUCKET)
      .upload(previewPath, previewBuffer, {
        contentType: "image/jpeg",
        upsert: true,
        cacheControl: "31536000",
      });
    if (upErr) throw new Error(`preview upload failed: ${upErr.message}`);

    await supabase
      .from("images")
      .update({
        preview_path: previewPath,
        preview_size_bytes: previewBuffer.byteLength,
        width: width || null,
        height: height || null,
        processing_status: "ready",
        processing_error: null,
      })
      .eq("id", imageId)
      .eq("user_id", userId);

    console.log(`[${WORKER_NAME}] done ${imageId} preview=${previewPath} ${width}x${height}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[${WORKER_NAME}] failed ${imageId}: ${message}`);
    await supabase
      .from("images")
      .update({
        processing_status: "failed",
        processing_error: message.slice(0, 500),
      })
      .eq("id", imageId)
      .eq("user_id", userId);
    throw err;  // let BullMQ retry per defaultJobOptions
  }
}

const worker = new Worker<ImagePreviewJobData>(
  IMAGE_PREVIEW_QUEUE_NAME,
  processJob,
  {
    connection: createRedisConnection(),
    concurrency: Number(process.env.IMAGE_PREVIEW_CONCURRENCY || 2),
  },
);

worker.on("ready", () => {
  console.log(`[${WORKER_NAME}] ready, listening on ${IMAGE_PREVIEW_QUEUE_NAME}`);
});

worker.on("failed", (job, err) => {
  console.error(`[${WORKER_NAME}] job ${job?.id} failed: ${err?.message}`);
});

process.on("SIGTERM", () => {
  console.log(`[${WORKER_NAME}] SIGTERM, shutting down...`);
  void worker.close().then(() => process.exit(0));
});

// Silence the unused randomBytes import — reserved for future jitter on
// retry filenames if Ghostscript ever races itself.
void randomBytes;
