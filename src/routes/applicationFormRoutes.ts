import { Router } from "oak";
import { z } from "zod";
import { registry, badRequestResponse, serverErrorResponse, unauthorizedResponse, notFoundResponse } from "$app/openapi/registry.ts";
import * as c from "../controllers/applicationFormControllers.ts";
import { enforceAuthenticationMiddleware } from "../middleware/authMiddleware.ts";

const router = new Router();

router.get("/api/rounds/:roundId/application-forms", c.getApplicationFormsController);

router.get("/api/rounds/:roundId/categories/:categoryId/application-form", c.getApplicationFormByCategoryController);

router.put("/api/rounds/:roundId/application-forms", enforceAuthenticationMiddleware, c.createApplicationFormController);
router.patch("/api/rounds/:roundId/application-forms/:formId", enforceAuthenticationMiddleware, c.updateApplicationFormController);
router.delete("/api/rounds/:roundId/application-forms/:formId", enforceAuthenticationMiddleware, c.deleteApplicationFormController);

const applicationFormBodySchema = z.object({
  name: z.string(),
  fields: z.array(z.object({
    name: z.string(),
    type: z.string(),
    required: z.boolean().optional(),
    options: z.array(z.string()).optional(),
  })),
});

registry.registerPath({
  method: "get",
  path: "/api/rounds/{roundId}/application-forms",
  tags: ["Application Forms"],
  summary: "List application forms",
  description: "Lists all application form templates defined for a round.",
  security: [],
  request: {
    params: z.object({
      roundId: z.string().uuid(),
    }),
  },
  responses: {
    200: {
      description: "List of application forms",
      content: {
        "application/json": {
          schema: z.array(z.object({
            id: z.string(),
            name: z.string(),
            fields: z.array(z.object({
              name: z.string(),
              type: z.string(),
            })),
          })),
        },
      },
    },
    ...serverErrorResponse,
  },
});

registry.registerPath({
  method: "get",
  path: "/api/rounds/{roundId}/categories/{categoryId}/application-form",
  tags: ["Application Forms"],
  summary: "Get form by category",
  description: "Retrieves the application form template associated with a specific category. Returns 204 if no form is assigned to the category.",
  security: [],
  request: {
    params: z.object({
      roundId: z.string().uuid(),
      categoryId: z.string().uuid(),
    }),
  },
  responses: {
    200: {
      description: "Application form for the category",
      content: {
        "application/json": {
          schema: z.object({
            id: z.string(),
            name: z.string(),
            fields: z.array(z.object({
              name: z.string(),
              type: z.string(),
            })),
          }),
        },
      },
    },
    ...notFoundResponse,
    ...serverErrorResponse,
  },
});

registry.registerPath({
  method: "put",
  path: "/api/rounds/{roundId}/application-forms",
  tags: ["Application Forms"],
  summary: "Create application form",
  description: "Creates a new application form template for a round. Forms define the fields applicants must fill out. Requires round admin permissions.",
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      roundId: z.string().uuid(),
    }),
    body: {
      content: {
        "application/json": {
          schema: applicationFormBodySchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Application form created successfully",
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
  path: "/api/rounds/{roundId}/application-forms/{formId}",
  tags: ["Application Forms"],
  summary: "Update application form",
  description: "Updates an application form template's name and field definitions. Requires round admin permissions.",
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      roundId: z.string().uuid(),
      formId: z.string(),
    }),
    body: {
      content: {
        "application/json": {
          schema: applicationFormBodySchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Application form updated successfully",
    },
    ...badRequestResponse,
    ...unauthorizedResponse,
    ...notFoundResponse,
    ...serverErrorResponse,
  },
});

registry.registerPath({
  method: "delete",
  path: "/api/rounds/{roundId}/application-forms/{formId}",
  tags: ["Application Forms"],
  summary: "Delete application form",
  description: "Deletes an application form template. Requires round admin permissions.",
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      roundId: z.string().uuid(),
      formId: z.string(),
    }),
  },
  responses: {
    204: {
      description: "Application form deleted successfully",
    },
    ...unauthorizedResponse,
    ...notFoundResponse,
    ...serverErrorResponse,
  },
});

export default router;
