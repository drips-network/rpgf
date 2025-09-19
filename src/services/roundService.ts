import { db, Transaction } from "$app/db/postgres.ts";
import { log, LogLevel } from "./loggingService.ts";
import {
  chains,
  linkedDripLists,
  lower,
  roundAdmins,
  rounds,
  users,
  applicationCategories,
} from "$app/db/schema.ts";
import {
  CreateRoundDto,
  type PatchRoundDto,
  Round,
  RoundState,
} from "$app/types/round.ts";
import { and, count, eq, inArray, InferSelectModel, isNull } from "drizzle-orm";
import { BadRequestError, NotFoundError } from "../errors/generic.ts";
import { UnauthorizedError } from "../errors/auth.ts";
import { z } from "zod";
import { createLog } from "./auditLogService.ts";
import { AuditLogAction, AuditLogActorType } from "../types/auditLog.ts";
import { KycProvider } from "../types/kyc.ts";

export function isUserRoundAdmin(
  roundWithAdmins: {
    admins: { userId: string }[];
  },
  userId: string | undefined | null,
): boolean {
  if (!userId) {
    return false;
  }

  return roundWithAdmins.admins.some((admin) => admin.userId === userId);
}

const defaultRoundSelectFields = {
  admins: {
    with: {
      user: true,
    },
  },
  voters: true,
  linkedDripLists: {
    columns: {
      dripListAccountId: true,
    },
  },
  applicationCategories: {
    where: isNull(applicationCategories.deletedAt),
    with: {
      form: true,
    }
  },
  chain: {
    columns: {
      chainId: true,
    },
  },
  createdBy: true,
  kycConfiguration: true,
} as const;

type RoundSelectModelWithRelations = InferSelectModel<typeof rounds> & {
  admins: { userId: string }[];
  voters: { userId: string }[];
  linkedDripLists: { dripListAccountId: string }[];
  createdBy: { id: string, walletAddress: string };
  chain: { chainId: number };
  applicationCategories: { id: string, name: string, applicationFormId: string, description: string | null }[];
  kycConfiguration: { kycProvider: KycProvider, treovaFormId: string | null } | null;
};

function mapDbRoundToDto(
  requestingUserId: string | null,
  round: RoundSelectModelWithRelations,
  adminCount: number | null,
): Round<boolean> {
  // triple ensure that the user is an admin if the round is unpublished
  const isAdmin = isUserRoundAdmin(round, requestingUserId ?? undefined);
  if (!round.published && !isAdmin) {
    throw new Error(`We were about to return draft round ${round.id} to a non-admin user.`);
  }

  const validation = round.published ? null : {
    scheduleValid: validateSchedule(round, false),
    readyToPublish: validateRoundReadyForPublishing(round),
    applicationFormValid: round.applicationCategories.length > 0,
  };

  let kycConfig: Round<boolean>["kycConfig"] | null = null;
  if (round.kycConfiguration) {
    switch (round.kycConfiguration.kycProvider) {
      case KycProvider.Fern: {
        kycConfig = { provider: KycProvider.Fern };
        break;
      }
      case KycProvider.Treova: {
        if (!round.kycConfiguration.treovaFormId) {
          throw new Error(`Round ${round.id} has Treova KYC provider but missing form ID in configuration.`);
        }

        kycConfig = {
          provider: KycProvider.Treova,
          formId: round.kycConfiguration.treovaFormId,
        };
        break;
      }
    }
  }

  return {
    id: round.id,
    published: round.published,
    chainId: round.chain.chainId, // Here we need to return the canonical "chainId", not the id of the chain in our DB
    emoji: round.emoji,
    color: round.color,
    urlSlug: round.urlSlug,
    state: inferRoundState(round),
    name: round.name,
    customAvatarCid: round.customAvatarCid,
    description: round.description,
    applicationPeriodStart: round.applicationPeriodStart,
    applicationPeriodEnd: round.applicationPeriodEnd,
    votingPeriodStart: round.votingPeriodStart,
    votingPeriodEnd: round.votingPeriodEnd,
    resultsPeriodStart: round.resultsPeriodStart,
    maxVotesPerVoter: round.maxVotesPerVoter,
    maxVotesPerProjectPerVoter: round.maxVotesPerProjectPerVoter,
    voterGuidelinesLink: round.voterGuidelinesLink,
    createdByUser: {
      id: round.createdBy.id,
      walletAddress: round.createdBy.walletAddress,
    },
    createdAt: round.createdAt,
    updatedAt: round.updatedAt,
    resultsCalculated: round.resultsCalculated,
    resultsPublished: round.resultsPublished,
    linkedDripLists: round.linkedDripLists.map((d) => d.dripListAccountId),
    applicationCategories: round.applicationCategories.map((c) => ({
      id: c.id,
      name: c.name,
      applicationForm: {
        id: c.applicationFormId,
        name: c.name,
      },
      description: c.description,
    })),
    isVoter: !!requestingUserId && round.voters.some((v) => v.userId === requestingUserId),
    isAdmin,
    validation,
    adminCount,
    kycConfig,
  };
};

/** Get PUBLISHED rounds */
export async function getRounds(
  requestingUserId: string | null,
  filter?: { chainId?: number },
  limit = 20,
  offset = 0,
  tx?: Transaction,
): Promise<Round<boolean>[]> {
  log(LogLevel.Info, "Getting rounds", {
    requestingUserId,
    filter,
    limit,
    offset,
  });
  const chain = filter?.chainId
    ? await db.query.chains.findFirst({
      where: eq(chains.chainId, filter.chainId),
    })
    : undefined;
  if (filter?.chainId && !chain) throw new BadRequestError("Unsupported chain ID.");

  const results = await (tx ?? db).query.rounds.findMany({
    limit,
    offset,
    where: and(
      chain ? eq(rounds.chainId, chain.id) : undefined,
      eq(rounds.published, true),
    ),
    with: defaultRoundSelectFields,
  });

  return results.map((r) => mapDbRoundToDto(requestingUserId, r, null));
}

/** Get all rounds where the user is an admin, even if unpublished */
export async function getRoundsByUser(
  userId: string,
  filter?: { chainId?: number, published?: boolean },
  tx?: Transaction,
): Promise<Round<true>[]> {
  log(LogLevel.Info, "Getting rounds by user", {
    userId,
    filter,
  });
  const chain = filter?.chainId
    ? await db.query.chains.findFirst({
      where: eq(chains.chainId, filter.chainId),
    })
    : undefined;
  if (filter?.chainId && !chain) throw new BadRequestError("Unsupported chain ID.");

  const matchingRoundAdmins = await (tx ?? db).query.roundAdmins.findMany({
    where: and(
      eq(roundAdmins.userId, userId),
    ),
    with: {
      round: {
        columns: { id: true },
      },
    },
  });

  const matchingRounds = await (tx ?? db).query.rounds.findMany({
    where: and(
      inArray(
        rounds.id,
        matchingRoundAdmins.map((ra) => ra.round.id),
      ),
      chain ? eq(rounds.chainId, chain.id) : undefined,
      filter?.published ? eq(rounds.published, filter.published) : undefined,
    ),
    with: defaultRoundSelectFields,
  });

  return matchingRounds.map((r) => mapDbRoundToDto(userId, r, null) as Round<true>);
};

export async function getRound(
  roundIdOrSlug: string,
  requestingUserId: string | null,
  tx?: Transaction,
): Promise<Round<boolean> | null> {
  log(LogLevel.Info, "Getting round", {
    roundIdOrSlug,
    requestingUserId,
  });
  const isUuid = z.string().uuid().safeParse(roundIdOrSlug).success;

  const round = await (tx ?? db).query.rounds.findFirst({
    where: isUuid
      ? eq(rounds.id, roundIdOrSlug)
      : eq(lower(rounds.urlSlug), roundIdOrSlug.toLowerCase()),
    with: defaultRoundSelectFields,
  });
  if (!round) {
    return null;
  }

  const isAdmin = isUserRoundAdmin(round, requestingUserId ?? undefined);

  // only round admins are allowed to see unpublished round drafts
  if (!round.published && !isAdmin) {
    return null;
  }

  const { count: adminCount } = isAdmin ? (await db
    .select({ count: count() })
    .from(roundAdmins)
    .where(
      eq(roundAdmins.roundId, round.id)
    ))[0] : {};

  return mapDbRoundToDto(requestingUserId, round, adminCount ?? null);
}

export async function isUrlSlugAvailable(
  urlSlug: string,
  tx?: Transaction,
): Promise<boolean> {
  const existingRound = await (tx ?? db).query.rounds.findFirst({
    where: eq(lower(rounds.urlSlug), urlSlug.toLowerCase()),
    columns: { id: true },
  });

  return !existingRound;
}

export async function ensureUrlSlugAvailable(
  urlSlug: string,
  tx?: Transaction,
): Promise<void> {
  const isAvailable = await isUrlSlugAvailable(urlSlug, tx);

  if (!isAvailable) {
    throw new BadRequestError("URL slug already taken.");
  }
}

export async function createRound(
  dto: CreateRoundDto,
  creatorUserId: string,
): Promise<Round<false>> {
  log(LogLevel.Info, "Creating round", {
    creatorUserId,
  });
  const result = await db.transaction(async (tx) => {
    const chain = await tx.query.chains.findFirst({
      where: eq(chains.chainId, dto.chainId),
    });
    if (!chain) {
      log(LogLevel.Error, "Unsupported chain ID", { chainId: dto.chainId });
      throw new BadRequestError(
        `Chain with ID ${dto.chainId} is unsupported.`,
      );
    }

    const { whitelistMode } = chain;

    if (whitelistMode) {
      const user = await tx.query.users.findFirst({
        where: eq(users.id, creatorUserId),
      });

      if (!user?.whitelisted) {
        log(LogLevel.Error, "User is not whitelisted to create rounds on this chain", {
          creatorUserId,
        });
        throw new UnauthorizedError(
          "You are not whitelisted to create rounds on this chain.",
        )
      }
    }

    if (dto.urlSlug) {
      ensureUrlSlugAvailable(dto.urlSlug, tx);
    }

    const { id: insertedId } = (await tx.insert(rounds).values({
      chainId: chain.id,
      urlSlug: dto.urlSlug,
      published: false,
      name: dto.name,
      emoji: dto.emoji,
      color: dto.color,
      description: dto.description,
      applicationPeriodStart: dto.applicationPeriodStart ? new Date(dto.applicationPeriodStart) : null,
      applicationPeriodEnd: dto.applicationPeriodEnd ? new Date(dto.applicationPeriodEnd) : null,
      votingPeriodStart: dto.votingPeriodStart ? new Date(dto.votingPeriodStart) : null,
      votingPeriodEnd: dto.votingPeriodEnd ? new Date(dto.votingPeriodEnd) : null,
      resultsPeriodStart: dto.resultsPeriodStart ? new Date(dto.resultsPeriodStart) : null,
      maxVotesPerVoter: dto.maxVotesPerVoter,
      maxVotesPerProjectPerVoter: dto.maxVotesPerProjectPerVoter,
      voterGuidelinesLink: dto.voterGuidelinesLink,
      createdByUserId: creatorUserId,
      customAvatarCid: dto.customAvatarCid,
    }).returning())[0];

    // create a single admin for the round, the creator
    await tx.insert(roundAdmins).values({
      roundId: insertedId,
      userId: creatorUserId,
    });

    const newRoundDraft = await tx.query.rounds.findFirst({
      where: eq(rounds.id, insertedId),
      with: defaultRoundSelectFields,
    });
    if (!newRoundDraft) {
      throw new Error("Failed to create round draft.");
    }

    await createLog({
      type: AuditLogAction.RoundCreated,
      roundId: newRoundDraft.id,
      actor: {
        type: AuditLogActorType.User,
        userId: creatorUserId,
      },
      payload: dto,
      tx,
    });

    return newRoundDraft;
  });

  return mapDbRoundToDto(creatorUserId, result, null) as Round<false>;
}


export async function deleteRound(roundId: string, requestingUserId: string): Promise<void> {
  log(LogLevel.Info, "Deleting round", { roundId, requestingUserId });
  await db.transaction(async (tx) => {
    const round = await tx.query.rounds.findFirst({
      where: eq(rounds.id, roundId),
      columns: { id: true, published: true },
      with: {
        admins: true,
      }
    });
    if (!round) {
      log(LogLevel.Error, "Round not found", { roundId });
      throw new NotFoundError(`Round with ID ${roundId} not found.`);
    }
    if (!isUserRoundAdmin(round, requestingUserId)) {
      log(LogLevel.Error, "Only round admins can delete the round", {
        roundId,
        requestingUserId,
      });
      throw new UnauthorizedError("Only round admins can delete the round.");
    }
    if (round.published) {
      log(LogLevel.Error, "Cannot delete a published round", { roundId });
      throw new BadRequestError("Cannot delete a published round.");
    }

    await tx.delete(rounds).where(eq(rounds.id, round.id));

    await createLog({
      type: AuditLogAction.RoundDeleted,
      roundId: round.id,
      actor: {
        type: AuditLogActorType.User,
        userId: requestingUserId,
      },
      payload: null,
      tx,
    })
  });
}

function validateSchedule(
  schedule:
    Pick<
      Round<boolean>,
      | "applicationPeriodStart"
      | "applicationPeriodEnd"
      | "votingPeriodStart"
      | "votingPeriodEnd"
      | "resultsPeriodStart"
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

  // if any missing, not valid
  if (
    !applicationPeriodStart || !applicationPeriodEnd ||
    !votingPeriodStart || !votingPeriodEnd ||
    !resultsPeriodStart
  ) {
    if (throwOnError) {
      throw new BadRequestError("All schedule dates must be provided.");
    }
    return false;
  }

  if (
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
    votingPeriodStart >= votingPeriodEnd
  ) {
    if (throwOnError) {
      throw new BadRequestError(
        "Voting period start must be before end.",
      );
    }
    return false;
  }
  if (
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
    (applicationPeriodStart < now) ||
    (applicationPeriodEnd < now) ||
    (votingPeriodStart < now) ||
    (votingPeriodEnd < now) ||
    (resultsPeriodStart < now)
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

function validateRoundReadyForPublishing(
  round: RoundSelectModelWithRelations,
): boolean {
  if (!validateSchedule(round, false)) {
    return false;
  }

  if (
    !round.name ||
    !round.urlSlug ||
    !round.maxVotesPerProjectPerVoter ||
    !round.maxVotesPerVoter
  ) {
    return false;
  }

  if (round.admins.length === 0) {
    return false;
  }

  if (round.applicationCategories.length === 0) {
    return false;
  }

  if (round.voters.length === 0) {
    return false;
  }

  return true;
}

export async function publishRound(
  roundId: string,
  publishedByUserId: string,
): Promise<Round<true>> {
  log(LogLevel.Info, "Publishing round", { roundId, publishedByUserId });
  return await db.transaction(async (tx) => {
    const round = await tx.query.rounds.findFirst({
      where: eq(rounds.id, roundId),
      with: defaultRoundSelectFields,
    });

    if (!round) {
      log(LogLevel.Error, "Round not found", { roundId });
      throw new NotFoundError(`Round with ID ${roundId} not found.`);
    }
    if (round.published) {
      log(LogLevel.Error, "Round is already published", { roundId });
      throw new BadRequestError("Round is already published.");
    }
    if (!isUserRoundAdmin(round, publishedByUserId)) {
      log(LogLevel.Error, "Only round admins can publish the round", {
        roundId,
        publishedByUserId,
      });
      throw new UnauthorizedError("Only round admins can publish the round.");
    }

    const readyToPublish = validateRoundReadyForPublishing(round);
    if (!readyToPublish) {
      log(
        LogLevel.Error,
        "Round is not ready to be published. Ensure all required fields are set, at least one admin and one application category exist, and the schedule is valid.",
        { roundId },
      );
      throw new BadRequestError(
        "Round is not ready to be published. Ensure all required fields are set, at least one admin and one application category exist, and the schedule is valid.",
      );
    }

    await tx.update(rounds).set({
      published: true,
      publishedByUserId,
      publishedAt: new Date(),
    }).where(eq(rounds.id, roundId));

    await createLog({
      type: AuditLogAction.RoundPublished,
      roundId: round.id,
      actor: {
        type: AuditLogActorType.User,
        userId: publishedByUserId,
      },
      payload: null,
      tx,
    })

    return await db.query.rounds.findFirst({
      where: eq(rounds.id, roundId),
      with: defaultRoundSelectFields,
    }).then((r) => {
      if (!r) {
        throw new Error("Failed to retrieve published round.");
      }
      return mapDbRoundToDto(publishedByUserId, r, null) as Round<true>;
    });
  }
  )
};

export async function patchRound(
  roundId: string,
  dto: PatchRoundDto,
  patchingUserId: string,
): Promise<Round<true>> {
  log(LogLevel.Info, "Patching round", { roundId, patchingUserId });
  const result = await db.transaction(async (tx) => {
    const existingRound = await tx.query.rounds.findFirst({
      where: eq(rounds.id, roundId),
      with: defaultRoundSelectFields,
    });

    if (!existingRound) {
      log(LogLevel.Error, "Round not found", { roundId });
      throw new NotFoundError(`Round not found.`);
    }

    if (!isUserRoundAdmin(existingRound, patchingUserId)) {
      log(LogLevel.Error, "Only round admins can update the round", {
        roundId,
        patchingUserId,
      });
      throw new UnauthorizedError("Only round admins can update the round.");
    }

    // if the round is not published yet, allow partial updates to any field
    // else, only allow name, color, emoji, customAvatarCid, description, voterGuidelinesLink

    if (existingRound.published) {
      const allowedFields = [
        "name",
        "color",
        "emoji",
        "customAvatarCid",
        "description",
        "voterGuidelinesLink",
      ];

      // check if dto has any fields not in allowedFields
      const dtoFields = Object.keys(dto);
      const invalidFields = dtoFields
        .filter((field) => !allowedFields.includes(field))
        // ignore fields that haven't changed
        // deno-lint-ignore no-explicit-any
        .filter((field) => (dto as any)[field] !== (existingRound as any)[field]);
      
      if (invalidFields.length > 0) {
        log(
          LogLevel.Error,
          `Cannot update fields ${invalidFields.join(", ")} on a published round.`,
          { roundId },
        );
        throw new BadRequestError(
          `Cannot update fields ${invalidFields.join(", ")} on a published round.`,
        );
      }

      // update the fields
      await tx.update(rounds).set({
        name: dto.name ?? existingRound.name,
        color: dto.color ?? existingRound.color,
        emoji: dto.emoji ?? existingRound.emoji,
        customAvatarCid: dto.customAvatarCid ?? existingRound.customAvatarCid,
        description: dto.description ?? existingRound.description,
        voterGuidelinesLink: dto.voterGuidelinesLink ?? existingRound.voterGuidelinesLink,
        updatedAt: new Date(),
      }).where(eq(rounds.id, existingRound.id)).returning();
    } else {
      // if urlSlug is being updated, ensure it's available
      if (dto.urlSlug && dto.urlSlug !== existingRound.urlSlug) {
        await ensureUrlSlugAvailable(dto.urlSlug, tx);
      }

      await tx.update(rounds).set({
        name: dto.name ?? existingRound.name,
        urlSlug: dto.urlSlug ?? existingRound.urlSlug,
        color: dto.color ?? existingRound.color,
        emoji: dto.emoji ?? existingRound.emoji,
        customAvatarCid: dto.customAvatarCid ?? existingRound.customAvatarCid,
        description: dto.description ?? existingRound.description,
        applicationPeriodStart: dto.applicationPeriodStart ? new Date(dto.applicationPeriodStart) : existingRound.applicationPeriodStart,
        applicationPeriodEnd: dto.applicationPeriodEnd ? new Date(dto.applicationPeriodEnd) : existingRound.applicationPeriodEnd,
        votingPeriodStart: dto.votingPeriodStart ? new Date(dto.votingPeriodStart) : existingRound.votingPeriodStart,
        votingPeriodEnd: dto.votingPeriodEnd ? new Date(dto.votingPeriodEnd) : existingRound.votingPeriodEnd,
        resultsPeriodStart: dto.resultsPeriodStart ? new Date(dto.resultsPeriodStart) : existingRound.resultsPeriodStart,
        maxVotesPerVoter: dto.maxVotesPerVoter ?? existingRound.maxVotesPerVoter,
        maxVotesPerProjectPerVoter: dto.maxVotesPerProjectPerVoter ?? existingRound.maxVotesPerProjectPerVoter,
        voterGuidelinesLink: dto.voterGuidelinesLink ?? existingRound.voterGuidelinesLink,
        updatedAt: new Date(),
      }).where(eq(rounds.id, existingRound.id));
    }

    const updatedRound = await tx.query.rounds.findFirst({
      where: eq(rounds.id, existingRound.id),
      with: defaultRoundSelectFields,
    });
    if (!updatedRound) {
      throw new Error("Failed to retrieve updated round.");
    }

    await createLog({
      type: AuditLogAction.RoundSettingsChanged,
      roundId: updatedRound.id,
      actor: {
        type: AuditLogActorType.User,
        userId: patchingUserId,
      },
      payload: dto,
      tx,
    });

    return mapDbRoundToDto(patchingUserId, updatedRound, null);
  });

  return result as Round<true>;
}

export function inferRoundState(
  round: InferSelectModel<typeof rounds>,
): RoundState | null {
  const now = new Date();

  if (!round.published) {
    return null;
  }

  if (!round.applicationPeriodStart ||
    !round.applicationPeriodEnd ||
    !round.votingPeriodStart ||
    !round.votingPeriodEnd ||
    !round.resultsPeriodStart
  ) {
    throw new Error(`Published round ${round.id} is missing schedule dates`)
  }

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

export async function linkDripListsToRound(
  roundId: string,
  requestingUserId: string,
  dripListAccountIds: string[],
): Promise<void> {
  log(LogLevel.Info, "Linking drip lists to round", {
    roundId,
    requestingUserId,
  });
  // TODO: Ideally verify that the Drip Lists exist, are valid, and are two-way linked
  // to the round

  void await db.transaction(async (tx) => {
    const round = await tx.query.rounds.findFirst({
      where: (rounds, { eq }) => eq(rounds.id, roundId),
      with: {
        admins: true,
      }
    });
    if (!round) {
      log(LogLevel.Error, "Round not found", { roundId });
      throw new NotFoundError(
        `Round with id ${roundId} not found`,
      );
    }
    if (!isUserRoundAdmin(round, requestingUserId)) {
      log(LogLevel.Error, "User is not an admin of this round", {
        roundId,
        requestingUserId,
      });
      throw new UnauthorizedError("You are not an admin of this round");
    }

    // replace any existing linked drip lists for this round with the new ones

    await tx.delete(linkedDripLists).where(
      eq(linkedDripLists.roundId, round.id),
    );

    if (dripListAccountIds.length === 0) {
      return;
    }

    await tx.insert(linkedDripLists).values(dripListAccountIds.map((accountId) => ({
      roundId: round.id,
      dripListAccountId: accountId,
    })));

    await createLog({
      type: AuditLogAction.LinkedDripListsEdited,
      roundId: round.id,
      actor: {
        type: AuditLogActorType.User,
        userId: requestingUserId,
      },
      payload: {
        dripListAccountIds,
      },
      tx,
    })
  });
}
