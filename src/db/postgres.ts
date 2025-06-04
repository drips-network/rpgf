import { drizzle, NodePgDatabase, NodePgQueryResultHKT } from 'drizzle-orm/node-postgres';
import * as schema from "$app/db/schema.ts";
import { PgTransaction } from "drizzle-orm/pg-core/session";
import { ExtractTablesWithRelations } from "drizzle-orm";

const connectionString = Deno.env.get("DB_CONNECTION_STRING");

// Initialize Drizzle ORM with the postgres.js client and schema
// The schema import gives Drizzle access to your table definitions.
export const db: NodePgDatabase<typeof schema> = drizzle({ 
  connection: { 
    connectionString,
  },
  schema,
});

export type Transaction = PgTransaction<NodePgQueryResultHKT, typeof schema, ExtractTablesWithRelations<typeof schema>>;

// The old getDbClient() and ensureSchema() are no longer needed in the same way.
// Drizzle uses its own migration system. We'll create a migration script later.
// For now, db is the Drizzle instance you'll use in services.

// You can export the pgClient if direct access is needed, but usually db is sufficient.
// export { pgClient };
