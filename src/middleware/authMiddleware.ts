import { type Context, type Middleware } from "oak";
import { verify } from "djwt";
import type { AccessTokenJwtPayload } from "$app/types/auth.ts";
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
      const payload = await verify(token, jwtSecretKey) as AccessTokenJwtPayload;

      if (payload && payload.walletAddress && payload.userId && payload.type === "access") {
        ctx.state.user = {
          userId: payload.userId,
          walletAddress: payload.walletAddress,
        };
      } else {
        ctx.state.user = undefined;
      }
    } catch (error) {
      ctx.state.user = undefined;

      if (error instanceof RangeError) {
        throw new ExpiredJwtError();
      }
    }
  } else {
    ctx.state.user = undefined; // No token provided
  }

  await next();
};
