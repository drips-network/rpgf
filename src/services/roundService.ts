import { db } from "$app/db/postgres.ts";
import { rounds, roundAdmins, roundVoters } from "$app/db/schema.ts";
import { roundAdminFieldsSchema, RoundPublicFields, RoundState, type CreateRoundDto, type PatchRoundDto, type RoundAdminFields } from "$app/types/round.ts";
import { and, eq } from "drizzle-orm";
import createOrGetUser from "./userService.ts";
import mapFilterUndefined from "../utils/mapFilterUndefined.ts";
import ensureAtLeastOneArrayMember from "../utils/ensureAtLeastOneArrayMember.ts";

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

export async function getRounds(limit = 20, offset = 0): Promise<RoundPublicFields[]> {
  const results = await db.query.rounds.findMany({
    limit,
    offset,
  });

  return results.map((round) => {
    const state = inferRoundState(round);
    return {
      ...round,
      state,
    };
  });
}

export async function getRound(roundId: number, accessLevel: 'public' | 'admin'): Promise<typeof accessLevel extends 'admin' ? RoundAdminFields : RoundPublicFields | null> {
  const round = await db.query.rounds.findFirst({
    where: eq(rounds.id, roundId),
  });
  if (!round) {
    return null;
  }

  const state = inferRoundState(round);

  if (accessLevel === 'admin') {
    const admins = await db.query.roundAdmins.findMany({
      where: eq(roundAdmins.roundId, roundId),
      with: {
        user: true,
      },
    });
    const adminAddresses = mapFilterUndefined(admins, (admin) => admin.user?.walletAddress);
    if (!ensureAtLeastOneArrayMember(adminAddresses)) {
      throw new Error("Round must have at least one admin");
    }
    
    const voters = await db.query.roundVoters.findMany({
      where: eq(roundVoters.roundId, roundId),
      with: {
        user: true,
      },
    });
    const voterAddresses = mapFilterUndefined(voters, (voter) => voter.user?.walletAddress);
    if (!ensureAtLeastOneArrayMember(voterAddresses)) {
      throw new Error("Round must have at least one voter");
    }

    const result: RoundAdminFields = {
      ...round,
      state,
      adminWalletAddresses: adminAddresses,
      votingConfig: {
        ...round.votingConfig,
        allowedVoters: voterAddresses,
      },
    };

    return result;
  } else {
    return {
      state,
      ...round,
    };
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

  return {
    ...result,
    state: inferRoundState(result),
    adminWalletAddresses: roundDto.adminWalletAddresses,
  }
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

export async function deleteRound(roundId: number): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(rounds).where(eq(rounds.id, roundId));
    await tx.delete(roundAdmins).where(eq(roundAdmins.roundId, roundId));
    await tx.delete(roundVoters).where(eq(roundVoters.roundId, roundId));
  });
}

export function inferRoundState(round: Omit<RoundPublicFields, "state">): RoundState {
  const now = new Date();

  if (now < round.applicationPeriodStart) {
    return "pending-intake";
  } else if (now < round.applicationPeriodEnd) {
    return "intake";
  } else if (now < round.votingPeriodStart) {
    return "pending-voting";
  } else if (now < round.votingPeriodEnd) {
    return "voting";
  } else if (now < round.resultsPeriodStart) {
    return "pending-results";
  } else {
    return "results";
  }
}
