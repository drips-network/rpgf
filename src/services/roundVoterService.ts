import type { SetRoundVotersDto, RoundVoter } from '$app/types/roundVoter.ts';
import { eq } from "drizzle-orm";
import { db } from "../db/postgres.ts";
import { log, LogLevel } from "./loggingService.ts";
import { rounds, roundVoters } from "../db/schema.ts";
import { createOrGetUser } from "./userService.ts";
import { inferRoundState, isUserRoundAdmin } from "./roundService.ts";
import { BadRequestError, NotFoundError } from "../errors/generic.ts";
import { UnauthorizedError } from "../errors/auth.ts";
import { createLog } from "./auditLogService.ts";
import { AuditLogAction, AuditLogActorType } from "../types/auditLog.ts";
import { RoundState } from "../types/round.ts";

export async function setRoundVoters(
  dto: SetRoundVotersDto,
  requestingUserId: string,
  roundId: string,
): Promise<RoundVoter[]> {
  log(LogLevel.Info, "Setting round voters", {
    requestingUserId,
    roundId,
  });
  const round = await db.query.rounds.findFirst({
    where: eq(rounds.id, roundId),
    with: {
      admins: true,
    }
  });
  if (!round) {
    log(LogLevel.Error, "Round not found", { roundId });
    throw new NotFoundError("Round not found.");
  }
  if (!isUserRoundAdmin(round, requestingUserId)) {
    log(LogLevel.Error, "User is not authorized to modify this round", {
      requestingUserId,
      roundId,
    });
    throw new UnauthorizedError("You are not authorized to modify this round.");
  }

  const roundState = inferRoundState(round);

  const editingAllowedInStates: RoundState[] = [
    'intake',
    'pending-intake',
    'pending-voting',
  ];

  if (roundState && !editingAllowedInStates.includes(roundState)) {
    log(LogLevel.Error, "Round voters can no longer be edited for this round", {
      roundId,
    });
    throw new BadRequestError("Round voters can no longer be edited for this round");
  }

  const uniqueAddresses = new Set(dto.walletAddresses.map((addr) => addr.toLowerCase()));
  if (uniqueAddresses.size !== dto.walletAddresses.length) {
    log(LogLevel.Error, "Duplicate wallet addresses are not allowed");
    throw new BadRequestError("Duplicate wallet addresses are not allowed.");
  }

  const result = await db.transaction(async (tx) => {

    await createLog({
      type: AuditLogAction.RoundVotersChanged,
      roundId: round.id,
      actor: {
        type: AuditLogActorType.User,
        userId: requestingUserId,
      },
      payload: {
        walletAddresses: dto.walletAddresses,
      },
      tx,
    })

    // get the list of users for the provided wallet addresses, creating any that don't exist

    const users = await Promise.all(dto.walletAddresses.map((walletAddress) =>
      createOrGetUser(tx, walletAddress),
    ));

    // get the list of existing voters for the round

    const existingVoters = await tx.query.roundVoters.findMany({
      where: (rv, { eq }) => eq(rv.roundId, roundId),
      columns: {
        userId: true,
      },
    });

    // check that we're not deleting any voters that already submitted a ballot
    const existingVoterIds = existingVoters.map((v) => v.userId);
    const newVoterIds = users.map((u) => u.id);
    const votersToRemove = existingVoterIds.filter((id) => !newVoterIds.includes(id));

    if (votersToRemove.length > 0) {
      const ballots = await tx.query.ballots.findMany({
        where: (b, { and, eq, inArray }) =>
          and(
            eq(b.roundId, roundId),
            inArray(b.voterUserId, votersToRemove),
          ),
        columns: {
          id: true,
        },
      });

      if (ballots.length > 0) {
        throw new Error("Cannot remove voters that have already submitted a ballot.");
      }
    }

    // delete existing voters for the round

    await tx.delete(roundVoters).where(eq(roundVoters.roundId, roundId));

    // insert the new voters for the round

    if (users.length === 0) {
      return [];
    }

    const voters = await tx.insert(roundVoters).values(
      users.map((u) => ({
        roundId,
        userId: u.id,
      })),
    ).returning();

    return voters.map((voter) => ({
      id: voter.userId,
      walletAddress: users.find((u) => u.id === voter.userId)!.walletAddress,
    }));
  });

  return result;
}

export async function getRoundVotersByRoundId(roundId: string, requestingUserId: string): Promise<RoundVoter[]> {
  log(LogLevel.Info, "Getting round voters by round ID", {
    roundId,
    requestingUserId,
  });
  const round = await db.query.rounds.findFirst({
    where: eq(rounds.id, roundId),
    with: {
      admins: true,
    }
  });
  if (!round) {
    log(LogLevel.Error, "Round not found", { roundId });
    throw new Error("Round not found.");
  }
  if (!isUserRoundAdmin(round, requestingUserId)) {
    log(LogLevel.Error, "User is not authorized to view this round's voters", {
      requestingUserId,
      roundId,
    });
    throw new Error("You are not authorized to view this round's voters.");
  }

  const voters = await db.query.roundVoters.findMany({
    where: eq(roundVoters.roundId, roundId),
    with: {
      user: true,
    },
  });

  return voters.map((voter) => ({
    id: voter.user.id,
    walletAddress: voter.user.walletAddress,
  }));
}
