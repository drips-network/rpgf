import { db } from "$app/db/postgres.ts";
import { rounds, users, roundAdmins } from "$app/db/schema.ts";
import type { CreateRoundDto, Round } from "$app/types/round.ts";
import { eq } from "drizzle-orm";

export async function createRound(
  roundDto: CreateRoundDto,
  creatorUserId: number, // Assume this comes from an authenticated session
): Promise<Round> {
  // Drizzle's transaction API
  const result = await db.transaction(async (tx) => {
    // 1. Insert the round
    // Drizzle ORM automatically maps JS Date objects to TIMESTAMPTZ
    // and objects to JSONB if the schema types ($type<T>) are set.
    const newRounds = await tx.insert(rounds).values({
      name: roundDto.name,
      description: roundDto.description,
      applicationPeriodStart: new Date(roundDto.applicationPeriodStart),
      applicationPeriodEnd: new Date(roundDto.applicationPeriodEnd),
      votingPeriodStart: new Date(roundDto.votingPeriodStart),
      votingPeriodEnd: new Date(roundDto.votingPeriodEnd),
      resultsPeriodStart: new Date(roundDto.resultsPeriodStart),
      applicationFormat: roundDto.applicationFormat, // Drizzle handles stringification for JSONB
      votingConfig: roundDto.votingConfig,         // Drizzle handles stringification for JSONB
      createdByUserId: creatorUserId,
      // createdAt and updatedAt have defaultNow() in schema
    }).returning();

    if (!newRounds || newRounds.length === 0) {
      throw new Error("Failed to create round: No record returned.");
    }
    const newRound = newRounds[0];

    if (roundDto.adminWalletAddresses && roundDto.adminWalletAddresses.length > 0) {
      for (const adminAddress of roundDto.adminWalletAddresses) {
        const normalizedAdminAddress = adminAddress.toLowerCase();

        const adminUser = await tx.select({ id: users.id })
          .from(users)
          .where(eq(users.walletAddress, normalizedAdminAddress))
          .limit(1)
          .then(res => res[0]);

        let adminUserId: number;
        if (adminUser) {
          adminUserId = adminUser.id;
        } else {
          // If admin user doesn't exist, create them
          const newAdminUsers = await tx.insert(users).values({
            walletAddress: normalizedAdminAddress,
          }).returning({ id: users.id });

          if (!newAdminUsers || newAdminUsers.length === 0) {
            throw new Error(`Failed to create user for admin: ${adminAddress}`);
          }
          adminUserId = newAdminUsers[0].id;
        }

        // Assign admin to round
        // ON CONFLICT DO NOTHING can be handled by checking existence first or a raw query if Drizzle doesn't support it directly here.
        // For simplicity, let's assume we attempt insert and handle potential unique constraint violation if not using ON CONFLICT.
        // Or, more simply, check if the admin already exists for the round.
        const existingAdmin = await tx.select()
          .from(roundAdmins)
          .where(eq(roundAdmins.roundId, newRound.id) && eq(roundAdmins.userId, adminUserId))
          .limit(1);

        if (existingAdmin.length === 0) {
          await tx.insert(roundAdmins).values({
            roundId: newRound.id,
            userId: adminUserId,
          });
        }
      }
    }
    // The 'returning' clause gives us the complete round object as defined by the schema.
    // Drizzle automatically maps column names (snake_case) to field names (camelCase) as defined in schema.ts
    // Dates are Date objects, JSONB fields are typed objects.
    return newRound;
  });

  // The result from tx.insert().returning() should match the Round type if schema is correct.
  // Drizzle's .returning() by default returns all columns.
  // Ensure the returned 'result' (which is 'newRound' from the transaction) matches the 'Round' interface.
  // The types ApplicationFormat and VotingConfiguration are used in schema.ts for jsonb columns,
  // so Drizzle should provide them as objects.
  return result as Round; // Cast if confident, or perform a more detailed mapping if necessary.
}
