import { Context, RouteParams, RouterContext } from "oak";
import { AppState, AuthenticatedAppState } from "../../main.ts";
import parseDto from "../utils/parseDto.ts";
import { createRoundDtoSchema, patchRoundDtoSchema } from "../types/round.ts";
import { createRound, getRound, isUserRoundAdmin, patchRound } from "../services/roundService.ts";
import { UnauthorizedError } from "../errors/auth.ts";
import { NotFoundError } from "../errors/generic.ts";

export async function createRoundController(ctx: Context<AuthenticatedAppState>) {
  const dto = await parseDto(createRoundDtoSchema, ctx);

  const round = await createRound(dto, ctx.state.user.userId);

  ctx.response.status = 200;
  ctx.response.body = round;
}

export async function patchRoundController(ctx: RouterContext<'/api/rounds/:id', RouteParams<'/api/rounds/:id'>, AuthenticatedAppState>) {
  const roundId = ctx.params.id;
  const userId = ctx.state.user.userId;

  console.log("User ID:", userId);

  if (!(await isUserRoundAdmin(userId, Number(roundId)))) {
    throw new UnauthorizedError("You are not authorized to modify this round");
  }

  const dto = await parseDto(patchRoundDtoSchema, ctx);

  const round = await patchRound(Number(roundId), dto);

  ctx.response.status = 200;
  ctx.response.body = round;
}

export async function getRoundController(ctx: RouterContext<'/api/rounds/:id', RouteParams<'/api/rounds/:id'>, AppState>) {
  const roundId = ctx.params.id;
  const userId = ctx.state.user?.userId;

  const isAdmin = await isUserRoundAdmin(userId, Number(roundId));

  const round = await getRound(Number(roundId), isAdmin ? 'admin' : 'public');
  if (!round) {
    throw new NotFoundError("Round not found");
  }

  ctx.response.status = 200;
  ctx.response.body = round;
}
