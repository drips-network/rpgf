import { RouteParams, RouterContext } from "oak";
import { AuthenticatedAppState } from "../../main.ts";
import { BadRequestError } from "../errors/generic.ts";
import {
  calculateDripListWeights,
  importResultsForRound,
  isValidResultsCalculationMethod,
  publishResults,
  recalculateResultsForRound,
} from "../services/resultsService.ts";
import { parse } from "std/csv/parse";
import z from "zod";
import { convertXlsxToCsv } from "../utils/csv.ts";

function _csvToResultDto(csv: string): { results: Record<string, number> } {
  let parsed: ReturnType<typeof parse>;
  try {
    parsed = parse(csv, { skipFirstRow: true });
  } catch (e) {
    throw new BadRequestError(
      `Invalid CSV format: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  // ensure all the rows have at least ID and Allocation columns
  if (
    !Array.isArray(parsed) ||
    parsed.some((r) => !("ID" in r) || !("Allocation" in r))
  ) {
    throw new BadRequestError(
      "Invalid CSV format. Required columns: ID, Allocation",
    );
  }

  const rows = z
    .array(
      z.object({
        ID: z.string().uuid(),
        // parse empty string as null; otherwise, must be a positive number (zero values are excluded from import)
        Allocation:
          z
            .string()
            .transform((value) => (value === "" ? null : value))
            .nullable()
            .refine((value) => value === null || !isNaN(Number(value)), {
              message: "Invalid number",
            })
            .refine((value) => value === null || Number(value) >= 0, {
              message: "Allocation must be 0 or a positive number",
            })
            .transform((value) => (value === null ? null : Number(value))),
      }),
    )
    .safeParse(parsed);

  if (!rows.success) {
    let msg = "CSV parsing errors:\n";

    for (const err of rows.error.errors) {
      const rowNo = typeof err.path[0] === "number" ? err.path[0] + 2 : "?"; // +2 for header and 0-index

      msg += `Row ${rowNo}: ${err.message}\n`;
    }

    throw new BadRequestError(msg);
  }

  return {
    results: Object.fromEntries(
      rows.data
        .filter(
          (row): row is { ID: string; Allocation: number } =>
            row.Allocation !== null && row.Allocation > 0,
        )
        .map((row) => [row.ID, row.Allocation]),
    ),
  };
}

export async function importResultsFromSpreadsheetController(
  ctx: RouterContext<
    "/api/rounds/:roundId/results/import",
    RouteParams<"/api/rounds/:roundId/results/import">,
    AuthenticatedAppState
  >,
) {
  const roundId = ctx.params.roundId;
  const userId = ctx.state.user.userId;
  const format = ctx.request.url.searchParams.get("format");

  if (format !== "csv" && format !== "xlsx") {
    throw new BadRequestError("Invalid format. Possible: csv, xlsx");
  }

  let csv: string;
  if (format === "csv") {
    csv = await ctx.request.body.text();
  } else {
    const data = await ctx.request.body.arrayBuffer();
    csv = convertXlsxToCsv(data);
  }

  const resultDto = _csvToResultDto(csv);
  await importResultsForRound(roundId, userId, resultDto.results);

  ctx.response.status = 200;
}

export async function recalculateResultsController(
  ctx: RouterContext<
    "/api/rounds/:roundId/results/recalculate",
    RouteParams<"/api/rounds/:roundId/recalculate">,
    AuthenticatedAppState
  >,
) {
  const roundId = ctx.params.roundId;
  const userId = ctx.state.user.userId;
  const method = ctx.request.url.searchParams.get("method");

  if (!method || !isValidResultsCalculationMethod(method)) {
    throw new BadRequestError(
      "Invalid or missing result calculation `method` parameter. Possible: median, avg, sum",
    );
  }

  await recalculateResultsForRound(roundId, userId, method);

  ctx.response.status = 200;
}

export async function publishResultsController(
  ctx: RouterContext<
    "/api/rounds/:roundId/results/publish",
    RouteParams<"/api/rounds/:roundId/publish">,
    AuthenticatedAppState
  >,
) {
  const roundId = ctx.params.roundId;
  const userId = ctx.state.user.userId;

  await publishResults(roundId, userId);

  ctx.response.status = 200;
}

export async function getDripListWeightsController(
  ctx: RouterContext<
    "/api/rounds/:roundId/results/drip-list-weights",
    RouteParams<"/api/rounds/:roundId/drip-list-weights">,
    AuthenticatedAppState
  >,
) {
  const roundId = ctx.params.roundId;
  const userId = ctx.state.user.userId;

  const dripListWeights = await calculateDripListWeights(roundId, userId);

  ctx.response.status = 200;
  ctx.response.body = dripListWeights;
}