import { and, count, eq, InferSelectModel } from "drizzle-orm";
import { applications as applicationsModel, ballots, rounds, roundVoters, users } from "../db/schema.ts";
import { db, Transaction } from "../db/postgres.ts";
import { log, LogLevel } from "./loggingService.ts";
import { Ballot, SubmitBallotDto, WrappedBallot } from "../types/ballot.ts";
import { BadRequestError, NotFoundError } from "../errors/generic.ts";
import { getRound, isUserRoundAdmin } from "./roundService.ts";
import { UnauthorizedError } from "../errors/auth.ts";
import { createLog } from "./auditLogService.ts";
import { escapeCsvValue } from "../utils/csv.ts";
import { AuditLogAction, AuditLogActorType } from "../types/auditLog.ts";

export function validateBallot(ballot: Ballot, votingConfig: {
  maxVotesPerVoter: number;
  maxVotesPerProjectPerVoter: number;
  minVotesPerProjectPerVoter?: number;
}) {
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
    
    // Validate minimum votes only if minimum is set and project has at least 1 vote
    const hasMinimumVoteRequirement = votingConfig.minVotesPerProjectPerVoter !== undefined;
    const projectHasVotes = voteCount > 0;
    const votesBelowMinimum = hasMinimumVoteRequirement && voteCount < votingConfig.minVotesPerProjectPerVoter!;
    
    if (projectHasVotes && votesBelowMinimum) {
      throw new BadRequestError(
        `Votes for project ${projectId} are below the minimum required (${votingConfig.minVotesPerProjectPerVoter!})`,
      );
    }
  }
}

export async function getBallot(
  roundId: string,
  userId: string,
  tx?: Transaction,
): Promise<WrappedBallot | null> {
  log(LogLevel.Info, "Getting ballot", { roundId, userId });
  const round = await (tx ?? db).query.rounds.findFirst({
    where: eq(rounds.id, roundId),
    with: {
      voters: true,
    },
  });
  if (!round) {
    log(LogLevel.Error, "Round not found", { roundId });
    throw new NotFoundError("Round not found");
  }

  const result = await (tx ?? db).query.ballots.findFirst({
    where: and(
      eq(ballots.roundId, round.id),
      eq(ballots.voterUserId, userId),
    ),
    with: {
      user: true,
    },
  });

  return result ?? null;
}

async function createBallot(
  tx: Transaction,
  roundId: string,
  userId: string,
  ballotDto: SubmitBallotDto,
): Promise<WrappedBallot> {
  const includedApplicationIds = Object.keys(ballotDto.ballot);

  if (includedApplicationIds.length === 0) {
    throw new BadRequestError("Ballot must include at least one application with an allocation");
  }

  const applicationsForRound = await tx.query.applications.findMany({
    where: and(
      eq(applicationsModel.roundId, roundId),
      eq(applicationsModel.state, "approved"),
    ),
  });

  // throw bad request if any of the application ids are not in the approved applications
  
  const approvedApplicationIds = applicationsForRound.map((app) => app.id);
  const invalidApplicationIds = includedApplicationIds.filter(
    (id) => !approvedApplicationIds.includes(id),
  );

  if (invalidApplicationIds.length > 0) {
    throw new BadRequestError(
      `The following application IDs had allocations, but are not approved: ${invalidApplicationIds.join(", ")}`,
    );
  }

  await tx.insert(ballots).values({
    roundId,
    voterUserId: userId,
    ballot: ballotDto.ballot,
  });

  const ballot = await getBallot(roundId, userId, tx);
  if (!ballot) {
    throw new Error("Ballot not found after submission");
  }

  return ballot;
}

export async function submitBallot(
  userId: string,
  roundId: string,
  ballotDto: SubmitBallotDto,
): Promise<WrappedBallot> {
  log(LogLevel.Info, "Submitting ballot", { userId, roundId });
  const result = await db.transaction(async (tx) => {
    const round = await getRound(roundId, userId);
    if (!round) {
      log(LogLevel.Error, "Round not found", { roundId });
      throw new NotFoundError("Round not found");
    }
    if (!round.isVoter) {
      log(LogLevel.Error, "User is not a voter for this round", {
        userId,
        roundId,
      });
      throw new UnauthorizedError(
        "You are not authorized to submit a ballot for this round",
      );
    }
    if (round.state !== "voting") {
      log(LogLevel.Error, "Round is not in voting state", { roundId });
      throw new BadRequestError("Round is not in voting state");
    }
    if (!round.published || !round.maxVotesPerProjectPerVoter || !round.maxVotesPerVoter) {
      log(LogLevel.Error, "Round is not properly configured for voting", {
        roundId,
      });
      throw new BadRequestError("Round is not properly configured for voting");
    }

    validateBallot(ballotDto.ballot, {
      maxVotesPerVoter: round.maxVotesPerVoter,
      maxVotesPerProjectPerVoter: round.maxVotesPerProjectPerVoter,
      minVotesPerProjectPerVoter: round.minVotesPerProjectPerVoter ?? undefined,
    });

    const existingBallot = await getBallot(roundId, userId, tx);
    if (existingBallot) {
      log(LogLevel.Info, "Deleting existing ballot", {
        userId,
        roundId,
      });

      await tx.delete(ballots).where(
        and(
          eq(ballots.roundId, round.id),
          eq(ballots.voterUserId, userId),
        ),
      );
    }

    const result = await createBallot(tx, round.id, userId, ballotDto);

    await createLog({
      type: AuditLogAction.BallotSubmitted,
      roundId: round.id,
      actor: {
        type: AuditLogActorType.User,
        userId,
      },
      payload: {
        ...ballotDto,
        id: result.id,
      },
      tx,
    });

    return result;
  });

  return result;
}

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
      escapeCsvValue(application.dripsProjectDataSnapshot.gitHubUrl ?? "Unknown"),
      escapeCsvValue(voteCount.toString()),
      escapeCsvValue(ballot?.createdAt.toString() ?? ""),
      escapeCsvValue(ballot?.updatedAt.toString() ?? ""),
    ].join(',');

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
      voters: {
        with: {
          user: true,
        },
      },
      admins: true,
      applications: true,
    },
  });

  if (!round) {
    log(LogLevel.Error, "Round not found", { roundId });
    throw new NotFoundError("Round not found");
  }
  if (!isUserRoundAdmin(round, requestingUserId)) {
    log(
      LogLevel.Error,
      "You are not authorized to view the ballots for this round",
      { roundId, requestingUserId },
    );
    throw new UnauthorizedError(
      "You are not authorized to view the ballots for this round",
    );
  }

  const submittedBallots = await db.query.ballots.findMany({
    where: eq(ballots.roundId, round.id),
    with: {
      user: true,
    },
    limit,
    offset,
  });

  if (format === "csv") {
    let csv =
      `Voter Wallet Address,Application ID,Project Name,GitHub URL,Assigned votes,Submitted at,Updated at\n`;

    csv += round.voters.map((voter) => {
      const voterUser = voter.user;
      return _generateCsvRowsForVoter(
        voterUser,
        submittedBallots,
        round.applications,
      );
    }).join("");

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
  if (!round) {
    log(LogLevel.Error, "Round not found", { roundId });
    throw new NotFoundError("Round not found");
  }
  if (!isUserRoundAdmin(round, requestingUserId)) {
    log(
      LogLevel.Error,
      "You are not authorized to view the ballots for this round",
      { roundId, requestingUserId },
    );
    throw new UnauthorizedError(
      "You are not authorized to view the ballots for this round",
    );
  }

  const numberOfVoters = (await db
    .select({
      count: count(),
    })
    .from(roundVoters)
    .where(eq(roundVoters.roundId, round.id)))[0]?.count || 0;

  const numberOfBallots = (await db
    .select({
      count: count(),
    })
    .from(ballots)
    .where(eq(ballots.roundId, round.id)))[0]?.count || 0;

  return {
    numberOfVoters,
    numberOfBallots,
  };
}
