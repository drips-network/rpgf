import { db } from "../db/postgres.ts";
import { log, LogLevel } from "./loggingService.ts";

export async function getChains() {
  log(LogLevel.Info, "Getting all chains");
  const result = await db.query.chains.findMany({});

  return result;
}

export async function getChainById(id: number) {
  log(LogLevel.Info, "Getting chain by ID", { id });
  const result = await db.query.chains.findFirst({
    where: (chains, { eq }) => eq(chains.id, id),
  });

  return result;
}
