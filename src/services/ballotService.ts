import { and, eq } from "drizzle-orm";
import { applications, ballots, roundVoters } from "../db/schema.ts";
import { db } from "../db/postgres.ts";
import { Ballot, SubmitBallotDto } from "../types/ballot.ts";
import { BadRequestError } from "../errors/generic.ts";
import { EthereumAddress } from "../types/shared.ts";

export async function isUserRoundVoter(
  userId: number | undefined,
  roundId: number,
): Promise<boolean> {
  if (!userId) {
    return false;
  }

  const result = await db.query.roundVoters.findFirst({
    where: and(
      eq(roundVoters.roundId, roundId),
      eq(roundVoters.userId, userId),
    ),
  });

  return !!result;
}

export async function getBallot(
  roundId: number,
  userId: number,
): Promise<Ballot | null> {
  const result = await db.query.ballots.findFirst({
    where: and(
      eq(ballots.roundId, roundId),
      eq(ballots.voterUserId, userId),
    ),
  });

  return result ?? null;
}

export async function submitBallot(
  userId: number,
  ballotDto: SubmitBallotDto,
): Promise<Ballot> {
  const includedApplicationIds = Object.keys(ballotDto.ballot).map(Number);

  const applicatons = await db.query.applications.findMany({
    where: and(
      eq(applications.roundId, ballotDto.roundId),
      eq(applications.state, "approved"),
    ),
  });

  // throw bad request if any of the application ids are not in the approved applications
  const approvedApplicationIds = applicatons.map((app) => app.id);
  const invalidApplicationIds = includedApplicationIds.filter(
    (id) => !approvedApplicationIds.includes(id),
  );
  if (invalidApplicationIds.length > 0) {
    throw new BadRequestError(
      `Invalid application IDs: ${invalidApplicationIds.join(", ")}`,
    );
  }

  const result = await db.insert(ballots).values({
    roundId: ballotDto.roundId,
    voterUserId: userId,
    ballot: ballotDto.ballot
  }).returning();

  if (!result || result.length === 0) {
    throw new Error("Failed to submit ballot");
  }

  return result[0];
}

export async function getBallots(
  roundId: number,
  limit = 20,
  offset = 0,
): Promise<{ voterWalletAddress: EthereumAddress; ballot: Ballot | null }[]> {
  const submittedBallots = await db.query.ballots.findMany({
    where: eq(ballots.roundId, roundId),
    limit,
    offset,
  });

  const voters = await db.query.roundVoters.findMany({
    where: eq(roundVoters.roundId, roundId),
    with: {
      user: true,
    }
  });

  const result = voters.map((voter) => {
    const ballot = submittedBallots.find(
      (b) => b.voterUserId === voter.userId,
    );
    return {
      voterWalletAddress: voter.user.walletAddress,
      ballot: ballot ? ballot.ballot : null,
    };
  });

  return result;
}
