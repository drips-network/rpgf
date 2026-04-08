import { Router } from "oak";
import { z } from "zod";
import * as healthController from "$app/controllers/healthController.ts";
import { registry, badRequestResponse, serverErrorResponse } from "$app/openapi/registry.ts";

const router = new Router();

router.get("/api/health", healthController.getHealthController);

registry.registerPath({
  method: "get",
  path: "/api/health",
  tags: ["Health"],
  summary: "Health check",
  description: "Simple health check endpoint that returns the server status.",
  security: [],
  responses: {
    200: {
      description: "Service is healthy",
      content: {
        "application/json": {
          schema: z.object({
            status: z.literal("ok"),
          }),
        },
      },
    },
    ...serverErrorResponse,
  },
});

export default router;
