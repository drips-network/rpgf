import { type Context, type Middleware } from "oak";
import { verify } from "djwt";
import type { AppJwtPayload } from "$app/types/auth.ts";
import { AppState } from "../../main.ts";
import { getJwtSecret } from "../services/authService.ts";

export const authMiddleware: Middleware = async (ctx: Context<AppState>, next) => {
  const authHeader = ctx.request.headers.get("Authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7); // Remove "Bearer " prefix
    try {
      const jwtSecretKey = await getJwtSecret();
      const payload = await verify(token, jwtSecretKey) as AppJwtPayload; // Cast to AppJwtPayload

      if (payload && payload.walletAddress) {
        ctx.state.user = {
          walletAddress: payload.walletAddress,
        };
      } else {
        // This case should ideally not happen if token creation ensures walletAddress
        console.warn("JWT payload missing walletAddress:", payload);
      }
    } catch (error) {
      // Token verification failed (e.g., expired, invalid signature)
      if (error instanceof Error) {
        console.debug("JWT verification failed:", error.message);
      } else {
        console.debug("JWT verification failed with an unknown error type:", error);
      }
    }
  }

  await next();
};
