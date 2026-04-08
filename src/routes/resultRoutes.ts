import { Router } from "oak";
import { z } from "zod";
import { registry, badRequestResponse, serverErrorResponse, unauthorizedResponse, notFoundResponse } from "$app/openapi/registry.ts";
import { enforceAuthenticationMiddleware } from "../middleware/authMiddleware.ts";
import * as resolutController from "$app/controllers/resultController.ts";

const router = new Router();

router.post('/api/rounds/:roundId/results/recalculate', enforceAuthenticationMiddleware, resolutController.recalculateResultsController);
router.post('/api/rounds/:roundId/results/import', enforceAuthenticationMiddleware, resolutController.importResultsFromSpreadsheetController);
router.post('/api/rounds/:roundId/results/publish', enforceAuthenticationMiddleware, resolutController.publishResultsController);

router.get('/api/rounds/:roundId/results/drip-list-weights', enforceAuthenticationMiddleware, resolutController.getDripListWeightsController);

registry.registerPath({
  method: "post",
  path: "/api/rounds/{roundId}/results/recalculate",
  tags: ["Results"],
  summary: "Recalculate results",
  description: "Recalculates round results from submitted ballots using the specified aggregation method (median, average, or sum). Requires round admin permissions.",
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      roundId: z.string().uuid(),
    }),
    query: z.object({
      method: z.enum(["median", "avg", "sum"]),
    }),
  },
  responses: {
    200: {
      description: "Results recalculated successfully",
      content: {
        "application/json": {
          schema: z.object({
            success: z.boolean(),
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
  path: "/api/rounds/{roundId}/results/import",
  tags: ["Results"],
  summary: "Import results from spreadsheet",
  description: "Imports round results from a CSV or XLSX file for manual result entry. The file must contain ID (UUID) and Allocation (positive number) columns. Requires round admin permissions.",
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
      description: "Results imported successfully",
      content: {
        "application/json": {
          schema: z.object({
            success: z.boolean(),
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
  path: "/api/rounds/{roundId}/results/publish",
  tags: ["Results"],
  summary: "Publish results",
  description: "Finalizes and publishes round results, making them publicly visible. This action cannot be undone. Requires round admin permissions.",
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      roundId: z.string().uuid(),
    }),
  },
  responses: {
    200: {
      description: "Results published successfully",
      content: {
        "application/json": {
          schema: z.object({
            success: z.boolean(),
          }),
        },
      },
    },
    ...unauthorizedResponse,
    ...serverErrorResponse,
  },
});

registry.registerPath({
  method: "get",
  path: "/api/rounds/{roundId}/results/drip-list-weights",
  tags: ["Results"],
  summary: "Get Drip List weights",
  description: "Calculates the distribution weights for linked Drip Lists based on the round's results. Used to configure on-chain fund distribution.",
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      roundId: z.string().uuid(),
    }),
  },
  responses: {
    200: {
      description: "Drip list weights",
      content: {
        "application/json": {
          schema: z.object({
            weights: z.record(z.string(), z.number()),
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
