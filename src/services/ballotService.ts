import { and, count, eq, isNull, InferSelectModel } from "drizzle-orm";
import {
  applicationCategories,
  applications as applicationsModel,
  ballotCategoryAllocations,
  ballotDrafts,
  ballots,
  rounds,
  roundVoters,
  users,
} from "../db/schema.ts";
import { db, Transaction } from "../db/postgres.ts";
import { log, LogLevel } from "./loggingService.ts";
import {
  Ballot,
  CategoryAllocations,
  DraftVotes,
  SaveCategoryAllocationsDto,
  SaveDraftVotesDto,
  SubmitBallotDirectDto,
  SubmitBallotDto,
  WrappedBallot,
} from "../types/ballot.ts";
import { BadRequestError, NotFoundError } from "../errors/generic.ts";
import { getRound, isUserRoundAdmin } from "./roundService.ts";
import { UnauthorizedError } from "../errors/auth.ts";
import { createLog } from "./auditLogService.ts";
import { escapeCsvValue } from "../utils/csv.ts";
import {
  AuditLogAction,
  AuditLogActorType,
  type PayloadByAction,
} from "../types/auditLog.ts";
import { verifyBallotSignature } from "../utils/ballotSignature.ts";

type SubmitBallotOptions = {
  actorUserId?: string;
};

// --- Validation helpers ---

export function validateBallot(
  ballot: Ballot,
  votingConfig: {
    maxVotesPerVoter: number;
    maxVotesPerProjectPerVoter: number;
    minVotesPerProjectPerVoter?: number;
  },
) {
  const totalVotes = Object.values(ballot).reduce(
    (acc, voteCount) => acc + voteCount,
    0,
  );
  if (totalVotes > votingConfig.maxVotesPerVoter) {
    throw new BadRequestError(
      `Total votes exceed the maximum allowed (${votingConfig.maxVotesPerVoter})`,
    );
  }

  for (const [projectId, voteCount] of Object.entries(ballot)) {
    if (voteCount > votingConfig.maxVotesPerProjectPerVoter) {
      throw new BadRequestError(
        `Votes for project ${projectId} exceed the maximum allowed (${votingConfig.maxVotesPerProjectPerVoter})`,
      );
    }

    if (votingConfig.minVotesPerProjectPerVoter !== undefined) {
      const minRequired = votingConfig.minVotesPerProjectPerVoter;
      if (voteCount > 0 && voteCount < minRequired) {
        throw new BadRequestError(
          `Votes for project ${projectId} are below the minimum required (${minRequired})`,
        );
      }
    }
  }
}

/**
 * Scale votes down using the largest remainder method when a category budget decreases.
 * Returns the scaled votes record.
 */
export function scaleVotesForCategory(
  votes: Record<string, number>,
  newBudget: number,
): Record<string, number> {
  const currentTotal = Object.values(votes).reduce((a, b) => a + b, 0);
  if (currentTotal <= newBudget) return votes;

  const scaleFactor = newBudget / currentTotal;

  const scaled: { id: string; floored: number; remainder: number }[] = [];
  for (const [id, count] of Object.entries(votes)) {
    const exact = count * scaleFactor;
    const floored = Math.floor(exact);
    scaled.push({ id, floored, remainder: exact - floored });
  }

  const flooredSum = scaled.reduce((a, b) => a + b.floored, 0);
  let remaining = newBudget - flooredSum;

  // Distribute remaining votes to entries with largest remainders
  scaled.sort((a, b) => b.remainder - a.remainder);
  for (const entry of scaled) {
    if (remaining <= 0) break;
    entry.floored += 1;
    remaining -= 1;
  }

  const result: Record<string, number> = {};
  for (const entry of scaled) {
    if (entry.floored > 0) {
      result[entry.id] = entry.floored;
    }
  }
  return result;
}

// --- Category Allocations ---

export async function saveCategoryAllocations(
  userId: string,
  roundId: string,
  dto: SaveCategoryAllocationsDto,
): Promise<CategoryAllocations> {
  log(LogLevel.Info, "Saving category allocations", { userId, roundId });

  return await db.transaction(async (tx) => {
    const round = await getRound(roundId, userId, tx);
    if (!round) throw new NotFoundError("Round not found");

    if (!round.isVoter && !round.isAdmin) {
      throw new UnauthorizedError(
        "Not authorized to set allocations for this round",
      );
    }

    if (round.state !== "voting") {
      throw new BadRequestError(
        "Round is not in a state that allows setting allocations",
      );
    }

    if (!round.published || !round.maxVotesPerVoter) {
      throw new BadRequestError(
        "Round is not properly configured for voting",
      );
    }

    // Validate all category IDs belong to this round and aren't deleted
    const categories = await tx.query.applicationCategories.findMany({
      where: and(
        eq(applicationCategories.roundId, roundId),
        isNull(applicationCategories.deletedAt),
      ),
    });
    const categoryIds = new Set(categories.map((c) => c.id));
    const percentageKeys = Object.keys(dto.categoryPercentages);

    // Every non-deleted category must be present
    for (const cat of categories) {
      if (!(cat.id in dto.categoryPercentages)) {
        throw new BadRequestError(
          `Missing percentage for category "${cat.name}" (${cat.id})`,
        );
      }
    }

    // No extra categories
    for (const key of percentageKeys) {
      if (!categoryIds.has(key)) {
        throw new BadRequestError(
          `Category ID ${key} does not belong to this round or is deleted`,
        );
      }
    }

    // Validate percentages sum to 100
    const sum = Object.values(dto.categoryPercentages).reduce((a, b) => a + b, 0);
    if (sum !== 100) {
      throw new BadRequestError(
        `Category allocations must sum to 100%, got ${sum}%`,
      );
    }

    // Validate each percentage meets the admin minimum
    for (const cat of categories) {
      const minPct = cat.minVotePercentage ?? 0;
      const allocated = dto.categoryPercentages[cat.id] ?? 0;
      if (allocated < minPct) {
        throw new BadRequestError(
          `Category "${cat.name}" requires at least ${minPct}% allocation, got ${allocated}%`,
        );
      }
    }

    // Check if there are existing allocations — if so, handle scaling
    const existingAlloc = await tx.query.ballotCategoryAllocations.findFirst({
      where: and(
        eq(ballotCategoryAllocations.roundId, roundId),
        eq(ballotCategoryAllocations.voterUserId, userId),
      ),
    });

    if (existingAlloc) {
      const oldAllocations = existingAlloc.allocations as Record<
        string,
        number
      >;

      // For categories whose percentage decreased, scale draft votes
      for (const catId of percentageKeys) {
        const oldPct = oldAllocations[catId] ?? 0;
        const newPct = dto.categoryPercentages[catId];
        if (newPct < oldPct) {
          const draft = await tx.query.ballotDrafts.findFirst({
            where: and(
              eq(ballotDrafts.roundId, roundId),
              eq(ballotDrafts.voterUserId, userId),
              eq(ballotDrafts.categoryId, catId),
            ),
          });
          if (draft) {
            const newBudget = Math.floor(
              (newPct / 100) * round.maxVotesPerVoter,
            );
            const scaledVotes = scaleVotesForCategory(
              draft.votes as Record<string, number>,
              newBudget,
            );
            await tx
              .update(ballotDrafts)
              .set({ votes: scaledVotes })
              .where(eq(ballotDrafts.id, draft.id));
          }
        }
      }

      // Update existing allocations
      await tx
        .update(ballotCategoryAllocations)
        .set({
          allocations: dto.categoryPercentages,
        })
        .where(eq(ballotCategoryAllocations.id, existingAlloc.id));
    } else {
      await tx.insert(ballotCategoryAllocations).values({
        roundId,
        voterUserId: userId,
        allocations: dto.categoryPercentages,
      });
    }

    const result = await tx.query.ballotCategoryAllocations.findFirst({
      where: and(
        eq(ballotCategoryAllocations.roundId, roundId),
        eq(ballotCategoryAllocations.voterUserId, userId),
      ),
    });

    if (!result) throw new Error("Allocation not found after save");

    await createLog({
      type: AuditLogAction.BallotAllocationsSaved,
      roundId,
      actor: { type: AuditLogActorType.User, userId },
      payload: { categoryPercentages: dto.categoryPercentages },
      tx,
    });

    return {
      categoryPercentages: result.allocations as Record<string, number>,
      createdAt: result.createdAt,
      updatedAt: result.updatedAt,
    };
  });
}

export async function getCategoryAllocations(
  userId: string,
  roundId: string,
): Promise<CategoryAllocations | null> {
  log(LogLevel.Info, "Getting category allocations", { userId, roundId });

  const result = await db.query.ballotCategoryAllocations.findFirst({
    where: and(
      eq(ballotCategoryAllocations.roundId, roundId),
      eq(ballotCategoryAllocations.voterUserId, userId),
    ),
  });

  if (!result) return null;

  return {
    categoryPercentages: result.allocations as Record<string, number>,
    createdAt: result.createdAt,
    updatedAt: result.updatedAt,
  };
}

// --- Draft Votes ---

export async function saveDraftVotes(
  userId: string,
  roundId: string,
  categoryId: string,
  dto: SaveDraftVotesDto,
): Promise<Record<string, number>> {
  log(LogLevel.Info, "Saving draft votes", { userId, roundId, categoryId });

  return await db.transaction(async (tx) => {
    const round = await getRound(roundId, userId, tx);
    if (!round) throw new NotFoundError("Round not found");

    if (!round.isVoter && !round.isAdmin) {
      throw new UnauthorizedError("Not authorized to vote in this round");
    }

    if (round.state !== "voting") {
      throw new BadRequestError(
        "Round is not in a state that allows voting",
      );
    }

    if (
      !round.published || !round.maxVotesPerVoter ||
      !round.maxVotesPerProjectPerVoter
    ) {
      throw new BadRequestError(
        "Round is not properly configured for voting",
      );
    }

    // Verify category allocations exist
    const alloc = await tx.query.ballotCategoryAllocations.findFirst({
      where: and(
        eq(ballotCategoryAllocations.roundId, roundId),
        eq(ballotCategoryAllocations.voterUserId, userId),
      ),
    });
    if (!alloc) {
      throw new BadRequestError(
        "You must set category allocations before saving draft votes",
      );
    }

    const allocations = alloc.allocations as Record<string, number>;
    const categoryPct = allocations[categoryId];
    if (categoryPct === undefined) {
      throw new BadRequestError(
        `Category ${categoryId} is not in your allocations`,
      );
    }

    // Verify all application IDs are approved and belong to this category
    const includedAppIds = Object.keys(dto.votes);
    if (includedAppIds.length > 0) {
      const approvedApps = await tx.query.applications.findMany({
        where: and(
          eq(applicationsModel.roundId, roundId),
          eq(applicationsModel.state, "approved"),
          eq(applicationsModel.categoryId, categoryId),
        ),
      });
      const approvedIds = new Set(approvedApps.map((a) => a.id));

      for (const appId of includedAppIds) {
        if (!approvedIds.has(appId)) {
          throw new BadRequestError(
            `Application ${appId} is not an approved application in category ${categoryId}`,
          );
        }
      }
    }

    // Validate vote budget for this category
    const categoryBudget = Math.floor(
      (categoryPct / 100) * round.maxVotesPerVoter,
    );
    const totalVotes = Object.values(dto.votes).reduce((a, b) => a + b, 0);
    if (totalVotes > categoryBudget) {
      throw new BadRequestError(
        `Total votes (${totalVotes}) exceed category budget (${categoryBudget}) based on ${categoryPct}% of ${round.maxVotesPerVoter}`,
      );
    }

    // Per-project limits
    for (const [appId, voteCount] of Object.entries(dto.votes)) {
      if (voteCount > round.maxVotesPerProjectPerVoter) {
        throw new BadRequestError(
          `Votes for project ${appId} exceed the maximum allowed (${round.maxVotesPerProjectPerVoter})`,
        );
      }
      if (round.minVotesPerProjectPerVoter) {
        if (voteCount > 0 && voteCount < round.minVotesPerProjectPerVoter) {
          throw new BadRequestError(
            `Votes for project ${appId} are below the minimum required (${round.minVotesPerProjectPerVoter})`,
          );
        }
      }
    }

    // Filter out zero votes
    const filteredVotes: Record<string, number> = {};
    for (const [id, count] of Object.entries(dto.votes)) {
      if (count > 0) filteredVotes[id] = count;
    }

    // Upsert draft
    const existing = await tx.query.ballotDrafts.findFirst({
      where: and(
        eq(ballotDrafts.roundId, roundId),
        eq(ballotDrafts.voterUserId, userId),
        eq(ballotDrafts.categoryId, categoryId),
      ),
    });

    if (existing) {
      await tx
        .update(ballotDrafts)
        .set({ votes: filteredVotes })
        .where(eq(ballotDrafts.id, existing.id));
    } else {
      await tx.insert(ballotDrafts).values({
        roundId,
        voterUserId: userId,
        categoryId,
        votes: filteredVotes,
      });
    }

    await createLog({
      type: AuditLogAction.BallotDraftSaved,
      roundId,
      actor: { type: AuditLogActorType.User, userId },
      payload: { categoryId, votes: filteredVotes },
      tx,
    });

    return filteredVotes;
  });
}

export async function getDraftVotes(
  userId: string,
  roundId: string,
): Promise<DraftVotes> {
  log(LogLevel.Info, "Getting draft votes", { userId, roundId });

  const drafts = await db.query.ballotDrafts.findMany({
    where: and(
      eq(ballotDrafts.roundId, roundId),
      eq(ballotDrafts.voterUserId, userId),
    ),
  });

  const result: DraftVotes = {};
  for (const draft of drafts) {
    result[draft.categoryId] = draft.votes as Record<string, number>;
  }
  return result;
}

/**
 * Assembles a flat ballot from all draft votes for a voter in a round.
 * Merges all per-category votes into a single Record<applicationId, voteCount>.
 */
export async function assembleBallotFromDrafts(
  userId: string,
  roundId: string,
  tx?: Transaction,
): Promise<Ballot> {
  const drafts = await (tx ?? db).query.ballotDrafts.findMany({
    where: and(
      eq(ballotDrafts.roundId, roundId),
      eq(ballotDrafts.voterUserId, userId),
    ),
  });

  const ballot: Ballot = {};
  for (const draft of drafts) {
    const votes = draft.votes as Record<string, number>;
    for (const [appId, count] of Object.entries(votes)) {
      ballot[appId] = (ballot[appId] ?? 0) + count;
    }
  }
  return ballot;
}

// --- Ballot CRUD ---

export async function getBallot(
  roundId: string,
  userId: string,
  tx?: Transaction,
): Promise<WrappedBallot | null> {
  log(LogLevel.Info, "Getting ballot", { roundId, userId });
  const round = await (tx ?? db).query.rounds.findFirst({
    where: eq(rounds.id, roundId),
    with: { voters: true },
  });
  if (!round) throw new NotFoundError("Round not found");

  const result = await (tx ?? db).query.ballots.findFirst({
    where: and(
      eq(ballots.roundId, round.id),
      eq(ballots.voterUserId, userId),
    ),
    with: { user: true },
  });

  return result ?? null;
}

export async function submitBallot(
  userId: string,
  roundId: string,
  ballotDto: SubmitBallotDto,
  options?: SubmitBallotOptions,
): Promise<WrappedBallot> {
  const actorUserId = options?.actorUserId ?? userId;
  const actingOnBehalf = actorUserId !== userId;

  log(LogLevel.Info, "Submitting ballot", {
    userId,
    actorUserId,
    actingOnBehalf,
    roundId,
  });

  const result = await db.transaction(async (tx) => {
    const round = await getRound(roundId, userId, tx);
    if (!round) throw new NotFoundError("Round not found");

    let actorIsAdmin = round.isAdmin;

    if (actingOnBehalf) {
      const actorRound = await getRound(roundId, actorUserId, tx);
      if (!actorRound) {
        throw new UnauthorizedError(
          "You are not authorized to submit a ballot for this round",
        );
      }
      if (!actorRound.isAdmin) {
        throw new UnauthorizedError(
          "Only round admins can submit ballots on behalf of voters",
        );
      }
      actorIsAdmin = actorRound.isAdmin;
    }

    if (!round.isVoter && !actorIsAdmin) {
      throw new UnauthorizedError(
        "Not authorized to submit a ballot for this round",
      );
    }

    const roundState = round.state;
    const roundAllowsPendingResults = roundState === "pending-results" &&
      actorIsAdmin && actingOnBehalf;
    const roundInAllowedState = roundState === "voting" ||
      roundAllowsPendingResults;

    if (!roundInAllowedState) {
      throw new BadRequestError(
        "Round is not in a state that allows ballot submission",
      );
    }

    if (
      !round.published || !round.maxVotesPerProjectPerVoter ||
      !round.maxVotesPerVoter
    ) {
      throw new BadRequestError(
        "Round is not properly configured for voting",
      );
    }

    // Verify allocations exist
    const alloc = await tx.query.ballotCategoryAllocations.findFirst({
      where: and(
        eq(ballotCategoryAllocations.roundId, roundId),
        eq(ballotCategoryAllocations.voterUserId, userId),
      ),
    });
    if (!alloc) {
      throw new BadRequestError(
        "You must set category allocations before submitting a ballot",
      );
    }

    // Assemble ballot from drafts
    const assembledBallot = await assembleBallotFromDrafts(
      userId,
      roundId,
      tx,
    );

    // Get user wallet for signature verification
    const user = await tx.query.users.findFirst({
      where: eq(users.id, userId),
    });
    if (!user) throw new NotFoundError("User not found");

    let signatureWalletAddress = user.walletAddress;
    if (actingOnBehalf) {
      const actorUser = await tx.query.users.findFirst({
        where: eq(users.id, actorUserId),
      });
      if (!actorUser) throw new NotFoundError("Round admin not found");
      signatureWalletAddress = actorUser.walletAddress;
    }

    // Verify signature against assembled ballot
    try {
      verifyBallotSignature(
        signatureWalletAddress,
        assembledBallot,
        ballotDto.signature,
        ballotDto.chainId,
      );
    } catch (error) {
      log(LogLevel.Error, "Ballot signature verification failed", {
        userId,
        roundId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new UnauthorizedError(
        `Ballot signature verification failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // Validate assembled ballot
    validateBallot(assembledBallot, {
      maxVotesPerVoter: round.maxVotesPerVoter,
      maxVotesPerProjectPerVoter: round.maxVotesPerProjectPerVoter,
      minVotesPerProjectPerVoter: round.minVotesPerProjectPerVoter ??
        undefined,
    });

    // Validate all application IDs are approved
    const includedAppIds = Object.keys(assembledBallot);
    if (includedAppIds.length > 0) {
      const approvedApps = await tx.query.applications.findMany({
        where: and(
          eq(applicationsModel.roundId, roundId),
          eq(applicationsModel.state, "approved"),
        ),
      });
      const approvedIds = new Set(approvedApps.map((a) => a.id));
      const invalidIds = includedAppIds.filter((id) => !approvedIds.has(id));
      if (invalidIds.length > 0) {
        throw new BadRequestError(
          `The following application IDs are not approved: ${invalidIds.join(", ")}`,
        );
      }
    }

    // Delete existing ballot if resubmitting
    const existingBallot = await getBallot(roundId, userId, tx);
    if (existingBallot) {
      await tx.delete(ballots).where(
        and(
          eq(ballots.roundId, round.id),
          eq(ballots.voterUserId, userId),
        ),
      );
    }

    // Insert final ballot
    await tx.insert(ballots).values({
      roundId,
      voterUserId: userId,
      ballot: assembledBallot,
      signature: ballotDto.signature,
      chainId: ballotDto.chainId,
    });

    const ballot = await getBallot(roundId, userId, tx);
    if (!ballot) throw new Error("Ballot not found after submission");

    const auditPayload: PayloadByAction[AuditLogAction.BallotSubmitted] = {
      ballot: assembledBallot,
      chainId: ballotDto.chainId,
      id: ballot.id,
    };

    if (actingOnBehalf) {
      auditPayload.badgeholderWalletAddress = user.walletAddress;
    }

    await createLog({
      type: AuditLogAction.BallotSubmitted,
      roundId: round.id,
      actor: { type: AuditLogActorType.User, userId: actorUserId },
      payload: auditPayload,
      tx,
    });

    return ballot;
  });

  return result;
}

// --- Direct ballot submission (spreadsheet flow) ---

/**
 * Validates a flat ballot against category minimum percentage requirements.
 * Groups votes by application category, calculates the effective percentage per category,
 * and checks that each category meets its minimum.
 */
async function validateCategoryMinimums(
  ballot: Ballot,
  roundId: string,
  tx: Transaction,
) {
  const categories = await tx.query.applicationCategories.findMany({
    where: and(
      eq(applicationCategories.roundId, roundId),
      isNull(applicationCategories.deletedAt),
    ),
  });

  const categoriesWithMinimums = categories.filter(
    (c) => c.minVotePercentage && c.minVotePercentage > 0,
  );

  if (categoriesWithMinimums.length === 0) return;

  // Look up category for each application in the ballot
  const appIds = Object.keys(ballot);
  if (appIds.length === 0) return;

  const apps = await tx.query.applications.findMany({
    where: and(
      eq(applicationsModel.roundId, roundId),
      eq(applicationsModel.state, "approved"),
    ),
  });

  const appCategoryMap = new Map(apps.map((a) => [a.id, a.categoryId]));

  // Sum votes per category
  const votesPerCategory: Record<string, number> = {};
  for (const [appId, votes] of Object.entries(ballot)) {
    const catId = appCategoryMap.get(appId);
    if (catId) {
      votesPerCategory[catId] = (votesPerCategory[catId] ?? 0) + votes;
    }
  }

  const totalVotes = Object.values(ballot).reduce((a, b) => a + b, 0);

  for (const cat of categoriesWithMinimums) {
    const catVotes = votesPerCategory[cat.id] ?? 0;
    const catPercentage = totalVotes > 0
      ? (catVotes / totalVotes) * 100
      : 0;

    if (catPercentage < cat.minVotePercentage!) {
      throw new BadRequestError(
        `Category "${cat.name}" requires at least ${cat.minVotePercentage}% of votes, but only ${catPercentage.toFixed(1)}% was allocated`,
      );
    }
  }
}

export async function submitBallotDirect(
  userId: string,
  roundId: string,
  ballotDto: SubmitBallotDirectDto,
  options?: SubmitBallotOptions,
): Promise<WrappedBallot> {
  const actorUserId = options?.actorUserId ?? userId;
  const actingOnBehalf = actorUserId !== userId;

  log(LogLevel.Info, "Submitting ballot directly", {
    userId,
    actorUserId,
    actingOnBehalf,
    roundId,
  });

  const result = await db.transaction(async (tx) => {
    const round = await getRound(roundId, userId, tx);
    if (!round) throw new NotFoundError("Round not found");

    let actorIsAdmin = round.isAdmin;

    if (actingOnBehalf) {
      const actorRound = await getRound(roundId, actorUserId, tx);
      if (!actorRound) {
        throw new UnauthorizedError(
          "You are not authorized to submit a ballot for this round",
        );
      }
      if (!actorRound.isAdmin) {
        throw new UnauthorizedError(
          "Only round admins can submit ballots on behalf of voters",
        );
      }
      actorIsAdmin = actorRound.isAdmin;
    }

    if (!round.isVoter && !actorIsAdmin) {
      throw new UnauthorizedError(
        "Not authorized to submit a ballot for this round",
      );
    }

    const roundState = round.state;
    const roundAllowsPendingResults = roundState === "pending-results" &&
      actorIsAdmin && actingOnBehalf;
    const roundInAllowedState = roundState === "voting" ||
      roundAllowsPendingResults;

    if (!roundInAllowedState) {
      throw new BadRequestError(
        "Round is not in a state that allows ballot submission",
      );
    }

    if (
      !round.published || !round.maxVotesPerProjectPerVoter ||
      !round.maxVotesPerVoter
    ) {
      throw new BadRequestError(
        "Round is not properly configured for voting",
      );
    }

    // Get user wallet for signature verification
    const user = await tx.query.users.findFirst({
      where: eq(users.id, userId),
    });
    if (!user) throw new NotFoundError("User not found");

    let signatureWalletAddress = user.walletAddress;
    if (actingOnBehalf) {
      const actorUser = await tx.query.users.findFirst({
        where: eq(users.id, actorUserId),
      });
      if (!actorUser) throw new NotFoundError("Round admin not found");
      signatureWalletAddress = actorUser.walletAddress;
    }

    // Verify signature BEFORE content validation
    try {
      verifyBallotSignature(
        signatureWalletAddress,
        ballotDto.ballot,
        ballotDto.signature,
        ballotDto.chainId,
      );
    } catch (error) {
      log(LogLevel.Error, "Ballot signature verification failed", {
        userId,
        roundId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new UnauthorizedError(
        `Ballot signature verification failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // Validate ballot content
    validateBallot(ballotDto.ballot, {
      maxVotesPerVoter: round.maxVotesPerVoter,
      maxVotesPerProjectPerVoter: round.maxVotesPerProjectPerVoter,
      minVotesPerProjectPerVoter: round.minVotesPerProjectPerVoter ??
        undefined,
    });

    // Validate category minimum percentages
    await validateCategoryMinimums(
      ballotDto.ballot,
      roundId,
      tx,
    );

    // Validate all application IDs are approved
    const includedAppIds = Object.keys(ballotDto.ballot);
    if (includedAppIds.length === 0) {
      throw new BadRequestError(
        "Ballot must include at least one application with an allocation",
      );
    }

    const approvedApps = await tx.query.applications.findMany({
      where: and(
        eq(applicationsModel.roundId, roundId),
        eq(applicationsModel.state, "approved"),
      ),
    });
    const approvedIds = new Set(approvedApps.map((a) => a.id));
    const invalidIds = includedAppIds.filter((id) => !approvedIds.has(id));
    if (invalidIds.length > 0) {
      throw new BadRequestError(
        `The following application IDs are not approved: ${invalidIds.join(", ")}`,
      );
    }

    // Delete existing ballot if resubmitting
    const existingBallot = await getBallot(roundId, userId, tx);
    if (existingBallot) {
      await tx.delete(ballots).where(
        and(
          eq(ballots.roundId, round.id),
          eq(ballots.voterUserId, userId),
        ),
      );
    }

    // Insert ballot
    await tx.insert(ballots).values({
      roundId,
      voterUserId: userId,
      ballot: ballotDto.ballot,
      signature: ballotDto.signature,
      chainId: ballotDto.chainId,
    });

    const ballot = await getBallot(roundId, userId, tx);
    if (!ballot) throw new Error("Ballot not found after submission");

    const auditPayload: PayloadByAction[AuditLogAction.BallotSubmitted] = {
      ballot: ballotDto.ballot,
      chainId: ballotDto.chainId,
      id: ballot.id,
    };

    if (actingOnBehalf) {
      auditPayload.badgeholderWalletAddress = user.walletAddress;
    }

    await createLog({
      type: AuditLogAction.BallotSubmitted,
      roundId: round.id,
      actor: { type: AuditLogActorType.User, userId: actorUserId },
      payload: auditPayload,
      tx,
    });

    return ballot;
  });

  return result;
}

// --- Admin endpoints ---

function _generateCsvRowsForVoter(
  voterUser: InferSelectModel<typeof users>,
  submittedBallots: WrappedBallot[],
  applications: InferSelectModel<typeof applicationsModel>[],
): string {
  const ballot = submittedBallots.find((b) => b.user.id === voterUser.id);

  let result: string = "";

  for (
    const [applicationId, voteCount] of Object.entries(ballot?.ballot || {})
  ) {
    const application = applications.find((app) => app.id === applicationId);
    if (!application) {
      throw new Error(
        `Application with ID ${applicationId} not found for voter ${voterUser.id}`,
      );
    }

    const values = [
      escapeCsvValue(voterUser.walletAddress),
      escapeCsvValue(application.id),
      escapeCsvValue(application.projectName),
      escapeCsvValue(
        application.dripsProjectDataSnapshot.gitHubUrl ?? "Unknown",
      ),
      escapeCsvValue(voteCount.toString()),
      escapeCsvValue(ballot?.createdAt.toString() ?? ""),
      escapeCsvValue(ballot?.updatedAt.toString() ?? ""),
      escapeCsvValue(ballot?.signature ?? ""),
      escapeCsvValue(ballot?.chainId?.toString() ?? ""),
    ].join(",");

    result += `${values}\n`;
  }

  return result;
}

export async function getBallots(
  roundId: string,
  requestingUserId: string,
  limit = 0,
  offset = 0,
  format: "json" | "csv" = "json",
): Promise<WrappedBallot[] | string> {
  log(LogLevel.Info, "Getting ballots", {
    roundId,
    requestingUserId,
    limit,
    offset,
    format,
  });
  const round = await db.query.rounds.findFirst({
    where: eq(rounds.id, roundId),
    with: {
      voters: { with: { user: true } },
      admins: true,
      applications: true,
    },
  });

  if (!round) throw new NotFoundError("Round not found");
  if (!isUserRoundAdmin(round, requestingUserId)) {
    throw new UnauthorizedError(
      "You are not authorized to view the ballots for this round",
    );
  }

  const submittedBallots = await db.query.ballots.findMany({
    where: eq(ballots.roundId, round.id),
    with: { user: true },
    limit,
    offset,
  });

  if (format === "csv") {
    let csv =
      `Voter Wallet Address,Application ID,Project Name,GitHub URL,Assigned votes,Submitted at,Updated at,Signature,Chain ID\n`;

    csv += round.voters
      .map((voter) => {
        const voterUser = voter.user;
        return _generateCsvRowsForVoter(
          voterUser,
          submittedBallots,
          round.applications,
        );
      })
      .join("");

    return csv;
  }

  return submittedBallots;
}

export async function getBallotStats(
  roundId: string,
  requestingUserId: string,
) {
  log(LogLevel.Info, "Getting ballot stats", { roundId, requestingUserId });
  const round = await db.query.rounds.findFirst({
    where: eq(rounds.id, roundId),
    with: { admins: true },
  });
  if (!round) throw new NotFoundError("Round not found");
  if (!isUserRoundAdmin(round, requestingUserId)) {
    throw new UnauthorizedError(
      "You are not authorized to view the ballots for this round",
    );
  }

  const numberOfVoters =
    (
      await db
        .select({ count: count() })
        .from(roundVoters)
        .where(eq(roundVoters.roundId, round.id))
    )[0]?.count || 0;

  const numberOfBallots =
    (
      await db
        .select({ count: count() })
        .from(ballots)
        .where(eq(ballots.roundId, round.id))
    )[0]?.count || 0;

  return { numberOfVoters, numberOfBallots };
}
