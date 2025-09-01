import { RouteParams, RouterContext } from "oak";
import { AuthenticatedAppState } from "../../main.ts";
import parseDto from "../utils/parseDto.ts";
import { setRoundVotersDtoSchema } from "../types/roundVoter.ts";
import { getRoundVotersByRoundId, getRoundVotersByRoundSlug, setRoundVoters } from "../services/roundVoterService.ts";

export async function setRoundVotersController(
  ctx: RouterContext<
    "/api/round-drafts/:id/voters",
    RouteParams<"/api/round-drafts/:id/voters">,
    AuthenticatedAppState
  >
) {
  const roundId = ctx.params.id;
  const userId = ctx.state.user.userId;

  const dto = await parseDto(setRoundVotersDtoSchema, ctx);

  const newVoters = await setRoundVoters(dto, userId, roundId);

  ctx.response.status = 200;
  ctx.response.body = newVoters;
}

export async function getRoundVotersController(
  ctx: RouterContext<
    "/api/rounds/:slug/voters",
    RouteParams<"/api/rounds/:slug/voters">,
    AuthenticatedAppState
  >
) {
  const roundSlug = ctx.params.slug;
  const userId = ctx.state.user.userId;

  const voters = await getRoundVotersByRoundSlug(roundSlug, userId);

  ctx.response.status = 200;
  ctx.response.body = voters;
}

export async function getRoundDraftVotersController(
  ctx: RouterContext<
    "/api/round-drafts/:id/voters",
    RouteParams<"/api/round-drafts/:id/voters">,
    AuthenticatedAppState
  >
) {
  const roundId = ctx.params.id;
  const userId = ctx.state.user.userId;

  const voters = await getRoundVotersByRoundId(roundId, userId);

  ctx.response.status = 200;
  ctx.response.body = voters;
}
