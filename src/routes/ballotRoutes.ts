import { Router } from "oak";
import { z } from "zod";
import { registry, badRequestResponse, serverErrorResponse, unauthorizedResponse, notFoundResponse } from "$app/openapi/registry.ts";
import { enforceAuthenticationMiddleware } from "../middleware/authMiddleware.ts";
import * as ballotController from "$app/controllers/ballotController.ts";

const router = new Router();

router.post('/api/rounds/:roundId/ballots/parse-spreadsheet', enforceAuthenticationMiddleware, ballotController.parseBallotFromSpreadsheetController);
router.put('/api/rounds/:roundId/ballots', enforceAuthenticationMiddleware, ballotController.submitBallotController);
router.post('/api/rounds/:roundId/ballots/spreadsheet', enforceAuthenticationMiddleware, ballotController.submitBallotAsSpreadsheetController);

router.get('/api/rounds/:roundId/ballots/own', enforceAuthenticationMiddleware, ballotController.getOwnBallotController);
router.get('/api/rounds/:roundId/ballots', enforceAuthenticationMiddleware, ballotController.getBallotsController);
router.get('/api/rounds/:roundId/ballots/stats', enforceAuthenticationMiddleware, ballotController.getBallotStatsController);

registry.registerPath({
  method: "post",
  path: "/api/rounds/{roundId}/ballots/parse-spreadsheet",
  tags: ["Ballots"],
  summary: "Parse ballot spreadsheet",
  description: "Validates and parses a CSV or XLSX ballot file without submitting it. The file must contain ID (UUID) and Allocation (non-negative number) columns. Returns the parsed ballot as a map of application IDs to allocations, or detailed row-by-row validation errors.",
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      roundId: z.string().uuid(),
    }),
    query: z.object({
      format: z.enum(["csv", "xlsx"]),
    }),
    body: {
      content: {
        "application/octet-stream": {
          schema: z.string().openapi({ format: "binary" }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "Parsed ballot from spreadsheet",
      content: {
        "application/json": {
          schema: z.object({
            ballot: z.record(z.string(), z.number()).openapi({ description: "Map of application ID (UUID) to allocation value", example: { "550e8400-e29b-41d4-a716-446655440000": 100, "6ba7b810-9dad-11d1-80b4-00c04fd430c8": 250 } }),
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
  method: "put",
  path: "/api/rounds/{roundId}/ballots",
  tags: ["Ballots"],
  summary: "Submit ballot",
  description: "Submits the authenticated voter's ballot for a round. The ballot maps application IDs to integer allocation values. Requires a cryptographic signature and chain ID for on-chain verification.",
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      roundId: z.string().uuid(),
    }),
    body: {
      content: {
        "application/json": {
          schema: z.object({
            ballot: z.record(z.string().uuid(), z.number().int().min(0)).openapi({ description: "Map of application ID (UUID) to integer allocation value (>= 0)", example: { "550e8400-e29b-41d4-a716-446655440000": 100, "6ba7b810-9dad-11d1-80b4-00c04fd430c8": 250 } }),
            signature: z.string(),
            chainId: z.number().int().positive(),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "Submitted ballot",
      content: {
        "application/json": {
          schema: z.object({
            id: z.string().uuid(),
            roundId: z.string().uuid(),
            voterId: z.string(),
            ballot: z.record(z.string().uuid(), z.number()).openapi({ description: "Map of application ID (UUID) to allocation value", example: { "550e8400-e29b-41d4-a716-446655440000": 100, "6ba7b810-9dad-11d1-80b4-00c04fd430c8": 250 } }),
            signature: z.string(),
            chainId: z.number(),
            createdAt: z.string(),
            updatedAt: z.string(),
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
  method: "post",
  path: "/api/rounds/{roundId}/ballots/spreadsheet",
  tags: ["Ballots"],
  summary: "Submit ballot from spreadsheet",
  description: "Parses and submits a ballot from a CSV or XLSX file. Requires signature and chainId as query parameters. Optionally accepts an addressOverride to submit on behalf of another voter, which records the acting user for audit purposes.",
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      roundId: z.string().uuid(),
    }),
    query: z.object({
      format: z.enum(["csv", "xlsx"]),
      signature: z.string(),
      chainId: z.number().int().positive(),
      addressOverride: z.string().optional(),
    }),
    body: {
      content: {
        "application/octet-stream": {
          schema: z.string().openapi({ format: "binary" }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "Submitted ballot from spreadsheet",
      content: {
        "application/json": {
          schema: z.object({
            id: z.string().uuid(),
            roundId: z.string().uuid(),
            voterId: z.string(),
            ballot: z.record(z.string().uuid(), z.number()).openapi({ description: "Map of application ID (UUID) to allocation value", example: { "550e8400-e29b-41d4-a716-446655440000": 100, "6ba7b810-9dad-11d1-80b4-00c04fd430c8": 250 } }),
            signature: z.string(),
            chainId: z.number(),
            createdAt: z.string(),
            updatedAt: z.string(),
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
  path: "/api/rounds/{roundId}/ballots/own",
  tags: ["Ballots"],
  summary: "Get own ballot",
  description: "Retrieves the authenticated voter's submitted ballot for a round. Returns 404 if no ballot has been submitted yet.",
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      roundId: z.string().uuid(),
    }),
  },
  responses: {
    200: {
      description: "Own ballot",
      content: {
        "application/json": {
          schema: z.object({
            id: z.string().uuid(),
            roundId: z.string().uuid(),
            voterId: z.string(),
            ballot: z.record(z.string().uuid(), z.number()).openapi({ description: "Map of application ID (UUID) to allocation value", example: { "550e8400-e29b-41d4-a716-446655440000": 100, "6ba7b810-9dad-11d1-80b4-00c04fd430c8": 250 } }),
            signature: z.string(),
            chainId: z.number(),
            createdAt: z.string(),
            updatedAt: z.string(),
          }),
        },
      },
    },
    ...unauthorizedResponse,
    ...notFoundResponse,
    ...serverErrorResponse,
  },
});

registry.registerPath({
  method: "get",
  path: "/api/rounds/{roundId}/ballots",
  tags: ["Ballots"],
  summary: "List ballots",
  description: "Lists all submitted ballots for a round with pagination. Requires round admin permissions. Results can be exported as JSON or CSV.",
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      roundId: z.string().uuid(),
    }),
    query: z.object({
      limit: z.number().int().positive().optional().openapi({ default: 20 }),
      page: z.number().int().min(0).optional().openapi({ default: 0 }),
      format: z.enum(["json", "csv"]).optional().openapi({ default: "json" }),
    }),
  },
  responses: {
    200: {
      description: "List of ballots (JSON array or CSV depending on format parameter)",
      content: {
        "application/json": {
          schema: z.array(
            z.object({
              id: z.string().uuid(),
              roundId: z.string().uuid(),
              voterId: z.string(),
              ballot: z.record(z.string().uuid(), z.number()).openapi({ description: "Map of application ID (UUID) to allocation value", example: { "550e8400-e29b-41d4-a716-446655440000": 100, "6ba7b810-9dad-11d1-80b4-00c04fd430c8": 250 } }),
              signature: z.string(),
              chainId: z.number(),
              createdAt: z.string(),
              updatedAt: z.string(),
            }),
          ),
        },
      },
    },
    ...unauthorizedResponse,
    ...serverErrorResponse,
  },
});

registry.registerPath({
  method: "get",
  path: "/api/rounds/{roundId}/ballots/stats",
  tags: ["Ballots"],
  summary: "Get ballot statistics",
  description: "Returns voting statistics for a round, such as total votes cast and participation metrics.",
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      roundId: z.string().uuid(),
    }),
  },
  responses: {
    200: {
      description: "Ballot statistics",
      content: {
        "application/json": {
          schema: z.object({
            totalBallots: z.number().int(),
            totalVoters: z.number().int(),
          }),
        },
      },
    },
    ...unauthorizedResponse,
    ...serverErrorResponse,
  },
});

export default router;
