import { Queue } from "bullmq";
import { createRedisConnection } from "@/lib/redis";

export const SCREENSHOT_QUEUE_NAME = "screenshots";

export interface ScreenshotJobData {
  bookmarkId: string;
  url: string;
  userId: string;
  force_screenshot?: boolean;
}

let queue: Queue<ScreenshotJobData> | null = null;

export function getScreenshotQueue(): Queue<ScreenshotJobData> {
  if (!queue) {
    queue = new Queue<ScreenshotJobData>(SCREENSHOT_QUEUE_NAME, {
      connection: createRedisConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: { age: 3600, count: 100 },
        removeOnFail: { age: 86400, count: 50 },
      },
    });
  }
  return queue;
}

/** Enqueue a screenshot capture job. Non-blocking — fire and forget. */
export async function enqueueScreenshot(job: ScreenshotJobData): Promise<void> {
  if (!process.env.REDIS_URL) {
    throw new Error("REDIS_URL not set — screenshot worker unavailable");
  }
  await getScreenshotQueue().add("capture", job, {
    jobId: `screenshot-${job.bookmarkId}-${Date.now()}`,
  });
}
