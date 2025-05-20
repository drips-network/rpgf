import { Context } from "oak";
import { z, ZodSchema } from "zod";
import { BadRequestError } from "../errors/generic.ts";

export default async function parseDto<T extends ZodSchema>(
  dtoSchema: T,
  context: Context | unknown,
): Promise<z.infer<T>> {
  let body: unknown;
  try {
    if (context instanceof Context) {
      body = await context.request.body.json();
    } else {
      body = context;
    }
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
