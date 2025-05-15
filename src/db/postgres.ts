import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from "$app/db/schema.ts";

const DB_HOST = Deno.env.get("DB_HOST") || "localhost";
const DB_PORT = parseInt(Deno.env.get("DB_PORT") || "5432");
const DB_USER = Deno.env.get("DB_USER") || "rpgf_user";
const DB_PASSWORD = Deno.env.get("DB_PASSWORD") || "rpgf_password";
const DB_NAME = Deno.env.get("DB_NAME") || "rpgf_db";
// const DB_POOL_SIZE = parseInt(Deno.env.get("DB_POOL_SIZE") || "5"); // postgres.js handles pooling

const connectionString = `postgres://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}`;

console.log(
  `Setting up Drizzle with PostgreSQL: user=${DB_USER} host=${DB_HOST} port=${DB_PORT} dbname=${DB_NAME}`,
);

// Initialize Drizzle ORM with the postgres.js client and schema
// The schema import gives Drizzle access to your table definitions.
export const db: NodePgDatabase<typeof schema> = drizzle({ 
  connection: { 
    connectionString,
  }
});

// The old getDbClient() and ensureSchema() are no longer needed in the same way.
// Drizzle uses its own migration system. We'll create a migration script later.
// For now, db is the Drizzle instance you'll use in services.

// You can export the pgClient if direct access is needed, but usually db is sufficient.
// export { pgClient };
