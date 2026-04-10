/** These routes are only intended for use in E2E tests and MUST be disabled
 * in production environments. They're only loaded if ENABLE_DANGEROUS_TEST_ROUTES
 * is true in the environment.
 */

import { Router } from "oak";
import { z } from "zod";
import { dangerouslyForceRoundStateController, dangerouslyForceDeleteRoundController } from "$app/controllers/testController.ts";
import {
  badRequestResponse,
  registry,
  serverErrorResponse,
  unauthorizedResponse,
} from "$app/openapi/registry.ts";
import { roundStateSchema } from "$app/types/round.ts";
import { config } from "../../config.ts";

const router = new Router();

if (config.testing.enableDangerousTestRoutes) {
  router.post(
    '/api/testing/force-round-state',
    dangerouslyForceRoundStateController,
  );

  router.post(
    '/api/testing/force-delete-round',
    dangerouslyForceDeleteRoundController,
  );

  const dangerousTestingDescription =
    "⚠️ DANGEROUS: This endpoint is only available when " +
    "`ENABLE_DANGEROUS_TEST_ROUTES` is set to true in the server environment. " +
    "It is intended exclusively for E2E testing and MUST be disabled in production.";

  registry.registerPath({
    method: "post",
    path: "/api/testing/force-round-state",
    tags: ["Testing (Dangerous)"],
    summary: "Force a round into a particular lifecycle state",
    description:
      `${dangerousTestingDescription} Overrides a round's schedule so that the ` +
      "requested state is currently active. Milestones before the target state " +
      "are set to the epoch; milestones after it are pushed ten years into the future.",
    security: [],
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              roundSlug: z.string().openapi({ example: "my-round" }),
              desiredState: roundStateSchema,
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Round schedule was overridden successfully",
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
      ...serverErrorResponse,
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/testing/force-delete-round",
    tags: ["Testing (Dangerous)"],
    summary: "Permanently delete a round and all associated data",
    description:
      `${dangerousTestingDescription} Deletes the round identified by slug and ` +
      "all its associated rows in a single transaction. There is no undo.",
    security: [],
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              roundSlug: z.string().openapi({ example: "my-round" }),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Round and associated data were deleted",
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
      ...serverErrorResponse,
    },
  });
}

export default router;
