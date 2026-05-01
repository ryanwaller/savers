import { Queue } from "bullmq";
import { createRedisConnection } from "@/lib/redis";

export const AUTO_TAG_QUEUE_NAME = "auto-tags";

export interface AutoTagJobData {
  bookmarkId: string;
  userId: string;
  url: string;
  title: string | null;
  description: string | null;
}

let queue: Queue<AutoTagJobData> | null = null;

export function getAutoTagQueue(): Queue<AutoTagJobData> {
  if (!queue) {
    queue = new Queue<AutoTagJobData>(AUTO_TAG_QUEUE_NAME, {
      connection: createRedisConnection(),
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: { age: 3600, count: 100 },
        removeOnFail: { age: 86400, count: 50 },
      },
    });
  }
  return queue;
}

/** Enqueue an auto-tag job. Non-blocking — fire and forget. */
export async function enqueueAutoTag(job: AutoTagJobData): Promise<void> {
  if (!process.env.REDIS_URL) {
    console.warn("[auto-tag-queue] REDIS_URL not set — skipping auto-tag enqueue");
    return;
  }
  await getAutoTagQueue().add("extract-tags", job, {
    jobId: `autotag-${job.bookmarkId}`,
  });
}
