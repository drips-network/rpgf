import { type Context, type Middleware } from "oak";
import { verify } from "djwt";
import type { AppJwtPayload } from "$app/types/auth.ts";
import { AppState } from "../../main.ts";
import { getJwtSecret } from "../services/authService.ts";
import { ExpiredJwtError } from "../errors/auth.ts";

export const enforceAuthenticationMiddleware: Middleware<AppState> = async (ctx: Context<AppState>, next) => {
  if (!ctx.state.user) {
    ctx.response.status = 401; // Unauthorized
    ctx.response.body = { error: "Unauthorized" };
    return;
  }
  await next();
}

export const authMiddleware: Middleware<AppState> = async (ctx: Context<AppState>, next) => {
  const authHeader = ctx.request.headers.get("Authorization");

  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    try {
      const jwtSecretKey = await getJwtSecret();
      const payload = await verify(token, jwtSecretKey) as AppJwtPayload;

      if (payload && payload.walletAddress && payload.userId) {
        ctx.state.user = {
          userId: payload.userId,
          walletAddress: payload.walletAddress,
        };
      } else {
        ctx.state.user = undefined;
        console.warn("JWT payload missing walletAddress:", payload);
      }
    } catch (error) {
      ctx.state.user = undefined;

      if (error instanceof RangeError) {
        throw new ExpiredJwtError();
      } else if (error instanceof Error) {
        console.debug("JWT verification failed:", error.message);
      } else {
        console.debug("JWT verification failed with an unknown error type:", error);
      }
    }
  } else {
    ctx.state.user = undefined; // No token provided
  }

  await next();
};
