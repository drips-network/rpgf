import { RouteParams, RouterContext } from "oak";
import { AppState, AuthenticatedAppState } from "../../main.ts";
import parseDto from "../utils/parseDto.ts";
import { Application, applicationReviewDtoSchema, createApplicationDtoSchema } from "../types/application.ts";
import { getWrappedRound } from "../services/roundService.ts";
import { BadRequestError, NotFoundError } from "../errors/generic.ts";
import {
applyApplicationReview,
  createApplication,
  filterPrivateFields,
  getApplications,
} from "../services/applicationService.ts";
import deduplicateArray from "../utils/deduplicateArray.ts";
import { UnauthorizedError } from "../errors/auth.ts";

export async function createAppplicationController(
  ctx: RouterContext<
    "/api/rounds/:slug/applications",
    RouteParams<"/api/rounds/:slug/applications">,
    AuthenticatedAppState
  >,
) {
  const roundSlug = ctx.params.slug;
  const userId = ctx.state.user.userId;
  const userWalletAddress = ctx.state.user.walletAddress;

  const { round } = await getWrappedRound(roundSlug, userId) ?? {};
  
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
    round.id,
    userId,
    userWalletAddress,
    round.applicationFormat,
    dto,
  );

  ctx.response.status = 200;
  ctx.response.body = application;
}

export async function getApplicationsForRoundController(
  ctx: RouterContext<
    "/api/rounds/:slug/applications",
    RouteParams<"/api/rounds/:slug/applications">,
    AppState
  >,
) {
  const roundSlug = ctx.params.slug;
  const userId = ctx.state.user?.userId;

  const { round, isAdmin } = await getWrappedRound(roundSlug, userId ?? null) ?? {};
  if (!round) {
    throw new NotFoundError("Round not found");
  }

  if (isAdmin) {
    // admins can see all applications, always

    ctx.response.status = 200;
    ctx.response.body = await getApplications(round.id, round.applicationFormat, true);
    return;
  }

  // non-admins can see their own application plus all approved ones, but without private fields

  const approvedApplications = await getApplications(
    round.id,
    round.applicationFormat,
    false,
    {
      state: "approved",
    },
  );

  const ownApplication = userId
    ? (await getApplications(round.id, round.applicationFormat, true, {
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

export async function getApplicationController(
  ctx: RouterContext<
    "/api/rounds/:slug/applications/:applicationId",
    RouteParams<"/api/rounds/:slug/applications/:applicationId">,
    AppState
  >,
) {
  const roundSlug = ctx.params.slug;
  const applicationId = ctx.params.applicationId;
  const userId = ctx.state.user?.userId;

  const { round, isAdmin } = await getWrappedRound(roundSlug, userId ?? null) ?? {};
  if (!round) {
    throw new NotFoundError("Round not found");
  }

  // initially get full application including private fields
  const application = (await getApplications(
    round.id,
    round.applicationFormat,
    true,
  )).find((app) => app.id === applicationId);

  if (!application) {
    throw new NotFoundError("Application not found");
  }

  const isOwnApplication = userId === application.submitterUserId;

  // if the requester is not the submitter and not an admin, return only if the 
  // application is approved, and without private fields
  if (!isOwnApplication && !isAdmin) {
    if (application.state !== "approved") {
      throw new UnauthorizedError("You are not allowed to view this application");
    }

    // return without private fields
    return ctx.response.body = filterPrivateFields(round.applicationFormat, application);
  }

  ctx.response.status = 200;
  ctx.response.body = application;
}

export async function submitApplicationReviewController(
  ctx: RouterContext<
    "/api/rounds/:slug/applications/review",
    RouteParams<
      "/api/rounds/:slug/applications/review"
    >,
    AuthenticatedAppState
  >,
) {
  const roundSlug = ctx.params.slug;
  const userId = ctx.state.user.userId;

  const { round, isAdmin } = await getWrappedRound(roundSlug, userId ?? null) ?? {};
  if (!round) {
    throw new NotFoundError("Round not found");
  }
  if (!isAdmin) {
    throw new UnauthorizedError("You are not an admin of this round");
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
