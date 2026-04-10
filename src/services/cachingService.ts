import { redis } from "$app/db/redis.ts";
import { Logger } from "$app/services/loggingService.ts";

const logger = new Logger("cachingService");
import { config } from "../../config.ts";

const CACHE_PREFIX = `rpgf-cache:v${config.cache.version}:`;
const DEFAULT_TTL_SECONDS = config.cache.defaultTtlSeconds;

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
    logger.error("Failed to get value from Redis cache", { key, error });
  }

  return null;
}

async function set<T>(key: string, value: T, ttlSeconds: number = DEFAULT_TTL_SECONDS): Promise<void> {
  if (!redis) {
    return;
  }

  try {
    const stringValue = JSON.stringify(value);
    await redis.set(key, stringValue, { EX: ttlSeconds });
  } catch (error) {
    logger.error("Failed to set value in Redis cache", { key, error });
  }
}

async function del(keys: string | string[]): Promise<void> {
  if (!redis) {
    return;
  }

  try {
    const keysToDelete = Array.isArray(keys) ? keys : [keys];
    if (keysToDelete.length > 0) {
      await redis.del(keysToDelete);
    }
  } catch (error) {
    logger.error("Failed to delete key(s) from Redis cache", { keys, error });
  }
}

async function delByPattern(pattern: string): Promise<void> {
  if (!redis) {
    return;
  }

  try {
    const keys: string[] = [];
    for await (const key of redis.scanIterator({ MATCH: pattern })) {
      keys.push(...key);
    }

    if (keys.length > 0) {
      await del(keys);
    }
  } catch (error) {
    logger.error("Failed to delete keys by pattern from Redis cache", { pattern, error });
  }
}

export const cachingService = {
  generateKey,
  get,
  set,
  del,
  delByPattern,
};
