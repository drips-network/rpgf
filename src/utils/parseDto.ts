import { Context } from "oak";
import { z } from "zod";
import { BadRequestError } from "../errors/generic.ts";

export default async function parseDto<T extends z.AnyZodObject>(
  dtoSchema: T,
  context: Context,
): Promise<z.infer<T>> {
  let body: unknown;
  try {
    body = await context.request.body.json();
  } catch {
    throw new BadRequestError("Invalid JSON body");
  }

  const parseResult = dtoSchema.safeParse(body);

  if (!parseResult.success) {
    throw new BadRequestError(
      JSON.stringify(parseResult.error.errors.map((error) => ({
        field: error.path.join("."),
        message: error.message,
      }))),
    );
  }

  return parseResult.data;
}
