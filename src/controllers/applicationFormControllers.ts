import { RouteParams, RouterContext } from "oak";
import { AppState, AuthenticatedAppState } from "../../main.ts";
import { createApplicationForm, deleteApplicationForm, getApplicationFormForCategory, getApplicationFormsByRoundId, updateApplicationForm } from "../services/applicationFormService.ts";
import parseDto from "../utils/parseDto.ts";
import { createApplicationFormDtoSchema } from "../types/applicationForm.ts";

export async function createApplicationFormController(
  ctx: RouterContext<
    "/api/rounds/:roundId/application-forms",
    RouteParams<"/api/rounds/:roundId/application-forms">,
    AuthenticatedAppState
  >,
) {
  const roundId = ctx.params.roundId;
  const userId = ctx.state.user.userId;

  const dto = await parseDto(createApplicationFormDtoSchema, ctx);

  const form = await createApplicationForm(dto, userId, roundId);
  ctx.response.status = 201;
  ctx.response.body = form;
}

export async function updateApplicationFormController(
  ctx: RouterContext<
    "/api/rounds/:roundId/application-forms/:formId",
    RouteParams<"/api/rounds/:roundId/application-forms/:formId">,
    AuthenticatedAppState
  >,
) {
  const roundId = ctx.params.roundId;
  const userId = ctx.state.user.userId;
  const applicationFormId = ctx.params.formId;

  const dto = await parseDto(createApplicationFormDtoSchema, ctx);

  const form = await updateApplicationForm(dto, userId, roundId, applicationFormId);
  ctx.response.status = 200;
  ctx.response.body = form;
}

export async function deleteApplicationFormController(
  ctx: RouterContext<
    "/api/rounds/:roundId/application-forms/:formId",
    RouteParams<"/api/rounds/:roundId/application-forms/:formId">,
    AuthenticatedAppState
  >,
) {
  const roundId = ctx.params.roundId;
  const userId = ctx.state.user.userId;
  const applicationFormId = ctx.params.formId;

  await deleteApplicationForm(applicationFormId, userId, roundId);
  ctx.response.status = 204;
  ctx.response.body = null;
}

export async function getApplicationFormByCategoryController(
  ctx: RouterContext<
    "/api/rounds/:roundId/categories/:categoryId/application-form",
    RouteParams<"/api/rounds/:roundId/categories/:categoryId/application-form">,
    AppState
  >,
) {
  const roundId = ctx.params.roundId;
  const categoryId = ctx.params.categoryId;

  const form = await getApplicationFormForCategory(categoryId, roundId);
  if (!form) {
    ctx.response.status = 204;
    ctx.response.body = null;
    return;
  }

  ctx.response.status = 200;
  ctx.response.body = form;
}

export async function getApplicationFormsController(
  ctx: RouterContext<
    "/api/rounds/:roundId/application-forms",
    RouteParams<"/api/rounds/:roundId/application-forms">,
    AppState
  >,
) {
  const roundId = ctx.params.roundId;

  // Only admins can fetch all application forms
  const forms = await getApplicationFormsByRoundId(roundId);
  ctx.response.status = 200;
  ctx.response.body = forms;
}
