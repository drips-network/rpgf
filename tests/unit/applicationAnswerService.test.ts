
import { ApplicationAnswerDto } from "$app/types/applicationAnswer.ts";
import { assert, assertFalse } from "jsr:@std/assert@^1.0.13";
import { validateAnswers } from "$app/services/applicationAnswerService.ts";
import { InferSelectModel } from "drizzle-orm/table";
import { applicationFormFields } from "$app/db/schema.ts";

Deno.test("validateAnswers should throw if an answer is missing for a required field", () => {
  const answers: ApplicationAnswerDto = [];
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
  assertFalse(validateAnswers(answers, fields));
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
