import { Context, RouteParams, RouterContext } from "oak";
import { AppState, AuthenticatedAppState } from "../../main.ts";
import parseDto from "../utils/parseDto.ts";
import {
  createRoundDtoSchema,
  linkDripListsToRoundDtoSchema,
  patchRoundDtoSchema,
} from "../types/round.ts";
import {
  createRound,
  deleteRound,
  getRounds,
  linkDripListsToRound,
  patchRound,
  getRound,
  getRoundsByUser,
  publishRound,
  isUrlSlugAvailable,
} from "../services/roundService.ts";
import { BadRequestError, NotFoundError } from "../errors/generic.ts";
import parseUrlParam from "../utils/parseUrlParam.ts";
import { z } from "zod";

export async function createRoundDraftController(
  ctx: Context<AuthenticatedAppState>,
) {
  const dto = await parseDto(createRoundDtoSchema, ctx);

  const round = await createRound(dto, ctx.state.user.userId);

  ctx.response.status = 200;
  ctx.response.body = round;
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

  const round = await getRound(roundDraftId, userId);
  if (!round) {
    throw new NotFoundError("Round draft not found");
  }

  if (round.published) {
    return new NotFoundError("This round draft has already been published. Query the published round instead.");
  }

  ctx.response.status = 200;
  ctx.response.body = round;
}

export async function getRoundDraftsController(
  ctx: RouterContext<
    "/api/round-drafts",
    RouteParams<"/api/round-drafts">,
    AuthenticatedAppState
  >,
) {
  const chainId = Number(ctx.request.url.searchParams.get("chainId")) || undefined;
  const userId = ctx.state.user.userId;

  const rounds = await getRoundsByUser(userId, { chainId, published: false });

  ctx.response.status = 200;
  ctx.response.body = rounds;
}

export async function patchRoundDraftController(
  ctx: RouterContext<
    "/api/round-drafts/:id",
    RouteParams<"/api/round-drafts/:id">,
    AuthenticatedAppState
  >,
) {
  const roundId = ctx.params.id;
  const userId = ctx.state.user.userId;

  const dto = await parseDto(patchRoundDtoSchema, ctx);

  const roundDraft = await patchRound({
    type: 'id',
    value: roundId,
  }, dto, userId);

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

  await deleteRound(roundDraftId, userId);

  ctx.response.status = 204; // No content
}

export async function publishRoundDraftController(
  ctx: RouterContext<
    "/api/round-drafts/:id/publish",
    RouteParams<"/api/round-drafts/:id/publish">,
    AuthenticatedAppState
  >,
) {
  const roundId = parseUrlParam(ctx, "id", z.string().uuid());
  const userId = ctx.state.user.userId;

  const round = await publishRound(roundId, userId);

  ctx.response.status = 200;
  ctx.response.body = round;
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

  const dto = await parseDto(patchRoundDtoSchema, ctx);

  const roundDraft = await patchRound({
    type: 'slug',
    value: roundSlug,
  }, dto, userId);

  ctx.response.status = 200;
  ctx.response.body = roundDraft;
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

  const round = await getRound(roundSlug, userId ?? null);
  if (!round) {
    throw new NotFoundError("Round not found");
  }
  if (chainId && round.chainId !== chainId) {
    throw new NotFoundError("Round not found on the specified chain");
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

  const result = await isUrlSlugAvailable(normalizedSlug);

  ctx.response.status = 200;
  ctx.response.body = {
    available: result,
  };
}

export async function linkDripListToRoundController(
  ctx: RouterContext<
    "/api/rounds/:slug/drip-lists",
    RouteParams<"/api/rounds/:slug/drip-lists">,
    AuthenticatedAppState
  >,
) {
  const slug = ctx.params.slug;
  const userId = ctx.state.user.userId;
  const dto = await parseDto(linkDripListsToRoundDtoSchema, ctx);

  await linkDripListsToRound(
    slug,
    userId,
    dto.dripListAccountIds,
  );

  ctx.response.status = 200;
  ctx.response.body = {
    message: "Drip Lists linked successfully",
  };
}
