/**
 * Standalone link health check worker.
 *
 * Run with: npx tsx workers/link-check-worker.ts
 * Deploy as a separate Railway service alongside the Next.js app.
 *
 * This process:
 * 1. Listens on the BullMQ "link-checks" queue
 * 2. Sends HTTP HEAD requests (with GET fallback) to bookmark URLs
 * 3. Classifies responses as active, broken, or redirect
 * 4. Updates bookmark.link_status and last_link_check
 */

import { Worker, type Job } from "bullmq";
import { createClient } from "@supabase/supabase-js";
import { createRedisConnection } from "@/lib/redis";
import type { LinkCheckJobData } from "@/lib/link-check-queue";
import { LINK_CHECK_QUEUE_NAME, enqueueLinkCheck } from "@/lib/link-check-queue";

const USER_AGENT =
  "Mozilla/5.0 (compatible; SaversBot/1.0; +https://savers.com)";
const REQUEST_TIMEOUT_MS = 8000;

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
    );
  }
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    db: { schema: "savers" },
  });
}

const WORKER_NAME =
  process.env.WORKER_NAME || `link-check-worker-${process.pid}`;

interface CheckResult {
  status: "active" | "broken" | "redirect";
  statusCode?: number;
  error?: string;
}

async function checkUrl(url: string): Promise<CheckResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    // Try HEAD first for efficiency
    const headRes = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
      redirect: "manual",
      headers: { "User-Agent": USER_AGENT },
    }).catch(() => null);

    if (headRes) {
      clearTimeout(timeout);

      // Handle redirects
      if ([301, 302, 307, 308].includes(headRes.status)) {
        const location = headRes.headers.get("location");
        if (location) {
          // Follow one redirect to verify the target works
          const followRes = await followRedirect(location);
          if (followRes) return followRes;
        }
        return { status: "redirect", statusCode: headRes.status };
      }

      return classifyStatus(headRes.status);
    }

    // HEAD failed (some servers reject it) — fall back to GET with range
    const getController = new AbortController();
    const getTimeout = setTimeout(
      () => getController.abort(),
      REQUEST_TIMEOUT_MS,
    );

    try {
      const getRes = await fetch(url, {
        method: "GET",
        signal: getController.signal,
        redirect: "follow",
        headers: {
          "User-Agent": USER_AGENT,
          Range: "bytes=0-0", // Only fetch first byte
        },
      });
      clearTimeout(getTimeout);

      if ([301, 302, 307, 308].includes(getRes.status)) {
        return { status: "redirect", statusCode: getRes.status };
      }

      return classifyStatus(getRes.status);
    } catch {
      clearTimeout(getTimeout);
      throw new Error("GET request failed after HEAD fallback");
    }
  } catch (err) {
    clearTimeout(timeout);
    const message = err instanceof Error ? err.message : String(err);
    // AbortError = timeout; TypeError = DNS/network failure
    return { status: "broken", error: message };
  }
}

async function followRedirect(url: string): Promise<CheckResult | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": USER_AGENT },
    });
    clearTimeout(timeout);
    return classifyStatus(res.status);
  } catch {
    clearTimeout(timeout);
    return null;
  }
}

function classifyStatus(status: number): CheckResult {
  if (status === 404 || status === 410) {
    return { status: "broken", statusCode: status };
  }
  if (status >= 500) {
    return { status: "broken", statusCode: status };
  }
  // 403 Forbidden is not broken — many sites block bots
  // 401 Unauthorized is not broken — might require login
  if (status === 403 || status === 401) {
    return { status: "active", statusCode: status };
  }
  if (status >= 400) {
    return { status: "broken", statusCode: status };
  }
  return { status: "active", statusCode: status };
}

async function processJob(job: Job<LinkCheckJobData>) {
  const { bookmarkId, url, userId } = job.data;
  const supabase = getSupabaseAdmin();

  // Random jitter between 500ms-2000ms to avoid hammering domains
  const jitter = 500 + Math.random() * 1500;
  await new Promise((r) => setTimeout(r, jitter));

  const result = await checkUrl(url);

  await supabase
    .from("bookmarks")
    .update({
      link_status: result.status,
      last_link_check: new Date().toISOString(),
    })
    .eq("id", bookmarkId)
    .eq("user_id", userId);

  return result;
}

const SCAN_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // Weekly
const SCAN_STALE_DAYS = 30;

async function runWeeklyScan() {
  const supabase = getSupabaseAdmin();
  const cutoff = new Date(
    Date.now() - SCAN_STALE_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  console.log(`[${WORKER_NAME}] Starting weekly link scan (stale cutoff: ${cutoff})...`);

  try {
    // Fetch bookmarks never checked, or not checked in SCAN_STALE_DAYS
    const { data: bookmarks, error } = await supabase
      .from("bookmarks")
      .select("id, url, user_id")
      .or(`last_link_check.is.null,last_link_check.lt.${cutoff}`);

    if (error) throw error;

    if (!bookmarks || bookmarks.length === 0) {
      console.log(`[${WORKER_NAME}] Weekly scan: no stale bookmarks to check`);
      return;
    }

    console.log(`[${WORKER_NAME}] Weekly scan: enqueuing ${bookmarks.length} link checks...`);

    let queued = 0;
    for (const b of bookmarks) {
      try {
        await enqueueLinkCheck({
          bookmarkId: b.id,
          userId: b.user_id,
          url: b.url,
        });
        queued++;
      } catch {
        // Fire-and-forget: continue with remaining bookmarks
      }
    }

    console.log(`[${WORKER_NAME}] Weekly scan: queued ${queued} of ${bookmarks.length} bookmarks`);
  } catch (err) {
    console.error(
      `[${WORKER_NAME}] Weekly scan failed:`,
      err instanceof Error ? err.message : String(err),
    );
  }
}

async function main() {
  console.log(`[${WORKER_NAME}] Starting link check worker...`);

  const worker = new Worker<LinkCheckJobData>(
    LINK_CHECK_QUEUE_NAME,
    processJob,
    {
      connection: createRedisConnection(),
      concurrency: 4,
      limiter: { max: 30, duration: 60000 },
    },
  );

  worker.on("completed", (job, result) => {
    console.log(
      `[${WORKER_NAME}] Completed: ${job.data.url} → ${result?.status}${result?.statusCode ? ` (${result.statusCode})` : ""}`,
    );
  });

  worker.on("failed", (job, err) => {
    console.error(
      `[${WORKER_NAME}] Failed: ${job?.data.url} (attempt ${job?.attemptsMade}): ${err.message}`,
    );
  });

  worker.on("error", (err) => {
    console.error(`[${WORKER_NAME}] Worker error: ${err.message}`);
  });

  // Schedule recurring weekly scans
  const scanTimer = setInterval(() => {
    void runWeeklyScan();
  }, SCAN_INTERVAL_MS);

  const shutdown = async (signal: string) => {
    clearInterval(scanTimer);
    console.log(`[${WORKER_NAME}] ${signal} — shutting down...`);
    await worker.close(true);
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  // Run an initial scan on startup (after a short delay to let the worker connect)
  setTimeout(() => {
    void runWeeklyScan();
  }, 10000);

  console.log(`[${WORKER_NAME}] Ready, waiting for jobs...`);
}

main().catch((err) => {
  console.error(`[${WORKER_NAME}] Fatal:`, err);
  process.exit(1);
});
