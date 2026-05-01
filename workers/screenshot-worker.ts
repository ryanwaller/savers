/**
 * Standalone screenshot worker.
 *
 * Run with: npx tsx workers/screenshot-worker.ts
 * Deploy as a separate Railway service alongside the Next.js app.
 *
 * This process:
 * 1. Listens on the BullMQ "screenshots" queue
 * 2. Launches Puppeteer to capture a full-page JPEG screenshot
 * 3. Uploads to Supabase Storage (bookmark-previews bucket)
 * 4. Updates the bookmark row with preview_path and screenshot_status
 */

import { Worker, type Job } from "bullmq";
import puppeteer from "puppeteer";
import { createClient } from "@supabase/supabase-js";
import { createRedisConnection } from "@/lib/redis";
import type { ScreenshotJobData } from "@/lib/screenshot-queue";
import { SCREENSHOT_QUEUE_NAME } from "@/lib/screenshot-queue";
import { captureScreenshot, captureTextExcerptImage, PUPPETEER_LAUNCH_OPTIONS } from "@/lib/puppeteer-capture";
import { extractExcerpt } from "@/lib/excerpt";

const PREVIEW_BUCKET = "bookmark-previews";

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

const WORKER_NAME = process.env.WORKER_NAME || `screenshot-worker-${process.pid}`;

async function processJob(job: Job<ScreenshotJobData>) {
  const { bookmarkId, url, userId } = job.data;
  const supabase = getSupabaseAdmin();

  // Mark as processing
  await supabase
    .from("bookmarks")
    .update({ screenshot_status: "processing" })
    .eq("id", bookmarkId)
    .eq("user_id", userId);

  // Check if this bookmark qualifies for a text excerpt image
  const { data: bookmark } = await supabase
    .from("bookmarks")
    .select("id, tags, collection_id, title, description")
    .eq("id", bookmarkId)
    .eq("user_id", userId)
    .maybeSingle();

  let useTextExcerpt = false;
  if (bookmark) {
    const tags = (bookmark.tags ?? []) as string[];
    const hasArticleTag = tags.some(
      (t: string) => t.toLowerCase() === "essay" || t.toLowerCase() === "article",
    );

    let isReadLater = false;
    if (bookmark.collection_id) {
      const { data: collection } = await supabase
        .from("collections")
        .select("name")
        .eq("id", bookmark.collection_id)
        .maybeSingle();
      isReadLater = collection?.name?.toLowerCase() === "read later";
    }

    useTextExcerpt = isReadLater || hasArticleTag;
  }

  const browser = await puppeteer.launch(PUPPETEER_LAUNCH_OPTIONS);

  try {
    if (useTextExcerpt) {
      const excerpt = await extractExcerpt(
        url,
        bookmark?.title,
        bookmark?.description,
      );

      const { buffer, contentType } = await captureTextExcerptImage(browser, excerpt);

      const version = Date.now();
      const previewPath = `${userId}/${bookmarkId}/preview-${version}.jpg`;
      const previewUpdatedAt = new Date().toISOString();

      const { error: uploadError } = await supabase.storage
        .from(PREVIEW_BUCKET)
        .upload(previewPath, buffer, {
          contentType,
          upsert: true,
          cacheControl: "31536000",
        });

      if (uploadError) throw uploadError;

      const { error: updateError } = await supabase
        .from("bookmarks")
        .update({
          preview_path: previewPath,
          preview_provider: "puppeteer",
          preview_updated_at: previewUpdatedAt,
          preview_version: version,
          screenshot_status: "complete",
          screenshot_error: null,
          asset_type: "text_excerpt",
        })
        .eq("id", bookmarkId)
        .eq("user_id", userId);

      if (updateError) throw updateError;

      return { previewPath, provider: "puppeteer", assetType: "text_excerpt" as const };
    }

    const { buffer, contentType } = await captureScreenshot(browser, url);

    const version = Date.now();
    const previewPath = `${userId}/${bookmarkId}/preview-${version}.jpg`;
    const previewUpdatedAt = new Date().toISOString();

    const { error: uploadError } = await supabase.storage
      .from(PREVIEW_BUCKET)
      .upload(previewPath, buffer, {
        contentType,
        upsert: true,
        cacheControl: "31536000",
      });

    if (uploadError) throw uploadError;

    const { error: updateError } = await supabase
      .from("bookmarks")
      .update({
        preview_path: previewPath,
        preview_provider: "puppeteer",
        preview_updated_at: previewUpdatedAt,
        preview_version: version,
        screenshot_status: "complete",
        screenshot_error: null,
      })
      .eq("id", bookmarkId)
      .eq("user_id", userId);

    if (updateError) throw updateError;

    return { previewPath, provider: "puppeteer" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await supabase
      .from("bookmarks")
      .update({
        screenshot_status: "error",
        screenshot_error: message.slice(0, 500),
      })
      .eq("id", bookmarkId)
      .eq("user_id", userId);

    throw error;
  } finally {
    await browser.close().catch(() => {});
  }
}

async function main() {
  console.log(`[${WORKER_NAME}] Starting screenshot worker...`);

  const worker = new Worker<ScreenshotJobData>(
    SCREENSHOT_QUEUE_NAME,
    processJob,
    {
      connection: createRedisConnection(),
      concurrency: 2,
      limiter: { max: 10, duration: 60000 },
    },
  );

  worker.on("completed", (job) => {
    console.log(`[${WORKER_NAME}] Completed: ${job.data.url}`);
  });

  worker.on("failed", (job, err) => {
    console.error(
      `[${WORKER_NAME}] Failed: ${job?.data.url} (attempt ${job?.attemptsMade}): ${err.message}`,
    );
  });

  worker.on("error", (err) => {
    console.error(`[${WORKER_NAME}] Worker error: ${err.message}`);
  });

  const shutdown = async (signal: string) => {
    console.log(`[${WORKER_NAME}] ${signal} — shutting down...`);
    await worker.close(true);
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  console.log(`[${WORKER_NAME}] Ready, waiting for jobs...`);
}

main().catch((err) => {
  console.error(`[${WORKER_NAME}] Fatal:`, err);
  process.exit(1);
});
