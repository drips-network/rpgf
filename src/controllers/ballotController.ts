import { RouteParams, RouterContext } from "oak";
import { AuthenticatedAppState } from "../../main.ts";
import { getBallot, getBallots, isUserRoundVoter, submitBallot } from "../services/ballotService.ts";
import { UnauthorizedError } from "../errors/auth.ts";
import parseDto from "../utils/parseDto.ts";
import { Ballot, submitBallotDtoSchema } from "../types/ballot.ts";
import { BadRequestError, NotFoundError } from "../errors/generic.ts";
import { getWrappedRoundPublic, isUserRoundAdmin } from "../services/roundService.ts";

function validateBallot(ballot: Ballot, votingConfig: {
  maxVotesPerVoter: number;
  maxVotesPerProjectPerVoter: number;
}) {
  const totalVotes = Object.values(ballot).reduce((acc, voteCount) => acc + voteCount, 0);
  if (totalVotes > votingConfig.maxVotesPerVoter) {
    throw new BadRequestError(`Total votes exceed the maximum allowed (${votingConfig.maxVotesPerVoter})`);
  }

  const projectVoteCounts = Object.entries(ballot).reduce((acc, [applicationId, voteCount]) => {
    acc[Number(applicationId)] = (acc[Number(applicationId)] || 0) + voteCount;
    return acc;
  }, {} as Record<number, number>);

  for (const projectId in projectVoteCounts) {
    if (projectVoteCounts[projectId] > votingConfig.maxVotesPerProjectPerVoter) {
      throw new BadRequestError(`Votes for project ${projectId} exceed the maximum allowed (${votingConfig.maxVotesPerProjectPerVoter})`);
    }
  }
}

export async function submitBallotController(
  ctx: RouterContext<
      "/api/rounds/:id/ballots",
      RouteParams<"/api/rounds/:id/ballots">,
      AuthenticatedAppState
    >,
) {
  const roundId = ctx.params.id;
  const userId = ctx.state.user.userId;

  const round = (await getWrappedRoundPublic(roundId))?.round;
  if (!round) {
    throw new NotFoundError("Round not found");
  }
  if (round.state !== "voting") {
    throw new BadRequestError("Round is not in voting state");
  }

  const isVoter = await isUserRoundVoter(userId, roundId);
  if (!isVoter) {
    throw new UnauthorizedError("You are not authorized to submit a ballot for this round");
  }

  const existingBallot = await getBallot(roundId, userId);
  if (existingBallot) {
    throw new BadRequestError("You have already submitted a ballot for this round");
  }

  const dto = await parseDto(submitBallotDtoSchema, ctx);

  const { votingConfig } = round;

  validateBallot(dto['ballot'], votingConfig);

  const result = await submitBallot(userId, dto);

  ctx.response.status = 200;
  ctx.response.body = result;
}

export async function getBallotsController(
  ctx: RouterContext<
      "/api/rounds/:id/ballots",
      RouteParams<"/api/rounds/:id/ballots">,
      AuthenticatedAppState
    >,
) {
  const roundId = ctx.params.id;
  const userId = ctx.state.user.userId;
  const limit = Number(ctx.request.url.searchParams.get("limit")) || 20;
  const offset = Number(ctx.request.url.searchParams.get("page")) || 0;
  const format = ctx.request.url.searchParams.get("format") || "json";

  if (format !== "json" && format !== "csv") {
    throw new BadRequestError("Invalid format. Possible: json, csv");
  }

  const isAdmin = await isUserRoundAdmin(userId, roundId);
  if (!isAdmin) {
    throw new UnauthorizedError("You are not an admin of this round");
  }

  const round = (await getWrappedRoundPublic(roundId))?.round;
  if (!round) {
    throw new NotFoundError("Round not found");
  }
  if (!(round.state === "voting" || round.state === "pending-results" || round.state === "results")) {
    throw new BadRequestError("Round voting hasn't started yet");
  }

  const ballots = await getBallots(roundId, limit, offset, format);

  ctx.response.status = 200;
  ctx.response.body = ballots;
}
