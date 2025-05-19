import { db } from "../db/postgres.ts";

export async function getChains() {
  const result = await db.query.chains.findMany({});

  return result;
}

export async function getChainById(id: number) {
  const result = await db.query.chains.findFirst({
    where: (chains, { eq }) => eq(chains.id, id),
  });

  return result;
}
