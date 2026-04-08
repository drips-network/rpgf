import { Router } from "oak";
import * as c from "../controllers/roundVoterController.ts";
import { enforceAuthenticationMiddleware } from "../middleware/authMiddleware.ts";
import { z } from "zod";
import { registry, badRequestResponse, serverErrorResponse, unauthorizedResponse, notFoundResponse } from "$app/openapi/registry.ts";

const router = new Router();

router.get("/api/rounds/:roundId/voters", enforceAuthenticationMiddleware, c.getRoundVotersController);
router.put("/api/rounds/:roundId/voters", enforceAuthenticationMiddleware, c.setRoundVotersController);

registry.registerPath({
  method: "get",
  path: "/api/rounds/{roundId}/voters",
  tags: ["Round Voters"],
  summary: "List round voters",
  description: "Retrieves the list of wallet addresses eligible to vote in this round. Requires round admin permissions.",
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      roundId: z.string(),
    }),
  },
  responses: {
    200: {
      description: "Array of voter objects",
      content: {
        "application/json": {
          schema: z.array(
            z.object({
              walletAddress: z.string(),
              roundId: z.string(),
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
  path: "/api/rounds/{roundId}/voters",
  tags: ["Round Voters"],
  summary: "Set round voters",
  description: "Replaces the full list of eligible voters for a round. Accepts up to 100,000 Ethereum wallet addresses. Requires round admin permissions.",
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      roundId: z.string(),
    }),
    body: {
      content: {
        "application/json": {
          schema: z.object({
            walletAddresses: z.array(z.string()).max(100000),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "Array of voters",
      content: {
        "application/json": {
          schema: z.array(
            z.object({
              walletAddress: z.string(),
              roundId: z.string(),
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
