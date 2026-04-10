import { Context, RouterContext } from "oak";
import { z, ZodSchema } from "zod";
import { BadRequestError } from "$app/errors/generic.ts";

/**
 * Validates `ctx.params` against a Zod schema and returns the parsed result.
 * Throws `BadRequestError` (→ 400) when validation fails, so invalid path
 * parameters (e.g. malformed UUIDs) never reach the database layer.
 */
export default function parseParams<T extends ZodSchema>(
  schema: T,
  // deno-lint-ignore no-explicit-any
  ctx: Context | RouterContext<string, any, any>,
): z.infer<T> {
  const params = "params" in ctx ? ctx.params : {};
  const result = schema.safeParse(params);

  if (!result.success) {
    throw new BadRequestError(
      JSON.stringify(
        result.error.errors.map((issue) => ({
          field: issue.path.join(".") || "(root)",
          message: issue.message,
        })),
      ),
    );
  }

  return result.data;
}
