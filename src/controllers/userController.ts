import { RouteParams, RouterContext } from "oak";
import { AuthenticatedAppState } from "../../main.ts";
import { getUser } from "../services/userService.ts";
import { BadRequestError } from "../errors/generic.ts";
import { UnauthorizedError } from "../errors/auth.ts";

export async function getOwnUserDataController(
  ctx: RouterContext<
    "/api/users/me",
    RouteParams<"/api/users/me">,
    AuthenticatedAppState
  >
) {
  const chainId = Number(ctx.request.url.searchParams.get("chainId")) || null;

  if (!chainId) {
    throw new BadRequestError("chainId query parameter is required.");
  }

  const user = await getUser(ctx.state.user.userId, chainId);

  if (!user) {
    // This should not happen for real, but it may happen in tests (when users are deleted)
    
    console.error(
      `Authenticated user with ID ${ctx.state.user.userId} not found in DB.`
    );

    throw new UnauthorizedError();
  }

  ctx.response.status = 200;
  ctx.response.body = user;
}
