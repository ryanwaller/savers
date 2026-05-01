/**
 * Standalone auto-tagging worker.
 *
 * Run with: npx tsx workers/auto-tag-worker.ts
 * Deploy as a separate Railway service alongside the Next.js app.
 *
 * This process:
 * 1. Listens on the BullMQ "auto-tags" queue
 * 2. Fetches page content
 * 3. Calls Anthropic Haiku to extract semantic tags
 * 4. Normalizes against the tag_aliases table
 * 5. Updates bookmark.auto_tags and tagging_status
 */

import { Worker, type Job } from "bullmq";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { createHash } from "node:crypto";
import { createRedisConnection, getRedis } from "@/lib/redis";
import type { AutoTagJobData } from "@/lib/auto-tag-queue";
import { AUTO_TAG_QUEUE_NAME } from "@/lib/auto-tag-queue";
import { fetchPageContent } from "@/lib/page-content";
import { normalizeTag, resolveAliases } from "@/lib/tag-aliases";
import type { TagAlias } from "@/lib/types";

const anthropic = new Anthropic();

const CACHE_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days
const CACHE_KEY_PREFIX = "autotag:";
const BODY_TEXT_MAX_CHARS = 2000;

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

const WORKER_NAME = process.env.WORKER_NAME || `auto-tag-worker-${process.pid}`;

function cacheKey(url: string, title: string | null): string {
  const hash = createHash("sha256")
    .update(`${url}\0${title ?? ""}`)
    .digest("hex");
  return `${CACHE_KEY_PREFIX}${hash}`;
}

async function loadAliases(supabase: ReturnType<typeof getSupabaseAdmin>): Promise<TagAlias[]> {
  const { data } = await supabase.from("tag_aliases").select("*");
  return (data as TagAlias[]) ?? [];
}

async function extractTagsViaLLM(
  url: string,
  title: string | null,
  bodyText: string,
): Promise<string[]> {
  const truncated = bodyText.slice(0, BODY_TEXT_MAX_CHARS);

  const prompt = `Extract 3-5 concise, lowercase tags from this bookmarked page. Return JSON only.

Prioritize specific facts: creator location (city/country), named studio/agency, narrow discipline, languages/scripts, techniques, materials, eras.

Hard rules:
- Lowercase, 1-3 words each, no "#" prefix
- Skip the obvious category (it's a website, it's a portfolio, it's design)
- Don't guess — if the page doesn't state it, don't tag it
- Fewer concrete tags beat more generic ones

URL: ${url}
Title: ${title ?? "Unknown"}
Page text:
"""
${truncated || "(no text extracted)"}
"""

Respond with JSON only, no explanation:
{"tags": ["example-tag", "another-tag"]}`;

  const message = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 200,
    messages: [{ role: "user", content: prompt }],
  });

  const text =
    message.content[0]?.type === "text" ? message.content[0].text : "";

  let parsed: { tags?: unknown };
  try {
    parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
  } catch {
    return [];
  }

  if (!Array.isArray(parsed.tags)) return [];
  return parsed.tags.map((t) => normalizeTag(t)).filter((t): t is string => Boolean(t));
}

async function processJob(job: Job<AutoTagJobData>) {
  const { bookmarkId, userId, url, title } = job.data;
  const supabase = getSupabaseAdmin();

  // Mark as processing
  await supabase
    .from("bookmarks")
    .update({ tagging_status: "processing" })
    .eq("id", bookmarkId)
    .eq("user_id", userId);

  // Check cache
  const redis = getRedis();
  const key = cacheKey(url, title);
  const cached = await redis.get(key);
  if (cached) {
    const tags = JSON.parse(cached) as string[];
    await supabase
      .from("bookmarks")
      .update({ auto_tags: tags, tagging_status: "completed" })
      .eq("id", bookmarkId)
      .eq("user_id", userId);
    return { tags, source: "cache" as const };
  }

  // Fetch page content
  const content = await fetchPageContent(url);
  if (!content) {
    await supabase
      .from("bookmarks")
      .update({ tagging_status: "failed" })
      .eq("id", bookmarkId)
      .eq("user_id", userId);
    return { tags: [], source: "no-content" as const };
  }

  // Extract tags via LLM
  const rawTags = await extractTagsViaLLM(url, title, content.body_text);

  // Normalize against aliases
  const aliases = await loadAliases(supabase);
  const tags = resolveAliases(rawTags, aliases);

  // Cache the result
  await redis.setex(key, CACHE_TTL_SECONDS, JSON.stringify(tags));

  // Update bookmark
  await supabase
    .from("bookmarks")
    .update({ auto_tags: tags, tagging_status: "completed" })
    .eq("id", bookmarkId)
    .eq("user_id", userId);

  return { tags, source: "llm" as const };
}

async function main() {
  console.log(`[${WORKER_NAME}] Starting auto-tag worker...`);

  const worker = new Worker<AutoTagJobData>(
    AUTO_TAG_QUEUE_NAME,
    processJob,
    {
      connection: createRedisConnection(),
      concurrency: 3,
      limiter: { max: 20, duration: 60000 },
    },
  );

  worker.on("completed", (job, result) => {
    console.log(
      `[${WORKER_NAME}] Completed: ${job.data.url} → [${(result?.tags ?? []).join(", ")}] (${result?.source})`,
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
