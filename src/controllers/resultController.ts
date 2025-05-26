import { RouteParams, RouterContext } from "oak";
import { AuthenticatedAppState } from "../../main.ts";
import { BadRequestError, NotFoundError } from "../errors/generic.ts";
import { getWrappedRoundPublic, isUserRoundAdmin } from "../services/roundService.ts";
import { UnauthorizedError } from "../errors/auth.ts";
import { getResults } from "../services/resultsService.ts";

export async function getResultsController(
  ctx: RouterContext<
      "/api/rounds/:slug/results",
      RouteParams<"/api/rounds/:slug/results">,
      AuthenticatedAppState
    >,
) {
  const roundSlug = ctx.params.slug;
  const userId = ctx.state.user.userId;
  const format = ctx.request.url.searchParams.get("format") || "json";

  if (format !== "json" && format !== "csv") {
    throw new BadRequestError("Invalid format. Possible: json, csv");
  }

  const isAdmin = await isUserRoundAdmin(userId, roundSlug);
  if (!isAdmin) {
    throw new UnauthorizedError("You are not an admin of this round");
  }

  const round = (await getWrappedRoundPublic(roundSlug))?.round;
  if (!round) {
    throw new NotFoundError("Round not found");
  }
  if (!(round.state === "results" || round.state === "pending-results")) {
    throw new BadRequestError("Round voting hasn't concluded yet");
  }

  const ballots = await getResults(roundSlug, format);

  ctx.response.status = 200;
  ctx.response.body = ballots;
}
