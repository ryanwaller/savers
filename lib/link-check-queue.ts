import { Queue } from "bullmq";
import { createRedisConnection } from "@/lib/redis";

export const LINK_CHECK_QUEUE_NAME = "link-checks";

export interface LinkCheckJobData {
  bookmarkId: string;
  url: string;
  userId: string;
  /** Internal flag — true when this is a retry of a previous temporary failure. */
  retry?: boolean;
}

let queue: Queue<LinkCheckJobData> | null = null;

export function getLinkCheckQueue(): Queue<LinkCheckJobData> {
  if (!queue) {
    queue = new Queue<LinkCheckJobData>(LINK_CHECK_QUEUE_NAME, {
      connection: createRedisConnection(),
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: { age: 86400, count: 500 },
        removeOnFail: { age: 86400 * 7, count: 100 },
      },
    });
  }
  return queue;
}

/** Enqueue a link health check job. Non-blocking — fire and forget. */
export async function enqueueLinkCheck(job: LinkCheckJobData): Promise<void> {
  if (!process.env.REDIS_URL) {
    console.warn("[link-check-queue] REDIS_URL not set — skipping link check enqueue");
    return;
  }
  await getLinkCheckQueue().add("check", job, {
    jobId: `linkcheck-${job.bookmarkId}${job.retry ? "-retry" : ""}`,
    delay: job.retry ? 5 * 60 * 1000 : undefined, // 5 min delay for retries
  });
}
