import { Queue } from "bullmq";
import { createRedisConnection } from "@/lib/redis";

export const IMAGE_PREVIEW_QUEUE_NAME = "image-previews";

/**
 * One job per non-raster image (PDF / EPS / SVG) that needs its preview
 * generated asynchronously. The job carries identifiers; the worker
 * does the storage download, rasterisation, and DB update on its own.
 */
export interface ImagePreviewJobData {
  imageId: string;
  userId: string;
  originalPath: string;
  /** "pdf" | "eps" | "svg" — drives which rasteriser the worker invokes. */
  fileKind: string;
  mimeType: string | null;
}

let queue: Queue<ImagePreviewJobData> | null = null;

export function getImagePreviewQueue(): Queue<ImagePreviewJobData> {
  if (!queue) {
    queue = new Queue<ImagePreviewJobData>(IMAGE_PREVIEW_QUEUE_NAME, {
      connection: createRedisConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: { age: 3600, count: 100 },
        removeOnFail: { age: 86400, count: 50 },
      },
    });
  }
  return queue;
}

/** Fire and forget. If Redis isn't configured, the row just stays pending. */
export async function enqueueImagePreview(job: ImagePreviewJobData): Promise<void> {
  if (!process.env.REDIS_URL) {
    console.warn("[image-preview-queue] REDIS_URL not set — skipping enqueue");
    return;
  }
  await getImagePreviewQueue().add("render-preview", job, {
    jobId: `image-preview-${job.imageId}`,
  });
}
