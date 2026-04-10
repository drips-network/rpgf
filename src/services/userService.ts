import { eq } from "drizzle-orm";
import { db, Transaction } from "../db/postgres.ts";
import { chains, users } from "../db/schema.ts";
import { BadRequestError } from "../errors/generic.ts";
import { Logger } from "./loggingService.ts";

const logger = new Logger("userService");

const USER_FIELDS = { id: users.id, walletAddress: users.walletAddress, whitelisted: users.whitelisted };

export async function getUser(id: string, chainId: number) {
  logger.info("Getting user", { id, chainId });

  const chain = await db.query.chains.findFirst({
    where: eq(chains.chainId, chainId),
    columns: {
      whitelistMode: true,
    },
  });

  if (!chain) {
    logger.error("Chain not found", { chainId });
    throw new BadRequestError(`Chain with ID ${chainId} not supported.`);
  }

  const user = await db.query.users.findFirst({
    where: eq(users.id, id),
    columns: {
      id: true,
      walletAddress: true,
      whitelisted: true,
    },
  });

  if (!user) {
    logger.info("User not found", { id });
    return null;
  }

  if (!chain.whitelistMode) {
    return {
      ...user,
      whitelisted: true, // Everyone is whitelisted if whitelist mode is off
    }
  }

  logger.info("User found", { id });
  return user;
}

export async function createOrGetUser(tx: Transaction, walletAddress: string) {
  const normalizedWalletAddress = walletAddress.toLowerCase();

  logger.info("Creating or getting user", { walletAddress });

  let user = await tx.select(USER_FIELDS)
    .from(users)
    .where(eq(users.walletAddress, normalizedWalletAddress))
    .limit(1)
    .then(res => res[0]);

  if (!user) {
    logger.info("User not found, creating new user", {
      walletAddress,
    });
    const newUsers = await tx.insert(users).values({
      walletAddress: normalizedWalletAddress,
    }).returning(USER_FIELDS);

    if (!newUsers || newUsers.length === 0) {
      logger.error("Failed to create user", { walletAddress });
      throw new Error(`Failed to create user for wallet address: ${walletAddress}`);
    }
    user = newUsers[0];
    logger.info("User created", { id: user.id });
  } else {
    logger.info("User found", { id: user.id });
  }

  return user;
}

export async function getUserByWalletAddress(
  walletAddress: string,
  tx?: Transaction,
) {
  const normalizedWalletAddress = walletAddress.toLowerCase();

  logger.info("Getting user by wallet address", {
    walletAddress: normalizedWalletAddress,
  });

  const user = await (tx ?? db).select(USER_FIELDS)
    .from(users)
    .where(eq(users.walletAddress, normalizedWalletAddress))
    .limit(1)
    .then((res) => res[0] ?? null);

  if (!user) {
    logger.info("User not found for wallet address", {
      walletAddress: normalizedWalletAddress,
    });
    return null;
  }

  logger.info("User found by wallet address", { id: user.id });
  return user;
}
