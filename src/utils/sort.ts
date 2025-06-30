import { Context } from "oak";
import { z } from "zod";
import { BadRequestError } from "../errors/generic.ts";

type SortConfig = {
  field: 'random' | 'createdAt' | 'name';
  direction: 'asc' | 'desc';
}

export function parseSortParam(ctx: Context): SortConfig | null {
  const sortParam = ctx.request.url.searchParams.get("sort");
  if (!sortParam) {
    return null;
  }

  const [field, direction] = sortParam.split(":");
  if (!field || !direction) {
    return null;
  }

  const parsedField = z.union([z.literal('random'), z.literal('createdAt'), z.literal('name')]).safeParse(field);
  if (!parsedField.success) {
    throw new BadRequestError(`Invalid sort field: ${field}. Allowed values are 'random', 'createdAt', 'name'.`);
  }

  const parsedDirection = z.union([z.literal('asc'), z.literal('desc')]).safeParse(direction);
  if (!parsedDirection.success) {
    throw new BadRequestError(`Invalid sort direction: ${direction}. Allowed values are 'asc', 'desc'.`);
  }

  return {
    field: parsedField.data,
    direction: parsedDirection.data,
  };
}

export function sortArray<T extends { createdAt: Date }>(
  array: T[],
  sortConfig: SortConfig | null,
  nameKey: keyof T,
) {
  if (!sortConfig) {
    return array;
  }

  return array.sort((a, b) => {
    let comparison = 0;

    switch (sortConfig.field) {
      case 'random':
        comparison = Math.random() - 0.5; // Random order
        break;
      case 'createdAt':
        comparison = a.createdAt.getTime() - b.createdAt.getTime();
        break;
      case 'name': {
        const nameA = String(a[nameKey]).toLowerCase();
        const nameB = String(b[nameKey]).toLowerCase();
        comparison = nameA.localeCompare(nameB);
        break;
      }
    }

    return sortConfig.direction === 'asc' ? comparison : -comparison;
  });
}
