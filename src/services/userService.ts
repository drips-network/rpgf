import { eq } from "drizzle-orm";
import { db, Transaction } from "../db/postgres.ts";
import { users } from "../db/schema.ts";

const USER_FIELDS = { id: users.id, walletAddress: users.walletAddress, whitelisted: users.whitelisted };

export async function getUser(id: string) {
  const user = await db.query.users.findFirst({
    where: eq(users.id, id),
    columns: {
      id: true,
      walletAddress: true,
      whitelisted: true,
    },
  });
  
  if (Deno.env.get("REQUIRE_WHITELIST_FOR_CREATING_ROUNDS") !== "true") {
    return {
      ...user,
      whitelisted: true, // Everyone is whitelisted if the environment variable is false
    }
  }

  return user;
}

export async function createOrGetUser(tx: Transaction, walletAddress: string) {
  const normalizedWalletAddress = walletAddress.toLowerCase();

  let user = await tx.select(USER_FIELDS)
    .from(users)
    .where(eq(users.walletAddress, normalizedWalletAddress))
    .limit(1)
    .then(res => res[0]);

  if (!user) {
    const newUsers = await tx.insert(users).values({
      walletAddress: normalizedWalletAddress,
    }).returning(USER_FIELDS);

    if (!newUsers || newUsers.length === 0) {
      throw new Error(`Failed to create user for wallet address: ${walletAddress}`);
    }
    user = newUsers[0];
  }

  return user;
}
