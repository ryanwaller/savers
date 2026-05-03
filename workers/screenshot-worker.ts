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
import { findRecipeHeroImageUrl, fetchAndProcessRecipeHero } from "@/lib/extractRecipeHero";
import { detectProductPage } from "@/lib/detectProductPage";
import { extractPrimaryProductImage } from "@/lib/extractProductImage";
import { generateProductInsetImage } from "@/lib/generateProductInsetImage";
import { preparePageForCapture } from "@/lib/preparePageForCapture";
import { getSaversUserAgent, normalizeUrl, BROWSER_HEADERS } from "@/lib/site-url";
import { isArticleContext, isRecipeContext, isShoppingContext } from "@/lib/assetTypeRules";

const PREVIEW_BUCKET = "bookmark-previews";
const USER_AGENT = getSaversUserAgent();

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

async function cleanupReplacedPreviewObjects(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  oldPaths: Array<string | null | undefined>,
  keepPath: string,
) {
  const paths = oldPaths.filter(
    (path): path is string => typeof path === "string" && path.length > 0 && path !== keepPath,
  );
  if (paths.length === 0) return;
  const uniquePaths = Array.from(new Set(paths));
  const { error } = await supabase.storage.from(PREVIEW_BUCKET).remove(uniquePaths);
  if (error) {
    console.warn(
      JSON.stringify({
        event: "preview_cleanup_failed",
        keepPath,
        paths: uniquePaths,
        error: error.message,
      }),
    );
  }
}

async function processJob(job: Job<ScreenshotJobData>) {
  const { bookmarkId, url, userId } = job.data;
  const supabase = getSupabaseAdmin();

  // Hard override: skip ALL classification and run standard screenshot only.
  if (job.data.force_screenshot) {
    console.log(
      JSON.stringify({ event: "hard_override_screenshot", bookmarkId }),
    );

    const { data: existing } = await supabase
      .from("bookmarks")
      .select("preview_path, custom_preview_path")
      .eq("id", bookmarkId)
      .eq("user_id", userId)
      .maybeSingle();

    const browser = await puppeteer.launch(PUPPETEER_LAUNCH_OPTIONS);

    try {
      await supabase
        .from("bookmarks")
        .update({ screenshot_status: "processing" })
        .eq("id", bookmarkId)
        .eq("user_id", userId);

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

      await cleanupReplacedPreviewObjects(
        supabase,
        [existing?.preview_path, existing?.custom_preview_path],
        previewPath,
      );

      return { previewPath, provider: "puppeteer", assetType: "screenshot" as const };
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

  // Mark as processing
  await supabase
    .from("bookmarks")
    .update({ screenshot_status: "processing" })
    .eq("id", bookmarkId)
    .eq("user_id", userId);

  // Check if this bookmark qualifies for a text excerpt image
  const { data: bookmark } = await supabase
    .from("bookmarks")
      .select("id, tags, collection_id, title, description, preview_path, custom_preview_path")
      .eq("id", bookmarkId)
      .eq("user_id", userId)
      .maybeSingle();

  let useRecipeHero = false;
  let useShoppingImage = false;
  let useTextExcerpt = false;
  const previousPreviewPaths: Array<string | null | undefined> = [
    bookmark?.preview_path,
    bookmark?.custom_preview_path,
  ];
  if (bookmark) {
    const tags = (bookmark.tags ?? []) as string[];

    let collectionPath = "";
    if (bookmark.collection_id) {
      // Fetch all user collections to walk parent chain for hierarchical matching
      const { data: allCollections } = await supabase
        .from("collections")
        .select("id, name, parent_id")
        .eq("user_id", userId);

      if (allCollections) {
        const byId = new Map(allCollections.map((c) => [c.id, c]));

        function buildPath(collectionId: string): string {
          const parts: string[] = [];
          let cur = byId.get(collectionId);
          while (cur) {
            parts.unshift(cur.name);
            cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
          }
          return parts.join(" / ").toLowerCase();
        }

        collectionPath = buildPath(bookmark.collection_id);
      }
    }

    // Recipe > Shopping > Article.
    // force_product_inset never applies to recipe bookmarks — recipe
    // context always wins so a failed hero extraction falls back to
    // screenshot, never to a product inset.
    useRecipeHero = isRecipeContext(collectionPath, tags);
    useShoppingImage =
      !useRecipeHero &&
      (job.data.force_product_inset || isShoppingContext(collectionPath, tags));
    useTextExcerpt =
      !useRecipeHero && !useShoppingImage && isArticleContext(collectionPath, tags);
  }

  const browser = await puppeteer.launch(PUPPETEER_LAUNCH_OPTIONS);

  try {
    if (useRecipeHero) {
      // Try hero image extraction, fall back to screenshot on any failure
      const recipePage = await browser.newPage();
      try {
        await recipePage.setUserAgent(USER_AGENT);
        await recipePage.setExtraHTTPHeaders(BROWSER_HEADERS);
        await recipePage.goto(normalizeUrl(url), {
          waitUntil: "domcontentloaded",
          timeout: 25000,
        });
        // Wait for lazy images to load
        await new Promise((r) => setTimeout(r, 3000));

        const imageUrl = await findRecipeHeroImageUrl(recipePage, url);

        if (imageUrl) {
          console.log(`[${WORKER_NAME}] Recipe hero found: ${imageUrl}`);
          const heroBuffer = await fetchAndProcessRecipeHero(imageUrl);

          const version = Date.now();
          const previewPath = `${userId}/${bookmarkId}/preview-${version}.jpg`;
          const previewUpdatedAt = new Date().toISOString();

          const { error: uploadError } = await supabase.storage
            .from(PREVIEW_BUCKET)
            .upload(previewPath, heroBuffer, {
              contentType: "image/jpeg",
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
              asset_type: "recipe_hero",
            })
            .eq("id", bookmarkId)
            .eq("user_id", userId);

          if (updateError) throw updateError;

          await cleanupReplacedPreviewObjects(
            supabase,
            previousPreviewPaths,
            previewPath,
          );

          return { previewPath, provider: "puppeteer", assetType: "recipe_hero" as const };
        }

        console.log(`[${WORKER_NAME}] No recipe hero found, falling back to screenshot`);
      } catch (err) {
        console.log(
          `[${WORKER_NAME}] Recipe hero extraction failed, falling back to screenshot: ${err instanceof Error ? err.message : String(err)}`,
        );
      } finally {
        await recipePage.close().catch(() => {});
      }
    }

    if (useShoppingImage) {
      const shopPage = await browser.newPage();
      let shopCleanup: (() => Promise<void>) | null = null;
      try {
        await shopPage.setUserAgent(USER_AGENT);
        await shopPage.setExtraHTTPHeaders(BROWSER_HEADERS);

        const prepResult = await preparePageForCapture(shopPage, normalizeUrl(url), {
          timeout: 30000,
          settleMs: 4000,
        });
        shopCleanup = prepResult.cleanup;

        let forceInset: boolean;
        let isStorefront: boolean;
        let confidence: "high" | "medium" | "low";
        let signals: string[];

        if (job.data.force_product_inset) {
          forceInset = true;
          isStorefront = false;
          confidence = "high";
          signals = ["force_product_inset"];
          console.log(
            JSON.stringify({
              event: "shopping_detection_forced",
              url,
              reason: "force_product_inset flag",
            }),
          );
        } else {
          const detection = await detectProductPage(shopPage);
          forceInset = detection.forceInset;
          isStorefront = detection.isStorefront;
          confidence = detection.confidence;
          signals = detection.signals;
          console.log(
            JSON.stringify({
              event: "shopping_detection",
              url,
              forceInset,
              isStorefront,
              confidence,
              signals,
            }),
          );
        }

        // FORCE inset unless it's clearly a storefront
        if (forceInset && !isStorefront) {
          const maxAttempts = 2;

          for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            console.log(
              JSON.stringify({ event: "attempting_product_inset", url, attempt }),
            );

            const productImgUrl =
              await extractPrimaryProductImage(shopPage);

            console.log(
              JSON.stringify({
                event: "image_extraction_result",
                url,
                imageUrl: productImgUrl?.slice(0, 120),
                success: !!productImgUrl,
                attempt,
              }),
            );

            if (productImgUrl) {
                try {
                  const insetBuffer =
                    await generateProductInsetImage(productImgUrl, url);

                const version = Date.now();
                const previewPath = `${userId}/${bookmarkId}/preview-${version}.jpg`;
                const previewUpdatedAt = new Date().toISOString();

                const { error: uploadError } = await supabase.storage
                  .from(PREVIEW_BUCKET)
                  .upload(previewPath, insetBuffer, {
                    contentType: "image/jpeg",
                    upsert: true,
                    cacheControl: "31536000",
                  });

                if (uploadError) throw uploadError;

                const { error: updateError } = await supabase
                  .from("bookmarks")
                  .update({
                    preview_path: previewPath,
                    custom_preview_path: null,
                    preview_provider: "puppeteer",
                    preview_updated_at: previewUpdatedAt,
                    preview_version: version,
                    screenshot_status: "complete",
                    screenshot_error: null,
                    asset_type: "product_inset",
                  })
                  .eq("id", bookmarkId)
                  .eq("user_id", userId);

                if (updateError) throw updateError;

                await cleanupReplacedPreviewObjects(
                  supabase,
                  previousPreviewPaths,
                  previewPath,
                );

                console.log(
                  JSON.stringify({
                    event: "product_inset_success",
                    url,
                    preview_path: previewPath,
                  }),
                );

                return {
                  previewPath,
                  provider: "puppeteer",
                  assetType: "product_inset" as const,
                };
              } catch (insetErr) {
                console.warn(
                  JSON.stringify({
                    event: "inset_generation_failed",
                    url,
                    attempt,
                    error:
                      insetErr instanceof Error
                        ? insetErr.message
                        : String(insetErr),
                  }),
                );
                if (attempt < maxAttempts) {
                  await shopPage.reload({ waitUntil: "domcontentloaded", timeout: 25000 }).catch(() => {});
                  await preparePageForCapture(shopPage, url, {
                    skipNavigation: true,
                    setupInterception: false,
                    settleMs: 2000,
                  });
                }
              }
          } else {
            console.log(
              JSON.stringify({
                event: "product_inset_fallback",
                reason: "no_image_url",
                url,
                attempt,
              }),
            );
            if (attempt < maxAttempts) {
              await shopPage.reload({ waitUntil: "domcontentloaded", timeout: 25000 }).catch(() => {});
              await preparePageForCapture(shopPage, url, {
                skipNavigation: true,
                setupInterception: false,
                settleMs: 2000,
              });
            }
          }
          }
          // All attempts exhausted — store reason before falling through to screenshot
          try {
            await supabase
              .from("bookmarks")
              .update({ screenshot_error: "product_inset: all attempts exhausted" })
              .eq("id", bookmarkId)
              .eq("user_id", userId);
          } catch {}
        } else if (isStorefront) {
          console.log(
            JSON.stringify({
              event: "product_inset_fallback",
              reason: "storefront",
              url,
            }),
          );
          try {
            await supabase
              .from("bookmarks")
              .update({ screenshot_error: "product_inset: storefront (multiple product cards detected)" })
              .eq("id", bookmarkId)
              .eq("user_id", userId);
          } catch {}
        } else {
          console.log(
            JSON.stringify({
              event: "product_inset_fallback",
              reason: `no_signals_confidence_${confidence}`,
              url,
            }),
          );
          try {
            await supabase
              .from("bookmarks")
              .update({ screenshot_error: `product_inset: no product signals detected (confidence: ${confidence})` })
              .eq("id", bookmarkId)
              .eq("user_id", userId);
          } catch {}
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(
          `[${WORKER_NAME}] Product inset generation failed, falling back to screenshot: ${message}`,
        );
        // Store the reason so the user can see it in the UI
        try {
          await supabase
            .from("bookmarks")
            .update({
              screenshot_error: `product_inset: ${message.slice(0, 400)}`,
            })
            .eq("id", bookmarkId)
            .eq("user_id", userId);
        } catch {}
      } finally {
        if (shopCleanup) await shopCleanup().catch(() => {});
        await shopPage.close().catch(() => {});
      }
    }

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

      await cleanupReplacedPreviewObjects(
        supabase,
        previousPreviewPaths,
        previewPath,
      );

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
        custom_preview_path: null,
        preview_provider: "puppeteer",
        preview_updated_at: previewUpdatedAt,
        preview_version: version,
        screenshot_status: "complete",
        screenshot_error: null,
        asset_type: "screenshot",
      })
      .eq("id", bookmarkId)
      .eq("user_id", userId);

    if (updateError) throw updateError;

    await cleanupReplacedPreviewObjects(
      supabase,
      previousPreviewPaths,
      previewPath,
    );

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
