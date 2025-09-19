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
  publishRound,
  isUrlSlugAvailable,
  getRoundsByUser,
} from "../services/roundService.ts";
import { BadRequestError, NotFoundError } from "../errors/generic.ts";
import parseUrlParam from "../utils/parseUrlParam.ts";
import { z } from "zod";

export async function createRoundController(
  ctx: Context<AuthenticatedAppState>,
) {
  const dto = await parseDto(createRoundDtoSchema, ctx);

  const round = await createRound(dto, ctx.state.user.userId);

  ctx.response.status = 200;
  ctx.response.body = round;
}

export async function deleteRoundController(
  ctx: RouterContext<
    "/api/rounds/:id",
    RouteParams<"/api/rounds/:id">,
    AuthenticatedAppState
  >,
) {
  const roundId = ctx.params.id;
  const userId = ctx.state.user.userId;

  await deleteRound(roundId, userId);

  ctx.response.status = 204; // No content
}

export async function publishRoundController(
  ctx: RouterContext<
    "/api/rounds/:id/publish",
    RouteParams<"/api/rounds/:id/publish">,
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
    "/api/rounds/:id",
    RouteParams<"/api/rounds/:id">,
    AuthenticatedAppState
  >,
) {
  const roundId = ctx.params.id;
  const userId = ctx.state.user.userId;

  const dto = await parseDto(patchRoundDtoSchema, ctx);

  const roundDraft = await patchRound(roundId, dto, userId);

  ctx.response.status = 200;
  ctx.response.body = roundDraft;
}

export async function getRoundController(
  ctx: RouterContext<
    "/api/rounds/:id",
    RouteParams<"/api/rounds/:id">,
    AppState
  >,
) {
  const roundId = ctx.params.id;
  const chainId = z.coerce.number().optional().parse(
    ctx.request.url.searchParams.get("chainId"),
  );
  const userId = ctx.state.user?.userId;

  const round = await getRound(roundId, userId ?? null);
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
  const limit = z.coerce.number().optional().default(20).parse(
    ctx.request.url.searchParams.get("limit"),
  );
  const offset = z.coerce.number().optional().default(0).parse(
    ctx.request.url.searchParams.get("offset"),
  );
  const chainId = z.coerce.number().optional().parse(
    ctx.request.url.searchParams.get("chainId"),
  );

  const rounds = await getRounds(userId ?? null, { chainId }, limit, offset);

  ctx.response.status = 200;
  ctx.response.body = rounds;
}

export async function getOwnRoundsController(ctx: Context<AuthenticatedAppState>) {
  const userId = ctx.state.user.userId;
  const chainId = z.coerce.number().optional().parse(
    ctx.request.url.searchParams.get("chainId"),
  );

  const rounds = await getRoundsByUser(userId, { chainId});

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
    "/api/rounds/:id/drip-lists",
    RouteParams<"/api/rounds/:id/drip-lists">,
    AuthenticatedAppState
  >,
) {
  const roundId = ctx.params.id;
  const userId = ctx.state.user.userId;
  const dto = await parseDto(linkDripListsToRoundDtoSchema, ctx);

  await linkDripListsToRound(
    roundId,
    userId,
    dto.dripListAccountIds,
  );

  ctx.response.status = 200;
  ctx.response.body = {
    message: "Drip Lists linked successfully",
  };
}
