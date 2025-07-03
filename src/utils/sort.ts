import { Context } from "oak";
import { z } from "zod";
import { BadRequestError } from "../errors/generic.ts";

export type SortConfig<TFields extends string> = {
  field: TFields;
  direction: 'asc' | 'desc';
}

export function parseSortParam<TFields extends readonly string[]>(ctx: Context, fields: TFields): SortConfig<TFields[number]> | null {
  const sortParam = ctx.request.url.searchParams.get("sort");
  if (!sortParam) {
    return null;
  }

  const [field, direction] = sortParam.split(":");
  if (!field || !direction) {
    return null;
  }

  function assertFieldValid(field: string, validFields: TFields): field is TFields[number] {
    return validFields.includes(field as TFields[number]);
  }

  if (!assertFieldValid(field, fields)) {
    throw new BadRequestError(`Invalid sort field: ${field}. Allowed values are ${fields.join(", ")}.`);
  }

  const parsedDirection = z.union([z.literal('asc'), z.literal('desc')]).safeParse(direction);
  if (!parsedDirection.success) {
    throw new BadRequestError(`Invalid sort direction: ${direction}. Allowed values are 'asc', 'desc'.`);
  }

  return {
    field: field,
    direction: parsedDirection.data,
  };
}
