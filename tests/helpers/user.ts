import { db } from "$app/db/postgres.ts";
import { users } from "$app/db/schema.ts";
import { ethers } from "ethers";

export async function createUser() {
  const wallet = ethers.Wallet.createRandom();
  const [user] = await db.insert(users).values({
    walletAddress: wallet.address.toLowerCase(),
  }).returning();

  return { ...user, wallet };
}
