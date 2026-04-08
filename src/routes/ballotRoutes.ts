import { Router } from "oak";
import { z } from "zod";
import {
  registry,
  badRequestResponse,
  serverErrorResponse,
  unauthorizedResponse,
  notFoundResponse,
} from "$app/openapi/registry.ts";
import { enforceAuthenticationMiddleware } from "../middleware/authMiddleware.ts";
import * as ballotController from "$app/controllers/ballotController.ts";

const router = new Router();

// Category allocations
router.put(
  "/api/rounds/:roundId/ballot-allocations",
  enforceAuthenticationMiddleware,
  ballotController.saveCategoryAllocationsController,
);
router.get(
  "/api/rounds/:roundId/ballot-allocations/own",
  enforceAuthenticationMiddleware,
  ballotController.getOwnCategoryAllocationsController,
);

// Draft votes
router.put(
  "/api/rounds/:roundId/ballots/draft/:categoryId",
  enforceAuthenticationMiddleware,
  ballotController.saveDraftVotesController,
);
router.get(
  "/api/rounds/:roundId/ballots/draft",
  enforceAuthenticationMiddleware,
  ballotController.getDraftVotesController,
);

// Spreadsheet
router.post(
  "/api/rounds/:roundId/ballots/parse-spreadsheet",
  enforceAuthenticationMiddleware,
  ballotController.parseBallotFromSpreadsheetController,
);
router.post(
  "/api/rounds/:roundId/ballots/spreadsheet",
  enforceAuthenticationMiddleware,
  ballotController.submitBallotAsSpreadsheetController,
);

// Ballot preview & submission
router.get(
  "/api/rounds/:roundId/ballots/preview",
  enforceAuthenticationMiddleware,
  ballotController.getBallotPreviewController,
);
router.put(
  "/api/rounds/:roundId/ballots",
  enforceAuthenticationMiddleware,
  ballotController.submitBallotController,
);

// Read endpoints
router.get(
  "/api/rounds/:roundId/ballots/own",
  enforceAuthenticationMiddleware,
  ballotController.getOwnBallotController,
);
router.get(
  "/api/rounds/:roundId/ballots",
  enforceAuthenticationMiddleware,
  ballotController.getBallotsController,
);
router.get(
  "/api/rounds/:roundId/ballots/stats",
  enforceAuthenticationMiddleware,
  ballotController.getBallotStatsController,
);

// --- OpenAPI Annotations ---

const roundIdParam = z.object({
  roundId: z.string().uuid(),
});

const ballotExampleMap = {
  "550e8400-e29b-41d4-a716-446655440000": 100,
  "6ba7b810-9dad-11d1-80b4-00c04fd430c8": 250,
};

// Category Allocations

registry.registerPath({
  method: "put",
  path: "/api/rounds/{roundId}/ballot-allocations",
  tags: ["Ballots"],
  summary: "Save category percentages",
  description:
    "Sets or updates the voter's percentage split across application categories. Percentages must be integers summing to exactly 100 and must meet any admin-configured minimum percentages per category. If a category's percentage decreases and existing draft votes exceed the new budget, votes are scaled down proportionally using the largest remainder method. Category percentages must be set before saving draft votes or submitting a ballot.",
  security: [{ bearerAuth: [] }],
  request: {
    params: roundIdParam,
    body: {
      content: {
        "application/json": {
          schema: z.object({
            categoryPercentages: z
              .record(z.string().uuid(), z.number().int().min(0).max(100))
              .openapi({
                description:
                  "Map of category ID to percentage (0-100). Must sum to 100.",
                example: {
                  "cat-uuid-1": 40,
                  "cat-uuid-2": 35,
                  "cat-uuid-3": 25,
                },
              }),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "Category percentages saved successfully",
      content: {
        "application/json": {
          schema: z.object({
            categoryPercentages: z.record(z.string(), z.number()).openapi({
              description: "Map of category ID to percentage",
              example: { "cat-uuid-1": 40, "cat-uuid-2": 35, "cat-uuid-3": 25 },
            }),
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
  path: "/api/rounds/{roundId}/ballot-allocations/own",
  tags: ["Ballots"],
  summary: "Get own category percentages",
  description:
    "Retrieves the authenticated voter's current category percentages for a round. Returns null if not set yet.",
  security: [{ bearerAuth: [] }],
  request: { params: roundIdParam },
  responses: {
    200: {
      description: "Category percentages (or null if not set)",
      content: {
        "application/json": {
          schema: z
            .object({
              categoryPercentages: z.record(z.string(), z.number()).openapi({
                description: "Map of category ID to percentage",
                example: { "cat-uuid-1": 40, "cat-uuid-2": 35, "cat-uuid-3": 25 },
              }),
              createdAt: z.string(),
              updatedAt: z.string(),
            })
            .nullable(),
        },
      },
    },
    ...unauthorizedResponse,
    ...serverErrorResponse,
  },
});

// Spreadsheet

registry.registerPath({
  method: "post",
  path: "/api/rounds/{roundId}/ballots/parse-spreadsheet",
  tags: ["Ballots"],
  summary: "Parse ballot spreadsheet",
  description:
    "Validates and parses a CSV or XLSX ballot file without submitting it. The file must contain ID (UUID) and Allocation (non-negative number) columns. Returns the parsed ballot as a map of application IDs to allocations, or detailed row-by-row validation errors.",
  security: [{ bearerAuth: [] }],
  request: {
    params: roundIdParam,
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
            ballot: z.record(z.string(), z.number()).openapi({
              description: "Map of application ID to allocation value",
              example: ballotExampleMap,
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
  method: "post",
  path: "/api/rounds/{roundId}/ballots/spreadsheet",
  tags: ["Ballots"],
  summary: "Submit ballot from spreadsheet",
  description:
    "Parses and submits a ballot from a CSV or XLSX file. Requires signature and chainId as query parameters. Validates that category minimum percentage requirements are met. Optionally accepts an addressOverride to submit on behalf of another voter (requires round admin permissions).",
  security: [{ bearerAuth: [] }],
  request: {
    params: roundIdParam,
    query: z.object({
      format: z.enum(["csv", "xlsx"]),
      signature: z.string(),
      chainId: z.number().int().positive(),
      addressOverride: z.string().optional().openapi({
        description: "Ethereum address to submit on behalf of (admin only)",
      }),
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
      description: "Ballot submitted from spreadsheet",
      content: {
        "application/json": {
          schema: z.object({
            id: z.string().uuid(),
            ballot: z.record(z.string().uuid(), z.number()).openapi({
              description: "The submitted ballot",
              example: ballotExampleMap,
            }),
            signature: z.string().nullable(),
            chainId: z.number().nullable(),
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

// Draft Votes

registry.registerPath({
  method: "put",
  path: "/api/rounds/{roundId}/ballots/draft/{categoryId}",
  tags: ["Ballots"],
  summary: "Save draft votes for category",
  description:
    "Saves or updates in-progress votes for a single category. Category percentages must be set first. Total votes within the category must not exceed the category's percentage share of maxVotesPerVoter. Per-project vote limits are also enforced. Designed for periodic auto-saving by the UI.",
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      roundId: z.string().uuid(),
      categoryId: z.string().uuid(),
    }),
    body: {
      content: {
        "application/json": {
          schema: z.object({
            votes: z
              .record(z.string().uuid(), z.number().int().min(0))
              .openapi({
                description:
                  "Map of application ID to vote count for this category",
                example: ballotExampleMap,
              }),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "Draft votes saved (filtered to non-zero entries)",
      content: {
        "application/json": {
          schema: z.record(z.string(), z.number()).openapi({
            description: "The saved votes (zero-vote entries removed)",
            example: ballotExampleMap,
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
  path: "/api/rounds/{roundId}/ballots/draft",
  tags: ["Ballots"],
  summary: "Get all draft votes",
  description:
    "Retrieves all saved draft votes for the authenticated voter across all categories in a round.",
  security: [{ bearerAuth: [] }],
  request: { params: roundIdParam },
  responses: {
    200: {
      description:
        "Map of category ID to votes (each being a map of application ID to vote count)",
      content: {
        "application/json": {
          schema: z.record(
            z.string(),
            z.record(z.string(), z.number()),
          ).openapi({
            description: "categoryId -> { applicationId -> voteCount }",
          }),
        },
      },
    },
    ...unauthorizedResponse,
    ...serverErrorResponse,
  },
});

// Ballot Preview & Submission

registry.registerPath({
  method: "get",
  path: "/api/rounds/{roundId}/ballots/preview",
  tags: ["Ballots"],
  summary: "Preview assembled ballot",
  description:
    "Assembles and returns the flat ballot that would be submitted from the voter's current draft votes. The client should use this to construct the EIP-712 signature before calling the submit endpoint.",
  security: [{ bearerAuth: [] }],
  request: { params: roundIdParam },
  responses: {
    200: {
      description: "Assembled flat ballot for signing",
      content: {
        "application/json": {
          schema: z.object({
            ballot: z.record(z.string().uuid(), z.number()).openapi({
              description: "Flat map of application ID to total vote count",
              example: ballotExampleMap,
            }),
          }),
        },
      },
    },
    ...unauthorizedResponse,
    ...serverErrorResponse,
  },
});

registry.registerPath({
  method: "put",
  path: "/api/rounds/{roundId}/ballots",
  tags: ["Ballots"],
  summary: "Submit ballot",
  description:
    "Submits the voter's final ballot. The server assembles the ballot from saved draft votes and verifies the EIP-712 signature against the assembled result. The client must first call GET /api/rounds/{roundId}/ballots/preview to obtain the flat ballot for signing. Category percentages and draft votes must be saved before submission. Empty categories (0 votes) are allowed.",
  security: [{ bearerAuth: [] }],
  request: {
    params: roundIdParam,
    body: {
      content: {
        "application/json": {
          schema: z.object({
            signature: z.string().openapi({
              description:
                "EIP-712 signature of the assembled ballot",
            }),
            chainId: z.number().int().positive().openapi({
              description: "Chain ID used for signing",
            }),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "Ballot submitted successfully",
      content: {
        "application/json": {
          schema: z.object({
            id: z.string().uuid(),
            ballot: z.record(z.string().uuid(), z.number()).openapi({
              description:
                "The final flat ballot (merged from all category drafts)",
              example: ballotExampleMap,
            }),
            signature: z.string().nullable(),
            chainId: z.number().nullable(),
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

// Read endpoints

registry.registerPath({
  method: "get",
  path: "/api/rounds/{roundId}/ballots/own",
  tags: ["Ballots"],
  summary: "Get own ballot",
  description:
    "Retrieves the authenticated voter's submitted ballot, category percentages, and draft votes for a round. Returns 404 if no ballot or category percentages exist.",
  security: [{ bearerAuth: [] }],
  request: { params: roundIdParam },
  responses: {
    200: {
      description: "Voter's ballot data including category percentages and drafts",
      content: {
        "application/json": {
          schema: z.object({
            ballot: z
              .object({
                id: z.string().uuid(),
                ballot: z.record(z.string(), z.number()).openapi({
                  description: "Map of application ID to vote count",
                  example: { "550e8400-e29b-41d4-a716-446655440000": 100, "6ba7b810-9dad-11d1-80b4-00c04fd430c8": 250 },
                }),
                signature: z.string().nullable(),
                chainId: z.number().nullable(),
                createdAt: z.string(),
                updatedAt: z.string(),
              })
              .nullable(),
            categoryPercentages: z.record(z.string(), z.number()).nullable().openapi({
              description: "Category percentages, or null if not set",
              example: { "cat-uuid-1": 40, "cat-uuid-2": 35, "cat-uuid-3": 25 },
            }),
            drafts: z.record(z.string(), z.record(z.string(), z.number())).openapi({
              description: "Draft votes per category: categoryId -> { applicationId -> voteCount }",
              example: { "cat-uuid-1": { "550e8400-e29b-41d4-a716-446655440000": 100 }, "cat-uuid-2": { "6ba7b810-9dad-11d1-80b4-00c04fd430c8": 250 } },
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

registry.registerPath({
  method: "get",
  path: "/api/rounds/{roundId}/ballots",
  tags: ["Ballots"],
  summary: "List ballots",
  description:
    "Lists all submitted ballots for a round with pagination. Requires round admin permissions. Results can be exported as JSON or CSV.",
  security: [{ bearerAuth: [] }],
  request: {
    params: roundIdParam,
    query: z.object({
      limit: z.number().int().positive().optional().openapi({ default: 20 }),
      page: z.number().int().min(0).optional().openapi({ default: 0 }),
      format: z.enum(["json", "csv"]).optional().openapi({ default: "json" }),
    }),
  },
  responses: {
    200: {
      description:
        "List of ballots (JSON array or CSV depending on format parameter)",
      content: {
        "application/json": {
          schema: z.array(
            z.object({
              id: z.string().uuid(),
              roundId: z.string().uuid(),
              voterId: z.string(),
              ballot: z.record(z.string().uuid(), z.number()).openapi({
                description: "Map of application ID to allocation value",
                example: ballotExampleMap,
              }),
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
  description:
    "Returns voting statistics for a round, such as total votes cast and participation metrics.",
  security: [{ bearerAuth: [] }],
  request: { params: roundIdParam },
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
