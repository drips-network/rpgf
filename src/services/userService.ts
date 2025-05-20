import { eq } from "drizzle-orm";
import { Transaction } from "../db/postgres.ts";
import { users } from "../db/schema.ts";

export default async function createOrGetUser(tx: Transaction, walletAddress: string) {
  const normalizedWalletAddress = walletAddress.toLowerCase();

  const user = await tx.select({ id: users.id })
    .from(users)
    .where(eq(users.walletAddress, normalizedWalletAddress))
    .limit(1)
    .then(res => res[0]);

  let userId: string;

  if (user) {
    userId = user.id;
  } else {
    const newUsers = await tx.insert(users).values({
      walletAddress: normalizedWalletAddress,
    }).returning({ id: users.id });

    if (!newUsers || newUsers.length === 0) {
      throw new Error(`Failed to create user for wallet address: ${walletAddress}`);
    }
    userId = newUsers[0].id;
  }

  return userId;
}
