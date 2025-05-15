import type { Config } from "drizzle-kit";

const DB_HOST = Deno.env.get("DB_HOST") || "localhost";
const DB_PORT = parseInt(Deno.env.get("DB_PORT") || "5432");
const DB_USER = Deno.env.get("DB_USER") || "rpgf_user";
const DB_PASSWORD = Deno.env.get("DB_PASSWORD") || "rpgf_password";
const DB_NAME = Deno.env.get("DB_NAME") || "rpgf_db";

if (!DB_USER || !DB_PASSWORD || !DB_NAME) {
  throw new Error(
    "Missing database credentials in environment variables for Drizzle config.",
  );
}

export default {
  schema: "./src/db/schema.ts", // Path to your Drizzle schema file
  out: "./drizzle", // Output directory for migrations
  dialect: "postgresql", // Specify 'postgresql' for PostgreSQL driver
  dbCredentials: {
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    ssl: false,
  },
} satisfies Config;
