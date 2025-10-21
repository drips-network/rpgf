import { RouterContext } from "oak";
import { AppState, AuthenticatedAppState } from "../../main.ts";
import parseDto from "$app/utils/parseDto.ts";
import {
  createCustomDatasetDtoSchema,
  updateCustomDatasetDtoSchema,
} from "$app/types/customDataset.ts";
import * as customDatasetService from "$app/services/customDatasetService.ts";

export async function createCustomDatasetController(
  ctx: RouterContext<
    "/api/rounds/:roundId/custom-datasets",
    { roundId: string },
    AuthenticatedAppState
  >,
) {
  const { roundId } = ctx.params;
  const dto = await parseDto(createCustomDatasetDtoSchema, ctx);

  const dataset = await customDatasetService.createCustomDataset(
    roundId,
    dto,
    ctx.state.user.userId,
  );

  ctx.response.body = dataset;
}

export async function uploadCustomDatasetController(
  ctx: RouterContext<
    "/api/rounds/:roundId/custom-datasets/:datasetId/upload",
    { roundId: string; datasetId: string },
    AuthenticatedAppState
  >,
) {
  const { roundId, datasetId } = ctx.params;
  const csv = await ctx.request.body.text();

  const result = await customDatasetService.uploadCustomDataset(
    roundId,
    datasetId,
    csv,
    ctx.state.user.userId,
  );

  ctx.response.body = result;
}

export async function updateCustomDatasetController(
  ctx: RouterContext<
    "/api/rounds/:roundId/custom-datasets/:datasetId",
    { roundId: string; datasetId: string },
    AuthenticatedAppState
  >,
) {
  const { roundId, datasetId } = ctx.params;
  const dto = await parseDto(updateCustomDatasetDtoSchema, ctx);

  const dataset = await customDatasetService.updateCustomDataset(
    roundId,
    datasetId,
    dto,
    ctx.state.user.userId,
  );

  ctx.response.body = dataset;
}

export async function listCustomDatasetsController(
  ctx: RouterContext<
    "/api/rounds/:roundId/custom-datasets",
    { roundId: string },
    AppState
  >,
) {
  const { roundId } = ctx.params;
  const datasets = await customDatasetService.listCustomDatasets(
    roundId,
    ctx.state.user?.userId,
  );

  ctx.response.body = datasets;
}

export async function downloadCustomDatasetController(
  ctx: RouterContext<
    "/api/rounds/:roundId/custom-datasets/:datasetId/data.csv",
    { roundId: string; datasetId: string },
    AuthenticatedAppState
  >,
) {
  const { roundId, datasetId } = ctx.params;

  const csv = await customDatasetService.downloadCustomDataset(
    roundId,
    datasetId,
  );

  ctx.response.headers.set("Content-Type", "text/csv");
  ctx.response.headers.set(
    "Content-Disposition",
    `attachment; filename="dataset.csv"`,
  );
  ctx.response.body = csv;
}

export async function deleteCustomDatasetController(
  ctx: RouterContext<
    "/api/rounds/:roundId/custom-datasets/:datasetId",
    { roundId: string; datasetId: string },
    AuthenticatedAppState
  >,
) {
  const { roundId, datasetId } = ctx.params;

  await customDatasetService.deleteCustomDataset(
    roundId,
    datasetId,
    ctx.state.user.userId,
  );

  ctx.response.status = 204;
}
