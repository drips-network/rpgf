import { db, Transaction } from "$app/db/postgres.ts";
import {
ballots,
  chains,
  lower,
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
  RoundPublicFields,
  RoundState,
  WrappedRound,
  WrappedRoundDraft,
} from "$app/types/round.ts";
import { and, eq, InferSelectModel, isNull } from "drizzle-orm";
import createOrGetUser from "./userService.ts";
import ensureAtLeastOneArrayMember from "../utils/ensureAtLeastOneArrayMember.ts";
import { BadRequestError, NotFoundError } from "../errors/generic.ts";
import parseDto from "../utils/parseDto.ts";

export async function checkUrlSlugAvailability(
  urlSlug: string,
  tx: Transaction,
): Promise<boolean> {
  const existingRound = await tx.query.rounds.findFirst({
    where: eq(lower(rounds.urlSlug), urlSlug.toLowerCase()),
  });
  if (existingRound) {
    return false;
  }

  return true;
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

function mapVotersOrAdminsToAddresses(
  votersOrAdmins: { user: { walletAddress: string } }[],
): [string, ...string[]] {
  const addresses = votersOrAdmins.map((voterOrAdmin) =>
    voterOrAdmin.user.walletAddress
  );

  if (ensureAtLeastOneArrayMember(addresses)) {
    return addresses as [string, ...string[]];
  } else {
    throw new Error("Voters or admins must include at least one address.");
  }
}

type RoundSelectModelWithRelations = InferSelectModel<typeof rounds> & {
  admins: { user: { id: string, walletAddress: string } }[];
  voters: { user: { id: string, walletAddress: string } }[];
  createdBy: { id: string, walletAddress: string };
};

function mapDbRoundToWrappedRound(
  requestingUserId: string | null,
  roundSelectModel: RoundSelectModelWithRelations,
): WrappedRound<RoundPublicFields | RoundAdminFields> {
  const state = inferRoundState(roundSelectModel);

  const isAdmin = roundSelectModel.admins.some(
    (admin) => admin.user.id === requestingUserId,
  );

  const isVoter = roundSelectModel.voters.some(
    (voter) => voter.user.id === requestingUserId,
  );

  return {
    id: roundSelectModel.id,
    type: "round",
    chainId: roundSelectModel.chainId,
    round: {
      id: roundSelectModel.id,
      chainId: roundSelectModel.chainId,
      urlSlug: roundSelectModel.urlSlug,
      state,
      name: roundSelectModel.name,
      emoji: roundSelectModel.emoji,
      color: roundSelectModel.color,
      description: roundSelectModel.description,
      applicationPeriodStart: roundSelectModel.applicationPeriodStart,
      applicationPeriodEnd: roundSelectModel.applicationPeriodEnd,
      votingPeriodStart: roundSelectModel.votingPeriodStart,
      votingPeriodEnd: roundSelectModel.votingPeriodEnd,
      resultsPeriodStart: roundSelectModel.resultsPeriodStart,
      applicationFormat: roundSelectModel.applicationFormat,
      votingConfig: isAdmin ? {
        ...roundSelectModel.votingConfig,
        allowedVoters: mapVotersOrAdminsToAddresses(roundSelectModel.voters),
      } : {
        maxVotesPerVoter: roundSelectModel.votingConfig.maxVotesPerVoter,
        maxVotesPerProjectPerVoter: roundSelectModel.votingConfig.maxVotesPerProjectPerVoter,
      },
      createdByUserId: roundSelectModel.createdByUserId,
      createdAt: roundSelectModel.createdAt,
      updatedAt: roundSelectModel.updatedAt,
      adminWalletAddresses: mapVotersOrAdminsToAddresses(roundSelectModel.admins),
      isAdmin,
    },
    isAdmin,
    isVoter,
    createdBy: {
      id: roundSelectModel.createdBy.id,
      walletAddress: roundSelectModel.createdBy.walletAddress,
    }
  } as WrappedRound<RoundPublicFields | RoundAdminFields>;
};

type RoundDraftSelectModelWithRelations = InferSelectModel<typeof roundDrafts> & {
  admins: { user: { id: string, walletAddress: string } }[];
  createdBy: { id: string, walletAddress: string };
};

function mapDbDraftToWrappedRoundDraft(
  roundDraftSelectModel: RoundDraftSelectModelWithRelations,
): WrappedRoundDraft {
  return {
    id: roundDraftSelectModel.id,
    chainId: roundDraftSelectModel.chainId,
    type: "round-draft",
    draft: {
      ...roundDraftSelectModel.draft,
      adminWalletAddresses: mapVotersOrAdminsToAddresses(roundDraftSelectModel.admins),
    },
    validation: validateRoundDraft(roundDraftSelectModel.draft),
    createdBy: {
      id: roundDraftSelectModel.createdBy.id,
      walletAddress: roundDraftSelectModel.createdBy.walletAddress,
    },
    // only admins can see drafts
    isAdmin: true,
  };
}

export async function getRounds(
  requestingUserId: string | null,
  filter?: { chainId?: number },
  limit = 20,
  offset = 0,
): Promise<WrappedRound<RoundPublicFields>[]> {
  const chain = filter?.chainId
    ? await db.query.chains.findFirst({
      where: eq(chains.chainId, filter.chainId),
    })
    : undefined;
  if (filter?.chainId && !chain) throw new BadRequestError("Unsupported chain ID.");

  const results = await db.query.rounds.findMany({
    limit,
    offset,
    where: chain ? eq(rounds.chainId, chain.id) : undefined,
    with: {
      admins: {
        with: {
          user: true,
        },
      },
      voters: {
        with: {
          user: true,
        },
      },
      createdBy: true,
    },
  });

  return results.map((r) => mapDbRoundToWrappedRound(requestingUserId, r));
}

async function getRawRound(
  slug: string,
  tx?: Transaction,
  chainId?: number,
): Promise<RoundSelectModelWithRelations | null> {
  let chain: InferSelectModel<typeof chains> | undefined;

  if (chainId) {
    chain = await db.query.chains.findFirst({
      where: eq(chains.chainId, chainId),
    });
  }

  return await (tx ?? db).query.rounds.findFirst({
    where: and(
      chain ? eq(rounds.chainId, chain.id) : undefined,
      eq(lower(rounds.urlSlug), slug.toLowerCase()),
    ),
    with: {
      admins: {
        with: {
          user: true,
        },
      },
      voters: {
        with: {
          user: true,
        },
      },
      createdBy: true,
    },
  }) ?? null;
}

export async function getWrappedRound(
  slug: string,
  requestingUserId: string | null,
  tx?: Transaction,
  chainId?: number,
): Promise<WrappedRound<RoundAdminFields | RoundPublicFields> | null> {
  const rawRound = await getRawRound(slug, tx, chainId);

  if (!rawRound) {
    return null;
  }

  return mapDbRoundToWrappedRound(
    requestingUserId,
    rawRound,
  );
}

export async function createRoundDraft(
  roundDraftDto: CreateRoundDraftDto,
  creatorUserId: string,
): Promise<WrappedRoundDraft> {
  const result = await db.transaction(async (tx) => {
    const chain = await tx.query.chains.findFirst({
      where: eq(chains.chainId, roundDraftDto.chainId),
    });
    if (!chain) {
      throw new BadRequestError(
        `Chain with ID ${roundDraftDto.chainId} is unsupported.`,
      );
    }

    if (roundDraftDto.urlSlug) {
      const isAvailable = await checkUrlSlugAvailability(
        roundDraftDto.urlSlug,
        tx,
      );

      if (!isAvailable) {
        throw new BadRequestError(
          "URL slug already taken.",
        );
      }
    }

    const { insertedId } = (await tx.insert(roundDrafts).values({
      chainId: chain.id,
      createdByUserId: creatorUserId,
      draft: roundDraftDto,
    }).returning({ insertedId: roundDrafts.id }))[0];

    for (const address of roundDraftDto.adminWalletAddresses) {
      const adminUser = await createOrGetUser(tx, address);

      await tx.insert(roundAdmins).values({
        roundDraftId: insertedId,
        userId: adminUser,
      });
    }

    const newRoundDraft = await tx.query.roundDrafts.findFirst({
      where: eq(roundDrafts.id, insertedId),
      with: {
        admins: {
          with: {
            user: true,
          },
        },
        createdBy: true,
      },
    });
    if (!newRoundDraft) {
      throw new Error("Failed to create round draft.");
    }

    return newRoundDraft;
  });

  return mapDbDraftToWrappedRoundDraft(result);
}

export async function patchRoundDraft(
  roundDraftId: string,
  updates: CreateRoundDraftDto,
): Promise<WrappedRoundDraft> {
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

    // Compare the current draft with the updates to determine which fields have changed
    const changedFields =
      (Object.keys(updates) as (keyof CreateRoundDraftDto)[]).filter((key) => {
        // Skip the adminWalletAddresses field, as it will be handled separately
        if (key === "adminWalletAddresses") {
          return false;
        }
        // Check if the value has changed
        return roundDraft.draft[key] !== updates[key];
      });

    // If the URL slug has changed and is provided, check its availability
    if (changedFields.includes("urlSlug") && updates.urlSlug) {
      const isAvailable = await checkUrlSlugAvailability(
        updates.urlSlug,
        tx,
      );

      if (!isAvailable) {
        throw new BadRequestError(
          "URL slug already taken.",
        );
      }
    }

    // If some schedule-related fields have changed, validate the new schedule
    if (
      [
        "applicationPeriodStart",
        "applicationPeriodEnd",
        "votingPeriodStart",
        "votingPeriodEnd",
        "resultsPeriodStart",
      ].some(
        (key) => changedFields.includes(key as keyof CreateRoundDraftDto),
      )
    ) {
      validateSchedule({
        ...roundDraft.draft,
        ...updates,
      });
    }

    await tx.update(roundDrafts)
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

    return await getRoundDrafts({ id: roundDraftId }, 1, 0);
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

function validateRoundDraft(
  roundDraft: Partial<CreateRoundDraftDto>,
) {
  let scheduleValid = true;
  let draftComplete = true;

  if (
    roundDraft.applicationPeriodStart &&
    roundDraft.applicationPeriodEnd &&
    roundDraft.votingPeriodStart &&
    roundDraft.votingPeriodEnd &&
    roundDraft.resultsPeriodStart
  ) {
    scheduleValid = validateSchedule(roundDraft, false);
  }

  if (!createRoundDtoSchema.safeParse(roundDraft).success) {
    draftComplete = false;
  }

  return {
    scheduleValid,
    draftComplete,
  };
}

export async function getRoundDrafts(
  filter?: { chainId?: number; creatorUserId?: string; id?: string },
  limit = 20,
  offset = 0,
): Promise<WrappedRoundDraft[]> {
  const chain = filter?.chainId
    ? await db.query.chains.findFirst({
      where: eq(chains.chainId, filter.chainId),
    })
    : undefined;
  if (filter?.chainId && !chain) throw new BadRequestError("Unsupported chain ID.");

  const results = await db.query.roundDrafts.findMany({
    limit,
    offset,
    where: and(
      chain ? eq(roundDrafts.chainId, chain.id) : undefined,
      filter?.creatorUserId
        ? eq(roundDrafts.createdByUserId, filter.creatorUserId)
        : undefined,
      filter?.id ? eq(roundDrafts.id, filter.id) : undefined,
      isNull(roundDrafts.publishedAsRoundId),
    ),
    with: {
      admins: {
        with: {
          user: true,
        },
      },
      createdBy: true,
    },
  });

  return results.map((draftWrapper) => mapDbDraftToWrappedRoundDraft(draftWrapper));
}

export async function publishRoundDraft(
  roundDraftId: string,
  publishedByUserId: string,
): Promise<WrappedRound<RoundAdminFields>> {
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

    validateSchedule(roundDto);

    // Ugly, but drafts currently contain the canonical chain ID, but for rounds we store
    // the ID of the chain in the `chains` table.
    const realChain = await db.query.chains.findFirst({
      where: eq(chains.chainId, roundDto.chainId),
    });
    if (!realChain) {
      throw new BadRequestError(
        `Chain with ID ${roundDto.chainId} is unsupported.`,
      );
    }

    const newRounds = await tx.insert(rounds).values({
      urlSlug: roundDto.urlSlug,
      createdFromDraftId: roundDraft.id,
      name: roundDto.name,
      emoji: roundDto.emoji,
      color: roundDto.color,
      chainId: realChain.id,
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

    const fullRound = await getWrappedRound(newRound.urlSlug, publishedByUserId, tx);
    if (!fullRound) {
      throw new Error("Failed to retrieve the newly created round.");
    }

    return fullRound;
  });

  return result as WrappedRound<RoundAdminFields>;
}

function validateSchedule(
  schedule: Partial<
    Pick<
      CreateRoundDto,
      | "applicationPeriodStart"
      | "applicationPeriodEnd"
      | "votingPeriodStart"
      | "votingPeriodEnd"
      | "resultsPeriodStart"
    >
  >,
  throwOnError = true,
): boolean {
  const {
    applicationPeriodStart,
    applicationPeriodEnd,
    votingPeriodStart,
    votingPeriodEnd,
    resultsPeriodStart,
  } = schedule;

  const applicationPeriodStartDate = applicationPeriodStart
    ? new Date(applicationPeriodStart)
    : undefined;
  const applicationPeriodEndDate = applicationPeriodEnd
    ? new Date(applicationPeriodEnd)
    : undefined;
  const votingPeriodStartDate = votingPeriodStart
    ? new Date(votingPeriodStart)
    : undefined;
  const votingPeriodEndDate = votingPeriodEnd
    ? new Date(votingPeriodEnd)
    : undefined;
  const resultsPeriodStartDate = resultsPeriodStart
    ? new Date(resultsPeriodStart)
    : undefined;

  if (
    applicationPeriodStart && applicationPeriodEnd &&
    applicationPeriodStart >= applicationPeriodEnd
  ) {
    if (throwOnError) {
      throw new BadRequestError(
        "Application period start must be before end.",
      );
    }
    return false;
  }
  if (
    votingPeriodStart && votingPeriodEnd && votingPeriodStart >= votingPeriodEnd
  ) {
    if (throwOnError) {
      throw new BadRequestError(
        "Voting period start must be before end.",
      );
    }
    return false;
  }
  if (
    applicationPeriodEnd && votingPeriodStart &&
    applicationPeriodEnd >= votingPeriodStart
  ) {
    if (throwOnError) {
      throw new BadRequestError(
        "Voting period must start after application period ends.",
      );
    }
    return false;
  }
  if (
    votingPeriodEnd && resultsPeriodStart &&
    votingPeriodEnd >= resultsPeriodStart
  ) {
    if (throwOnError) {
      throw new BadRequestError(
        "Results period must start after voting period ends.",
      );
    }
    return false;
  }

  // if any of the dates are in the past, throw an error
  const now = new Date();

  if (
    (applicationPeriodStartDate && applicationPeriodStartDate < now) ||
    (applicationPeriodEndDate && applicationPeriodEndDate < now) ||
    (votingPeriodStartDate && votingPeriodStartDate < now) ||
    (votingPeriodEndDate && votingPeriodEndDate < now) ||
    (resultsPeriodStartDate && resultsPeriodStartDate < now)
  ) {
    if (throwOnError) {
      throw new BadRequestError(
        "All dates must be in the future.",
      );
    }
    return false;
  }

  return true;
}

export async function patchRound(
  roundSlug: string,
  patchingUserId: string,
  updates: PatchRoundDto,
): Promise<WrappedRound<RoundAdminFields> | null> {
  const result = await db.transaction(async (tx) => {
    const existingRound = await getRawRound(roundSlug, tx);
    if (!existingRound) {
      throw new NotFoundError(`Round with slug ${roundSlug} not found.`);
    }

    const state = inferRoundState(existingRound);

    const result = await tx.update(rounds)
      .set({
        name: updates.name,
        description: updates.description,
        votingConfig: updates.votingConfig,
        color: updates.color,
        emoji: updates.emoji,
      })
      .where(eq(rounds.urlSlug, roundSlug))
      .returning();

    const newRound = result[0];
    if (!newRound) {
      throw new Error("Failed to update round.");
    }

    if (updates.adminWalletAddresses) {
      if (!ensureAtLeastOneArrayMember(updates.adminWalletAddresses)) {
        throw new BadRequestError("At least one admin wallet address is required.");
      }

      // Remove all existing admins
      await tx.delete(roundAdmins).where(
        eq(roundAdmins.roundId, newRound.id),
      );

      for (const adminAddress of updates.adminWalletAddresses) {
        const adminUser = await createOrGetUser(tx, adminAddress);

        await tx.insert(roundAdmins).values({
          roundId: newRound.id,
          roundDraftId: result[0].createdFromDraftId,
          userId: adminUser,
        });
      }
    }

    const canUpdateVotingConfigInStates = [
      'pending-intake',
      'intake',
      'pending-voting',
      'voting',
    ];

    if (updates.votingConfig && canUpdateVotingConfigInStates.includes(state)) {
      // update voters for the round.
      // previously-existing voters may be removed, but only if they have not submitted a ballot yet.
      // new voters will be added.

      const existingVoterAddresses = new Set(
        existingRound.voters.map((voter) => voter.user.walletAddress),
      );
      const newVoterAddresses = new Set(updates.votingConfig.allowedVoters);
      const votersToRemove = existingRound.voters
        .filter((voter) => !newVoterAddresses.has(voter.user.walletAddress))
        .map((voter) => voter.user.id);

      const votersToAdd = updates.votingConfig.allowedVoters
        .filter((address) => !existingVoterAddresses.has(address));

      for (const voterId of votersToRemove) {
        // Only remove voters who have not submitted a ballot yet
        const hasSubmittedBallot = await tx.query.ballots.findFirst({
          where: and(
            eq(ballots.roundId, newRound.id),
            eq(ballots.voterUserId, voterId),
          ),
        });

        if (!hasSubmittedBallot) {
          await tx.delete(roundVoters).where(
            and(
              eq(roundVoters.roundId, newRound.id),
              eq(roundVoters.userId, voterId),
            ),
          );
        }
      }

      for (const voterAddress of votersToAdd) {
        const voterUser = await createOrGetUser(tx, voterAddress);

        await tx.insert(roundVoters).values({
          roundId: newRound.id,
          userId: voterUser,
        });
      }
    }

    return await getWrappedRound(
      result[0].urlSlug,
      patchingUserId,
      tx,
    );
  });

  return result as WrappedRound<RoundAdminFields>;
}

export async function deleteRound(roundId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(rounds).where(eq(rounds.id, roundId));
    await tx.delete(roundAdmins).where(eq(roundAdmins.roundId, roundId));
    await tx.delete(roundVoters).where(eq(roundVoters.roundId, roundId));
  });
}

export function inferRoundState(
  round: InferSelectModel<typeof rounds>,
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
