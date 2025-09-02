import { RouteParams, RouterContext } from "oak";
import { AuthenticatedAppState } from "../../main.ts";
import parseDto from "../utils/parseDto.ts";
import { setRoundVotersDtoSchema } from "../types/roundVoter.ts";
import { getRoundVotersByRoundId, setRoundVoters } from "../services/roundVoterService.ts";

export async function setRoundVotersController(
  ctx: RouterContext<
    "/api/rounds/:roundId/voters",
    RouteParams<"/api/round-drafts/:roundId/voters">,
    AuthenticatedAppState
  >
) {
  const roundId = ctx.params.roundId;
  const userId = ctx.state.user.userId;

  const dto = await parseDto(setRoundVotersDtoSchema, ctx);

  const newVoters = await setRoundVoters(dto, userId, roundId);

  ctx.response.status = 200;
  ctx.response.body = newVoters;
}

export async function getRoundVotersController(
  ctx: RouterContext<
    "/api/rounds/:roundId/voters",
    RouteParams<"/api/rounds/:roundId/voters">,
    AuthenticatedAppState
  >
) {
  const roundId = ctx.params.roundId;
  const userId = ctx.state.user.userId;

  const voters = await getRoundVotersByRoundId(roundId, userId);

  ctx.response.status = 200;
  ctx.response.body = voters;
}
