import { db } from "$app/db/postgres.ts";
import {
  chains,
  roundAdmins,
  roundDrafts,
  rounds,
  roundVoters,
} from "$app/db/schema.ts";
import {
  CreateRoundDraftDto,
  CreateRoundDto,
  createRoundDtoSchema,
  type PatchRoundDto,
  type RoundAdminFields,
  roundAdminFieldsSchema,
  RoundPublicFields,
  RoundState,
} from "$app/types/round.ts";
import { and, eq } from "drizzle-orm";
import createOrGetUser from "./userService.ts";
import mapFilterUndefined from "../utils/mapFilterUndefined.ts";
import ensureAtLeastOneArrayMember from "../utils/ensureAtLeastOneArrayMember.ts";
import { BadRequestError, NotFoundError } from "../errors/generic.ts";
import parseDto from "../utils/parseDto.ts";
import isUuid from "../utils/isUuid.ts";

export async function isUserRoundAdmin(
  userId: string | undefined,
  roundIdOrSlug: string,
): Promise<boolean> {
  if (!userId) {
    return false;
  }

  const queryById = isUuid(roundIdOrSlug);

  const result = await db.query.roundAdmins.findFirst({
    where: and(
      eq(roundAdmins.userId, userId),
      queryById
        ? eq(roundAdmins.roundId, roundIdOrSlug)
        : eq(rounds.urlSlug, roundIdOrSlug),
    ),
  });

  return Boolean(result);
}

export async function isUserRoundDraftAdmin(
  userId: string | undefined,
  roundDraftId: string,
): Promise<boolean> {
  if (!userId) {
    return false;
  }

  const result = await db.query.roundAdmins.findFirst({
    where: and(
      eq(roundAdmins.userId, userId),
      eq(roundAdmins.roundDraftId, roundDraftId),
    ),
  });
  return Boolean(result);
}

export async function getRounds(
  filter?: { chainId?: number },
  limit = 20,
  offset = 0,
): Promise<RoundPublicFields[]> {
  const results = await db.query.rounds.findMany({
    limit,
    offset,
    where: filter?.chainId ? eq(rounds.chainId, filter.chainId) : undefined,
  });

  return results.map((round) => {
    const state = inferRoundState(round);
    return {
      ...round,
      state,
    };
  });
}

export async function getRound(
  roundSlug: string,
  accessLevel: "public" | "admin",
): Promise<
  typeof accessLevel extends "admin" ? RoundAdminFields
    : RoundPublicFields | null
> {
  const round = await db.query.rounds.findFirst({
    where: eq(rounds.urlSlug, roundSlug),
  });
  if (!round) {
    return null;
  }

  const state = inferRoundState(round);

  if (accessLevel === "admin") {
    const admins = await db.query.roundAdmins.findMany({
      where: eq(roundAdmins.roundId, round.id),
      with: {
        user: true,
      },
    });
    const adminAddresses = mapFilterUndefined(
      admins,
      (admin) => admin.user?.walletAddress,
    );
    if (!ensureAtLeastOneArrayMember(adminAddresses)) {
      throw new Error("Round must have at least one admin");
    }

    const voters = await db.query.roundVoters.findMany({
      where: eq(roundVoters.roundId, round.id),
      with: {
        user: true,
      },
    });
    const voterAddresses = mapFilterUndefined(
      voters,
      (voter) => voter.user?.walletAddress,
    );
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

export async function createRoundDraft(
  roundDraftDto: CreateRoundDraftDto,
  creatorUserId: string,
) {
  const result = await db.transaction(async (tx) => {
    const chain = await tx.query.chains.findFirst({
      where: eq(chains.id, roundDraftDto.chainId),
    });
    if (!chain) {
      throw new BadRequestError(
        `Chain with ID ${roundDraftDto.chainId} is unsupported.`,
      );
    }

    const newRoundDraft = (await tx.insert(roundDrafts).values({
      chainId: roundDraftDto.chainId,
      createdByUserId: creatorUserId,
      draft: roundDraftDto,
    }).returning())[0];

    for (const adminAddress of roundDraftDto.adminWalletAddresses) {
      const adminUser = await createOrGetUser(tx, adminAddress);

      await tx.insert(roundAdmins).values({
        roundDraftId: newRoundDraft.id,
        userId: adminUser,
      });
    }

    return newRoundDraft;
  });

  return result;
}

export async function patchRoundDraft(
  roundDraftId: string,
  updates: CreateRoundDraftDto,
): Promise<typeof roundDrafts.$inferSelect | null> {
  const result = await db.transaction(async (tx) => {
    const roundDraft = await tx.query.roundDrafts.findFirst({
      where: eq(roundDrafts.id, roundDraftId),
    });

    if (!roundDraft) {
      throw new NotFoundError("Round draft not found.");
    }

    if (roundDraft?.publishedAsRoundId) {
      throw new BadRequestError(
        "Cannot modify a round draft that has already been published.",
      );
    }

    const result = await tx.update(roundDrafts)
      .set({
        draft: updates,
      })
      .where(eq(roundDrafts.id, roundDraftId))
      .returning();

    // Remove all existing admins
    await tx.delete(roundAdmins).where(
      eq(roundAdmins.roundDraftId, roundDraftId),
    );

    for (const adminAddress of updates.adminWalletAddresses) {
      const adminUser = await createOrGetUser(tx, adminAddress);

      await tx.insert(roundAdmins).values({
        roundDraftId: roundDraftId,
        userId: adminUser,
      });
    }

    return result;
  });

  return result[0];
}

export async function deleteRoundDraft(
  roundDraftId: string,
  withAdmins: boolean,
): Promise<void> {
  await db.transaction(async (tx) => {
    const roundDraft = await db.query.roundDrafts.findFirst({
      where: eq(roundDrafts.id, roundDraftId),
    });

    if (!roundDraft) {
      throw new NotFoundError("Round draft not found.");
    }

    if (roundDraft?.publishedAsRoundId) {
      throw new BadRequestError(
        "Cannot modify a round draft that has already been published.",
      );
    }

    await tx.delete(roundDrafts).where(and(eq(roundDrafts.id, roundDraftId)));
    if (withAdmins) {
      await tx.delete(roundAdmins).where(
        eq(roundAdmins.roundDraftId, roundDraftId),
      );
    }
  });
}

export async function getRoundDrafts(
  filter?: { chainId?: number; creatorUserId?: string; id?: string },
  limit = 20,
  offset = 0,
): Promise<CreateRoundDraftDto[]> {
  const results = await db.query.roundDrafts.findMany({
    limit,
    offset,
    where: and(
      filter?.chainId ? eq(roundDrafts, filter.chainId) : undefined,
      filter?.creatorUserId
        ? eq(roundDrafts.createdByUserId, filter.creatorUserId)
        : undefined,
      filter?.id ? eq(roundDrafts.id, filter.id) : undefined,
    ),
  });

  return results.map((rd) => rd.draft);
}

export async function publishRoundDraft(
  roundDraftId: string,
) {
  const result = await db.transaction(async (tx) => {
    const roundDraft = await tx.query.roundDrafts.findFirst({
      where: eq(roundDrafts.id, roundDraftId),
    });
    if (!roundDraft) {
      throw new NotFoundError(`Round draft with ID ${roundDraftId} not found.`);
    }

    let roundDto: CreateRoundDto;
    try {
      roundDto = await parseDto(createRoundDtoSchema, roundDraft.draft);
    } catch (e) {
      throw new BadRequestError(
        `The round draft is missing required fields: ${
          e instanceof Error ? e.message : e
        }`,
      );
    }

    const newRounds = await tx.insert(rounds).values({
      urlSlug: roundDto.urlSlug,
      createdFromDraftId: roundDraft.id,
      name: roundDto.name,
      chainId: roundDto.chainId,
      description: roundDto.description,
      applicationPeriodStart: new Date(roundDto.applicationPeriodStart),
      applicationPeriodEnd: new Date(roundDto.applicationPeriodEnd),
      votingPeriodStart: new Date(roundDto.votingPeriodStart),
      votingPeriodEnd: new Date(roundDto.votingPeriodEnd),
      resultsPeriodStart: new Date(roundDto.resultsPeriodStart),
      applicationFormat: roundDto.applicationFormat,
      votingConfig: roundDto.votingConfig,
      createdByUserId: roundDraft.createdByUserId,
    }).returning();

    const newRound = newRounds[0];

    // Update all the round admins to point to the new round
    await tx.update(roundAdmins).set({
      roundId: newRound.id,
    }).where(eq(roundAdmins.roundDraftId, roundDraftId));

    // Create voters for the new round
    for (const voterAddress of newRound.votingConfig.allowedVoters) {
      const voterUser = await createOrGetUser(tx, voterAddress);

      await tx.insert(roundVoters).values({
        roundId: newRound.id,
        userId: voterUser,
      });
    }

    await tx.update(roundDrafts).set({
      publishedAsRoundId: newRound.id,
    }).where(eq(roundDrafts.id, roundDraftId));

    return newRound;
  });

  return result;
}

export async function patchRound(
  roundId: string,
  updates: PatchRoundDto,
): Promise<RoundAdminFields | null> {
  const result = await db.transaction(async (tx) => {
    const result = await tx.update(rounds)
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

    if (updates.adminWalletAddresses) {
      // Remove all existing admins
      await tx.delete(roundAdmins).where(
        eq(roundAdmins.roundId, roundId),
      );
  
      for (const adminAddress of updates.adminWalletAddresses) {
        const adminUser = await createOrGetUser(tx, adminAddress);
  
        await tx.insert(roundAdmins).values({
          roundId,
          roundDraftId: result[0].createdFromDraftId,
          userId: adminUser,
        });
      }
    }
  
    return result;
  });

  return roundAdminFieldsSchema.parse(result[0]);
}

export async function deleteRound(roundId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(rounds).where(eq(rounds.id, roundId));
    await tx.delete(roundAdmins).where(eq(roundAdmins.roundId, roundId));
    await tx.delete(roundVoters).where(eq(roundVoters.roundId, roundId));
  });
}

export function inferRoundState(
  round: Omit<RoundPublicFields, "state">,
): RoundState {
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
