import { RouteParams, RouterContext } from "oak";
import { AuthenticatedAppState } from "../../main.ts";
import { BadRequestError, NotFoundError } from "../errors/generic.ts";
import { getRound, isUserRoundAdmin } from "../services/roundService.ts";
import { UnauthorizedError } from "../errors/auth.ts";
import { getResults } from "../services/resultsService.ts";

export async function getResultsController(
  ctx: RouterContext<
      "/api/rounds/:id/results",
      RouteParams<"/api/rounds/:id/results">,
      AuthenticatedAppState
    >,
) {
  const roundId = ctx.params.id;
  const userId = ctx.state.user.userId;
  const format = ctx.request.url.searchParams.get("format") || "json";

  if (format !== "json" && format !== "csv") {
    throw new BadRequestError("Invalid format. Possible: json, csv");
  }

  const isAdmin = await isUserRoundAdmin(userId, Number(roundId));
  if (!isAdmin) {
    throw new UnauthorizedError("You are not an admin of this round");
  }

  const round = await getRound(Number(roundId), "public");
  if (!round) {
    throw new NotFoundError("Round not found");
  }
  if (!(round.state === "results" || round.state === "pending-results")) {
    throw new BadRequestError("Round voting hasn't concluded yet");
  }

  const ballots = await getResults(Number(roundId), format);

  ctx.response.status = 200;
  ctx.response.body = ballots;
}
