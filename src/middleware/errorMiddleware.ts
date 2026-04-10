import { Middleware } from "oak";
import { ZodError } from "zod";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  isInvalidTextRepresentation,
  NotFoundError,
  ServiceUnavailableError,
} from "$app/errors/generic.ts";
import {
  AuthError,
  ExpiredJwtError,
  UnauthenticatedError,
  UnauthorizedError,
} from "$app/errors/auth.ts";
import { Logger } from "$app/services/loggingService.ts";

const logger = new Logger("middleware:error");

function formatZodError(err: ZodError): string {
  return JSON.stringify(
    err.errors.map((issue) => ({
      field: issue.path.join(".") || "(root)",
      message: issue.message,
    })),
  );
}

const errorMiddleware: Middleware = async (ctx, next) => {
  try {
    await next();
  } catch (err) {
    if (err instanceof BadRequestError) {
      ctx.response.status = 400;
      ctx.response.body = { error: err.message };
      logger.warn("Serving BadRequestError", { message: err.message });
    } else if (err instanceof ZodError) {
      const message = formatZodError(err);
      ctx.response.status = 400;
      ctx.response.body = { error: message };
      logger.warn("Serving ZodError", { message });
    } else if (isInvalidTextRepresentation(err)) {
      // Postgres 22P02 — typically an invalid UUID or similar text cast.
      ctx.response.status = 400;
      ctx.response.body = {
        error: "Invalid parameter format in request",
      };
      logger.warn("Serving invalid-text-representation as 400", {
        message: err instanceof Error ? err.message : String(err),
      });
    } else if (err instanceof ExpiredJwtError) {
      ctx.response.status = 401;
      ctx.response.body = { error: "Token expired" };
      logger.warn("Serving ExpiredJwtError");
    } else if (err instanceof UnauthenticatedError) {
      ctx.response.status = 401;
      ctx.response.body = { error: err.message || "Unauthenticated" };
      logger.warn("Serving UnauthenticatedError", { message: err.message });
    } else if (err instanceof UnauthorizedError) {
      ctx.response.status = 401;
      ctx.response.body = { error: err.message || "Unauthorized" };
      logger.warn("Serving UnauthorizedError", { message: err.message });
    } else if (err instanceof AuthError) {
      ctx.response.status = 401;
      ctx.response.body = { error: err.message || "Authentication error" };
      logger.warn("Serving AuthError", { message: err.message });
    } else if (err instanceof ForbiddenError) {
      ctx.response.status = 403;
      ctx.response.body = { error: err.message };
      logger.warn("Serving ForbiddenError", { message: err.message });
    } else if (err instanceof NotFoundError) {
      ctx.response.status = 404;
      ctx.response.body = { error: err.message };
      logger.warn("Serving NotFoundError", { message: err.message });
    } else if (err instanceof ConflictError) {
      ctx.response.status = 409;
      ctx.response.body = { error: err.message };
      logger.warn("Serving ConflictError", { message: err.message });
    } else if (err instanceof ServiceUnavailableError) {
      ctx.response.status = 503;
      ctx.response.body = { error: err.message };
      logger.warn("Serving ServiceUnavailableError", { message: err.message });
    } else {
      ctx.response.status = 500;
      ctx.response.body = { error: "Internal Server Error" };
      logger.critical("Serving Internal Server Error", err);
    }
  }
};

export default errorMiddleware;
