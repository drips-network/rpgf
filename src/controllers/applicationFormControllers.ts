import { RouteParams, RouterContext } from "oak";
import { AuthenticatedAppState } from "../../main.ts";
import { createApplicationForm, deleteApplicationForm, updateApplicationForm } from "../services/applicationFormService.ts";
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
    "/api/rounds/:roundId/application-forms/:id",
    RouteParams<"/api/rounds/:roundId/application-forms/:id">,
    AuthenticatedAppState
  >,
) {
  const roundId = ctx.params.id;
  const userId = ctx.state.user.userId;
  const applicationFormId = ctx.params.id;

  const dto = await parseDto(createApplicationFormDtoSchema, ctx);

  const form = await updateApplicationForm(dto, userId, roundId, applicationFormId);
  ctx.response.status = 200;
  ctx.response.body = form;
}

export async function deleteApplicationFormController(
  ctx: RouterContext<
    "/api/rounds/:roundId/application-forms/:id",
    RouteParams<"/api/rounds/:roundId/application-forms/:id">,
    AuthenticatedAppState
  >,
) {
  const roundId = ctx.params.roundId;
  const userId = ctx.state.user.userId;
  const applicationFormId = ctx.params.id;

  await deleteApplicationForm(applicationFormId, userId, roundId);
  ctx.response.status = 204;
  ctx.response.body = null;
}
