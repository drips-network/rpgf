import { Router } from "oak";
import * as c from "$app/controllers/kycController.ts";
import { enforceAuthenticationMiddleware } from "../middleware/authMiddleware.ts";
import { z } from "zod";
import { registry, badRequestResponse, serverErrorResponse, unauthorizedResponse, notFoundResponse } from "$app/openapi/registry.ts";

const router = new Router();

router.post("/api/kyc/applications/:applicationId/request", enforceAuthenticationMiddleware, c.createKycRequestForApplicationController);

router.get("/api/kyc/rounds/:roundId/requests", enforceAuthenticationMiddleware, c.getKycRequestsForRoundController);
router.get("/api/kyc/applications/:applicationId/request", enforceAuthenticationMiddleware, c.getKycRequestForApplicationController);

router.post("/api/kyc/applications/:applicationId/link-existing", enforceAuthenticationMiddleware, c.linkExistingKycToApplicationController);

router.post("/api/kyc/status-updated-webhook/fern", c.fernUpdateWebhookController);
router.post("/api/kyc/status-updated-webhook/treova", c.treovaUpdateWebhookController);

registry.registerPath({
  method: "post",
  path: "/api/kyc/applications/{applicationId}/request",
  tags: ["KYC"],
  summary: "Create KYC request",
  description: "Initiates a KYC (Know Your Customer) verification for an application. Requires the applicant's personal details and triggers verification with the round's configured KYC provider.",
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      applicationId: z.string(),
    }),
    body: {
      content: {
        "application/json": {
          schema: z.object({
            type: z.enum(["INDIVIDUAL", "BUSINESS"]),
            firstName: z.string(),
            lastName: z.string(),
            businessName: z.string().optional(),
            email: z.string().email(),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "KYC request created",
      content: {
        "application/json": {
          schema: z.object({
            id: z.string(),
            applicationId: z.string(),
            status: z.string(),
            type: z.string(),
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
  method: "get",
  path: "/api/kyc/rounds/{roundId}/requests",
  tags: ["KYC"],
  summary: "List KYC requests for round",
  description: "Retrieves all KYC verification requests for a round. Requires round admin permissions.",
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      roundId: z.string(),
    }),
  },
  responses: {
    200: {
      description: "Array of KYC requests",
      content: {
        "application/json": {
          schema: z.array(
            z.object({
              id: z.string(),
              applicationId: z.string(),
              status: z.string(),
              type: z.string(),
            })
          ),
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
  path: "/api/kyc/applications/{applicationId}/request",
  tags: ["KYC"],
  summary: "Get KYC request",
  description: "Retrieves the KYC verification status for a specific application.",
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      applicationId: z.string(),
    }),
  },
  responses: {
    200: {
      description: "KYC request details",
      content: {
        "application/json": {
          schema: z.object({
            id: z.string(),
            applicationId: z.string(),
            status: z.string(),
            type: z.string(),
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
  method: "post",
  path: "/api/kyc/applications/{applicationId}/link-existing",
  tags: ["KYC"],
  summary: "Link existing KYC",
  description: "Reuses a previously completed KYC verification for a new application, avoiding duplicate verification for the same user.",
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      applicationId: z.string(),
    }),
    body: {
      content: {
        "application/json": {
          schema: z.object({
            kycRequestId: z.string().uuid(),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "KYC linked successfully",
      content: {
        "application/json": {
          schema: z.object({
            id: z.string(),
            applicationId: z.string(),
            status: z.string(),
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
  method: "post",
  path: "/api/kyc/status-updated-webhook/fern",
  tags: ["KYC"],
  summary: "Fern KYC webhook",
  description: "Webhook endpoint for receiving KYC status updates from the Fern provider. Secured by HMAC signature verification with timestamp-based replay protection (5-minute tolerance). Not intended for direct API consumption.",
  responses: {
    200: {
      description: "Webhook processed",
    },
    ...badRequestResponse,
    ...serverErrorResponse,
  },
});

registry.registerPath({
  method: "post",
  path: "/api/kyc/status-updated-webhook/treova",
  tags: ["KYC"],
  summary: "Treova KYC webhook",
  description: "Webhook endpoint for receiving KYC status updates from the Treova provider. Secured by HMAC signature verification with timestamp-based replay protection and idempotency key tracking. Not intended for direct API consumption.",
  responses: {
    200: {
      description: "Webhook processed",
    },
    ...badRequestResponse,
    ...serverErrorResponse,
  },
});

export default router;
