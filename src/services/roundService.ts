import { db, Transaction } from "$app/db/postgres.ts";
import {
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
  roundAdminFieldsSchema,
  RoundPublicFields,
  roundPublicFieldsSchema,
  RoundState,
  WrappedRound,
  WrappedRoundDraft,
} from "$app/types/round.ts";
import { and, eq, InferSelectModel, isNull } from "drizzle-orm";
import createOrGetUser from "./userService.ts";
import ensureAtLeastOneArrayMember from "../utils/ensureAtLeastOneArrayMember.ts";
import { BadRequestError, NotFoundError } from "../errors/generic.ts";
import parseDto from "../utils/parseDto.ts";

export async function isUserRoundAdmin(
  userId: string | undefined,
  roundSlug: string,
): Promise<boolean> {
  if (!userId) {
    return false;
  }

  const roundId = await db.query.rounds.findFirst({
    where: eq(lower(rounds.urlSlug), roundSlug.toLowerCase()),
    columns: { id: true },
  });
  if (!roundId) {
    return false;
  }

  const matchingAdmin = await db.query.roundAdmins.findFirst({
    where: and(
      eq(roundAdmins.userId, userId),
      eq(roundAdmins.roundId, roundId.id),
    ),
  });

  return Boolean(matchingAdmin);
}

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

export async function getRounds(
  filter?: { chainId?: number },
  limit = 20,
  offset = 0,
): Promise<WrappedRound<RoundPublicFields>[]> {
  const results = await db.query.rounds.findMany({
    limit,
    offset,
    where: filter?.chainId ? eq(rounds.chainId, filter.chainId) : undefined,
    with: {
      admins: {
        with: {
          user: true,
        },
      },
    },
  });

  return results.map((round) => {
    const state = inferRoundState(round);

    return {
      id: round.id,
      type: "round",
      chainId: round.chainId,
      round: {
        ...round,
        adminWalletAddresses: mapVotersOrAdminsToAddresses(round.admins),
        state,
        isAdmin: false,
      }
    };
  });
}

async function getRawWrappedRound(slug: string, tx?: Transaction): Promise<WrappedRound<RoundAdminFields> | null> {
  const round = await (tx ?? db).query.rounds.findFirst({
    where: eq(lower(rounds.urlSlug), slug.toLowerCase()),
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
    },
  });
  if (!round) {
    return null;
  }

  const state = inferRoundState(round);

  return {
    id: round.id,
    type: "round",
    chainId: round.chainId,
    round: {
      ...round,
      state,
      adminWalletAddresses: mapVotersOrAdminsToAddresses(round.admins),
      votingConfig: {
        ...round.votingConfig,
        allowedVoters: mapVotersOrAdminsToAddresses(round.voters),
      },
      isAdmin: true,
    }
  };
}

export async function getWrappedRoundPublic(
  roundSlug: string,
): Promise<WrappedRound<RoundPublicFields> | null> {
  const round = await getRawWrappedRound(roundSlug);
  if (!round) {
    return null;
  }

  const withoutAdminFields = roundPublicFieldsSchema.parse({
    ...round.round,
    isAdmin: false,
  });

  return {
    id: round.id,
    type: "round",
    chainId: round.chainId,
    round: {
      ...withoutAdminFields,
    }
  };
}

export async function getWrappedRoundAdmin(
  roundSlug: string,
  tx?: Transaction,
): Promise<WrappedRound<RoundAdminFields> | null> {
  const round = await getRawWrappedRound(roundSlug, tx);
  if (!round) {
    return null;
  }

  return {
    id: round.id,
    type: "round",
    chainId: round.chainId,
    round: round.round as RoundAdminFields,
  };
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
      chainId: roundDraftDto.chainId,
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
      },
    });
    if (!newRoundDraft) {
      throw new Error("Failed to create round draft.");
    }

    return {
      ...newRoundDraft.draft,
      adminWalletAddresses: mapVotersOrAdminsToAddresses(
        newRoundDraft.admins,
      ),
    };
  });

  return result;
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
    const changedFields = (Object.keys(updates) as (keyof CreateRoundDraftDto)[]).filter((key) => {
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
      ["applicationPeriodStart", "applicationPeriodEnd", "votingPeriodStart", "votingPeriodEnd", "resultsPeriodStart"].some(
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

  return result[0]
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

  if (roundDraft.applicationPeriodStart &&
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
  }
}

export async function getRoundDrafts(
  filter?: { chainId?: number; creatorUserId?: string; id?: string },
  limit = 20,
  offset = 0,
): Promise<WrappedRoundDraft[]> {
  const results = await db.query.roundDrafts.findMany({
    limit,
    offset,
    where: and(
      filter?.chainId ? eq(roundDrafts, filter.chainId) : undefined,
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
    },
  });

  return results.map((draftWrapper) => {
    return {
      ...draftWrapper,
      type: "round-draft",
      validation: validateRoundDraft(draftWrapper.draft),
      draft: {
        ...draftWrapper.draft,
        adminWalletAddresses: mapVotersOrAdminsToAddresses(draftWrapper.admins),
      },
    };
  });
}

export async function publishRoundDraft(
  roundDraftId: string,
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

    const newRounds = await tx.insert(rounds).values({
      urlSlug: roundDto.urlSlug,
      createdFromDraftId: roundDraft.id,
      name: roundDto.name,
      emoji: roundDto.emoji,
      color: roundDto.color,
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

    const fullRound = await getWrappedRoundAdmin(newRound.urlSlug, tx);
    if (!fullRound) {
      throw new Error("Failed to retrieve the newly created round.");
    }

    return fullRound;
  });

  return result;
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
  roundId: string,
  updates: PatchRoundDto,
): Promise<RoundAdminFields | null> {
  validateSchedule(updates);

  const result = await db.transaction(async (tx) => {
    if (updates.urlSlug) {
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

    // Todo: it should not be allowed to update the schedule anymore after the round has started
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
