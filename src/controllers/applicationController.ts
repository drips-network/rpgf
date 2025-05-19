import { RouteParams, RouterContext } from "oak";
import { AppState, AuthenticatedAppState } from "../../main.ts";
import parseDto from "../utils/parseDto.ts";
import { Application, applicationReviewDtoSchema, createApplicationDtoSchema } from "../types/application.ts";
import { getRound, isUserRoundAdmin } from "../services/roundService.ts";
import { BadRequestError, NotFoundError } from "../errors/generic.ts";
import {
applyApplicationReview,
  createApplication,
  getApplications,
} from "../services/applicationService.ts";
import deduplicateArray from "../utils/deduplicateArray.ts";
import { UnauthorizedError } from "../errors/auth.ts";

export async function createAppplicationController(
  ctx: RouterContext<
    "/api/rounds/:id/applications",
    RouteParams<"/api/rounds/:id/applications">,
    AuthenticatedAppState
  >,
) {
  // TODO: Validate `accountId` being for a project claimed on Drips

  const roundId = ctx.params.id;
  const userId = ctx.state.user.userId;

  const round = await getRound(Number(roundId), "public");
  if (!round) {
    throw new NotFoundError("Round not found");
  }

  if (round.state !== "intake") {
    throw new BadRequestError("Round is not in intake state");
  }

  const dto = await parseDto(
    createApplicationDtoSchema(round.applicationFormat),
    ctx,
  );

  const application = await createApplication(
    Number(roundId),
    userId,
    round.applicationFormat,
    dto,
  );

  ctx.response.status = 200;
  ctx.response.body = application;
}

export async function getApplicationsForRoundController(
  ctx: RouterContext<
    "/api/rounds/:id/applications",
    RouteParams<"/api/rounds/:id/applications">,
    AppState
  >,
) {
  const roundId = ctx.params.id;
  const userId = ctx.state.user?.userId;

  const isAdmin = await isUserRoundAdmin(userId, Number(roundId));

  const round = await getRound(Number(roundId), "public");
  if (!round) {
    throw new NotFoundError("Round not found");
  }

  if (isAdmin) {
    // admins can see all applications, always
    return await getApplications(Number(roundId), round.applicationFormat);
  }

  // non-admins can see their own application plus all approved ones, but without private fields

  const approvedApplications = await getApplications(
    Number(roundId),
    round.applicationFormat,
    false,
    {
      state: "approved",
    },
  );

  const ownApplication = userId
    ? (await getApplications(Number(roundId), round.applicationFormat, true, {
      submitterUserId: userId,
    }))[0]
    : null;

  const result: Application[] = approvedApplications;

  if (ownApplication) {
    result.push(ownApplication);
  }

  ctx.response.status = 200;
  ctx.response.body = deduplicateArray(result, 'id');
  return;
}

export async function submitApplicationReviewController(
  ctx: RouterContext<
    "/api/rounds/:id/applications/review",
    RouteParams<
      "/api/rounds/:id/applications/review"
    >,
    AuthenticatedAppState
  >,
) {
  const roundId = ctx.params.id;
  const userId = ctx.state.user.userId;

  const isAdmin = await isUserRoundAdmin(userId, Number(roundId));
  if (!isAdmin) {
    throw new UnauthorizedError("You are not an admin of this round");
  }

  const round = await getRound(Number(roundId), "public");
  console.log({ round });
  if (!round) {
    throw new NotFoundError("Round not found");
  }

  if (!(round.state === "intake" || round.state === "pending-voting")) {
    throw new BadRequestError("Round must ne in intake or pending-voting state to submit review");
  }

  const dto = await parseDto(
    applicationReviewDtoSchema,
    ctx,
  );

  const result = await applyApplicationReview(
    dto,
  );

  ctx.response.status = 200;
  ctx.response.body = result;
}
