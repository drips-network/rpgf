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
  getApplicationsCsv,
} from "../services/applicationService.ts";
import { UnauthorizedError } from "../errors/auth.ts";
import { parseSortParam } from "../utils/sort.ts";
import { parseFilterParams } from "../utils/filter.ts";
import { z } from "zod";

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
    dto,
  );

  ctx.response.status = 200;
  ctx.response.body = application;
}

// TODO: Return a more minimal response for listing, without custom fields
// TODO: Start returning results with applications if present & admins have published them
export async function getApplicationsForRoundController(
  ctx: RouterContext<
    "/api/rounds/:slug/applications",
    RouteParams<"/api/rounds/:slug/applications">,
    AppState
  >,
) {
  const roundSlug = ctx.params.slug;
  const userId = ctx.state.user?.userId;
  const format = ctx.request.url.searchParams.get("format") ?? "json";
  const limit = Number(ctx.request.url.searchParams.get("limit")) || 20;
  const offset = Number(ctx.request.url.searchParams.get("offset")) || 0;
  const sortConfig = parseSortParam(ctx, ["name", "createdAt", "random", "allocation"] as const);
  const filterConfig = parseFilterParams(ctx, {
    state: z.enum(["approved", "rejected", "pending"]),
    submitterUserId: z.string().optional(),
  });

  if (!(format === "json" || format === "csv")) {
    throw new BadRequestError("Invalid format, only 'json' and 'csv' are supported");
  }

  const { round, isAdmin } = await getWrappedRound(roundSlug, userId ?? null) ?? {};
  if (!round) {
    throw new NotFoundError("Round not found");
  }

  if (isAdmin) {
    // admins can see all applications, always
    
    ctx.response.status = 200;
    ctx.response.body = format === 'json'
      ? await getApplications(round.id, round.applicationFormat, true, filterConfig, sortConfig, limit, offset, true)
      : await getApplicationsCsv(round.id, round.applicationFormat);

    return;
  }

  if (format === "csv") {
    throw new BadRequestError("Non-admins cannot download applications in CSV format");
  }

  // Fetch applications WITHOUT private fields for non-admins
  const approvedApplications = await getApplications(
    round.id,
    round.applicationFormat,
    false,
    filterConfig,
    sortConfig,
    limit,
    offset,
  );

  // Filter out any applications that are not approved AND NOT submitted by the user

  const isOwnApplication = (app: Application) => app.submitterUserId === userId;

  if (userId) {
    ctx.response.body = approvedApplications.filter((app) => app.state === "approved" || isOwnApplication(app));
  } else {
    ctx.response.body = approvedApplications.filter((app) => app.state === "approved");
  }

  ctx.response.status = 200;
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
