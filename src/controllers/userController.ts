import { RouteParams, RouterContext } from "oak";
import { AuthenticatedAppState } from "../../main.ts";
import { getUser } from "../services/userService.ts";
import { BadRequestError, NotFoundError } from "../errors/generic.ts";

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
    throw new NotFoundError();
  }

  ctx.response.status = 200;
  ctx.response.body = user;
}
