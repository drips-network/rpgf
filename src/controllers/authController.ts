import { Context, Status, isHttpError } from "oak";
import * as authService from "$app/services/authService.ts";
import type { SiweVerifyRequest } from "$app/types/auth.ts";

export function getNonceController(ctx: Context) {
  try {
    const nonce = authService.generateNonce();
    ctx.response.status = Status.OK;
    ctx.response.body = { nonce };
  } catch (error) {
    console.error("Error in getNonceController:", error);
    ctx.response.status = Status.InternalServerError;
    ctx.response.body = { message: "Failed to generate nonce." };
  }
}

export async function verifySignatureController(ctx: Context) {
  try {
    if (!ctx.request.hasBody) {
      ctx.throw(Status.BadRequest, "Missing request body");
    }
    const body = await ctx.request.body.json();
    const { message: clientSiweMessageFields, signature } = body as SiweVerifyRequest;

    console.log({ clientSiweMessageFields, signature })

    if (!clientSiweMessageFields || !signature) {
      ctx.throw(Status.BadRequest, "Missing SIWE message or signature in request body.");
    }
    
    // It's crucial that the client sends all necessary fields for SiweMessage reconstruction.
    // Or, the server can fill in some expected values (e.g., domain, statement).
    // For this example, we assume clientSiweMessageFields contains enough to form a valid SiweMessage.
    // A more robust implementation would validate clientSiweMessageFields structure.
    // Example: ensure `domain`, `address`, `uri`, `version`, `chainId`, `nonce`, `issuedAt` are present.
    // The `siwe` library might also expect certain fields to be pre-filled if not provided by client.
    // For instance, `domain` and `statement` might be configured server-side.
    // Let's assume the client provides a complete message structure for now.
    // const siweMessageInstance = new SiweMessage(clientSiweMessageFields);

    const token = await authService.verifySignatureAndCreateToken(
      clientSiweMessageFields, // Pass the partial message fields
      signature,
    );

    if (token) {
      ctx.response.status = Status.OK;
      ctx.response.body = { token };
    } else {
      ctx.response.status = Status.Unauthorized;
      ctx.response.body = { message: "SIWE signature verification failed." };
    }
  } catch (error) {
    console.error("Error in verifySignatureController:", error);
    if (isHttpError(error) && error.status === Status.BadRequest) {
        ctx.response.status = Status.BadRequest;
        ctx.response.body = { message: error.message };
    } else if (error instanceof Error) {
        ctx.response.status = Status.InternalServerError;
        ctx.response.body = { message: error.message };
    } else {
        ctx.response.status = Status.InternalServerError;
        ctx.response.body = { message: "An unexpected error occurred during signature verification." };
    }
  }
}
