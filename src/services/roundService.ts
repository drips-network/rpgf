import { db } from "$app/db/postgres.ts";
import { rounds, roundAdmins, roundVoters } from "$app/db/schema.ts";
import { roundAdminFieldsSchema, RoundPublicFields, roundPublicFieldsSchema, type CreateRoundDto, type PatchRoundDto, type RoundAdminFields } from "$app/types/round.ts";
import { and, eq } from "drizzle-orm";
import createOrGetUser from "./userService.ts";
import { access } from "node:fs";
import mapFilterUndefined from "../utils/mapFilterUndefined.ts";

export async function isUserRoundAdmin(userId: number | undefined, roundId: number): Promise<boolean> {
  if (!userId) {
    return false;
  }

  const result = await db
    .select()
    .from(roundAdmins)
    .where(and(eq(roundAdmins.userId, userId), eq(roundAdmins.roundId, roundId)))
    .limit(1);

  return result.length > 0;
}

export async function getRound(roundId: number, accessLevel: 'public' | 'admin'): Promise<typeof accessLevel extends 'admin' ? RoundAdminFields : RoundPublicFields | null> {
  const round = await db.query.rounds.findFirst({
    where: eq(rounds.id, roundId),
  });
  if (!round) {
    return null;
  }

  if (accessLevel === 'admin') {
    const admins = await db.query.roundAdmins.findMany({
      where: eq(roundAdmins.roundId, roundId),
      with: {
        user: true,
      },
    });
    const adminAddresses = mapFilterUndefined(admins, (admin) => admin.user?.walletAddress);
    
    const voters = await db.query.roundVoters.findMany({
      where: eq(roundVoters.roundId, roundId),
      with: {
        user: true,
      },
    });
    const voterAddresses = mapFilterUndefined(voters, (voter) => voter.user?.walletAddress);

    return roundAdminFieldsSchema.parse({
      ...round,
      adminWalletAddresses: adminAddresses,
      votingConfig: {
        ...round.votingConfig,
        allowedVoters: voterAddresses,
      },
    });
  } else {
    return roundPublicFieldsSchema.parse(round);
  }
}

export async function createRound(
  roundDto: CreateRoundDto,
  creatorUserId: number,
): Promise<RoundAdminFields> {
  const result = await db.transaction(async (tx) => {

    const newRounds = await tx.insert(rounds).values({
      name: roundDto.name,
      description: roundDto.description,
      applicationPeriodStart: new Date(roundDto.applicationPeriodStart),
      applicationPeriodEnd: new Date(roundDto.applicationPeriodEnd),
      votingPeriodStart: new Date(roundDto.votingPeriodStart),
      votingPeriodEnd: new Date(roundDto.votingPeriodEnd),
      resultsPeriodStart: new Date(roundDto.resultsPeriodStart),
      applicationFormat: roundDto.applicationFormat,
      votingConfig: roundDto.votingConfig,
      createdByUserId: creatorUserId,
    }).returning();

    if (!newRounds || newRounds.length === 0) {
      throw new Error("Failed to create round: No record returned.");
    }
    const newRound = newRounds[0];

    for (const adminAddress of roundDto.adminWalletAddresses) {
      const adminUserId = await createOrGetUser(tx, adminAddress);
  
      // Assign admin to round
      const existingAdmin = await tx.select()
        .from(roundAdmins)
        .where(and(eq(roundAdmins.roundId, newRound.id), eq(roundAdmins.userId, adminUserId)))
        .limit(1);

      if (existingAdmin.length === 0) {
        await tx.insert(roundAdmins).values({
          roundId: newRound.id,
          userId: adminUserId,
        });
      }
    }

    for (const voterAddress of roundDto.votingConfig.allowedVoters) {
      const voterUser = await createOrGetUser(tx, voterAddress);

      // Assign voter to round
      const existingVoter = await tx.select()
        .from(roundVoters)
        .where(and(eq(roundVoters.roundId, newRound.id), eq(roundVoters.userId, voterUser)))
        .limit(1);

      if (existingVoter.length === 0) {
        await tx.insert(roundVoters).values({
          roundId: newRound.id,
          userId: voterUser,
        });
      }
    }

    return newRound;
  });

  return roundAdminFieldsSchema.parse(result);
}

export async function patchRound(
  roundId: number,
  updates: PatchRoundDto,
): Promise<RoundAdminFields | null> {
  const result = await db.update(rounds)
    .set({
      name: updates.name,
      description: updates.description,
      applicationPeriodStart: updates.applicationPeriodStart
        ? new Date(updates.applicationPeriodStart)
        : undefined,
      applicationPeriodEnd: updates.applicationPeriodEnd
        ? new Date(updates.applicationPeriodEnd)
        : undefined,
      votingPeriodStart: updates.votingPeriodStart
        ? new Date(updates.votingPeriodStart)
        : undefined,
      votingPeriodEnd: updates.votingPeriodEnd
        ? new Date(updates.votingPeriodEnd)
        : undefined,
      resultsPeriodStart: updates.resultsPeriodStart
        ? new Date(updates.resultsPeriodStart)
        : undefined,
      applicationFormat: updates.applicationFormat,
      votingConfig: updates.votingConfig,
    })
    .where(eq(rounds.id, roundId))
    .returning();

  if (!result || result.length === 0) {
    return null;
  }
  return roundAdminFieldsSchema.parse(result[0]);
}
