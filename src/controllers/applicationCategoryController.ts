import { RouteParams, RouterContext } from "oak";
import { AppState, AuthenticatedAppState } from "../../main.ts";
import { createApplicationCategoryDtoSchema } from "../types/applicationCategory.ts";
import parseDto from "../utils/parseDto.ts";
import { createApplicationCategoryForRound, deleteApplicationCategory, getApplicationCategoriesByRoundId, updateApplicationCategory } from "../services/applicationCategoryService.ts";
import { NotFoundError } from "../errors/generic.ts";

export async function createApplicationCategoryController(
  ctx: RouterContext<
      "/api/rounds/:roundId/application-categories",
      RouteParams<"/api/rounds/:roundId/application-categories">,
      AuthenticatedAppState
    >
) {
  const roundId = ctx.params.roundId;
  const userId = ctx.state.user.userId;

  const dto = await parseDto(createApplicationCategoryDtoSchema, ctx);

  const category = await createApplicationCategoryForRound(dto, userId, roundId);

  ctx.response.status = 201;
  ctx.response.body = category;
}

export async function updateApplicationCategoryController(
  ctx: RouterContext<
      "/api/rounds/:roundId/application-categories/:categoryId",
      RouteParams<"/api/rounds/:roundId/application-categories/:categoryId">,
      AuthenticatedAppState
    >
) {
  const roundId = ctx.params.roundId;
  const categoryId = ctx.params.categoryId;
  const userId = ctx.state.user.userId;

  const dto = await parseDto(createApplicationCategoryDtoSchema, ctx);

  const category = await updateApplicationCategory(roundId, categoryId, userId, dto);

  if (!category) {
    throw new NotFoundError("Application category not found");
  }

  ctx.response.status = 200;
  ctx.response.body = category;
}

export async function deleteApplicationCategoryController(
  ctx: RouterContext<
      "/api/rounds/:roundId/application-categories/:categoryId",
      RouteParams<"/api/rounds/:roundId/application-categories/:categoryId">,
      AuthenticatedAppState
    >
) {
  const roundId = ctx.params.roundId;
  const categoryId = ctx.params.categoryId;
  const userId = ctx.state.user.userId;

  await deleteApplicationCategory(roundId, categoryId, userId);

  ctx.response.status = 204;
}

export async function getApplicationCategoriesController(
  ctx: RouterContext<
      "/api/rounds/:roundId/application-categories",
      RouteParams<"/api/rounds/:roundId/application-categories">,
      AppState
    >
) {
  const roundId = ctx.params.roundId;
  const userId = ctx.state.user?.userId;

  const categories = await getApplicationCategoriesByRoundId(roundId, userId ?? null);

  ctx.response.status = 200;
  ctx.response.body = categories;
}
