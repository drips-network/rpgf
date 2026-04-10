import { createClient, RedisClientType } from "redis";
import { Logger } from "$app/services/loggingService.ts";

const logger = new Logger("db:redis");
import { config } from "../../config.ts";

const redisUrl = config.redis.url;

let redis: RedisClientType | undefined;

if (redisUrl) {
  try {
    redis = createClient({
      url: redisUrl,
    });
    await redis.connect();

    logger.info("Successfully connected to Redis.");
  } catch (error) {
    logger.error("Failed to connect to Redis:", { error });
  }
}

export { redis };
