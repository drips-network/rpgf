import { RouteParams, RouterContext } from "oak";
import { AuthenticatedAppState } from "../../main.ts";
import {
  getBallot,
  getBallots,
  getBallotStats,
  submitBallot,
} from "../services/ballotService.ts";
import parseDto from "../utils/parseDto.ts";
import { submitBallotDtoSchema } from "../types/ballot.ts";
import { BadRequestError, NotFoundError } from "../errors/generic.ts";
import { parse } from "std/csv/parse";
import z from "zod";
import { convertXlsxToCsv } from "../utils/csv.ts";
import { getUserByWalletAddress } from "../services/userService.ts";
import { ethereumAddressSchema } from "../types/shared.ts";

function _csvToBallotDto(csv: string): { ballot: Record<string, number> } {
  const parsed = parse(csv, { skipFirstRow: true });

  // ensure all the rows have at least ID and Allocation columns
  if (
    !Array.isArray(parsed) ||
    parsed.some((r) => !("ID" in r) || !("Allocation" in r))
  ) {
    throw new BadRequestError(
      "Invalid CSV format. Required columns: ID, Allocation"
    );
  }

  const rows = z
    .array(
      z.object({
        ID: z.string().uuid(),
        // parse empty string as null
        // otherwise, must be 0 or positive int number
        Allocation: z
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
      })
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
    ballot: Object.fromEntries(
      rows.data
        .filter(
          (row): row is { ID: string; Allocation: number } =>
            row.Allocation !== null && row.Allocation > 0
        )
        .map((row) => [row.ID, row.Allocation])
    ),
  };
}

export async function parseBallotFromSpreadsheetController(
  ctx: RouterContext<
    "/api/rounds/:roundId/ballots/parse-spreadsheet",
    RouteParams<"/api/rounds/:roundId/ballots/parse-spreadsheet">,
    AuthenticatedAppState
  >
) {
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

  const ballotDto = _csvToBallotDto(csv);

  ctx.response.status = 200;
  ctx.response.body = ballotDto;
}

export async function submitBallotController(
  ctx: RouterContext<
    "/api/rounds/:roundId/ballots",
    RouteParams<"/api/rounds/:roundId/ballots">,
    AuthenticatedAppState
  >
) {
  const roundId = ctx.params.roundId;
  const userId = ctx.state.user.userId;

  const dto = await parseDto(submitBallotDtoSchema, ctx);
  const result = await submitBallot(userId, roundId, dto);

  ctx.response.status = 200;
  ctx.response.body = result;
}

export async function submitBallotAsSpreadsheetController(
  ctx: RouterContext<
    "/api/rounds/:roundId/ballots/spreadsheet",
    RouteParams<"/api/rounds/:roundId/ballots/spreadsheet">,
    AuthenticatedAppState
  >
) {
  const format = ctx.request.url.searchParams.get("format");

  if (format !== "csv" && format !== "xlsx") {
    throw new BadRequestError("Invalid format. Possible: csv, xlsx");
  }

  const signature = ctx.request.url.searchParams.get("signature");
  const chainIdParam = ctx.request.url.searchParams.get("chainId");
  const addressOverrideParam = ctx.request.url.searchParams.get("addressOverride");

  if (!signature) {
    throw new BadRequestError("Signature is required");
  }

  if (!chainIdParam) {
    throw new BadRequestError("Chain ID is required");
  }

  const chainId = parseInt(chainIdParam, 10);
  if (isNaN(chainId) || chainId <= 0) {
    throw new BadRequestError("Chain ID must be a positive integer");
  }

  const roundId = ctx.params.roundId;
  const actorUserId = ctx.state.user.userId;

  let voterUserId = actorUserId;

  if (addressOverrideParam) {
    const parsedAddress = ethereumAddressSchema.safeParse(addressOverrideParam);
    if (!parsedAddress.success) {
      const message = parsedAddress.error.errors[0]?.message ?? "Invalid Ethereum address";
      throw new BadRequestError(message);
    }

    const overrideAddress = parsedAddress.data;

    const targetUser = await getUserByWalletAddress(overrideAddress);
    if (!targetUser) {
      throw new BadRequestError("No user found for the provided address");
    }

    voterUserId = targetUser.id;
  }

  let csv: string;
  if (format === "csv") {
    csv = await ctx.request.body.text();
  } else {
    const data = await ctx.request.body.arrayBuffer();

    csv = convertXlsxToCsv(data);
  }

  const ballotDto = _csvToBallotDto(csv);
  const dto = {
    ...ballotDto,
    signature,
    chainId,
  };
  const result = await submitBallot(voterUserId, roundId, dto, {
    actorUserId,
  });

  ctx.response.status = 200;
  ctx.response.body = result;
}

export async function getOwnBallotController(
  ctx: RouterContext<
    "/api/rounds/:roundId/ballots/own",
    RouteParams<"/api/rounds/:roundId/ballots/own">,
    AuthenticatedAppState
  >
) {
  const roundId = ctx.params.roundId;
  const userId = ctx.state.user.userId;

  const ballot = await getBallot(roundId, userId);
  if (!ballot) {
    throw new NotFoundError("You haven't submitted a ballot yet");
  }

  ctx.response.status = 200;
  ctx.response.body = ballot;
}

export async function getBallotsController(
  ctx: RouterContext<
    "/api/rounds/:roundId/ballots",
    RouteParams<"/api/rounds/:roundId/ballots">,
    AuthenticatedAppState
  >
) {
  const roundId = ctx.params.roundId;
  const userId = ctx.state.user.userId;
  const limit = Number(ctx.request.url.searchParams.get("limit")) || 20;
  const offset = Number(ctx.request.url.searchParams.get("page")) || 0;
  const format = ctx.request.url.searchParams.get("format") || "json";

  if (format !== "json" && format !== "csv") {
    throw new BadRequestError("Invalid format. Possible: json, csv");
  }

  const ballots = await getBallots(roundId, userId, limit, offset, format);

  ctx.response.status = 200;
  ctx.response.body = ballots;
}

export async function getBallotStatsController(
  ctx: RouterContext<
    "/api/rounds/:roundId/ballots/stats",
    RouteParams<"/api/rounds/:roundId/ballots/stats">,
    AuthenticatedAppState
  >
) {
  const roundId = ctx.params.roundId;
  const userId = ctx.state.user.userId;

  const stats = await getBallotStats(roundId, userId);

  ctx.response.status = 200;
  ctx.response.body = stats;
}
