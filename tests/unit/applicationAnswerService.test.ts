import { ApplicationAnswerDto } from "$app/types/applicationAnswer.ts";
import { assert, assertFalse, assertEquals } from "jsr:@std/assert@^1.0.13";
import { mapDbAnswersToDto, validateAnswers } from "$app/services/applicationAnswerService.ts";
import { InferSelectModel } from "drizzle-orm/table";
import { applicationAnswers, applicationFormFields } from "$app/db/schema.ts";

Deno.test("validateAnswers should throw if an answer is missing for a required field", () => {
  const fields: Pick<InferSelectModel<typeof applicationFormFields>, "id" | "type" | "required" | "properties">[] = [
    {
      id: "field-1",
      type: "text",
      required: true,
      properties: {
        id: "field-1",
        type: "text",
        private: false,
        required: true,
        slug: "field-1",
        label: "Field 1",
        descriptionMd: "",
      }
    },
  ];
  assertFalse(validateAnswers([], fields));

  const answerWithNull: ApplicationAnswerDto = [
    {
      fieldId: "field-1",
      value: null,
    },
  ];
  assertFalse(validateAnswers(answerWithNull, fields));
});

Deno.test("validateAnswers should not throw for a valid set of answers", () => {
  const answers: ApplicationAnswerDto = [
    {
      fieldId: "field-1",
      value: "Some answer",
    },
  ];
  const fields: Pick<InferSelectModel<typeof applicationFormFields>, "id" | "type" | "required" | "properties">[] = [
    {
      id: "field-1",
      type: "text",
      required: true,
      properties: {
        id: "field-1",
        type: "text",
        private: false,
        required: true,
        slug: "field-1",
        label: "Field 1",
        descriptionMd: "",
      }
    },
  ];
  assert(validateAnswers(answers, fields));
});

Deno.test("mapDbAnswersToDto should preserve the order of answers", () => {
  const dbAnswersWithField: (InferSelectModel<typeof applicationAnswers> & { field: InferSelectModel<typeof applicationFormFields> })[] = [
    {
      applicationVersionId: "version-1",
      fieldId: "field-2",
      answer: "Answer 2",
      order: 2,
      createdAt: new Date(),
      field: {
        id: "field-2",
        formId: "form-1",
        type: "text",
        slug: "field-2",
        order: 2,
        required: true,
        private: false,
        properties: { id: "field-2", type: "text", private: false, required: true, slug: "field-2", label: "Field 2", descriptionMd: "" },
        createdAt: new Date(),
        deletedAt: null,
        updatedAt: new Date(),
      },
    },
    {
      applicationVersionId: "version-1",
      fieldId: "field-1",
      answer: "Answer 1",
      order: 1,
      createdAt: new Date(),
      field: {
        id: "field-1",
        formId: "form-1",
        type: "text",
        slug: "field-1",
        order: 1,
        required: true,
        private: false,
        properties: { id: "field-1", type: "text", private: false, required: true, slug: "field-1", label: "Field 1", descriptionMd: "" },
        createdAt: new Date(),
        deletedAt: null,
        updatedAt: new Date(),
      },
    },
  ];

  const result = mapDbAnswersToDto(dbAnswersWithField.sort((a, b) => a.order - b.order), false);

  assertEquals(result.length, 2);
  assertEquals(result[0].fieldId, "field-1");
  assertEquals(result[1].fieldId, "field-2");
});

Deno.test("mapDbAnswersToDto should handle null answers", () => {
  const dbAnswersWithField: (InferSelectModel<typeof applicationAnswers> & { field: InferSelectModel<typeof applicationFormFields> })[] = [
    {
      applicationVersionId: "version-1",
      fieldId: "field-1",
      answer: null,
      order: 1,
      createdAt: new Date(),
      field: {
        id: "field-1",
        formId: "form-1",
        type: "text",
        slug: "field-1",
        order: 1,
        required: false,
        private: false,
        properties: { id: "field-1", type: "text", private: false, required: false, slug: "field-1", label: "Field 1", descriptionMd: "" },
        createdAt: new Date(),
        deletedAt: null,
        updatedAt: new Date(),
      },
    },
  ];

  const result = mapDbAnswersToDto(dbAnswersWithField, false);

  assertEquals(result.length, 1);
  assertEquals(result[0].fieldId, "field-1");
  // deno-lint-ignore no-explicit-any
  assertEquals((result[0] as any).text, null);
});
