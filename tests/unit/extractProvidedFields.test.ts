import {
  assertEquals,
  assertFalse,
  assert,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { extractProvidedFields } from "../../src/utils/extractProvidedFields.ts";

type SampleDto = {
  name?: string | null;
  description?: string | null;
  color?: string;
  resultsPeriodStart?: string | null;
};

Deno.test("extractProvidedFields returns only provided properties", () => {
  const dto: SampleDto = {
    name: "Test Round",
    description: null,
  };

  const { updates, has } = extractProvidedFields(dto, {
    name: true,
    description: true,
    color: true,
  });

  assertEquals(updates, {
    name: "Test Round",
    description: null,
  });
  assert(has("name"));
  assert(has("description"));
  assertFalse(has("color"));
});

Deno.test("extractProvidedFields applies transforms and preserves explicit null", () => {
  const dto: SampleDto = {
    resultsPeriodStart: null,
  };

  const { updates, has } = extractProvidedFields(dto, {
    resultsPeriodStart: (value) =>
      value === null
        ? null
        : value === undefined
        ? undefined
        : new Date(value),
  });

  assertEquals(updates, {
    resultsPeriodStart: null,
  });
  assert(has("resultsPeriodStart"));

  const dtoWithValue: SampleDto = {
    resultsPeriodStart: "2025-12-01T00:00:00.000Z",
  };

  const transformed = extractProvidedFields(dtoWithValue, {
    resultsPeriodStart: (value) =>
      value === null
        ? null
        : value === undefined
        ? undefined
        : new Date(value),
  });

  assert(transformed.has("resultsPeriodStart"));
  assertEquals(
    transformed.updates.resultsPeriodStart instanceof Date,
    true,
  );
  assertEquals(
    (transformed.updates.resultsPeriodStart as Date).toISOString(),
    "2025-12-01T00:00:00.000Z",
  );
});
