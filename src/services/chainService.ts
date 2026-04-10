import { db } from "../db/postgres.ts";
import { Logger } from "./loggingService.ts";

const logger = new Logger("chainService");

export async function getChains() {
  logger.info("Getting all chains");
  const result = await db.query.chains.findMany({});

  return result;
}

export async function getChainById(id: number) {
  logger.info("Getting chain by ID", { id });
  const result = await db.query.chains.findFirst({
    where: (chains, { eq }) => eq(chains.id, id),
  });

  return result;
}
