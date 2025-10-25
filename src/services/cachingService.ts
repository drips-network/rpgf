import { redis } from "$app/db/redis.ts";
import { log, LogLevel } from "$app/services/loggingService.ts";

const CACHE_VERSION = Deno.env.get("CACHE_VERSION") || "1";
const CACHE_PREFIX = `rpgf-cache:v${CACHE_VERSION}:`;
const DEFAULT_TTL_SECONDS = parseInt(
  Deno.env.get("CACHE_DEFAULT_TTL_SECONDS") || "3600",
  10,
);

function generateKey(parts: (string | number)[]): string {
  return `${CACHE_PREFIX}${parts.join(":")}`;
}

async function get<T>(key: string): Promise<T | null> {
  if (!redis) {
    return null;
  }

  try {
    const value = await redis.get(key);
    if (value) {
      return JSON.parse(value) as T;
    }
  } catch (error) {
    log(LogLevel.Error, "Failed to get value from Redis cache", { key, error });
  }

  return null;
}

async function set<T>(key: string, value: T, ttlSeconds: number = DEFAULT_TTL_SECONDS): Promise<void> {
  if (!redis) {
    return;
  }

  try {
    const stringValue = JSON.stringify(value);
    await redis.set(key, stringValue, { ex: ttlSeconds });
  } catch (error) {
    log(LogLevel.Error, "Failed to set value in Redis cache", { key, error });
  }
}

async function del(keys: string | string[]): Promise<void> {
  if (!redis) {
    return;
  }

  try {
    const keysToDelete = Array.isArray(keys) ? keys : [keys];
    if (keysToDelete.length > 0) {
      await redis.del(...keysToDelete);
    }
  } catch (error) {
    log(LogLevel.Error, "Failed to delete key(s) from Redis cache", { keys, error });
  }
}

async function delByPattern(pattern: string): Promise<void> {
  if (!redis) {
    return;
  }

  try {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch (error) {
    log(LogLevel.Error, "Failed to delete keys by pattern from Redis cache", { pattern, error });
  }
}

export const cachingService = {
  generateKey,
  get,
  set,
  del,
  delByPattern,
};
