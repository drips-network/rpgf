import type { RoundVoter } from '$app/types/roundVoter.ts';
import { eq } from "drizzle-orm";
import { db } from "../db/postgres.ts";
import { roundAdmins, rounds } from "../db/schema.ts";
import { createOrGetUser } from "./userService.ts";
import { isUserRoundAdmin } from "./roundService.ts";
import { SetRoundAdminsDto } from "../types/roundAdmin.ts";

export async function setRoundAdmins(
  dto: SetRoundAdminsDto,
  requestingUserId: string,
  roundId: string,
): Promise<RoundVoter[]> {
  const round = await db.query.rounds.findFirst({
    where: eq(rounds.id, roundId),
    with: {
      admins: true,
    }
  });
  if (!round) {
    throw new Error("Round not found.");
  }
  if (!isUserRoundAdmin(round, requestingUserId)) {
    throw new Error("You are not authorized to modify this round.");
  }

  const result = await db.transaction(async (tx) => {
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

    return admins.map((admin) => ({
      id: admin.userId,
      walletAddress: users.find((u) => u.id === admin.userId)!.walletAddress,
    }));
  });

  return result;
}

export async function getRoundAdminsByRoundId(roundId: string, requestingUserId: string): Promise<RoundVoter[]> {
  const round = await db.query.rounds.findFirst({
    where: eq(rounds.id, roundId),
    with: {
      admins: true,
    }
  });
  if (!round) {
    throw new Error("Round not found.");
  }
  if (!isUserRoundAdmin(round, requestingUserId)) {
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
