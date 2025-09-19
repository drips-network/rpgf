import type { RoundVoter } from '$app/types/roundVoter.ts';
import { eq } from "drizzle-orm";
import { db } from "../db/postgres.ts";
import { log, LogLevel } from "./loggingService.ts";
import { roundAdmins, rounds } from "../db/schema.ts";
import { createOrGetUser } from "./userService.ts";
import { isUserRoundAdmin } from "./roundService.ts";
import { SetRoundAdminsDto } from "../types/roundAdmin.ts";
import { BadRequestError, NotFoundError } from "../errors/generic.ts";
import { UnauthorizedError } from "../errors/auth.ts";
import { createLog } from "./auditLogService.ts";
import { AuditLogAction, AuditLogActorType } from "../types/auditLog.ts";

export async function setRoundAdmins(
  dto: SetRoundAdminsDto,
  requestingUserId: string,
  roundId: string,
): Promise<RoundVoter[]> {
  log(LogLevel.Info, "Setting round admins", {
    requestingUserId,
    roundId,
  });
  const result = await db.transaction(async (tx) => {
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

    const uniqueAddresses = new Set(dto.walletAddresses.map((addr) => addr.toLowerCase()));
    if (uniqueAddresses.size !== dto.walletAddresses.length) {
      log(LogLevel.Error, "Duplicate wallet addresses are not allowed");
      throw new BadRequestError("Duplicate wallet addresses are not allowed.");
    }

    // get the list of users for the provided wallet addresses, creating any that don't exist

    const users = await Promise.all(dto.walletAddresses.map((walletAddress) =>
      createOrGetUser(tx, walletAddress),
    ));

    // delete existing admins for the round

    await tx.delete(roundAdmins).where(eq(roundAdmins.roundId, roundId));

    // insert the new admins for the round

    const admins = await tx.insert(roundAdmins).values(
      users.map((u) => ({
        roundId,
        userId: u.id,
      })),
    ).returning();

    await createLog({
      type: AuditLogAction.RoundAdminsChanged,
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

    return admins.map((admin) => ({
      id: admin.userId,
      walletAddress: users.find((u) => u.id === admin.userId)!.walletAddress,
    }));
  });


  return result;
}

export async function getRoundAdminsByRoundId(roundId: string, requestingUserId: string): Promise<RoundVoter[]> {
  log(LogLevel.Info, "Getting round admins by round ID", {
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
    log(LogLevel.Error, "User is not authorized to view this round's admins", {
      requestingUserId,
      roundId,
    });
    throw new Error("You are not authorized to view this round's admins.");
  }

  const admins = await db.query.roundAdmins.findMany({
    where: eq(roundAdmins.roundId, roundId),
    with: {
      user: true,
    },
  });

  return admins.map((admin) => ({
    id: admin.user.id,
    walletAddress: admin.user.walletAddress,
  }));
}
