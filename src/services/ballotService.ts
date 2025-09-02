import { and, count, eq, InferSelectModel } from "drizzle-orm";
import { applications as applicationsModel, ballots, rounds, roundVoters, users } from "../db/schema.ts";
import { db, Transaction } from "../db/postgres.ts";
import { Ballot, SubmitBallotDto, WrappedBallot } from "../types/ballot.ts";
import { BadRequestError, NotFoundError } from "../errors/generic.ts";
import { getRound, isUserRoundAdmin } from "./roundService.ts";
import { UnauthorizedError } from "../errors/auth.ts";

import { escapeCsvValue } from "../utils/csv.ts";

function validateBallot(ballot: Ballot, votingConfig: {
  maxVotesPerVoter: number;
  maxVotesPerProjectPerVoter: number;
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

  for (const projectId in Object.keys(ballot)) {
    if (ballot[projectId] > votingConfig.maxVotesPerProjectPerVoter) {
      throw new BadRequestError(
        `Votes for project ${projectId} exceed the maximum allowed (${votingConfig.maxVotesPerProjectPerVoter})`,
      );
    }
  }
}

export async function getBallot(
  roundId: string,
  userId: string,
  tx?: Transaction,
): Promise<WrappedBallot | null> {
  const round = await (tx ?? db).query.rounds.findFirst({
    where: eq(rounds.id, roundId),
    with: {
      voters: true,
    },
  });
  if (!round) {
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
      `Invalid application IDs: ${invalidApplicationIds.join(", ")}`,
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
  const round = await getRound(roundId, userId);
  if (!round) {
    throw new NotFoundError("Round not found");
  }
  if (!round.isVoter) {
    throw new UnauthorizedError(
      "You are not authorized to submit a ballot for this round",
    );
  }
  if (round.state !== "voting") {
    throw new BadRequestError("Round is not in voting state");
  }
  if (!round.published || !round.maxVotesPerProjectPerVoter || !round.maxVotesPerVoter) {
    throw new BadRequestError("Round is not properly configured for voting");
  }

  const existingBallot = await getBallot(roundId, userId);
  if (existingBallot) {
    throw new BadRequestError(
      "You have already submitted a ballot for this round",
    );
  }

  validateBallot(ballotDto.ballot, {
    maxVotesPerVoter: round.maxVotesPerVoter,
    maxVotesPerProjectPerVoter: round.maxVotesPerProjectPerVoter,
  });

  const result = await db.transaction(async (tx) => {
    return await createBallot(tx, round.id, userId, ballotDto);
  });

  return result;
}

export async function patchBallot(
  userId: string,
  roundId: string,
  ballotDto: SubmitBallotDto,
): Promise<WrappedBallot> {
  const result = await db.transaction(async (tx) => {
    const round = await getRound(roundId, userId);
    if (!round) {
      throw new NotFoundError("Round not found");
    }
    if (!round.isVoter) {
      throw new UnauthorizedError("You are not a voter for this round");
    }
    if (round.state !== "voting") {
      throw new BadRequestError("Round is not in voting state");
    }
    if (!round.published || !round.maxVotesPerProjectPerVoter || !round.maxVotesPerVoter) {
      throw new BadRequestError("Round is not properly configured for voting");
    }

    validateBallot(ballotDto.ballot, {
      maxVotesPerVoter: round.maxVotesPerVoter,
      maxVotesPerProjectPerVoter: round.maxVotesPerProjectPerVoter,
    });

    const existingBallot = await getBallot(roundId, userId);
    if (!existingBallot) {
      throw new BadRequestError("Ballot not found");
    }

    await tx.update(ballots).set({
      ballot: ballotDto.ballot,
    }).where(
      eq(ballots.id, existingBallot.id),
    );

    const ballot = await getBallot(round.id, userId);
    if (!ballot) {
      throw new Error("Ballot not found after submission");
    }

    return ballot;
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
  roundSlug: string,
  requestingUserId: string,
  limit = 0,
  offset = 0,
  format: "json" | "csv" = "json",
): Promise<WrappedBallot[] | string> {
  const round = await db.query.rounds.findFirst({
    where: eq(rounds.urlSlug, roundSlug),
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
    throw new NotFoundError("Round not found");
  }
  if (!isUserRoundAdmin(round, requestingUserId)) {
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
  roundSlug: string,
  requestingUserId: string,
) {
  const round = await db.query.rounds.findFirst({
    where: eq(rounds.urlSlug, roundSlug),
    with: { admins: true },
  });
  if (!round) {
    throw new NotFoundError("Round not found");
  }
  if (!isUserRoundAdmin(round, requestingUserId)) {
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
