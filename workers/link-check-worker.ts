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
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const REQUEST_TIMEOUT_MS = 8000;

const BROWSER_HEADERS: Record<string, string> = {
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

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
  status: "active" | "broken" | "redirect" | "unknown";
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
      headers: { "User-Agent": USER_AGENT, ...BROWSER_HEADERS },
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
          ...BROWSER_HEADERS,
          Range: "bytes=0-0", // Only fetch first byte
        },
      });
      clearTimeout(getTimeout);

      if ([301, 302, 307, 308].includes(getRes.status)) {
        return { status: "redirect", statusCode: getRes.status };
      }

      return classifyStatus(getRes.status);
    } catch (getErr) {
      clearTimeout(getTimeout);
      throw getErr;
    }
  } catch (err) {
    clearTimeout(timeout);
    const message = err instanceof Error ? err.message : String(err);
    const code = (err as NodeJS.ErrnoException).code;

    // Timeout — temporary, may work later
    if (err instanceof DOMException && err.name === "AbortError") {
      return { status: "unknown", error: "timeout" };
    }
    // DNS resolution failure — likely permanent
    if (code === "ENOTFOUND") {
      return { status: "broken", error: message };
    }
    // Connection refused — likely permanent
    if (code === "ECONNREFUSED") {
      return { status: "broken", error: message };
    }
    // Other network errors (ETIMEDOUT, ECONNRESET, etc.) — temporary
    return { status: "unknown", error: message };
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
      headers: { "User-Agent": USER_AGENT, ...BROWSER_HEADERS },
    });
    clearTimeout(timeout);
    return classifyStatus(res.status);
  } catch {
    clearTimeout(timeout);
    return null;
  }
}

function classifyStatus(status: number): CheckResult {
  // 2xx/3xx — definitely alive
  if (status < 400) {
    return { status: "active", statusCode: status };
  }
  // 404/410 — genuinely gone
  if (status === 404 || status === 410) {
    return { status: "broken", statusCode: status };
  }
  // 401 — auth wall, page exists behind it
  if (status === 401) {
    return { status: "active", statusCode: status };
  }
  // 403/429 — bot blocking or rate limiting, temporary, retry later
  if (status === 403 || status === 429) {
    return { status: "unknown", statusCode: status };
  }
  // 5xx — temporary server error, retry later
  if (status >= 500) {
    return { status: "unknown", statusCode: status };
  }
  // Other 4xx (400, 402, 405-499) — client error, likely dead
  return { status: "broken", statusCode: status };
}

async function processJob(job: Job<LinkCheckJobData>) {
  const { bookmarkId, url, userId } = job.data;
  const supabase = getSupabaseAdmin();

  // Random jitter between 500ms-2000ms to avoid hammering domains
  const jitter = 500 + Math.random() * 1500;
  await new Promise((r) => setTimeout(r, jitter));

  const result = await checkUrl(url);

  const updateFields: Record<string, unknown> = {
    link_status: result.status,
    last_link_check: new Date().toISOString(),
  };

  // When a link is newly flagged as broken, set the verification status
  // so the user can confirm or dispute it.
  if (result.status === "broken") {
    updateFields.broken_status = "flagged";
    updateFields.broken_checked_at = new Date().toISOString();
  }

  await supabase
    .from("bookmarks")
    .update(updateFields)
    .eq("id", bookmarkId)
    .eq("user_id", userId);

  // Retry temporary failures (403, 429, 5xx, timeouts) after a delay.
  // Only retry once — the "retry" key prevents infinite loops.
  if (result.status === "unknown" && !job.data.retry) {
    try {
      await enqueueLinkCheck({
        bookmarkId,
        url,
        userId,
        retry: true,
      });
    } catch {
      // Fire-and-forget
    }
  }

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
