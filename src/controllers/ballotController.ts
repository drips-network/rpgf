import { RouteParams, RouterContext } from "oak";
import { AuthenticatedAppState } from "../../main.ts";
import { getBallot, getBallots, getBallotStats, patchBallot, submitBallot } from "../services/ballotService.ts";
import parseDto from "../utils/parseDto.ts";
import { submitBallotDtoSchema } from "../types/ballot.ts";
import { BadRequestError, NotFoundError } from "../errors/generic.ts";

export async function submitBallotController(
  ctx: RouterContext<
      "/api/rounds/:roundId/ballots",
      RouteParams<"/api/rounds/:roundId/ballots">,
      AuthenticatedAppState
    >,
) {
  const roundId = ctx.params.roundId;
  const userId = ctx.state.user.userId;

  const dto = await parseDto(submitBallotDtoSchema, ctx);
  const result = await submitBallot(userId, roundId, dto);

  ctx.response.status = 200;
  ctx.response.body = result;
}

export async function patchBallotController(
  ctx: RouterContext<
      "/api/rounds/:roundId/ballots/own",
      RouteParams<"/api/rounds/:roundId/ballots/own">,
      AuthenticatedAppState
    >,
) {
  const roundId = ctx.params.roundId;
  const userId = ctx.state.user.userId;

  const dto = await parseDto(submitBallotDtoSchema, ctx);
  const result = await patchBallot(userId, roundId, dto);

  ctx.response.status = 200;
  ctx.response.body = result;
}

export async function getOwnBallotController(
  ctx: RouterContext<
      "/api/rounds/:roundId/ballots/own",
      RouteParams<"/api/rounds/:roundId/ballots/own">,
      AuthenticatedAppState
    >,
) {
  const roundId = ctx.params.roundId;
  const userId = ctx.state.user.userId;

  const ballot = await getBallot(roundId, userId);
  if (!ballot) {
    throw new NotFoundError("You haven't submitted a ballot yet");
  }

  ctx.response.status = 200;
  ctx.response.body = ballot;
}

export async function getBallotsController(
  ctx: RouterContext<
      "/api/rounds/:roundId/ballots",
      RouteParams<"/api/rounds/:roundId/ballots">,
      AuthenticatedAppState
    >,
) {
  const roundId = ctx.params.roundId;
  const userId = ctx.state.user.userId;
  const limit = Number(ctx.request.url.searchParams.get("limit")) || 20;
  const offset = Number(ctx.request.url.searchParams.get("page")) || 0;
  const format = ctx.request.url.searchParams.get("format") || "json";

  if (format !== "json" && format !== "csv") {
    throw new BadRequestError("Invalid format. Possible: json, csv");
  }

  const ballots = await getBallots(roundId, userId, limit, offset, format);

  ctx.response.status = 200;
  ctx.response.body = ballots;
}

export async function getBallotStatsController(
  ctx: RouterContext<
      "/api/rounds/:roundId/ballots/stats",
      RouteParams<"/api/rounds/:roundId/ballots/stats">,
      AuthenticatedAppState
    >,
) {
  const roundId = ctx.params.roundId;
  const userId = ctx.state.user.userId;

  const stats = await getBallotStats(roundId, userId);

  ctx.response.status = 200;
  ctx.response.body = stats;
}
