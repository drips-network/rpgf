import { RouteParams, RouterContext } from "oak";
import { AuthenticatedAppState } from "../../main.ts";
import { getBallot, getBallots, getBallotStats, patchBallot, submitBallot } from "../services/ballotService.ts";
import { UnauthorizedError } from "../errors/auth.ts";
import parseDto from "../utils/parseDto.ts";
import { submitBallotDtoSchema } from "../types/ballot.ts";
import { BadRequestError, NotFoundError } from "../errors/generic.ts";
import { getWrappedRound } from "../services/roundService.ts";

export async function submitBallotController(
  ctx: RouterContext<
      "/api/rounds/:slug/ballots",
      RouteParams<"/api/rounds/:slug/ballots">,
      AuthenticatedAppState
    >,
) {
  const slug = ctx.params.slug;
  const userId = ctx.state.user.userId;

  const dto = await parseDto(submitBallotDtoSchema, ctx);
  const result = await submitBallot(userId, slug, dto);

  ctx.response.status = 200;
  ctx.response.body = result;
}

export async function patchBallotController(
  ctx: RouterContext<
      "/api/rounds/:slug/ballots/own",
      RouteParams<"/api/rounds/:slug/ballots/own">,
      AuthenticatedAppState
    >,
) {
  const slug = ctx.params.slug;
  const userId = ctx.state.user.userId;

  const dto = await parseDto(submitBallotDtoSchema, ctx);
  const result = await patchBallot(userId, slug, dto);

  ctx.response.status = 200;
  ctx.response.body = result;
}

export async function getOwnBallotController(
  ctx: RouterContext<
      "/api/rounds/:slug/ballots/own",
      RouteParams<"/api/rounds/:slug/ballots/own">,
      AuthenticatedAppState
    >,
) {
  const slug = ctx.params.slug;
  const userId = ctx.state.user.userId;

  const { round, isVoter } = await getWrappedRound(slug, userId) ?? {};

  if (!round) {
    throw new NotFoundError("Round not found");
  }

  if (!isVoter) {
    throw new UnauthorizedError("You are not a voter for this round");
  }

  if (round.state !== "voting") {
    throw new NotFoundError();
  }

  const ballot = await getBallot(slug, userId);
  if (!ballot) {
    throw new NotFoundError("You haven't submitted a ballot yet");
  }

  ctx.response.status = 200;
  ctx.response.body = ballot;
}

export async function getBallotsController(
  ctx: RouterContext<
      "/api/rounds/:slug/ballots",
      RouteParams<"/api/rounds/:slug/ballots">,
      AuthenticatedAppState
    >,
) {
  const slug = ctx.params.slug;
  const userId = ctx.state.user.userId;
  const limit = Number(ctx.request.url.searchParams.get("limit")) || 20;
  const offset = Number(ctx.request.url.searchParams.get("page")) || 0;
  const format = ctx.request.url.searchParams.get("format") || "json";

  if (format !== "json" && format !== "csv") {
    throw new BadRequestError("Invalid format. Possible: json, csv");
  }

  const { round, isAdmin } = await getWrappedRound(slug, userId) ?? {};

  if (!round) {
    throw new NotFoundError("Round not found");
  }

  if (!isAdmin) {
    throw new UnauthorizedError("You are not an admin of this round");
  }

  if (!(round.state === "voting" || round.state === "pending-results" || round.state === "results")) {
    throw new BadRequestError("Round voting hasn't started yet");
  }

  const ballots = await getBallots(slug, limit, offset, format);

  ctx.response.status = 200;
  ctx.response.body = ballots;
}

export async function getBallotStatsController(
  ctx: RouterContext<
      "/api/rounds/:slug/ballots/stats",
      RouteParams<"/api/rounds/:slug/ballots/stats">,
      AuthenticatedAppState
    >,
) {
  const slug = ctx.params.slug;
  const userId = ctx.state.user.userId;

  const { round, isAdmin } = await getWrappedRound(slug, userId) ?? {};

  if (!round) {
    throw new NotFoundError("Round not found");
  }

  if (!isAdmin) {
    throw new UnauthorizedError("You are not an admin of this round");
  }

  const stats = await getBallotStats(slug);

  ctx.response.status = 200;
  ctx.response.body = stats;
}
