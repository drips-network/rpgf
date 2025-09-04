import { RouteParams, RouterContext } from "oak";
import { AuthenticatedAppState } from "../../main.ts";
import { BadRequestError } from "../errors/generic.ts";
import { calculateDripListWeights, isValidResultsCalculationMethod, publishResults, recalculateResultsForRound } from "../services/resultsService.ts";

export async function recalculateResultsController(
  ctx: RouterContext<
      "/api/rounds/:roundId/results/recalculate",
      RouteParams<"/api/rounds/:roundId/recalculate">,
      AuthenticatedAppState
    >,
) {
  const roundId = ctx.params.roundId;
  const userId = ctx.state.user.userId;
  const method = ctx.request.url.searchParams.get("method");

  if (!method || !isValidResultsCalculationMethod(method)) {
    throw new BadRequestError("Invalid or missing result calculation `method` parameter. Possible: median, avg, sum");
  }

  await recalculateResultsForRound(roundId, userId, method);

  ctx.response.status = 200;
}

export async function publishResultsController(
  ctx: RouterContext<
      "/api/rounds/:roundId/results/publish",
      RouteParams<"/api/rounds/:roundId/publish">,
      AuthenticatedAppState
    >,
) {
  const roundId = ctx.params.roundId;
  const userId = ctx.state.user.userId;

  await publishResults(roundId, userId);

  ctx.response.status = 200;
}

export async function getDripListWeightsController(
  ctx: RouterContext<
      "/api/rounds/:roundId/results/drip-list-weights",
      RouteParams<"/api/rounds/:roundId/drip-list-weights">,
      AuthenticatedAppState
    >,
) {
  const roundId = ctx.params.roundId;
  const userId = ctx.state.user.userId;

  const dripListWeights = await calculateDripListWeights(roundId, userId);

  ctx.response.status = 200;
  ctx.response.body = dripListWeights;
}
