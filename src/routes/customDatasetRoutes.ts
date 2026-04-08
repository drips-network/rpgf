import { Router } from "oak";
import {
  createCustomDatasetController,
  deleteCustomDatasetController,
  downloadCustomDatasetController,
  listCustomDatasetsController,
  updateCustomDatasetController,
  uploadCustomDatasetController,
} from "$app/controllers/customDatasetController.ts";
import { enforceAuthenticationMiddleware } from "$app/middleware/authMiddleware.ts";
import { z } from "zod";
import { registry, badRequestResponse, serverErrorResponse, unauthorizedResponse, notFoundResponse } from "$app/openapi/registry.ts";

const router = new Router();

router.get(
  "/api/rounds/:roundId/custom-datasets",
  listCustomDatasetsController
);
router.put(
  "/api/rounds/:roundId/custom-datasets",
  enforceAuthenticationMiddleware,
  createCustomDatasetController
);
router.patch(
  "/api/rounds/:roundId/custom-datasets/:datasetId",
  enforceAuthenticationMiddleware,
  updateCustomDatasetController
);
router.delete(
  "/api/rounds/:roundId/custom-datasets/:datasetId",
  enforceAuthenticationMiddleware,
  deleteCustomDatasetController
);
router.post(
  "/api/rounds/:roundId/custom-datasets/:datasetId/upload",
  enforceAuthenticationMiddleware,
  uploadCustomDatasetController
);
router.get(
  "/api/rounds/:roundId/custom-datasets/:datasetId/data.csv",
  enforceAuthenticationMiddleware,
  downloadCustomDatasetController
);

registry.registerPath({
  method: "get",
  path: "/api/rounds/{roundId}/custom-datasets",
  tags: ["Custom Datasets"],
  summary: "List custom datasets",
  description: "Lists all custom datasets defined for a round. Custom datasets can contain arbitrary CSV data used for eligibility checks or allocation weighting.",
  request: {
    params: z.object({
      roundId: z.string(),
    }),
  },
  responses: {
    200: {
      description: "Array of custom datasets",
      content: {
        "application/json": {
          schema: z.array(
            z.object({
              id: z.string(),
              roundId: z.string(),
              name: z.string(),
              isPublic: z.boolean(),
            })
          ),
        },
      },
    },
    ...notFoundResponse,
    ...serverErrorResponse,
  },
});

registry.registerPath({
  method: "put",
  path: "/api/rounds/{roundId}/custom-datasets",
  tags: ["Custom Datasets"],
  summary: "Create custom dataset",
  description: "Creates a new custom dataset for a round. Requires round admin permissions. Upload the CSV data separately using the upload endpoint.",
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      roundId: z.string(),
    }),
    body: {
      content: {
        "application/json": {
          schema: z.object({
            name: z.string(),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "Created custom dataset",
      content: {
        "application/json": {
          schema: z.object({
            id: z.string(),
            roundId: z.string(),
            name: z.string(),
            isPublic: z.boolean(),
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

registry.registerPath({
  method: "patch",
  path: "/api/rounds/{roundId}/custom-datasets/{datasetId}",
  tags: ["Custom Datasets"],
  summary: "Update custom dataset",
  description: "Updates a custom dataset's name or public visibility setting. Requires round admin permissions.",
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      roundId: z.string(),
      datasetId: z.string(),
    }),
    body: {
      content: {
        "application/json": {
          schema: z.object({
            name: z.string().optional(),
            isPublic: z.boolean().optional(),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "Updated custom dataset",
      content: {
        "application/json": {
          schema: z.object({
            id: z.string(),
            roundId: z.string(),
            name: z.string(),
            isPublic: z.boolean(),
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

registry.registerPath({
  method: "delete",
  path: "/api/rounds/{roundId}/custom-datasets/{datasetId}",
  tags: ["Custom Datasets"],
  summary: "Delete custom dataset",
  description: "Permanently deletes a custom dataset and its data. Requires round admin permissions.",
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      roundId: z.string(),
      datasetId: z.string(),
    }),
  },
  responses: {
    204: {
      description: "Dataset deleted",
    },
    ...unauthorizedResponse,
    ...notFoundResponse,
    ...serverErrorResponse,
  },
});

registry.registerPath({
  method: "post",
  path: "/api/rounds/{roundId}/custom-datasets/{datasetId}/upload",
  tags: ["Custom Datasets"],
  summary: "Upload dataset CSV",
  description: "Uploads CSV data for a custom dataset, replacing any previously uploaded data. The request body should be raw CSV text. Requires round admin permissions.",
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      roundId: z.string(),
      datasetId: z.string(),
    }),
    body: {
      content: {
        "text/csv": {
          schema: z.string(),
        },
      },
    },
  },
  responses: {
    200: {
      description: "CSV data uploaded",
    },
    ...badRequestResponse,
    ...unauthorizedResponse,
    ...notFoundResponse,
    ...serverErrorResponse,
  },
});

registry.registerPath({
  method: "get",
  path: "/api/rounds/{roundId}/custom-datasets/{datasetId}/data.csv",
  tags: ["Custom Datasets"],
  summary: "Download dataset CSV",
  description: "Downloads the CSV data for a custom dataset as a file attachment.",
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      roundId: z.string(),
      datasetId: z.string(),
    }),
  },
  responses: {
    200: {
      description: "CSV file download",
      content: {
        "text/csv": {
          schema: z.string(),
        },
      },
    },
    ...unauthorizedResponse,
    ...notFoundResponse,
    ...serverErrorResponse,
  },
});

export default router;
