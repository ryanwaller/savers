import { NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth-server";
import { getRedis } from "@/lib/redis";
import { getScreenshotQueue } from "@/lib/screenshot-queue";
import { getAutoTagQueue } from "@/lib/auto-tag-queue";
import { getLinkCheckQueue } from "@/lib/link-check-queue";

type QueueCounts = {
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
};

async function readQueueCounts(
  getter: () => {
    getJobCounts: (...types: Array<keyof QueueCounts>) => Promise<Record<string, number>>;
  },
  configured: boolean,
): Promise<{ configured: boolean; reachable: boolean; counts: QueueCounts | null }> {
  if (!configured) {
    return { configured: false, reachable: false, counts: null };
  }

  try {
    const queue = getter();
    const rawCounts = await queue.getJobCounts("waiting", "active", "delayed", "failed");
    const counts: QueueCounts = {
      waiting: rawCounts.waiting ?? 0,
      active: rawCounts.active ?? 0,
      delayed: rawCounts.delayed ?? 0,
      failed: rawCounts.failed ?? 0,
    };
    return { configured: true, reachable: true, counts };
  } catch {
    return { configured: true, reachable: false, counts: null };
  }
}

export async function GET() {
  try {
    await requireUser();

    const redisConfigured = !!process.env.REDIS_URL;
    const suggestionsAiConfigured = !!(process.env.AI_API_KEY || process.env.DEEPSEEK_API_KEY)?.trim();
    const imageAiProvider = (process.env.IMAGE_AI_PROVIDER?.trim() || "anthropic").toLowerCase();
    const imageAiConfigured =
      imageAiProvider === "deepseek"
        ? !!(process.env.DEEPSEEK_API_KEY || process.env.AI_API_KEY)?.trim()
        : !!process.env.ANTHROPIC_API_KEY?.trim();

    let redisReachable = false;
    if (redisConfigured) {
      try {
        const redis = getRedis();
        const pong = await redis.ping();
        redisReachable = pong === "PONG";
      } catch {
        redisReachable = false;
      }
    }

    const [screenshotQueue, autoTagQueue, linkCheckQueue] = await Promise.all([
      readQueueCounts(getScreenshotQueue, redisConfigured),
      readQueueCounts(getAutoTagQueue, redisConfigured),
      readQueueCounts(getLinkCheckQueue, redisConfigured),
    ]);

    return NextResponse.json({
      services: {
        redis: {
          configured: redisConfigured,
          reachable: redisReachable,
        },
        ai: {
          configured: suggestionsAiConfigured,
        },
        imageAi: {
          provider: imageAiProvider,
          configured: imageAiConfigured,
        },
        screenshotQueue,
        autoTagQueue,
        linkCheckQueue,
      },
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    const message = error instanceof Error ? error.message : "Failed to load system health";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
