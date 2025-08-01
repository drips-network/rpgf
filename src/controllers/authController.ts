import { Context, Status } from "oak";
import * as authService from "$app/services/authService.ts";
import type { SiweVerifyRequest } from "$app/types/auth.ts";
import { UnauthorizedError } from "../errors/auth.ts";

export async function getNonceController(ctx: Context) {
  try {
    const nonce = await authService.generateNonce();
    ctx.response.status = Status.OK;
    ctx.response.body = { nonce };
  } catch (error) {
    console.error("Error in getNonceController:", error);
    ctx.response.status = Status.InternalServerError;
    ctx.response.body = { message: "Failed to generate nonce." };
  }
}

export async function logInController(ctx: Context) {
  if (!ctx.request.hasBody) {
    ctx.throw(Status.BadRequest, "Missing request body");
  }
  const body = await ctx.request.body.json();
  const { message: clientSiweMessageFields, signature } = body as SiweVerifyRequest;

  if (!clientSiweMessageFields || !signature) {
    ctx.throw(Status.BadRequest, "Missing SIWE message or signature in request body.");
  }
  
  const refreshJwt = await authService.verifySignatureAndCreateRefreshToken(
    clientSiweMessageFields,
    signature,
  );

  const accessTokenJwt = await authService.createAccessToken(refreshJwt);

  ctx.response.status = Status.OK;
  ctx.cookies.set('refreshToken', refreshJwt);
  ctx.response.body = { accessToken: accessTokenJwt };
}

export async function refreshAccessTokenController(ctx: Context) {
  const refreshToken = await ctx.cookies.get('refreshToken');

  if (!refreshToken) {
    ctx.response.status = Status.Unauthorized;
    ctx.response.body = { message: "No valid refresh token provided." };
    return;
  }
  
  const newRefreshToken = await authService.rotateRefreshToken(refreshToken);
  const accessToken = await authService.createAccessToken(newRefreshToken);

  ctx.cookies.set('refreshToken', newRefreshToken);
  ctx.response.body = { accessToken };
  ctx.response.status = Status.OK;
}

export async function logoutController(ctx: Context) {
  const refreshToken = await ctx.cookies.get('refreshToken');
  if (!refreshToken) {
    throw new UnauthorizedError("No valid refresh token provided.");
  }

  await authService.revokeRefreshToken(refreshToken);

  ctx.cookies.delete('refreshToken');
  ctx.response.status = Status.OK;
  ctx.response.body = { message: "Logged out successfully." };
}
