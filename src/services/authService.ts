import { SiweMessage } from "siwe";
import { create as createJwt, getNumericDate } from "djwt";
import { db } from "$app/db/postgres.ts";
import { users } from "$app/db/schema.ts";
import { eq } from "drizzle-orm";
import type { AppJwtPayload } from "$app/types/auth.ts";
import { crypto } from "std/crypto"; // Updated import alias

// In-memory nonce store: Map<nonce, expirationTimestamp>
const nonceStore = new Map<string, number>();
const NONCE_EXPIRATION_MS = 5 * 60 * 1000; // 5 minutes

// Helper to generate a cryptographically secure random string for nonce
function generateSecureNonce(): string {
  const buffer = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(buffer, (byte: number) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function generateNonce(): string {
  const nonce = generateSecureNonce();
  const expiresAt = Date.now() + NONCE_EXPIRATION_MS;
  nonceStore.set(nonce, expiresAt);

  // Optional: Clean up expired nonces periodically or on access
  // For simplicity, we'll let them expire and be overwritten or ignored
  return nonce;
}

function consumeNonce(nonce: string): boolean {
  const expiresAt = nonceStore.get(nonce);
  if (!expiresAt) {
    return false; // Nonce not found
  }
  if (Date.now() > expiresAt) {
    nonceStore.delete(nonce); // Expired
    return false;
  }
  nonceStore.delete(nonce); // Valid and consumed
  return true;
}

async function getJwtSecret(): Promise<CryptoKey> {
  const secret = Deno.env.get("JWT_SECRET");
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is not set.");
  }
  // Prepare the key for HMAC SHA-256.
  // The key material should be a Uint8Array.
  const keyData = new TextEncoder().encode(secret);
  return await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false, // not extractable
    ["sign", "verify"],
  );
}

export async function verifySignatureAndCreateToken(
  clientSiweMessage: Partial<SiweMessage>, // Fields sent by client
  signature: string,
): Promise<string | null> {
  try {
    // Reconstruct the SiweMessage. Client should provide all necessary fields.
    // Ensure domain, statement, etc., are what your server expects or are part of clientSiweMessage.
    const siweMessageInstance = new SiweMessage(clientSiweMessage);

    if (!consumeNonce(siweMessageInstance.nonce)) {
      console.warn("Invalid or expired nonce:", siweMessageInstance.nonce);
      return null;
    }

    // Verify the signature
    // The SIWE library's verify method might need options or specific setup.
    // We assume the client provides necessary fields like domain, issuedAt, etc.
    // or the server fills them if they are fixed (e.g. server's domain).
    // For `siwe.ts` library, verify is a method on the instance.
    const { success, error } = await siweMessageInstance.verify(
      { signature },
      // { suppressExceptions: true } // Use if you prefer error codes over exceptions
    );

    if (!success) {
      console.warn("SIWE signature verification failed:", error);
      return null;
    }

    // Signature is valid, proceed to find or create user
    const walletAddress = siweMessageInstance.address.toLowerCase();
    let user = await db.query.users.findFirst({
      where: eq(users.walletAddress, walletAddress),
    });

    if (!user) {
      const newUserResult = await db.insert(users).values({
        walletAddress: walletAddress,
      }).returning();
      if (!newUserResult || newUserResult.length === 0) {
        throw new Error("Failed to create user after SIWE verification.");
      }
      user = newUserResult[0];
    }

    // Create JWT
    const jwtSecretKey = await getJwtSecret();
    const expirationMinutes = parseInt(
      Deno.env.get("JWT_EXPIRATION_MINUTES") || "60",
    );
    const payload: AppJwtPayload = {
      walletAddress: user.walletAddress,
      exp: getNumericDate(expirationMinutes * 60), // Expires in X minutes
      iat: getNumericDate(0), // Issued at now
    };

    const jwt = await createJwt({ alg: "HS256", typ: "JWT" }, payload, jwtSecretKey);
    return jwt;
  } catch (e) {
    console.error("Error in verifySignatureAndCreateToken:", e);
    return null;
  }
}
