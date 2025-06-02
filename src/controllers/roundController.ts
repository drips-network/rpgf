import { Context, RouteParams, RouterContext } from "oak";
import { AppState, AuthenticatedAppState } from "../../main.ts";
import parseDto from "../utils/parseDto.ts";
import {
  createRoundDraftDtoSchema,
  patchRoundDtoSchema,
} from "../types/round.ts";
import {
  checkUrlSlugAvailability,
  createRoundDraft,
  deleteRound,
  deleteRoundDraft,
  getRoundDrafts,
  getRounds,
  getWrappedRound,
  isUserRoundDraftAdmin,
  patchRound,
  patchRoundDraft,
  publishRoundDraft,
} from "../services/roundService.ts";
import { UnauthorizedError } from "../errors/auth.ts";
import { BadRequestError, NotFoundError } from "../errors/generic.ts";
import parseUrlParam from "../utils/parseUrlParam.ts";
import { z } from "zod";
import { db } from "../db/postgres.ts";

export async function createRoundDraftController(
  ctx: Context<AuthenticatedAppState>,
) {
  const dto = await parseDto(createRoundDraftDtoSchema, ctx);

  const adminAddresses = dto.adminWalletAddresses.map((a) => a.toLowerCase());
  if (!adminAddresses.includes(ctx.state.user.walletAddress.toLowerCase())) {
    throw new BadRequestError(
      "Round must include the creator's wallet address as an admin",
    );
  }

  const roundDraft = await createRoundDraft(dto, ctx.state.user.userId);

  ctx.response.status = 200;
  ctx.response.body = roundDraft;
}

export async function getRoundDraftController(
  ctx: RouterContext<
    "/api/round-drafts/:id",
    RouteParams<"/api/round-drafts/:id">,
    AuthenticatedAppState
  >,
) {
  const roundDraftId = ctx.params.id;
  const userId = ctx.state.user.userId;

  if (!(await isUserRoundDraftAdmin(userId, roundDraftId))) {
    throw new UnauthorizedError(
      "You are not authorized to view this round draft",
    );
  }

  const roundDraft = (await getRoundDrafts({ id: roundDraftId }))[0];
  if (!roundDraft) {
    throw new NotFoundError("Round draft not found");
  }

  ctx.response.status = 200;
  ctx.response.body = roundDraft;
}

export async function getRoundDraftsController(
  ctx: RouterContext<
    "/api/round-drafts",
    RouteParams<"/api/round-drafts">,
    AuthenticatedAppState
  >,
) {
  const limit = Number(ctx.request.url.searchParams.get("limit")) || 20;
  const offset = Number(ctx.request.url.searchParams.get("offset")) || 0;
  const chainId = Number(ctx.request.url.searchParams.get("chainId")) || undefined;
  const userId = ctx.state.user.userId;

  // You can only see your own drafts
  const roundDrafts = await getRoundDrafts(
    { creatorUserId: userId, chainId },
    limit,
    offset,
  );

  ctx.response.status = 200;
  ctx.response.body = roundDrafts;
}

export async function patchRoundDraftController(
  ctx: RouterContext<
    "/api/round-drafts/:id",
    RouteParams<"/api/round-drafts/:id">,
    AuthenticatedAppState
  >,
) {
  const roundDraftId = ctx.params.id;
  const userId = ctx.state.user.userId;

  if (!(await isUserRoundDraftAdmin(userId, roundDraftId))) {
    throw new UnauthorizedError(
      "You are not authorized to modify this round draft",
    );
  }

  const dto = await parseDto(createRoundDraftDtoSchema, ctx);

  const adminAddresses = dto.adminWalletAddresses.map((a) => a.toLowerCase());
  if (!adminAddresses.includes(ctx.state.user.walletAddress.toLowerCase())) {
    throw new BadRequestError(
      "Round must include the creator's wallet address as an admin",
    );
  }

  const roundDraft = await patchRoundDraft(roundDraftId, dto);

  ctx.response.status = 200;
  ctx.response.body = roundDraft;
}

export async function deleteRoundDraftController(
  ctx: RouterContext<
    "/api/round-drafts/:id",
    RouteParams<"/api/round-drafts/:id">,
    AuthenticatedAppState
  >,
) {
  const roundDraftId = ctx.params.id;
  const userId = ctx.state.user.userId;

  if (!(await isUserRoundDraftAdmin(userId, roundDraftId))) {
    throw new UnauthorizedError(
      "You are not authorized to delete this round draft",
    );
  }

  await deleteRoundDraft(roundDraftId, true);

  ctx.response.status = 204; // No content
}

export async function publishRoundDraftController(
  ctx: RouterContext<
    "/api/round-drafts/:id/publish",
    RouteParams<"/api/round-drafts/:id/publish">,
    AuthenticatedAppState
  >,
) {
  const roundDraftId = parseUrlParam(ctx, "id", z.string().uuid());
  const userId = ctx.state.user.userId;

  if (!(await isUserRoundDraftAdmin(userId, roundDraftId))) {
    throw new UnauthorizedError(
      "You are not authorized to publish this round draft",
    );
  }

  const roundDraft = await publishRoundDraft(roundDraftId, userId);

  ctx.response.status = 200;
  ctx.response.body = roundDraft;
}

export async function patchRoundController(
  ctx: RouterContext<
    "/api/rounds/:slug",
    RouteParams<"/api/rounds/:slug">,
    AuthenticatedAppState
  >,
) {
  const roundSlug = ctx.params.slug;
  const userId = ctx.state.user.userId;

  const { round, isAdmin } = await getWrappedRound(roundSlug, userId) ?? {};
  if (!round) {
    throw new NotFoundError("Round not found");
  }
  if (!isAdmin) {
    throw new UnauthorizedError("You are not an admin of this round");
  }

  const dto = await parseDto(patchRoundDtoSchema, ctx);

  const patchedRound = await patchRound(roundSlug, userId, dto);

  ctx.response.status = 200;
  ctx.response.body = patchedRound;
}

export async function getRoundController(
  ctx: RouterContext<
    "/api/rounds/:slug",
    RouteParams<"/api/rounds/:slug">,
    AppState
  >,
) {
  const roundSlug = ctx.params.slug;
  const chainId = Number(ctx.request.url.searchParams.get("chainId")) || undefined;
  const userId = ctx.state.user?.userId;

  const round = await getWrappedRound(roundSlug, userId ?? null, undefined, chainId);
  if (!round) {
    throw new NotFoundError("Round not found");
  }

  ctx.response.status = 200;
  ctx.response.body = round;
}

export async function getRoundsController(ctx: Context<AppState>) {
  const userId = ctx.state.user?.userId;
  const limit = Number(ctx.request.url.searchParams.get("limit")) || 20;
  const offset = Number(ctx.request.url.searchParams.get("offset")) || 0;
  const chainId = Number(ctx.request.url.searchParams.get("chainId"));

  const rounds = await getRounds(userId ?? null, { chainId }, limit, offset);

  ctx.response.status = 200;
  ctx.response.body = rounds;
}

export async function deleteRoundController(
  ctx: RouterContext<
    "/api/rounds/:slug",
    RouteParams<"/api/rounds/:slug">,
    AuthenticatedAppState
  >,
) {
  const roundSlug = ctx.params.slug;
  const userId = ctx.state.user.userId;

  const { isAdmin } = await getWrappedRound(roundSlug, userId) ?? {};
  if (!isAdmin) {
    throw new UnauthorizedError("You are not an admin of this round");
  }

  await deleteRound(roundSlug);

  ctx.response.status = 204; // No content
}

export async function checkSlugAvailabilityController(
  ctx: RouterContext<
    "/api/rounds/check-slug/:slug",
    RouteParams<"/api/rounds/check-slug/:slug">,
    AppState
  >,
) {
  const slug = ctx.params.slug;

  if (!slug) {
    throw new BadRequestError("Slug is required");
  }

  const normalizedSlug = z.string().max(255).regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "URL slug must be URL-safe",
  ).transform((val) => val.toLowerCase()).parse(slug);

  const result = await db.transaction(async (tx) => {
    return await checkUrlSlugAvailability(normalizedSlug, tx);
  });

  ctx.response.status = 200;
  ctx.response.body = {
    available: result,
  };
}
