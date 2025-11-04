import { db } from "$app/db/postgres.ts";
import { roundAdmins, rounds } from "$app/db/schema.ts";
import { CreateRoundDto } from "$app/types/round.ts";
import { eq } from "drizzle-orm";

export async function createRound(
  data: CreateRoundDto,
  creatorUserId: string,
) {
  const [round] = await db.insert(rounds).values({
    ...data,
    applicationPeriodStart: new Date(data.applicationPeriodStart!),
    applicationPeriodEnd: new Date(data.applicationPeriodEnd!),
    votingPeriodStart: new Date(data.votingPeriodStart!),
    votingPeriodEnd: new Date(data.votingPeriodEnd!),
    resultsPeriodStart: new Date(data.resultsPeriodStart!),
    createdByUserId: creatorUserId,
  }).returning();

  return round;
}

export async function createRoundAdmin(
  roundId: string,
  userId: string,
  superAdmin = false,
) {
  await db.insert(roundAdmins).values({
    roundId,
    userId,
    superAdmin,
  });
}

export async function deleteRound(roundId: string) {
  await db.delete(rounds).where(eq(rounds.id, roundId));
}
