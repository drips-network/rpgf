import { db } from "$app/db/postgres.ts";
import { chains } from "$app/db/schema.ts";
import { z } from "zod";
import { ethereumAddressSchema } from "$app/types/shared.ts";

function getArgs() {
  const rawArgs = {
    chainId: Deno.args[0],
    gqlName: Deno.args[1],
    rpcUrl: Deno.args[2],
    whitelistMode: Deno.args[3],
    easAddress: Deno.args[4],
    applicationAttestationSchemaUID: Deno.args[5],
    applicationReviewAttestationSchemaUID: Deno.args[6],
  }

  const schema = z.object({
    chainId: z.string().transform(Number),
    gqlName: z.string(),
    rpcUrl: z.string().url(),
    whitelistMode: z.string().transform((val) => val === "true"),
    easAddress: ethereumAddressSchema.nullish(),
    applicationAttestationSchemaUID: z.string().nullish(),
    applicationReviewAttestationSchemaUID: z.string().nullish(),
  });

  const parsedArgs = schema.safeParse(rawArgs);
  if (!parsedArgs.success) {
    console.error("Invalid arguments:", parsedArgs.error);
    console.log("Usage: deno task configure-chain <chainId> <gqlName> <rpcUrl> <whitelistMode (true or false)> <easAddress>? <applicationAttestationSchemaUID>? <applicationReviewAttestationSchemaUID>?. The last three EAS-related args are optional.");
    Deno.exit(1);
  }

  return parsedArgs.data;
}

export async function addChain(
  chainId: number,
  gqlName: string,
  rpcUrl: string,
  whitelistMode: boolean,
  easAddress?: string,
  applicationAttestationSchemaUID?: string,
  applicationReviewAttestationSchemaUID?: string,
) {
  const existingChain = await db.query.chains.findFirst({
    where: (chains, { eq }) => eq(chains.chainId, chainId),
  }); 
  if (existingChain) {
    throw new Error(`Chain with ID ${chainId} already exists.`);
  }

  const attestationSetup = easAddress && applicationAttestationSchemaUID && applicationReviewAttestationSchemaUID
    ? {
        easAddress,
        applicationAttestationSchemaUID,
        applicationReviewAttestationSchemaUID,
      }
    : null;

  await db.insert(chains).values({
    chainId,
    gqlName,
    rpcUrl,
    whitelistMode,
    attestationSetup,
  });
}

async function main() {
  const {
    chainId,
    gqlName,
    rpcUrl,
    easAddress,
    whitelistMode,
    applicationAttestationSchemaUID,
    applicationReviewAttestationSchemaUID,
  } = getArgs();

  const existingChain = await db.query.chains.findFirst({
    where: (chains, { eq }) => eq(chains.chainId, chainId),
  }); 
  if (existingChain) {
    console.error(`❌ Chain with ID ${chainId} already exists.`);
    Deno.exit(1);
  }

  await addChain(
    chainId,
    gqlName,
    rpcUrl,
    whitelistMode,
    easAddress ?? undefined,
    applicationAttestationSchemaUID ?? undefined,
    applicationReviewAttestationSchemaUID ?? undefined,
  );

  console.log(`✅ We good. Chain with ID ${chainId} added successfully.`);

  console.log(`Chain details: 
    Chain ID: ${chainId}
    GraphQL Name: ${gqlName}
    RPC URL: ${rpcUrl}
    EAS Address: ${easAddress ?? "Not provided"}
    User whitelisting enabled: ${whitelistMode}
    Application Attestation Schema UID: ${applicationAttestationSchemaUID ?? "Not provided"}
    Application Review Attestation Schema UID: ${applicationReviewAttestationSchemaUID ?? "Not provided"}`);

  Deno.exit(0);
}

if (import.meta.main) {
  main();
}
