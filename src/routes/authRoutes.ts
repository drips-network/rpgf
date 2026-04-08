import { Router } from "oak";
import { z } from "zod";
import * as authController from "$app/controllers/authController.ts";
import { registry, badRequestResponse, serverErrorResponse, unauthorizedResponse } from "$app/openapi/registry.ts";

const router = new Router();

router.get("/api/auth/nonce", authController.getNonceController);
router.post("/api/auth/login", authController.logInController);
router.post("/api/auth/refresh-access-token", authController.refreshAccessTokenController);
router.post("/api/auth/logout", authController.logoutController);

registry.registerPath({
  method: "get",
  path: "/api/auth/nonce",
  tags: ["Authentication"],
  summary: "Get authentication nonce",
  description: "Generates a fresh cryptographic nonce for the SIWE (Sign-In With Ethereum) authentication flow. The client uses this nonce when constructing the SIWE message to sign.",
  security: [],
  responses: {
    200: {
      description: "A new nonce for signing",
      content: {
        "application/json": {
          schema: z.object({
            nonce: z.string(),
          }),
        },
      },
    },
    ...serverErrorResponse,
  },
});

registry.registerPath({
  method: "post",
  path: "/api/auth/login",
  tags: ["Authentication"],
  summary: "Log in with SIWE",
  description: "Verifies a signed SIWE (Sign-In With Ethereum) message and establishes a session. Returns a short-lived JWT access token and sets a long-lived refresh token as an HTTP-only cookie.",
  security: [],
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            message: z.object({}).passthrough().describe("The SIWE message object"),
            signature: z.string().describe("The signed message signature"),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "Login successful. Also sets a refreshToken HTTP-only cookie.",
      content: {
        "application/json": {
          schema: z.object({
            accessToken: z.string(),
          }),
        },
      },
    },
    ...badRequestResponse,
    ...serverErrorResponse,
  },
});

registry.registerPath({
  method: "post",
  path: "/api/auth/refresh-access-token",
  tags: ["Authentication"],
  summary: "Refresh access token",
  description: "Uses the refresh token stored in the HTTP-only cookie to issue a new access token and rotate the refresh token. Returns 401 if the refresh token is missing, expired, or invalid.",
  security: [],
  responses: {
    200: {
      description: "New access token issued",
      content: {
        "application/json": {
          schema: z.object({
            accessToken: z.string(),
          }),
        },
      },
    },
    ...unauthorizedResponse,
    ...serverErrorResponse,
  },
});

registry.registerPath({
  method: "post",
  path: "/api/auth/logout",
  tags: ["Authentication"],
  summary: "Log out",
  description: "Revokes the current refresh token and clears the refresh token cookie, ending the session.",
  security: [],
  responses: {
    200: {
      description: "Logged out successfully",
      content: {
        "application/json": {
          schema: z.object({
            message: z.literal("Logged out successfully."),
          }),
        },
      },
    },
    ...unauthorizedResponse,
    ...serverErrorResponse,
  },
});

export default router;
