import { z } from "zod";

const configSchema = z.object({
  server: z.object({
    port: z.coerce.number().int().positive().default(8000),
    baseUrl: z.string().url().default("http://localhost:8000"),
  }),
  frontend: z.object({
    baseUrl: z.string().url().default("http://localhost:5173"),
  }),
  env: z.enum(["development", "production", "test"]).default("development"),
  database: z.object({
    connectionString: z.string().min(1),
  }),
  redis: z.object({
    url: z.string().url().optional(),
  }),
  auth: z.object({
    jwtSecret: z.string().min(32),
    refreshJwtExpirationMinutes: z.coerce
      .number()
      .int()
      .positive()
      .default(43200),
  }),
  cache: z.object({
    version: z.string().default("1"),
    defaultTtlSeconds: z.coerce.number().int().positive().default(3600),
  }),
  logging: z.object({
    level: z
      .enum(["DEBUG", "INFO", "WARN", "ERROR", "CRITICAL"])
      .default("DEBUG"),
    format: z.enum(["TEXT", "JSON", "COLORFUL"]).default("COLORFUL"),
  }),
  cors: z.object({
    allowAllOrigins: z.coerce.boolean().default(false),
  }),
  testing: z.object({
    enableDangerousTestRoutes: z.coerce.boolean().default(false),
  }),
  ipfs: z.object({
    gatewayUrl: z
      .string()
      .url()
      .default("https://drips.mypinata.cloud/ipfs"),
  }),
  drips: z.object({
    gqlApiUrl: z.string().url(),
    gqlApiKey: z.string().optional(),
  }),
  kyc: z.object({
    fern: z.object({
      apiKey: z.string().min(1).optional(),
      webhookSecret: z.string().min(1).optional(),
    }),
    treova: z.object({
      webhookSecret: z.string().min(1).optional(),
    }),
  }),
});

export type Config = z.infer<typeof configSchema>;

function loadConfig(): Config {
  const raw = {
    server: {
      port: Deno.env.get("PORT"),
      baseUrl: Deno.env.get("BASE_URL"),
    },
    frontend: {
      baseUrl: Deno.env.get("FRONTEND_BASE_URL"),
    },
    env: Deno.env.get("DENO_ENV"),
    database: {
      connectionString: Deno.env.get("DB_CONNECTION_STRING"),
    },
    redis: {
      url: Deno.env.get("REDIS_URL"),
    },
    auth: {
      jwtSecret: Deno.env.get("JWT_SECRET"),
      refreshJwtExpirationMinutes: Deno.env.get(
        "REFRESH_JWT_EXPIRATION_MINUTES",
      ),
    },
    cache: {
      version: Deno.env.get("CACHE_VERSION"),
      defaultTtlSeconds: Deno.env.get("CACHE_DEFAULT_TTL_SECONDS"),
    },
    logging: {
      level: Deno.env.get("LOG_LEVEL"),
      format: Deno.env.get("LOG_FORMAT"),
    },
    cors: {
      allowAllOrigins: Deno.env.get("CORS_ALLOW_ALL_ORIGINS"),
    },
    testing: {
      enableDangerousTestRoutes: Deno.env.get("ENABLE_DANGEROUS_TEST_ROUTES"),
    },
    ipfs: {
      gatewayUrl: Deno.env.get("IPFS_GATEWAY_URL"),
    },
    drips: {
      gqlApiUrl: Deno.env.get("DRIPS_GQL_API_URL"),
      gqlApiKey: Deno.env.get("DRIPS_GQL_API_KEY"),
    },
    kyc: {
      fern: {
        apiKey: Deno.env.get("FERN_KYC_API_KEY"),
        webhookSecret: Deno.env.get("FERN_KYC_WEBHOOK_SECRET"),
      },
      treova: {
        webhookSecret: Deno.env.get("TREOVA_KYC_WEBHOOK_SECRET"),
      },
    },
  };

  const result = configSchema.safeParse(raw);

  if (!result.success) {
    console.error("❌ Configuration validation failed:");
    console.error(result.error.issues);
    Deno.exit(1);
    throw new Error("unreachable");
  }

  const data = result.data;

  if (data.cors.allowAllOrigins) {
    console.warn(
      "----------------------------------------------------------------------",
    );
    console.warn("🔒 CORS DISABLED! 🔒");
    console.warn(
      "CORS_ALLOW_ALL_ORIGINS is set to true. This is a security risk in production environments.",
    );
    console.warn(
      "----------------------------------------------------------------------",
    );
  }

  if (data.testing.enableDangerousTestRoutes) {
    console.warn(
      "----------------------------------------------------------------------",
    );
    console.warn("☠️⚠️☠️ DANGEROUS TEST ROUTES ENABLED! ☠️⚠️☠️");
    console.warn(
      "ENABLE_DANGEROUS_TEST_ROUTES MUST be set to false in production environments.",
    );
    console.warn(
      "----------------------------------------------------------------------",
    );
  }

  if (!data.redis.url) {
    console.warn("⚠️ REDIS_URL not set, caching will be disabled.");
  }

  if (data.env === "production") {
    const missing: string[] = [];
    if (!data.kyc.fern.apiKey) missing.push("FERN_KYC_API_KEY");
    if (!data.kyc.fern.webhookSecret) missing.push("FERN_KYC_WEBHOOK_SECRET");
    if (!data.kyc.treova.webhookSecret) {
      missing.push("TREOVA_KYC_WEBHOOK_SECRET");
    }
    if (missing.length > 0) {
      console.error(
        `❌ The following env vars are required in production: ${
          missing.join(", ")
        }`,
      );
      Deno.exit(1);
    }
  }

  return data;
}

export const config = loadConfig();
