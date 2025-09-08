import { RouteParams, RouterContext } from "oak";
import { AuthenticatedAppState } from "../../main.ts";
import { getLogsByRoundId } from "../services/auditLogService.ts";

export async function getAuditLogsForRoundController(
  ctx: RouterContext<
    "/api/rounds/:roundId/audit-logs",
    RouteParams<"/api/rounds/:roundId/audit-logs">,
    AuthenticatedAppState
  >
) {
  const roundId = ctx.params.roundId;
  const userId = ctx.state.user.userId;
  const limit = Number(ctx.request.url.searchParams.get("limit")) || 50;
  const next = ctx.request.url.searchParams.get("next") ?? undefined;

  const result = await getLogsByRoundId(roundId, limit, next, userId);

  ctx.response.status = 200;
  ctx.response.body = result;
}
