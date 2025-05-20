import { RouteParams, RouterContext } from "oak";
import { ZodSchema } from "zod";
import { BadRequestError } from "../errors/generic.ts";

export default function parseUrlParam<PS extends string>(ctx: RouterContext<PS>, paramName: keyof RouteParams<PS>, schema: ZodSchema) {
  const param = ctx.params[paramName];

  const parsed = schema.safeParse(param);
  if (!parsed.success) {
    throw new BadRequestError(`Invalid or missing URL parameter: ${String(paramName)}`);
  }

  return parsed.data;
}
