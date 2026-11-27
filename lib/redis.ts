/* ==================================================
   BLAZE-X V1.0
   REDIS X — Cache and Usage Protection
   Developed by Yuva
================================================== */

import "server-only";

import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";
import { createHash } from "node:crypto";

import { env } from "@/lib/env";

/* CONFIGURATION */

const CACHE_PREFIX = "blaze-x:v1";

const DEFAULT_CACHE_TTL = 3600;

const MAX_CACHE_SIZE = 100000;

/* REDIS CONNECTION */

export const redis =
  env.UPSTASH_REDIS_REST_URL &&
  env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: env.UPSTASH_REDIS_REST_URL,
        token: env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

/* RATE LIMITERS */

const minuteLimiter = redis
  ? new Ratelimit({
      redis,

      limiter: Ratelimit.slidingWindow(
        10,
        "1 m"
      ),

      analytics: false,

      prefix: `${CACHE_PREFIX}:limit:minute`,
    })
  : null;

const dailyLimiter = redis
  ? new Ratelimit({
      redis,

      limiter: Ratelimit.fixedWindow(
        100,
        "1 d"
      ),

      analytics: false,

      prefix: `${CACHE_PREFIX}:limit:daily`,
    })
  : null;

const globalLimiter = redis
  ? new Ratelimit({
      redis,

      limiter: Ratelimit.fixedWindow(
        500,
        "1 d"
      ),

      analytics: false,

      prefix: `${CACHE_PREFIX}:limit:global`,
    })
  : null;

/* RATE LIMIT RESULT */

export interface RateLimitResult {
  allowed: boolean;

  remaining: number;

  reset: number;

  reason?:
    | "MINUTE_LIMIT"
    | "DAILY_LIMIT"
    | "GLOBAL_LIMIT"
    | "SERVICE_UNAVAILABLE";
}

/* SECURE HASH */

function hash(value: string): string {
  return createHash("sha256")
    .update(value)
    .digest("hex");
}

/* RATE LIMIT CHECK */

export async function checkRateLimit(
  identifier: string
): Promise<RateLimitResult> {
  /*
    Fail closed when Redis is unavailable.
    Never allow unlimited cloud AI requests.
  */

  if (
    !identifier.trim() ||
    !minuteLimiter ||
    !dailyLimiter ||
    !globalLimiter
  ) {
    return {
      allowed: false,
      remaining: 0,
      reset: Date.now() + 60000,
      reason: "SERVICE_UNAVAILABLE",
    };
  }

  const safeId = hash(identifier);

  try {
    const minute =
      await minuteLimiter.limit(safeId);

    if (!minute.success) {
      return {
        allowed: false,
        remaining: 0,
        reset: minute.reset,
        reason: "MINUTE_LIMIT",
      };
    }

    const daily =
      await dailyLimiter.limit(safeId);

    if (!daily.success) {
      return {
        allowed: false,
        remaining: 0,
        reset: daily.reset,
        reason: "DAILY_LIMIT",
      };
    }

    const global =
      await globalLimiter.limit("all-users");

    if (!global.success) {
      return {
        allowed: false,
        remaining: 0,
        reset: global.reset,
        reason: "GLOBAL_LIMIT",
      };
    }

    return {
      allowed: true,

      remaining: Math.min(
        minute.remaining,
        daily.remaining,
        global.remaining
      ),

      reset: minute.reset,
    };
  } catch {
    console.warn(
      "[BLAZE-X] Rate limit service unavailable."
    );

    return {
      allowed: false,
      remaining: 0,
      reset: Date.now() + 60000,
      reason: "SERVICE_UNAVAILABLE",
    };
  }
}

/* PRIVATE CACHE KEY */

export function createCacheKey(
  userId: string,
  namespace: string,
  content: string
): string {
  if (!userId.trim()) {
    throw new Error(
      "A valid user ID is required."
    );
  }

  const userHash = hash(userId);

  const contentHash = hash(
    JSON.stringify([namespace, content])
  );

  return (
    `${CACHE_PREFIX}:cache:` +
    `${userHash}:${contentHash}`
  );
}

/* READ CACHE */

export async function getCache<T>(
  key: string
): Promise<T | null> {
  if (!redis) return null;

  try {
    return await redis.get<T>(key);
  } catch {
    return null;
  }
}

/* WRITE CACHE */

export async function setCache<T>(
  key: string,
  value: T,
  ttl: number = DEFAULT_CACHE_TTL
): Promise<boolean> {
  if (!redis) return false;

  try {
    const serialized = JSON.stringify(value);

    if (
      !serialized ||
      Buffer.byteLength(serialized, "utf8") >
        MAX_CACHE_SIZE
    ) {
      return false;
    }

    const safeTTL = Number.isFinite(ttl)
      ? Math.max(
          60,
          Math.min(Math.floor(ttl), 86400)
        )
      : DEFAULT_CACHE_TTL;

    await redis.set(key, value, {
      ex: safeTTL,
    });

    return true;
  } catch {
    return false;
  }
}

/* DELETE CACHE */

export async function deleteCache(
  key: string
): Promise<boolean> {
  if (!redis) return false;

  try {
    await redis.del(key);

    return true;
  } catch {
    return false;
  }
}

/* CONNECTION HEALTH CHECK */

export async function checkRedisHealth() {
  if (!redis) {
    return {
      configured: false,
      connected: false,
    };
  }

  const startedAt = Date.now();

  try {
    const response = await redis.ping();

    return {
      configured: true,

      connected: response === "PONG",

      latencyMs: Date.now() - startedAt,
    };
  } catch {
    return {
      configured: true,
      connected: false,
    };
  }
}

/* END OF REDIS X ENGINE */
