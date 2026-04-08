import { Router } from "oak";
import { z } from "zod";
import * as roundController from "$app/controllers/roundController.ts";
import { enforceAuthenticationMiddleware } from "../middleware/authMiddleware.ts";
import { registry, badRequestResponse, serverErrorResponse, unauthorizedResponse, notFoundResponse } from "$app/openapi/registry.ts";

const router = new Router();

router.get("/api/rounds", roundController.getRoundsController);
router.get("/api/rounds/own", enforceAuthenticationMiddleware, roundController.getOwnRoundsController);
router.get("/api/rounds/:id", roundController.getRoundController);

router.get("/api/rounds/check-slug/:slug", roundController.checkSlugAvailabilityController);

router.put("/api/rounds", enforceAuthenticationMiddleware, roundController.createRoundController);
router.post("/api/rounds/:id/publish", enforceAuthenticationMiddleware, roundController.publishRoundController);
router.delete("/api/rounds/:id", enforceAuthenticationMiddleware, roundController.deleteRoundController);
router.patch("/api/rounds/:id", enforceAuthenticationMiddleware, roundController.patchRoundController);

router.patch("/api/rounds/:id/drip-lists", enforceAuthenticationMiddleware, roundController.linkDripListToRoundController);

// --- OpenAPI Annotations ---

registry.registerPath({
  method: "get",
  path: "/api/rounds",
  summary: "List rounds",
  description: "Lists published RPGF rounds with pagination. Optionally filter by blockchain using the chainId query parameter.",
  tags: ["Rounds"],
  security: [],
  request: {
    query: z.object({
      limit: z.coerce.number().default(20).describe("Maximum number of rounds to return"),
      offset: z.coerce.number().default(0).describe("Number of rounds to skip"),
      chainId: z.coerce.number().optional().describe("Filter by chain ID"),
    }),
  },
  responses: {
    200: {
      description: "A list of rounds",
      content: {
        "application/json": {
          schema: z.array(z.object({}).passthrough().describe("Round object")),
        },
      },
    },
    ...badRequestResponse,
    ...serverErrorResponse,
  },
});

registry.registerPath({
  method: "get",
  path: "/api/rounds/own",
  summary: "List own rounds",
  description: "Lists all rounds created by the authenticated user. Optionally filter by blockchain using the chainId query parameter.",
  tags: ["Rounds"],
  security: [{ bearerAuth: [] }],
  request: {
    query: z.object({
      chainId: z.coerce.number().optional().describe("Filter by chain ID"),
    }),
  },
  responses: {
    200: {
      description: "A list of rounds owned by the authenticated user",
      content: {
        "application/json": {
          schema: z.array(z.object({}).passthrough().describe("Round object")),
        },
      },
    },
    ...unauthorizedResponse,
    ...serverErrorResponse,
  },
});

registry.registerPath({
  method: "get",
  path: "/api/rounds/{id}",
  summary: "Get round by ID",
  description: "Retrieves details of a specific round. If a chainId query parameter is provided, validates the round belongs to that chain and returns 404 if not. Returns additional information if the requester is authenticated.",
  tags: ["Rounds"],
  security: [],
  request: {
    params: z.object({
      id: z.string().describe("The round ID"),
    }),
    query: z.object({
      chainId: z.coerce.number().optional().describe("Filter by chain ID"),
    }),
  },
  responses: {
    200: {
      description: "The requested round",
      content: {
        "application/json": {
          schema: z.object({}).passthrough().describe("Round object"),
        },
      },
    },
    ...notFoundResponse,
    ...serverErrorResponse,
  },
});

registry.registerPath({
  method: "get",
  path: "/api/rounds/check-slug/{slug}",
  summary: "Check slug availability",
  description: "Checks whether a given URL slug is available for use when creating a new round. The slug must be lowercase alphanumeric with hyphens.",
  tags: ["Rounds"],
  security: [],
  request: {
    params: z.object({
      slug: z.string().describe("The URL slug to check"),
    }),
  },
  responses: {
    200: {
      description: "Slug availability result",
      content: {
        "application/json": {
          schema: z.object({
            available: z.boolean(),
          }),
        },
      },
    },
    ...badRequestResponse,
    ...serverErrorResponse,
  },
});

registry.registerPath({
  method: "put",
  path: "/api/rounds",
  summary: "Create round",
  description: "Creates a new RPGF round in draft state. The authenticated user becomes the round creator and owner. The round must be published separately before it becomes visible.",
  tags: ["Rounds"],
  security: [{ bearerAuth: [] }],
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            draft: z.literal(true),
            emoji: z.string().describe("An emoji character"),
            chainId: z.number().int().positive().describe("The blockchain chain ID"),
            color: z.string().describe("A hex color string from the allowed set"),
            name: z.string().nullable().describe("Round name (1-255 chars)"),
            customAvatarCid: z.string().nullable().describe("IPFS CID for a custom avatar"),
            urlSlug: z.string().nullable().describe("URL-safe slug (lowercase, hyphens allowed)"),
            description: z.string().nullable().describe("Round description (max 10000 chars)"),
            applicationPeriodStart: z.string().nullable().describe("ISO date string for application period start"),
            applicationPeriodEnd: z.string().nullable().describe("ISO date string for application period end"),
            votingPeriodStart: z.string().nullable().describe("ISO date string for voting period start"),
            votingPeriodEnd: z.string().nullable().describe("ISO date string for voting period end"),
            resultsPeriodStart: z.string().nullable().describe("ISO date string for results period start"),
            maxVotesPerVoter: z.number().int().positive().nullable().describe("Maximum votes per voter"),
            maxVotesPerProjectPerVoter: z.number().int().positive().nullable().describe("Maximum votes per project per voter"),
            minVotesPerProjectPerVoter: z.number().int().positive().nullable().describe("Minimum votes per project per voter"),
            voterGuidelinesLink: z.string().nullable().describe("URL to voter guidelines"),
            kycProvider: z.enum(["FERN"]).nullable().describe("KYC provider to use"),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "The created round",
      content: {
        "application/json": {
          schema: z.object({}).passthrough().describe("The newly created round object"),
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
  path: "/api/rounds/{id}/publish",
  summary: "Publish round",
  description: "Transitions a round from draft to published state, making it publicly visible. Requires round admin permissions.",
  tags: ["Rounds"],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      id: z.string().describe("The round ID"),
    }),
  },
  responses: {
    200: {
      description: "The round was published successfully",
      content: {
        "application/json": {
          schema: z.object({}).passthrough().describe("The published round object"),
        },
      },
    },
    ...badRequestResponse,
    ...unauthorizedResponse,
    ...notFoundResponse,
    ...serverErrorResponse,
  },
});

registry.registerPath({
  method: "delete",
  path: "/api/rounds/{id}",
  summary: "Delete round",
  description: "Permanently deletes a round. Requires round admin permissions. This action cannot be undone.",
  tags: ["Rounds"],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      id: z.string().describe("The round ID"),
    }),
  },
  responses: {
    204: {
      description: "The round was deleted successfully",
    },
    ...unauthorizedResponse,
    ...notFoundResponse,
    ...serverErrorResponse,
  },
});

registry.registerPath({
  method: "patch",
  path: "/api/rounds/{id}",
  summary: "Update round",
  description: "Updates a round's configuration including name, description, schedule, voting limits, and other settings. Requires round admin permissions.",
  tags: ["Rounds"],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      id: z.string().describe("The round ID"),
    }),
    body: {
      content: {
        "application/json": {
          schema: z.object({
            emoji: z.string().optional().describe("An emoji character"),
            color: z.string().optional().describe("A hex color string from the allowed set"),
            name: z.string().nullable().optional().describe("Round name (1-255 chars)"),
            customAvatarCid: z.string().nullable().optional().describe("IPFS CID for a custom avatar"),
            urlSlug: z.string().nullable().optional().describe("URL-safe slug (lowercase, hyphens allowed)"),
            description: z.string().nullable().optional().describe("Round description (max 10000 chars)"),
            applicationPeriodStart: z.string().nullable().optional().describe("ISO date string for application period start"),
            applicationPeriodEnd: z.string().nullable().optional().describe("ISO date string for application period end"),
            votingPeriodStart: z.string().nullable().optional().describe("ISO date string for voting period start"),
            votingPeriodEnd: z.string().nullable().optional().describe("ISO date string for voting period end"),
            resultsPeriodStart: z.string().nullable().optional().describe("ISO date string for results period start"),
            maxVotesPerVoter: z.number().int().positive().nullable().optional().describe("Maximum votes per voter"),
            maxVotesPerProjectPerVoter: z.number().int().positive().nullable().optional().describe("Maximum votes per project per voter"),
            minVotesPerProjectPerVoter: z.number().int().positive().nullable().optional().describe("Minimum votes per project per voter"),
            voterGuidelinesLink: z.string().nullable().optional().describe("URL to voter guidelines"),
            kycProvider: z.enum(["FERN"]).nullable().optional().describe("KYC provider to use"),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "The updated round",
      content: {
        "application/json": {
          schema: z.object({}).passthrough().describe("The updated round object"),
        },
      },
    },
    ...badRequestResponse,
    ...unauthorizedResponse,
    ...notFoundResponse,
    ...serverErrorResponse,
  },
});

registry.registerPath({
  method: "patch",
  path: "/api/rounds/{id}/drip-lists",
  summary: "Link Drip Lists to round",
  description: "Associates one or more Drip List accounts with the round for distributing results. Requires round admin permissions.",
  tags: ["Rounds"],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      id: z.string().describe("The round ID"),
    }),
    body: {
      content: {
        "application/json": {
          schema: z.object({
            dripListAccountIds: z.array(z.string()).describe("Array of Drip List account IDs to link"),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "Drip lists linked successfully",
      content: {
        "application/json": {
          schema: z.object({
            message: z.string(),
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
