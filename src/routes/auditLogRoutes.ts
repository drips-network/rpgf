import { Router } from "oak";
import { enforceAuthenticationMiddleware } from "../middleware/authMiddleware.ts";
import * as auditLogController from "$app/controllers/auditLogController.ts";
import { z } from "zod";
import { registry, badRequestResponse, serverErrorResponse, unauthorizedResponse, notFoundResponse } from "$app/openapi/registry.ts";

const router = new Router();

router.get("/api/rounds/:roundId/audit-logs", enforceAuthenticationMiddleware, auditLogController.getAuditLogsForRoundController);

registry.registerPath({
  method: "get",
  path: "/api/rounds/{roundId}/audit-logs",
  tags: ["Audit Logs"],
  summary: "Get audit logs",
  description: "Retrieves the audit trail of changes to a round, including application reviews, configuration changes, voter list updates, and other administrative actions. Supports cursor-based pagination. Requires round admin permissions.",
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      roundId: z.string(),
    }),
    query: z.object({
      limit: z.string().optional().default("50"),
      next: z.string().optional(),
    }),
  },
  responses: {
    200: {
      description: "Paginated audit log entries",
      content: {
        "application/json": {
          schema: z.object({
            items: z.array(
              z.object({
                id: z.string(),
                roundId: z.string(),
                action: z.string(),
                actorWalletAddress: z.string(),
                timestamp: z.string(),
                details: z.string().optional(),
              })
            ),
            next: z.string().optional(),
          }),
        },
      },
    },
    ...badRequestResponse,
    ...unauthorizedResponse,
    ...notFoundResponse,
    ...serverErrorResponse,
  },
});

export default router;
