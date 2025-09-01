import { RouteParams, RouterContext } from "oak";
import { AuthenticatedAppState } from "../../main.ts";
import { isUserRoundDraftAdmin } from "../services/roundService.ts";
import { UnauthorizedError } from "../errors/auth.ts";
import { createApplicationForm, deleteApplicationForm, updateApplicationForm } from "../services/applicationFormService.ts";
import parseDto from "../utils/parseDto.ts";
import { createApplicationFormDtoSchema } from "../types/applicationForm.ts";

export async function createApplicationFormController(
  ctx: RouterContext<
    "/api/round-drafts/:id/application-forms",
    RouteParams<"/api/round-drafts/:id/application-forms">,
    AuthenticatedAppState
  >,
) {
  const roundDraftId = ctx.params.id;
  const userId = ctx.state.user.userId;

  const dto = await parseDto(createApplicationFormDtoSchema, ctx);

  if (!(await isUserRoundDraftAdmin(userId, roundDraftId))) {
    throw new UnauthorizedError(
      "You are not authorized to modify this round draft",
    );
  }

  const form = await createApplicationForm(dto, roundDraftId, null);
  ctx.response.status = 201;
  ctx.response.body = form;
}

export async function updateApplicationFormController(
  ctx: RouterContext<
    "/api/round-drafts/:id/application-forms/:id",
    RouteParams<"/api/round-drafts/:id/application-forms/:id">,
    AuthenticatedAppState
  >,
) {
  const roundDraftId = ctx.params.id;
  const userId = ctx.state.user.userId;
  const applicationFormId = ctx.params.id;

  const dto = await parseDto(createApplicationFormDtoSchema, ctx);

  if (!(await isUserRoundDraftAdmin(userId, roundDraftId))) {
    throw new UnauthorizedError(
      "You are not authorized to modify this round draft",
    );
  }

  const form = await updateApplicationForm(dto, applicationFormId);
  ctx.response.status = 200;
  ctx.response.body = form;
}

export async function deleteApplicationFormController(
  ctx: RouterContext<
    "/api/round-drafts/:draftId/application-forms/:id",
    RouteParams<"/api/round-drafts/:draftId/application-forms/:id">,
    AuthenticatedAppState
  >,
) {
  const roundDraftId = ctx.params.draftId;
  const userId = ctx.state.user.userId;
  const applicationFormId = ctx.params.id;

  if (!(await isUserRoundDraftAdmin(userId, roundDraftId))) {
    throw new UnauthorizedError(
      "You are not authorized to modify this round draft",
    );
  }

  await deleteApplicationForm(applicationFormId);
  ctx.response.status = 204;
  ctx.response.body = null;
}
