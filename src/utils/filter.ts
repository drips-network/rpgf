import { Context } from "oak";
import { z } from "zod";
import { BadRequestError } from "../errors/generic.ts";

// Generic where each of the fields is the parse result of the provided zod schema
export type FilterConfig<FS extends Record<string, z.ZodSchema>> = {
  [K in keyof FS]?: z.infer<FS[K]>;
};

export function parseFilterParams<FS extends Record<string, z.ZodSchema>>(ctx: Context, filterSchema: FS): FilterConfig<FS> | null {
  for (const [key, schema] of Object.entries(filterSchema)) {
    const paramValue = ctx.request.url.searchParams.get(key);
    if (paramValue === null) {
      continue; // Skip if the parameter is not provided
    }

    const parsed = schema.safeParse(paramValue);
    if (!parsed.success) {
      throw new BadRequestError(`Invalid filter value for ${key}: ${paramValue}. Error: ${parsed.error.message}`);
    }

    return { [key]: parsed.data } as FilterConfig<FS>;
  }
  return null; // Return null if no valid filter parameters are found
}
