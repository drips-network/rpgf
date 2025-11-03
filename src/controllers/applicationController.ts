import { RouteParams, RouterContext } from "oak";
import { AppState, AuthenticatedAppState } from "../../main.ts";
import parseDto from "../utils/parseDto.ts";
import { addApplicationAttestationDtoSchema, applicationReviewDtoSchema, createApplicationDtoSchema, updateApplicationDtoSchema } from "../types/application.ts";
import { BadRequestError } from "../errors/generic.ts";
import {
  applyApplicationReview,
  createApplication,
  addApplicationAttestationFromTransaction,
  getApplication,
  getApplicationHistory,
  getApplications,
  getApplicationsCsv,
  updateApplication,
} from "../services/applicationService.ts";
import { parseSortParam } from "../utils/sort.ts";
import { parseFilterParams } from "../utils/filter.ts";
import { z } from "zod";
import { convertToXlsxBuffer } from "../utils/csv.ts";

export async function createAppplicationController(
  ctx: RouterContext<
    "/api/rounds/:roundId/applications",
    RouteParams<"/api/rounds/:roundId/applications">,
    AuthenticatedAppState
  >,
) {
  const roundId = ctx.params.roundId;
  const userId = ctx.state.user.userId;
  const userWalletAddress = ctx.state.user.walletAddress;

  const dto = await parseDto(
    createApplicationDtoSchema,
    ctx,
  );

  const application = await createApplication(
    roundId,
    userId,
    userWalletAddress,
    dto,
  );

  ctx.response.status = 200;
  ctx.response.body = application;
}

export async function updateApplicationController(
  ctx: RouterContext<
    "/api/rounds/:roundId/applications/:applicationId",
    RouteParams<"/api/rounds/:roundId/applications/:applicationId">,
    AuthenticatedAppState
  >,
) {
  const roundId = ctx.params.roundId;
  const applicationId = ctx.params.applicationId;
  const userId = ctx.state.user.userId;
  const userWalletAddress = ctx.state.user.walletAddress;

  const dto = await parseDto(
    updateApplicationDtoSchema,
    ctx,
  );

  const application = await updateApplication(
    applicationId,
    roundId,
    userId,
    userWalletAddress,
    dto,
  );

  ctx.response.status = 200;
  ctx.response.body = application;
}

export async function addApplicationAttestationController(
  ctx: RouterContext<
    "/api/rounds/:roundId/applications/:applicationId/add-attestation-uid",
    RouteParams<"/api/rounds/:roundId/applications/:applicationId/add-attestation-uid">,
    AuthenticatedAppState
  >,
) {
  const roundId = ctx.params.roundId;
  const applicationId = ctx.params.applicationId;
  const userId = ctx.state.user.userId;
  const userWalletAddress = ctx.state.user.walletAddress;

  const dto = await parseDto(
    addApplicationAttestationDtoSchema,
    ctx,
  );

  const application = await addApplicationAttestationFromTransaction(
    applicationId,
    roundId,
    userId,
    userWalletAddress,
    dto.transactionHash,
  );

  ctx.response.status = 200;
  ctx.response.body = application;
}

export async function getApplicationsForRoundController(
  ctx: RouterContext<
    "/api/rounds/:roundId/applications",
    RouteParams<"/api/rounds/:roundId/applications">,
    AppState
  >,
) {
  const roundId = ctx.params.roundId;
  const userId = ctx.state.user?.userId;
  const format = ctx.request.url.searchParams.get("format") ?? "json";
  const limit = Number(ctx.request.url.searchParams.get("limit")) || 20;
  const offset = Number(ctx.request.url.searchParams.get("offset")) || 0;
  const sortConfig = parseSortParam(ctx, ["name", "createdAt", "random", "allocation"] as const);
  const filterConfig = parseFilterParams(ctx, {
    state: z.enum(["approved", "rejected", "pending"]),
    submitterUserId: z.string().optional(),
    categoryId: z.string().optional(),
  });

  if (!(format === "json" || format === "csv" || format === "xlsx")) {
    throw new BadRequestError("Invalid format, only 'json', 'csv' and 'xlsx' are supported");
  }

  if (format === "json") {
    const applications = await getApplications(
      roundId,
      userId ?? null,
      filterConfig,
      sortConfig,
      limit,
      offset,
    );
    ctx.response.status = 200;
    ctx.response.body = applications;
    return;
  } else if (format === "csv" || format === "xlsx") {
    const csv = await getApplicationsCsv(
      roundId,
      userId ?? null,
      filterConfig?.state === "approved"
    );

    if (format === "xlsx") {
      const buff = convertToXlsxBuffer(csv);

      ctx.response.status = 200;
      ctx.response.headers.set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      ctx.response.headers.set("Content-Disposition", `attachment; filename="applications_${roundId}.xlsx"`);
      ctx.response.body = buff;

      return;
    }

    ctx.response.status = 200;
    ctx.response.headers.set("Content-Type", "text/csv");
    ctx.response.headers.set("Content-Disposition", `attachment; filename="applications_${roundId}.csv"`);
    ctx.response.body = csv;
    return;
  }
}

export async function getApplicationController(
  ctx: RouterContext<
    "/api/rounds/:roundId/applications/:applicationId",
    RouteParams<"/api/rounds/:roundId/applications/:applicationId">,
    AppState
  >,
) {
  const roundId = ctx.params.roundId;
  const applicationId = ctx.params.applicationId;
  const userId = ctx.state.user?.userId;

  const application = await getApplication(
    applicationId,
    roundId,
    userId ?? null,
  )

  ctx.response.status = 200;
  ctx.response.body = application;
}

export async function getApplicationHistoryController(
  ctx: RouterContext<
    "/api/rounds/:roundId/applications/:applicationId/history",
    RouteParams<"/api/rounds/:roundId/applications/:applicationId/history">,
    AppState
  >,
) {
  const roundId = ctx.params.roundId;
  const applicationId = ctx.params.applicationId;
  const userId = ctx.state.user?.userId;

  const history = await getApplicationHistory(
    applicationId,
    roundId,
    userId ?? null,
  )

  ctx.response.status = 200;
  ctx.response.body = history;
}

export async function submitApplicationReviewController(
  ctx: RouterContext<
    "/api/rounds/:roundId/applications/review",
    RouteParams<
      "/api/rounds/:roundId/applications/review"
    >,
    AuthenticatedAppState
  >,
) {
  const roundId = ctx.params.roundId;
  const userId = ctx.state.user.userId;

  const dto = await parseDto(
    applicationReviewDtoSchema,
    ctx,
  );

  const result = await applyApplicationReview(
    roundId,
    userId,
    dto,
  );

  ctx.response.status = 200;
  ctx.response.body = result;
}
