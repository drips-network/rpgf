export class BadRequestError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "BadRequestError";
  }
}

export class NotFoundError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

export class ForbiddenError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class ConflictError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "ConflictError";
  }
}

export class ServiceUnavailableError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "ServiceUnavailableError";
  }
}

/** Marks an error as non-retryable. Used for validation failures that will never succeed on retry. */
export class NonRetryableError extends BadRequestError {
  constructor(message: string) {
    super(message);
    this.name = "NonRetryableError";
  }
}

/** Checks whether an error is a PostgreSQL unique constraint violation (23505). */
export function isUniqueViolation(error: unknown): boolean {
  return getPgErrorCode(error) === "23505";
}

/** Checks whether an error is a PostgreSQL invalid text representation (e.g. malformed UUID). */
export function isInvalidTextRepresentation(error: unknown): boolean {
  return getPgErrorCode(error) === "22P02";
}

function getPgErrorCode(error: unknown): string | undefined {
  const cause = error instanceof Error
    ? (error as Error & { cause?: unknown }).cause
    : undefined;
  const candidate = cause ?? error;
  if (
    candidate != null &&
    typeof candidate === "object" &&
    "code" in candidate &&
    typeof (candidate as { code: unknown }).code === "string"
  ) {
    return (candidate as { code: string }).code;
  }
  return undefined;
}
