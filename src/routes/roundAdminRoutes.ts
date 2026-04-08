import { Router } from "oak";
import * as c from "../controllers/roundAdminController.ts";
import { enforceAuthenticationMiddleware } from "../middleware/authMiddleware.ts";
import { z } from "zod";
import { registry, badRequestResponse, serverErrorResponse, unauthorizedResponse, notFoundResponse } from "$app/openapi/registry.ts";

const router = new Router();

router.get("/api/rounds/:roundId/admins", enforceAuthenticationMiddleware, c.getRoundAdminsController);
router.put("/api/rounds/:roundId/admins", enforceAuthenticationMiddleware, c.setRoundAdminsController);

registry.registerPath({
  method: "get",
  path: "/api/rounds/{roundId}/admins",
  tags: ["Round Admins"],
  summary: "List round admins",
  description: "Retrieves the list of administrators for a round. Requires round admin permissions.",
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      roundId: z.string(),
    }),
  },
  responses: {
    200: {
      description: "Array of admin objects",
      content: {
        "application/json": {
          schema: z.array(
            z.object({
              walletAddress: z.string(),
              roundId: z.string(),
              superAdmin: z.boolean(),
            })
          ),
        },
      },
    },
    ...unauthorizedResponse,
    ...notFoundResponse,
    ...serverErrorResponse,
  },
});

registry.registerPath({
  method: "put",
  path: "/api/rounds/{roundId}/admins",
  tags: ["Round Admins"],
  summary: "Set round admins",
  description: "Replaces the full list of administrators for a round. Accepts up to 100,000 entries. Each admin can optionally be designated as a super admin. Requires round admin permissions.",
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      roundId: z.string(),
    }),
    body: {
      content: {
        "application/json": {
          schema: z.object({
            admins: z.array(
              z.object({
                walletAddress: z.string(),
                superAdmin: z.boolean().optional(),
              })
            ),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "Array of admins",
      content: {
        "application/json": {
          schema: z.array(
            z.object({
              walletAddress: z.string(),
              roundId: z.string(),
              superAdmin: z.boolean(),
            })
          ),
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
