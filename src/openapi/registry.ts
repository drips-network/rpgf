import {
  extendZodWithOpenApi,
  OpenApiGeneratorV31,
  OpenAPIRegistry,
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { config } from "../../config.ts";

// Extend Zod with OpenAPI capabilities - must be done before any schemas are created
extendZodWithOpenApi(z);

export const registry = new OpenAPIRegistry();

// Re-export for use in other modules
export { extendZodWithOpenApi };

// Register security schemes
registry.registerComponent("securitySchemes", "bearerAuth", {
  type: "http",
  scheme: "bearer",
  bearerFormat: "JWT",
  description: "JWT access token obtained from /api/auth/login",
});

// Common error response schemas
const errorResponseSchema = z.object({
  error: z.string(),
});

// Common error responses (keyed by status code for spreading into responses)
export const unauthorizedResponse = {
  401: {
    description: "Unauthorized - Invalid or missing authentication token",
    content: {
      "application/json": {
        schema: errorResponseSchema.openapi({
          example: {
            error: "Invalid authentication token",
          },
        }),
      },
    },
  },
};

export const badRequestResponse = {
  400: {
    description: "Bad Request - Invalid input data",
    content: {
      "application/json": {
        schema: errorResponseSchema.openapi({
          example: {
            error: "Invalid input data",
          },
        }),
      },
    },
  },
};

export const serverErrorResponse = {
  500: {
    description: "Internal Server Error",
    content: {
      "application/json": {
        schema: errorResponseSchema.openapi({
          example: {
            error: "Internal Server Error",
          },
        }),
      },
    },
  },
};

export const notFoundResponse = {
  404: {
    description: "Not Found - Resource not found",
    content: {
      "application/json": {
        schema: errorResponseSchema.openapi({
          example: {
            error: "Resource not found",
          },
        }),
      },
    },
  },
};

export function generateOpenAPIDocument() {
  const generator = new OpenApiGeneratorV31(registry.definitions);

  const baseUrl = config.server.baseUrl;

  return generator.generateDocument({
    openapi: "3.1.0",
    info: {
      title: "RPGF API",
      version: "1.0.0",
      description:
        "API documentation for RPGF - Retroactive Public Goods Funding",
    },
    servers: [
      {
        url: baseUrl,
        description: "Server serving this OpenAPI document",
      },
    ],
  });
}
