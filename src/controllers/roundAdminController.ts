import { RouteParams, RouterContext } from "oak";
import { AuthenticatedAppState } from "../../main.ts";
import parseDto from "../utils/parseDto.ts";
import { setRoundAdminsDtoSchema } from "../types/roundAdmin.ts";
import { setRoundAdmins, getRoundAdminsByRoundId } from "../services/roundAdminService.ts";

export async function setRoundAdminsController(
  ctx: RouterContext<
    "/api/rounds/:roundId/admins",
    RouteParams<"/api/round-drafts/:roundId/admins">,
    AuthenticatedAppState
  >
) {
  const roundId = ctx.params.roundId;
  const userId = ctx.state.user.userId;

  const dto = await parseDto(setRoundAdminsDtoSchema, ctx);

  const newVoters = await setRoundAdmins(dto, userId, roundId);

  ctx.response.status = 200;
  ctx.response.body = newVoters;
}

export async function getRoundAdminsController(
  ctx: RouterContext<
    "/api/rounds/:roundId/admins",
    RouteParams<"/api/rounds/:roundId/admins">,
    AuthenticatedAppState
  >
) {
  const roundId = ctx.params.roundId;
  const userId = ctx.state.user.userId;

  const voters = await getRoundAdminsByRoundId(roundId, userId);

  ctx.response.status = 200;
  ctx.response.body = voters;
}
