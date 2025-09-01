import { RouteParams, RouterContext } from "oak";
import { AuthenticatedAppState } from "../../main.ts";
import { createApplicationCategoryDtoSchema } from "../types/applicationCategory.ts";
import parseDto from "../utils/parseDto.ts";
import { createApplicationCategoryForRound, deleteApplicationCategory, updateApplicationCategory } from "../services/applicationCategoryService.ts";
import { NotFoundError } from "../errors/generic.ts";

export async function createApplicationCategoryController(
  ctx: RouterContext<
      "/api/round-drafts/:id/application-categories",
      RouteParams<"/api/round-drafts/:id/application-categories">,
      AuthenticatedAppState
    >
) {
  const roundDraftId = ctx.params.id;
  const userId = ctx.state.user.userId;

  const dto = await parseDto(createApplicationCategoryDtoSchema, ctx);

  const category = await createApplicationCategoryForRound(dto, userId, roundDraftId);

  ctx.response.status = 201;
  ctx.response.body = category;
}

export async function updateApplicationCategoryController(
  ctx: RouterContext<
      "/api/round-drafts/:id/application-categories/:categoryId",
      RouteParams<"/api/round-drafts/:id/application-categories/:categoryId">,
      AuthenticatedAppState
    >
) {
  const roundDraftId = ctx.params.id;
  const categoryId = ctx.params.categoryId;
  const userId = ctx.state.user.userId;

  const dto = await parseDto(createApplicationCategoryDtoSchema, ctx);

  const category = await updateApplicationCategory(roundDraftId, categoryId, userId, dto);

  if (!category) {
    throw new NotFoundError("Application category not found");
  }

  ctx.response.status = 200;
  ctx.response.body = category;
}

export async function deleteApplicationCategoryController(
  ctx: RouterContext<
      "/api/round-drafts/:id/application-categories/:categoryId",
      RouteParams<"/api/round-drafts/:id/application-categories/:categoryId">,
      AuthenticatedAppState
    >
) {
  const roundDraftId = ctx.params.id;
  const categoryId = ctx.params.categoryId;
  const userId = ctx.state.user.userId;

  await deleteApplicationCategory(roundDraftId, userId, categoryId);

  ctx.response.status = 204;
}
