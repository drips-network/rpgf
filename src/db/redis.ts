import { createClient, RedisClientType } from "redis";
import { log, LogLevel } from "$app/services/loggingService.ts";

const redisUrl = Deno.env.get("REDIS_URL");

if (!redisUrl) {
  log(LogLevel.Info, "REDIS_URL not set, caching will be disabled.");
}

let redis: RedisClientType | undefined;

if (redisUrl) {
  try {
    redis = createClient({
      url: redisUrl,
    });
    await redis.connect();

    log(LogLevel.Info, "Successfully connected to Redis.");
  } catch (error) {
    log(LogLevel.Error, "Failed to connect to Redis:", { error });
  }
}

export { redis };
