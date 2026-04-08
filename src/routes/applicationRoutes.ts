import { Router } from "oak";
import { z } from "zod";
import { registry, badRequestResponse, serverErrorResponse, unauthorizedResponse, notFoundResponse } from "$app/openapi/registry.ts";
import { enforceAuthenticationMiddleware } from "../middleware/authMiddleware.ts";
import * as applicationController from "$app/controllers/applicationController.ts";

const router = new Router();

router.put("/api/rounds/:roundId/applications", enforceAuthenticationMiddleware, applicationController.createAppplicationController);
router.post("/api/rounds/:roundId/applications/review", enforceAuthenticationMiddleware, applicationController.submitApplicationReviewController);
router.post("/api/rounds/:roundId/applications/:applicationId/add-attestation-uid", enforceAuthenticationMiddleware, applicationController.addApplicationAttestationController);
router.post("/api/rounds/:roundId/applications/:applicationId", enforceAuthenticationMiddleware, applicationController.updateApplicationController);
router.get("/api/rounds/:roundId/applications", applicationController.getApplicationsForRoundController);
router.get("/api/rounds/:roundId/applications/:applicationId", applicationController.getApplicationController);
router.get("/api/rounds/:roundId/applications/:applicationId/history", applicationController.getApplicationHistoryController);

registry.registerPath({
  method: "put",
  path: "/api/rounds/{roundId}/applications",
  tags: ["Applications"],
  summary: "Create application",
  description: "Submits a new application to a round. The authenticated user becomes the application owner. Optionally accepts a submitterOverride address for submitting on behalf of another wallet.",
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      roundId: z.string().uuid(),
    }),
    body: {
      content: {
        "application/json": {
          schema: z.object({
            projectName: z.string(),
            dripsAccountId: z.string(),
            attestationUID: z.string().optional(),
            deferredAttestationTxHash: z.string().optional(),
            categoryId: z.string().uuid(),
            answers: z.array(z.object({
              fieldId: z.string(),
              value: z.string(),
            })),
            submitterOverride: z.string().optional(),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "Application created successfully",
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
  method: "post",
  path: "/api/rounds/{roundId}/applications/review",
  tags: ["Applications"],
  summary: "Review applications",
  description: "Submits approval or rejection decisions for one or more applications. Requires round admin permissions.",
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      roundId: z.string().uuid(),
    }),
    body: {
      content: {
        "application/json": {
          schema: z.array(
            z.object({
              applicationId: z.string(),
              decision: z.enum(["approve", "reject"]),
            }),
          ),
        },
      },
    },
  },
  responses: {
    200: {
      description: "Applications reviewed successfully",
    },
    ...badRequestResponse,
    ...unauthorizedResponse,
    ...serverErrorResponse,
  },
});

registry.registerPath({
  method: "post",
  path: "/api/rounds/{roundId}/applications/{applicationId}/add-attestation-uid",
  tags: ["Applications"],
  summary: "Add attestation UID",
  description: "Resolves a deferred on-chain attestation for an application. Polls the blockchain for the transaction receipt, parses the EAS Attested event log to extract the attestation UID, and saves it to the application version. The application must have a pending deferred attestation transaction hash.",
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      roundId: z.string().uuid(),
      applicationId: z.string(),
    }),
  },
  responses: {
    200: {
      description: "Attestation UID added successfully",
    },
    ...badRequestResponse,
    ...unauthorizedResponse,
    ...notFoundResponse,
    ...serverErrorResponse,
  },
});

registry.registerPath({
  method: "post",
  path: "/api/rounds/{roundId}/applications/{applicationId}",
  tags: ["Applications"],
  summary: "Update application",
  description: "Updates an existing application's details. Only the application owner can update their application.",
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      roundId: z.string().uuid(),
      applicationId: z.string(),
    }),
    body: {
      content: {
        "application/json": {
          schema: z.object({
            projectName: z.string(),
            dripsAccountId: z.string(),
            attestationUID: z.string().optional(),
            deferredAttestationTxHash: z.string().optional(),
            categoryId: z.string().uuid(),
            answers: z.array(z.object({
              fieldId: z.string(),
              value: z.string(),
            })),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "Application updated successfully",
    },
    ...badRequestResponse,
    ...unauthorizedResponse,
    ...notFoundResponse,
    ...serverErrorResponse,
  },
});

registry.registerPath({
  method: "get",
  path: "/api/rounds/{roundId}/applications",
  tags: ["Applications"],
  summary: "List applications",
  description: "Retrieves applications for a round with support for filtering by state (approved, rejected, pending), category, and submitter. Supports pagination and sorting by name, creation date, random order, or allocation. Results can be exported as JSON, CSV, or XLSX. Private field data is only included for authenticated round admins.",
  security: [],
  request: {
    params: z.object({
      roundId: z.string().uuid(),
    }),
    query: z.object({
      format: z.enum(["json", "csv", "xlsx"]).default("json").optional(),
      limit: z.string().default("20").optional(),
      offset: z.string().default("0").optional(),
      state: z.enum(["approved", "rejected", "pending"]).optional(),
      submitterUserId: z.string().optional(),
      categoryId: z.string().optional(),
    }),
  },
  responses: {
    200: {
      description: "List of applications (listing format, without answers)",
      content: {
        "application/json": {
          schema: z.array(z.object({
            id: z.string().uuid(),
            state: z.enum(["pending", "approved", "rejected"]),
            projectName: z.string(),
            dripsProjectDataSnapshot: z.object({}).passthrough().nullable().openapi({ description: "Snapshot of the Drips project data at submission time" }),
            allocation: z.number().nullable().openapi({ description: "Result allocation, only included if results are published or requester is a round admin" }),
          })),
        },
      },
    },
    ...badRequestResponse,
    ...serverErrorResponse,
  },
});

registry.registerPath({
  method: "get",
  path: "/api/rounds/{roundId}/applications/{applicationId}",
  tags: ["Applications"],
  summary: "Get application",
  description: "Retrieves the details of a single application. Private field data is only included for authenticated round admins.",
  security: [],
  request: {
    params: z.object({
      roundId: z.string().uuid(),
      applicationId: z.string(),
    }),
  },
  responses: {
    200: {
      description: "Full application details including latest version with answers",
      content: {
        "application/json": {
          schema: z.object({
            id: z.string().uuid(),
            state: z.enum(["pending", "approved", "rejected"]),
            createdAt: z.string(),
            updatedAt: z.string(),
            roundId: z.string().uuid(),
            allocation: z.number().nullable().openapi({ description: "Result allocation, only included if results are published or requester is a round admin" }),
            submitter: z.object({
              id: z.string().uuid(),
              walletAddress: z.string(),
            }),
            projectName: z.string(),
            dripsProjectDataSnapshot: z.object({}).passthrough().nullable().openapi({ description: "Snapshot of the Drips project data at submission time" }),
            latestVersion: z.object({
              id: z.string().uuid(),
              projectName: z.string(),
              dripsAccountId: z.string(),
              easAttestationUID: z.string().nullable(),
              deferredAttestationTxHash: z.string().nullable(),
              dripsProjectDataSnapshot: z.object({}).passthrough().nullable(),
              createdAt: z.string(),
              formId: z.string().uuid(),
              category: z.object({
                id: z.string().uuid(),
                name: z.string(),
                description: z.string().nullable(),
                applicationForm: z.object({
                  id: z.string().uuid(),
                  name: z.string(),
                }),
              }),
              answers: z.array(z.object({
                type: z.enum(["url", "text", "email", "list", "select"]),
                fieldId: z.string().uuid(),
                field: z.object({}).passthrough().openapi({ description: "The form field definition" }),
              }).passthrough().openapi({ description: "Answer object. Shape varies by type: url has 'url', text/textarea has 'text', email has 'email', list has 'entries', select has 'selected'. Private field answers are omitted for non-admin, non-submitter users." })),
            }),
            customDatasetValues: z.array(z.object({
              datasetId: z.string().uuid(),
              datasetName: z.string(),
              values: z.object({}).passthrough(),
            })).openapi({ description: "Values from public custom datasets associated with this application" }),
          }),
        },
      },
    },
    ...notFoundResponse,
    ...serverErrorResponse,
  },
});

registry.registerPath({
  method: "get",
  path: "/api/rounds/{roundId}/applications/{applicationId}/history",
  tags: ["Applications"],
  summary: "Get application history",
  description: "Retrieves the audit history of changes made to an application, including status changes and edits. Private field data is only included for authenticated round admins.",
  security: [],
  request: {
    params: z.object({
      roundId: z.string().uuid(),
      applicationId: z.string(),
    }),
  },
  responses: {
    200: {
      description: "List of application versions, most recent first. Each version includes the full form answers at that point in time.",
      content: {
        "application/json": {
          schema: z.array(z.object({
            id: z.string().uuid(),
            projectName: z.string(),
            dripsAccountId: z.string(),
            easAttestationUID: z.string().nullable(),
            deferredAttestationTxHash: z.string().nullable(),
            dripsProjectDataSnapshot: z.object({}).passthrough().nullable(),
            createdAt: z.string(),
            formId: z.string().uuid(),
            category: z.object({
              id: z.string().uuid(),
              name: z.string(),
              description: z.string().nullable(),
              applicationForm: z.object({
                id: z.string().uuid(),
                name: z.string(),
              }),
            }),
            answers: z.array(z.object({
              type: z.enum(["url", "text", "email", "list", "select"]),
              fieldId: z.string().uuid(),
              field: z.object({}).passthrough().openapi({ description: "The form field definition" }),
            }).passthrough().openapi({ description: "Answer object. Shape varies by type. Private field answers are omitted for non-admin, non-submitter users." })),
          })),
        },
      },
    },
    ...notFoundResponse,
    ...serverErrorResponse,
  },
});

export default router;
