import { Router } from "oak";
import { z } from "zod";
import {
  registry,
  badRequestResponse,
  serverErrorResponse,
  unauthorizedResponse,
  notFoundResponse,
} from "$app/openapi/registry.ts";
import * as ballotController from "$app/controllers/ballotController.ts";
import { enforceAuthenticationMiddleware } from "../middleware/authMiddleware.ts";

const router = new Router();

// Unauthenticated: called by external voting tools
router.post(
  "/api/rounds/:roundId/external-vote-results",
  ballotController.submitExternalVoteResultController,
);

// Authenticated: called by the voter's browser
router.get(
  "/api/rounds/:roundId/external-vote-results/:id",
  enforceAuthenticationMiddleware,
  ballotController.getExternalVoteResultController,
);

// --- OpenAPI Annotations ---

const roundIdParam = z.object({
  roundId: z.string().uuid(),
});

registry.registerPath({
  method: "post",
  path: "/api/rounds/{roundId}/external-vote-results",
  tags: ["External Voting"],
  summary: "Submit external vote result",
  description:
    "Called by external voting tools (e.g. Pairwise) to submit vote results for a voter. Requires HMAC-SHA256 signature in the x-signature header, computed over the raw JSON body using the category's configured secret. The voter's Ethereum address must be included to identify whose ballot this applies to. Returns an ephemeral callback URL that the external tool should redirect the voter to.",
  security: [],
  request: {
    params: roundIdParam,
    body: {
      content: {
        "application/json": {
          schema: z.object({
            categoryId: z.string().uuid(),
            voterAddress: z.string().openapi({
              description: "Ethereum address of the voter",
              example: "0x1234567890abcdef1234567890abcdef12345678",
            }),
            votes: z.record(z.string().uuid(), z.number().int().min(0)).openapi({
              description: "Map of application ID to vote count",
              example: {
                "550e8400-e29b-41d4-a716-446655440000": 100,
                "6ba7b810-9dad-11d1-80b4-00c04fd430c8": 250,
              },
            }),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "Vote result stored. Returns an ephemeral callback URL (valid for 12 hours).",
      content: {
        "application/json": {
          schema: z.object({
            id: z.string().uuid().openapi({ description: "Ephemeral result ID" }),
            callbackUrl: z.string().url().openapi({
              description: "Full URL to redirect the voter to",
              example: "https://drips.network/rpgf/external-vote-landing?externalVoteResultId=abc-123&roundId=def-456",
            }),
          }),
        },
      },
    },
    ...badRequestResponse,
    ...unauthorizedResponse,
    ...serverErrorResponse,
  },
});

registry.registerPath({
  method: "get",
  path: "/api/rounds/{roundId}/external-vote-results/{id}",
  tags: ["External Voting"],
  summary: "Retrieve external vote result",
  description:
    "Retrieves an external vote result by its ephemeral ID. The authenticated voter's wallet address must match the voterAddress in the result. Results expire after 12 hours. After retrieving, the voter can commit the votes to their draft using the standard draft save endpoint.",
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      roundId: z.string().uuid(),
      id: z.string().uuid(),
    }),
  },
  responses: {
    200: {
      description: "External vote result",
      content: {
        "application/json": {
          schema: z.object({
            categoryId: z.string().uuid(),
            voterAddress: z.string().openapi({
              description: "Ethereum address this result is intended for",
            }),
            votes: z.record(z.string().uuid(), z.number().int().min(0)).openapi({
              description: "Map of application ID to vote count",
              example: {
                "550e8400-e29b-41d4-a716-446655440000": 100,
                "6ba7b810-9dad-11d1-80b4-00c04fd430c8": 250,
              },
            }),
          }),
        },
      },
    },
    ...unauthorizedResponse,
    ...notFoundResponse,
    ...serverErrorResponse,
  },
});

export default router;
