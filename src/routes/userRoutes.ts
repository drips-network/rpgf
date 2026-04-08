import { Router } from "oak";
import { z } from "zod";
import * as userController from "$app/controllers/userController.ts";
import { enforceAuthenticationMiddleware } from "../middleware/authMiddleware.ts";
import { registry, badRequestResponse, serverErrorResponse, unauthorizedResponse, notFoundResponse } from "$app/openapi/registry.ts";

const router = new Router();

router.get("/api/users/me", enforceAuthenticationMiddleware, userController.getOwnUserDataController);

registry.registerPath({
  method: "get",
  path: "/api/users/me",
  tags: ["User"],
  summary: "Get own user data",
  description: "Returns the authenticated user's profile data for the specified chain. The chainId query parameter is required to scope the user data to a specific blockchain.",
  security: [{ bearerAuth: [] }],
  request: {
    query: z.object({
      chainId: z.coerce.number().describe("The chain ID to query the user for"),
    }),
  },
  responses: {
    200: {
      description: "The authenticated user's data",
      content: {
        "application/json": {
          schema: z.object({
            id: z.string().uuid(),
            walletAddress: z.string().openapi({ description: "Ethereum address", example: "0x1234567890abcdef1234567890abcdef12345678" }),
            whitelisted: z.boolean().openapi({ description: "Whether the user is whitelisted for the specified chain" }),
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
