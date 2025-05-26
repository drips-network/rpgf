import { RouteParams, RouterContext } from "oak";
import { AppState, AuthenticatedAppState } from "../../main.ts";
import parseDto from "../utils/parseDto.ts";
import { Application, applicationReviewDtoSchema, createApplicationDtoSchema } from "../types/application.ts";
import { getWrappedRoundPublic, isUserRoundAdmin } from "../services/roundService.ts";
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
    "/api/rounds/:slug/applications",
    RouteParams<"/api/rounds/:slug/applications">,
    AuthenticatedAppState
  >,
) {
  const roundSlug = ctx.params.slug;
  const userId = ctx.state.user.userId;
  const userWalletAddress = ctx.state.user.walletAddress;

  const round = (await getWrappedRoundPublic(roundSlug))?.round;
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
    roundSlug,
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

  const isAdmin = await isUserRoundAdmin(userId, roundSlug);

  const round = (await getWrappedRoundPublic(roundSlug))?.round;
  if (!round) {
    throw new NotFoundError("Round not found");
  }

  if (isAdmin) {
    // admins can see all applications, always
    return await getApplications(roundSlug, round.applicationFormat);
  }

  // non-admins can see their own application plus all approved ones, but without private fields

  const approvedApplications = await getApplications(
    roundSlug,
    round.applicationFormat,
    false,
    {
      state: "approved",
    },
  );

  const ownApplication = userId
    ? (await getApplications(roundSlug, round.applicationFormat, true, {
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
    "/api/rounds/:slug/applications/review",
    RouteParams<
      "/api/rounds/:slug/applications/review"
    >,
    AuthenticatedAppState
  >,
) {
  const roundSlug = ctx.params.slug;
  const userId = ctx.state.user.userId;

  const isAdmin = await isUserRoundAdmin(userId, roundSlug);
  if (!isAdmin) {
    throw new UnauthorizedError("You are not an admin of this round");
  }

  const round = (await getWrappedRoundPublic(roundSlug))?.round;
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
