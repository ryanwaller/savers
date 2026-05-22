/**
 * Simple in-memory rate limiter using a sliding window.
 * Limits per-user requests to AI endpoints to prevent API budget exhaustion.
 */

const WINDOW_MS = 60_000; // 1 minute window
const MAX_REQUESTS = 30; // per user per window

const buckets = new Map<string, { count: number; windowStart: number }>();

export function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now - bucket.windowStart > WINDOW_MS) {
    buckets.set(key, { count: 1, windowStart: now });
    return true;
  }

  if (bucket.count >= MAX_REQUESTS) {
    return false;
  }

  bucket.count++;
  return true;
}

// Prune stale entries periodically to prevent memory leak
if (typeof setInterval === "function") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (now - bucket.windowStart > WINDOW_MS * 2) {
        buckets.delete(key);
      }
    }
  }, WINDOW_MS * 2).unref?.();
}
