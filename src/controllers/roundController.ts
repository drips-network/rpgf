import { Context, RouteParams, RouterContext } from "oak";
import { AppState, AuthenticatedAppState } from "../../main.ts";
import parseDto from "../utils/parseDto.ts";
import { createRoundDtoSchema, patchRoundDtoSchema } from "../types/round.ts";
import { createRound, deleteRound, getRound, getRounds, isUserRoundAdmin, patchRound } from "../services/roundService.ts";
import { UnauthorizedError } from "../errors/auth.ts";
import { BadRequestError, NotFoundError } from "../errors/generic.ts";

export async function createRoundController(ctx: Context<AuthenticatedAppState>) {
  const dto = await parseDto(createRoundDtoSchema, ctx);

  const adminAddresses = dto.adminWalletAddresses.map((a) => a.toLowerCase());
  if (!adminAddresses.includes(ctx.state.user.walletAddress.toLowerCase())) {
    throw new BadRequestError("Round must include the creator's wallet address as an admin");
  }

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

export async function getRoundsController(ctx: Context<AppState>) {
  const limit = Number(ctx.request.url.searchParams.get("limit")) || 20;
  const offset = Number(ctx.request.url.searchParams.get("offset")) || 0;
  const chainId = Number(ctx.request.url.searchParams.get("chainId"));

  const rounds = await getRounds({ chainId }, limit, offset);

  ctx.response.status = 200;
  ctx.response.body = rounds;
}

export async function deleteRoundController(ctx: RouterContext<'/api/rounds/:id', RouteParams<'/api/rounds/:id'>, AuthenticatedAppState>) {
  const roundId = ctx.params.id;
  const userId = ctx.state.user.userId;

  if (!(await isUserRoundAdmin(userId, Number(roundId)))) {
    throw new UnauthorizedError("You are not authorized to delete this round");
  }

  await deleteRound(Number(roundId));

  ctx.response.status = 204; // No content
}
