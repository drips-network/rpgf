import { RouteParams, RouterContext } from "oak";
import { AuthenticatedAppState } from "../../main.ts";
import { getUser } from "../services/userService.ts";
import { NotFoundError } from "../errors/generic.ts";

export async function getOwnUserDataController(
  ctx: RouterContext<
    "/api/users/me",
    RouteParams<"/api/users/me">,
    AuthenticatedAppState
  >
) {
  const user = await getUser(ctx.state.user.userId);

  if (!user) {
    throw new NotFoundError();
  }

  ctx.response.status = 200;
  ctx.response.body = user;
}
