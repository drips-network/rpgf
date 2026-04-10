import { drizzle, NodePgQueryResultHKT } from 'drizzle-orm/node-postgres';
import * as schema from "$app/db/schema.ts";
import { PgTransaction } from "drizzle-orm/pg-core/session";
import { ExtractTablesWithRelations } from "drizzle-orm";
import { config } from "../../config.ts";

export const db = drizzle({
  connection: {
    connectionString: config.database.connectionString,
  },
  schema,
});

export type Transaction = PgTransaction<NodePgQueryResultHKT, typeof schema, ExtractTablesWithRelations<typeof schema>>;

async function closeDbConnection() {
  console.log("Closing database connection...");

  // What the fuck? Only way i could figure out to do this.
  if ("end" in db.$client && typeof db.$client.end === "function") {
    await db.$client.end();
  };
}

Deno.addSignalListener("SIGINT", async () => {
  await closeDbConnection();
  Deno.exit();
});

Deno.addSignalListener("SIGTERM", async () => {
  await closeDbConnection();
  Deno.exit();
});
