import { connect, Redis } from "redis";
import { log, LogLevel } from "$app/services/loggingService.ts";

const redisUrl = Deno.env.get("REDIS_URL");

if (!redisUrl) {
  log(LogLevel.Info, "REDIS_URL not set, caching will be disabled.");
}

let redis: Redis | undefined;

if (redisUrl) {
  try {
    const url = new URL(redisUrl);
    redis = await connect({
      hostname: url.hostname,
      port: Number(url.port),
    });
    log(LogLevel.Info, "Successfully connected to Redis.");
  } catch (error) {
    log(LogLevel.Error, "Failed to connect to Redis:", { error });
  }
}

export { redis };
