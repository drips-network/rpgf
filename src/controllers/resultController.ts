import { RouteParams, RouterContext } from "oak";
import { AuthenticatedAppState } from "../../main.ts";
import { BadRequestError, NotFoundError } from "../errors/generic.ts";
import { getWrappedRound } from "../services/roundService.ts";
import { UnauthorizedError } from "../errors/auth.ts";
import { isValidResultsCalculationMethod, publishResults, recalculateResultsForRound } from "../services/resultsService.ts";

export async function recalculateResultsController(
  ctx: RouterContext<
      "/api/rounds/:slug/results/recalculate",
      RouteParams<"/api/rounds/:slug/recalculate">,
      AuthenticatedAppState
    >,
) {
  const roundSlug = ctx.params.slug;
  const userId = ctx.state.user.userId;
  const method = ctx.request.url.searchParams.get("method");

  if (!method || !isValidResultsCalculationMethod(method)) {
    throw new BadRequestError("Invalid or missing result calculation `method` parameter. Possible: median, avg, sum");
  }

  const { round, isAdmin } = await getWrappedRound(roundSlug, userId) ?? {};

  if (!round) {
    throw new NotFoundError("Round not found");
  }

  if (!isAdmin) {
    throw new UnauthorizedError("You are not an admin of this round");
  }

  if (!(round.state === "results" || round.state === "pending-results")) {
    throw new BadRequestError("Round voting hasn't concluded yet");
  }

  await recalculateResultsForRound(roundSlug, method);

  ctx.response.status = 200;
}

export async function publishResultsController(
  ctx: RouterContext<
      "/api/rounds/:slug/results/publish",
      RouteParams<"/api/rounds/:slug/publish">,
      AuthenticatedAppState
    >,
) {
  const roundSlug = ctx.params.slug;
  const userId = ctx.state.user.userId;

  const { round, isAdmin } = await getWrappedRound(roundSlug, userId) ?? {};

  if (!round) {
    throw new NotFoundError("Round not found");
  }

  if (!isAdmin) {
    throw new UnauthorizedError("You are not an admin of this round");
  }

  await publishResults(roundSlug);

  ctx.response.status = 200;
}
