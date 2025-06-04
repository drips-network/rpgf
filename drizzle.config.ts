import type { Config } from "drizzle-kit";

const DB_CONNECTION_STRING = Deno.env.get("DB_CONNECTION_STRING");

if (!DB_CONNECTION_STRING) {
  throw new Error(
    "Missing database credentials in environment variables for Drizzle config.",
  );
}

export default {
  schema: "./src/db/schema.ts", // Path to your Drizzle schema file
  out: "./drizzle", // Output directory for migrations
  dialect: "postgresql", // Specify 'postgresql' for PostgreSQL driver
  dbCredentials: {
    url: DB_CONNECTION_STRING,
  }
} satisfies Config;
