import { SiweMessage } from "siwe";
import { create as createJwt, getNumericDate, verify } from "djwt";
import { db } from "$app/db/postgres.ts";
import { nonces, refreshTokens, users } from "$app/db/schema.ts";
import { and, eq, lt } from "drizzle-orm";
import type { AccessTokenJwtPayload, RefreshTokenJwtPayload } from "$app/types/auth.ts";
import { crypto } from "std/crypto"; // Updated import alias
import { Context } from "oak";
import { AppState, AuthenticatedAppState } from "../../main.ts";
import { UnauthenticatedError, UnauthorizedError } from "../errors/auth.ts";
import { BadRequestError } from "../errors/generic.ts";

const NONCE_EXPIRATION_MS = 5 * 60 * 1000; // 5 minutes

export function enforceAuthentication(ctx: Context<AppState>): ctx is Context<AuthenticatedAppState> {
  if (!ctx.state.user) {
    ctx.response.status = 401; // Unauthorized
    ctx.response.body = { error: "Unauthorized" };

    throw new UnauthenticatedError();
  }
  return true;
}

// Helper to generate a cryptographically secure random string for nonce
function generateSecureNonce(): string {
  const buffer = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(buffer, (byte: number) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function generateNonce(): Promise<string> {
  const nonce = generateSecureNonce();
  const expiresAt = new Date(Date.now() + NONCE_EXPIRATION_MS);

  await db.insert(nonces).values({ nonce, expiresAt });

  return nonce;
}

async function consumeNonce(nonce: string): Promise<boolean> {
  const now = new Date();

  // Clean up expired nonces first
  await db.delete(nonces).where(lt(nonces.expiresAt, now));

  const nonceRecord = await db.query.nonces.findFirst({
    where: eq(nonces.nonce, nonce),
  });

  if (!nonceRecord) {
    return false; // Nonce not found
  }

  if (now > nonceRecord.expiresAt) {
    await db.delete(nonces).where(eq(nonces.nonce, nonce));
    return false; // Expired
  }

  await db.delete(nonces).where(eq(nonces.nonce, nonce)); // Valid and consumed
  return true;
}

export async function getJwtSecret(): Promise<CryptoKey> {
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

async function createRefreshToken(
  walletAddress: string,
  userId: string,
) {
  const jwtSecretKey = await getJwtSecret();
  const expirationMinutes = parseInt(
    Deno.env.get("REFRESH_JWT_EXPIRATION_MINUTES") || "60",
  );

  const payload: RefreshTokenJwtPayload = {
    type: 'refresh',
    walletAddress,
    userId,
    exp: getNumericDate(expirationMinutes * 60), // Expires in X minutes
    iat: getNumericDate(0), // Issued at now
  };

  const jwt = await createJwt({ alg: "HS256", typ: "JWT" }, payload, jwtSecretKey);

  // Store the refresh token in the database
  await db.insert(refreshTokens).values({
    token: jwt,
    userId,
  });

  return jwt;
}

export async function verifySignatureAndCreateRefreshToken(
  clientSiweMessage: Partial<SiweMessage>, // Fields sent by client
  signature: string,
): Promise<string> {
  const siweMessageInstance = new SiweMessage(clientSiweMessage);

  if (!(await consumeNonce(siweMessageInstance.nonce))) {
    throw new BadRequestError("Invalid or expired nonce.");
  }

  const { success } = await siweMessageInstance.verify(
    { signature },
  );

  if (!success) {
    throw new UnauthorizedError("Invalid SIWE signature.");
  }

  // Signature is valid, proceed to find or create user

  const walletAddress = siweMessageInstance.address.toLowerCase();
  let user = await db.query.users.findFirst({
    where: eq(users.walletAddress, walletAddress),
  });

  if (!user) {
    user = (await db.insert(users).values({
      walletAddress: walletAddress,
    }).returning())[0];
  }

  return await createRefreshToken(walletAddress, user.id);
}

export async function createAccessToken(
  refreshToken: string,
): Promise<string> {
  const jwtSecretKey = await getJwtSecret();
  const payload = await verify(refreshToken, jwtSecretKey) as RefreshTokenJwtPayload;
  const { userId, type, walletAddress } = payload ?? {};

  if (!payload || type !== 'refresh' || !walletAddress || !userId) {
    throw new Error("Invalid refresh token");
  }

  const storedRefreshToken = await db.query.refreshTokens.findFirst({
    where: and(
      eq(refreshTokens.token, refreshToken),
      eq(refreshTokens.userId, userId),
    ),
  });

  if (!storedRefreshToken || storedRefreshToken.revoked) {
    throw new UnauthorizedError();
  }

  // Create a new access token with the same userId and walletAddress
  const accessTokenPayload: AccessTokenJwtPayload = {
    type: 'access',
    walletAddress: walletAddress,
    userId: userId,
    exp: getNumericDate(15 * 60), // Expires in 15 minutes
    iat: getNumericDate(0), // Issued at now
  };

  const accessToken = await createJwt({ alg: "HS256", typ: "JWT" }, accessTokenPayload, jwtSecretKey);

  return accessToken;
}

export async function rotateRefreshToken(
  oldRefreshToken: string,
): Promise<string | null> {
  const jwtSecretKey = await getJwtSecret();

  let payload: RefreshTokenJwtPayload | null = null;
  try {
    payload = await verify(oldRefreshToken, jwtSecretKey) as RefreshTokenJwtPayload;
  } catch {
    // If verification fails, payload will remain null
    payload = null;
  }

  if (!payload || payload.type !== 'refresh') {
    throw new UnauthorizedError("Invalid refresh token");
  }

  // Revoke the old refresh token
  await db.update(refreshTokens)
    .set({ revoked: true })
    .where(eq(refreshTokens.token, oldRefreshToken));

  // Create a new refresh token
  return await createRefreshToken(payload.walletAddress, payload.userId);
}

export async function revokeRefreshToken(
  refreshToken: string,
): Promise<void> {
  const jwtSecretKey = await getJwtSecret();
  const payload = await verify(refreshToken, jwtSecretKey) as RefreshTokenJwtPayload;

  if (!payload || payload.type !== 'refresh') {
    throw new UnauthorizedError("Invalid refresh token");
  }

  // Revoke the refresh token
  await db.update(refreshTokens)
    .set({ revoked: true })
    .where(eq(refreshTokens.token, refreshToken));
}
