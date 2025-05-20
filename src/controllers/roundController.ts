import { Context, RouteParams, RouterContext } from "oak";
import { AppState, AuthenticatedAppState } from "../../main.ts";
import parseDto from "../utils/parseDto.ts";
import { createRoundDraftDtoSchema, patchRoundDtoSchema } from "../types/round.ts";
import { createRoundDraft, deleteRound, deleteRoundDraft, getRound, getRoundDrafts, getRounds, isUserRoundAdmin, isUserRoundDraftAdmin, patchRound, patchRoundDraft, publishRoundDraft } from "../services/roundService.ts";
import { UnauthorizedError } from "../errors/auth.ts";
import { BadRequestError, NotFoundError } from "../errors/generic.ts";
import parseUrlParam from "../utils/parseUrlParam.ts";
import { z } from "zod";

export async function createRoundDraftController(ctx: Context<AuthenticatedAppState>) {
  const dto = await parseDto(createRoundDraftDtoSchema, ctx);

  const adminAddresses = dto.adminWalletAddresses.map((a) => a.toLowerCase());
  if (!adminAddresses.includes(ctx.state.user.walletAddress.toLowerCase())) {
    throw new BadRequestError("Round must include the creator's wallet address as an admin");
  }

  const roundDraft = await createRoundDraft(dto, ctx.state.user.userId);

  ctx.response.status = 200;
  ctx.response.body = roundDraft;
}

export async function getRoundDraftController(ctx: RouterContext<'/api/round-drafts/:id', RouteParams<'/api/round-drafts/:id'>, AuthenticatedAppState>) {
  const roundDraftId = ctx.params.id;
  const userId = ctx.state.user.userId;
  
  if (!(await isUserRoundDraftAdmin(userId, roundDraftId))) {
    throw new UnauthorizedError("You are not authorized to view this round draft");
  }

  const roundDraft = (await getRoundDrafts({ id: roundDraftId }))[0];
  if (!roundDraft) {
    throw new NotFoundError("Round draft not found");
  }

  ctx.response.status = 200;
  ctx.response.body = roundDraft;
}

export async function getRoundDraftsController(ctx: RouterContext<'/api/round-drafts', RouteParams<'/api/round-drafts'>, AuthenticatedAppState>) {
  const limit = Number(ctx.request.url.searchParams.get("limit")) || 20;
  const offset = Number(ctx.request.url.searchParams.get("offset")) || 0;
  const userId = ctx.state.user.userId;

  // You can only see your own drafts
  const roundDrafts = await getRoundDrafts({ creatorUserId: userId }, limit, offset);

  ctx.response.status = 200;
  ctx.response.body = roundDrafts;
}

export async function patchRoundDraftController(ctx: RouterContext<'/api/round-drafts/:id', RouteParams<'/api/round-drafts/:id'>, AuthenticatedAppState>) {
  const roundDraftId = ctx.params.id;
  const userId = ctx.state.user.userId;

  if (!(await isUserRoundDraftAdmin(userId, roundDraftId))) {
    throw new UnauthorizedError("You are not authorized to modify this round draft");
  }

  const dto = await parseDto(createRoundDraftDtoSchema, ctx);

  const adminAddresses = dto.adminWalletAddresses.map((a) => a.toLowerCase());
  if (!adminAddresses.includes(ctx.state.user.walletAddress.toLowerCase())) {
    throw new BadRequestError("Round must include the creator's wallet address as an admin");
  }

  const roundDraft = await patchRoundDraft(roundDraftId, dto);

  ctx.response.status = 200;
  ctx.response.body = roundDraft;
}

export async function deleteRoundDraftController(ctx: RouterContext<'/api/round-drafts/:id', RouteParams<'/api/round-drafts/:id'>, AuthenticatedAppState>) {
  const roundDraftId = ctx.params.id;
  const userId = ctx.state.user.userId;

  if (!(await isUserRoundDraftAdmin(userId, roundDraftId))) {
    throw new UnauthorizedError("You are not authorized to delete this round draft");
  }

  await deleteRoundDraft(roundDraftId, true);

  ctx.response.status = 204; // No content
}

export async function publishRoundDraftController(ctx: RouterContext<'/api/round-drafts/:id/publish', RouteParams<'/api/round-drafts/:id/publish'>, AuthenticatedAppState>) {
  const roundDraftId = parseUrlParam(ctx, 'id', z.string().uuid());
  const userId = ctx.state.user.userId;

  if (!(await isUserRoundDraftAdmin(userId, roundDraftId))) {
    throw new UnauthorizedError("You are not authorized to publish this round draft");
  }

  const roundDraft = await publishRoundDraft(roundDraftId);

  ctx.response.status = 200;
  ctx.response.body = roundDraft;
}

export async function patchRoundController(ctx: RouterContext<'/api/rounds/:id', RouteParams<'/api/rounds/:id'>, AuthenticatedAppState>) {
  const roundId = ctx.params.id;
  const userId = ctx.state.user.userId;

  console.log("User ID:", userId);

  if (!(await isUserRoundAdmin(userId,roundId))) {
    throw new UnauthorizedError("You are not authorized to modify this round");
  }

  const dto = await parseDto(patchRoundDtoSchema, ctx);

  const round = await patchRound(roundId, dto);

  ctx.response.status = 200;
  ctx.response.body = round;
}

export async function getRoundController(ctx: RouterContext<'/api/rounds/:slug', RouteParams<'/api/rounds/:slug'>, AppState>) {
  const roundSlug = ctx.params.slug;
  const userId = ctx.state.user?.userId;

  const isAdmin = await isUserRoundAdmin(userId, roundSlug);
  const round = await getRound(roundSlug, isAdmin ? 'admin' : 'public');

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

  if (!(await isUserRoundAdmin(userId, roundId))) {
    throw new UnauthorizedError("You are not authorized to delete this round");
  }

  await deleteRound(roundId);

  ctx.response.status = 204; // No content
}
