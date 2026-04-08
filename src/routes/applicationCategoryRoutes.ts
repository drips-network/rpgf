import { Router } from "oak";
import { z } from "zod";
import { registry, badRequestResponse, serverErrorResponse, unauthorizedResponse, notFoundResponse } from "$app/openapi/registry.ts";
import * as c from "../controllers/applicationCategoryController.ts";
import { enforceAuthenticationMiddleware } from "../middleware/authMiddleware.ts";

const router = new Router();

router.get("/api/rounds/:roundId/application-categories", c.getApplicationCategoriesController);
router.put("/api/rounds/:roundId/application-categories", enforceAuthenticationMiddleware, c.createApplicationCategoryController);
router.patch("/api/rounds/:roundId/application-categories/:categoryId", enforceAuthenticationMiddleware, c.updateApplicationCategoryController);
router.delete("/api/rounds/:roundId/application-categories/:categoryId", enforceAuthenticationMiddleware, c.deleteApplicationCategoryController);

const categoryBodySchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  applicationFormId: z.string(),
  minVotePercentage: z.number().int().min(0).max(100).optional().openapi({
    description: "Minimum percentage of total votes that voters must allocate to this category. Sum of all category minimums in a round must not exceed 100.",
  }),
});

registry.registerPath({
  method: "get",
  path: "/api/rounds/{roundId}/application-categories",
  tags: ["Application Categories"],
  summary: "List categories",
  description: "Lists all application categories defined for a round. Categories are used to organize applications and associate them with specific forms.",
  security: [],
  request: {
    params: z.object({
      roundId: z.string().uuid(),
    }),
  },
  responses: {
    200: {
      description: "List of application categories",
      content: {
        "application/json": {
          schema: z.array(z.object({
            id: z.string(),
            name: z.string(),
            description: z.string().optional(),
            applicationFormId: z.string(),
            minVotePercentage: z.number().int().nullable().openapi({ description: "Admin-configured minimum vote percentage for this category" }),
          })),
        },
      },
    },
    ...serverErrorResponse,
  },
});

registry.registerPath({
  method: "put",
  path: "/api/rounds/{roundId}/application-categories",
  tags: ["Application Categories"],
  summary: "Create category",
  description: "Creates a new application category for a round. Each category can be linked to an application form. Requires round admin permissions.",
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      roundId: z.string().uuid(),
    }),
    body: {
      content: {
        "application/json": {
          schema: categoryBodySchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: "Application category created successfully",
      content: {
        "application/json": {
          schema: z.object({
            id: z.string(),
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
  method: "patch",
  path: "/api/rounds/{roundId}/application-categories/{categoryId}",
  tags: ["Application Categories"],
  summary: "Update category",
  description: "Updates a category's name, description, or linked application form. Requires round admin permissions.",
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      roundId: z.string().uuid(),
      categoryId: z.string(),
    }),
    body: {
      content: {
        "application/json": {
          schema: categoryBodySchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Application category updated successfully",
    },
    ...badRequestResponse,
    ...unauthorizedResponse,
    ...notFoundResponse,
    ...serverErrorResponse,
  },
});

registry.registerPath({
  method: "delete",
  path: "/api/rounds/{roundId}/application-categories/{categoryId}",
  tags: ["Application Categories"],
  summary: "Delete category",
  description: "Deletes an application category. Requires round admin permissions.",
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      roundId: z.string().uuid(),
      categoryId: z.string(),
    }),
  },
  responses: {
    204: {
      description: "Application category deleted successfully",
    },
    ...unauthorizedResponse,
    ...notFoundResponse,
    ...serverErrorResponse,
  },
});

export default router;
