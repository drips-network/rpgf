import { and, eq } from "drizzle-orm";
import { applications, ballots, rounds } from "../db/schema.ts";
import { db, Transaction } from "../db/postgres.ts";
import { Ballot, SubmitBallotDto, WrappedBallot } from "../types/ballot.ts";
import { BadRequestError, NotFoundError } from "../errors/generic.ts";
import { getWrappedRound } from "./roundService.ts";
import { UnauthorizedError } from "../errors/auth.ts";
import { RoundAdminFields, RoundPublicFields, WrappedRound } from "../types/round.ts";

function validateBallot(ballot: Ballot, votingConfig: {
  maxVotesPerVoter: number;
  maxVotesPerProjectPerVoter: number;
}) {
  const totalVotes = Object.values(ballot).reduce((acc, voteCount) => acc + voteCount, 0);
  if (totalVotes > votingConfig.maxVotesPerVoter) {
    throw new BadRequestError(`Total votes exceed the maximum allowed (${votingConfig.maxVotesPerVoter})`);
  }

  for (const projectId in Object.keys(ballot)) {
    if (ballot[projectId] > votingConfig.maxVotesPerProjectPerVoter) {
      throw new BadRequestError(`Votes for project ${projectId} exceed the maximum allowed (${votingConfig.maxVotesPerProjectPerVoter})`);
    }
  }
}

export async function getBallot(
  roundSlug: string,
  userId: string,
  tx?: Transaction,
): Promise<WrappedBallot | null> {
  const round = await (tx ?? db).query.rounds.findFirst({
    where: eq(rounds.urlSlug, roundSlug),
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
      voter: true,
    }
  });

  return result ?? null;
}

async function createBallot(
  tx: Transaction,
  round: WrappedRound<RoundAdminFields | RoundPublicFields>,
  userId: string,
  ballotDto: SubmitBallotDto,
): Promise<WrappedBallot> {
  const includedApplicationIds = Object.keys(ballotDto.ballot);

  const applicationsForRound = await tx.query.applications.findMany({
    where: and(
      eq(applications.roundId, round.id),
      eq(applications.state, "approved"),
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
    roundId: round.id,
    voterUserId: userId,
    ballot: ballotDto.ballot
  });

  const ballot = await getBallot(round.round.urlSlug, userId, tx);
  if (!ballot) {
    throw new Error("Ballot not found after submission");
  }

  return ballot;
}


export async function submitBallot(
  userId: string,
  roundSlug: string,
  ballotDto: SubmitBallotDto,
): Promise<WrappedBallot> {
  const round = await getWrappedRound(roundSlug, userId);
  if (!round) {
    throw new NotFoundError("Round not found");
  }
  if (!round.isVoter) {
    throw new UnauthorizedError("You are not authorized to submit a ballot for this round");
  }
  if (round.round.state !== 'voting') {
    throw new BadRequestError("Round is not in voting state");
  }

  const existingBallot = await getBallot(roundSlug, userId);
  if (existingBallot) {
    throw new BadRequestError("You have already submitted a ballot for this round");
  }

  validateBallot(ballotDto.ballot, round.round.votingConfig);

  const result = await db.transaction(async (tx) => {
    return await createBallot(tx, round, userId, ballotDto);
  });

  return result;
}

export async function patchBallot(
  userId: string,
  roundSlug: string,
  ballotDto: SubmitBallotDto,
): Promise<WrappedBallot> {
  const result = await db.transaction(async (tx) => {
    const round = await getWrappedRound(roundSlug, userId);
    if (!round) {
      throw new NotFoundError("Round not found");
    }
    if (!round.isVoter) {
      throw new UnauthorizedError("You are not a voter for this round");
    }
    if (round.round.state !== 'voting') {
      throw new BadRequestError("Round is not in voting state");
    }

    console.log(ballotDto)

    validateBallot(ballotDto.ballot, round.round.votingConfig);

    const existingBallot = await getBallot(roundSlug, userId);
    if (!existingBallot) {
      throw new BadRequestError("Ballot not found");
    }

    await tx.update(ballots).set({
      ballot: ballotDto.ballot,
    }).where(
      eq(ballots.id, existingBallot.id),
    );

    const ballot = await getBallot(round.round.urlSlug, userId);
    if (!ballot) {
      throw new Error("Ballot not found after submission");
    }

    return ballot;
  });

  return result;
}

export async function getBallots(
  roundId: string,
  limit = 20,
  offset = 0,
  format: 'json' | 'csv' = 'json',
): Promise<WrappedBallot[] | string> {
  const submittedBallots = await db.query.ballots.findMany({
    where: eq(ballots.roundId, roundId),
    with: {
      voter: true,
    },
    limit,
    offset,
  });

  if (format === 'csv') {
    const csv = submittedBallots.map((r) => {
      return `${r.voter.walletAddress},${JSON.stringify(r.ballot)}`;
    }).join("\n");
    return csv;
  }

  return submittedBallots;
}
