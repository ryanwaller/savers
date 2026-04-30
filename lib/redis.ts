import Redis from "ioredis";

let redis: Redis | null = null;

export function getRedis(): Redis {
  if (!redis) {
    const url = process.env.REDIS_URL;
    if (!url) {
      throw new Error("REDIS_URL is not set");
    }
    redis = new Redis(url, {
      maxRetriesPerRequest: null, // Required by BullMQ
      enableOfflineQueue: false,
      reconnectOnError(err: Error): boolean | 1 | 2 {
        // Reconnect on READONLY errors (Redis failover)
        const message = err.message.toLowerCase();
        if (message.includes("readonly")) return 2;
        return false;
      },
      retryStrategy(times: number): number | null {
        if (times > 10) return null; // stop retrying after 10 attempts
        return Math.min(times * 200, 5000);
      },
      lazyConnect: false,
    });
  }
  return redis;
}

/** Returns a fresh Redis connection (not shared). Used by BullMQ workers. */
export function createRedisConnection(): Redis {
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error("REDIS_URL is not set");
  }
  return new Redis(url, {
    maxRetriesPerRequest: null,
    enableOfflineQueue: false,
  });
}
