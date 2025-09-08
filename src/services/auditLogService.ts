import { desc, eq, lt } from "drizzle-orm";
import { db, Transaction } from "../db/postgres.ts";
import { auditLogs, rounds } from "../db/schema.ts";
import { AuditLog, AuditLogAction, PayloadByAction } from "../types/auditLog.ts";
import { isUserRoundAdmin } from "./roundService.ts";

export async function createLog<TAction extends AuditLogAction>({
  type,
  roundId,
  userId,
  payload,
  tx,
}: {
  type: TAction;
  roundId: string;
  userId: string;
  payload: PayloadByAction[TAction];
  tx: Transaction;
}) {
  await (tx ?? db).insert(auditLogs).values({
    action: type,
    roundId,
    userId,
    payload,
  });
}

export async function getLogsByRoundId(
  roundId: string,
  limit: number = 50,
  next: string | undefined,
  requestingUserId: string,
): Promise<{ logs: AuditLog<AuditLogAction>[]; next: string | null }> {
  const round = await db.query.rounds.findFirst({
    where: eq(rounds.id, roundId),
    with: {
      admins: true,
    },
  });
  if (!round) {
    throw new Error("Round not found.");
  }
  if (!isUserRoundAdmin(round, requestingUserId)) {
    throw new Error("You are not authorized to view this round's logs.");
  }

  const query = db.query.auditLogs.findMany({
    where: next
      ? lt(auditLogs.createdAt, new Date(next))
      : eq(auditLogs.roundId, roundId),
    orderBy: desc(auditLogs.createdAt),
    limit: limit + 1,
    with: {
      user: {
        columns: {
          walletAddress: true,
        }
      }
    }
  });

  const logs = await query;

  const hasNext = logs.length > limit;
  if (hasNext) {
    logs.pop();
  }

  const nextCursor = hasNext ? logs[logs.length - 1].createdAt.toISOString() : null;

  return {
    logs: logs.map((log) => ({
      id: log.id,
      userWalletAddress: log.user.walletAddress,
      action: log.action,
      payload: log.payload as PayloadByAction[typeof log.action],
      createdAt: log.createdAt,
    })),
    next: nextCursor,
  };
}
