import { InferSelectModel } from "drizzle-orm/table";
import { applicationAnswers, applicationFormFields, applications } from "../db/schema.ts";
import { 
  ApplicationAnswerDto,
  applicationUrlAnswerDtoSchema,
  applicationTextAnswerDtoSchema,
  applicationEmailAnswerDtoSchema,
  applicationListAnswerDtoSchema,
  applicationSelectAnswerDtoSchema,
  ApplicationAnswer
} from "../types/applicationAnswer.ts";
import { ZodSchema } from "zod";
import { BadRequestError } from "../errors/generic.ts";
import { db, Transaction } from "../db/postgres.ts";
import { ApplicationEmailField, ApplicationListField, ApplicationSelectField, ApplicationTextAreaField, ApplicationTextField, ApplicationUrlField } from "../types/applicationForm.ts";
import { isNull } from "drizzle-orm";

export function validateAnswers(
  dto: ApplicationAnswerDto,
  applicationFields: InferSelectModel<typeof applicationFormFields>[],
): boolean {
  // ensure all required fields are present in the answers
  const requiredFields = applicationFields.filter((f) => f.required).map((f) => f.id);
  for (const requiredFieldId of requiredFields) {
    if (!dto.find((a) => a.fieldId === requiredFieldId && a.value.toString().trim() !== "")) {
      return false;
    }
  }

  // ensure no duplicate field IDs in the answers
  const fieldIdSet = new Set<string>();
  for (const answer of dto) {
    if (fieldIdSet.has(answer.fieldId)) {
      return false;
    }
    fieldIdSet.add(answer.fieldId);
  }

  // ensure all answered field IDs exist in the form
  const formFieldIds = new Set(applicationFields.map((f) => f.id));
  for (const answer of dto) {
    if (!formFieldIds.has(answer.fieldId)) {
      return false;
    }
  }

  // build a map of fieldId with their respective schemas for validation
  const fieldSchemaMap: Record<string, ZodSchema> = {};
  
  const fillableFields = applicationFields.filter((f) => ["url", "text", "textarea", "email", "list", "select"].includes(f.type));

  for (const field of fillableFields) {
    switch (field.type) {
      case "url":
        fieldSchemaMap[field.id] = applicationUrlAnswerDtoSchema;
        break;
      case "text":
      case "textarea":
        fieldSchemaMap[field.id] = applicationTextAnswerDtoSchema;
        break;
      case "email":
        fieldSchemaMap[field.id] = applicationEmailAnswerDtoSchema;
        break;
      case "list":
        fieldSchemaMap[field.id] = applicationListAnswerDtoSchema;
        break;
      case "select":
        fieldSchemaMap[field.id] = applicationSelectAnswerDtoSchema;
        break;
      default:
        throw new Error(`Unsupported field type: ${field.type}`);
    }
  }

  const validatedFieldIds = new Set<string>();

  // validate each answer against its corresponding field schema
  for (const answer of dto) {
    const schema = fieldSchemaMap[answer.fieldId];
    if (!schema || !schema.safeParse(answer).success) {
      return false;
    }

    validatedFieldIds.add(answer.fieldId);
  }

  // ensure no fields unvalidated
  if (validatedFieldIds.size !== dto.length) {
    return false;
  }

  return true;
}

export function mapDbAnswersToDto(
  dbAnswersWithField: (InferSelectModel<typeof applicationAnswers> & { field: InferSelectModel<typeof applicationFormFields> })[],
  dropPrivateFields = true,
): ApplicationAnswer[] {
  const filteredFields = dropPrivateFields
    ? dbAnswersWithField.filter((a) => !a.field.private)
    : dbAnswersWithField;

  return filteredFields.map((dbAnswer) => {
    const { field } = dbAnswer;

    switch (field.type) {
      case "url":
        return {
          type: "url",
          fieldId: field.id,
          field: field.properties as ApplicationUrlField,
          url: dbAnswer.answer as string,
        };
      case "text":
      case "textarea":
        return {
          type: "text",
          fieldId: field.id,
          field: field.properties as ApplicationTextField | ApplicationTextAreaField,
          text: dbAnswer.answer as string,
        };
      case "email":
        return {
          type: "email",
          fieldId: field.id,
          field: field.properties as ApplicationEmailField,
          email: dbAnswer.answer as string,
        };
      case "list":
        return {
          type: "list",
          fieldId: field.id,
          field: field.properties as ApplicationListField,
          entries: dbAnswer.answer as Record<string, string | number>[],
        };
      case "select":
        return {
          type: "select",
          fieldId: field.id,
          field: field.properties as ApplicationSelectField,
          selected: dbAnswer.answer as string[],
        };
      default:
        throw new Error(`Unsupported field type: ${field.type}`);
    }
  });
}

export async function getAnswersByApplicationId(applicationId: string, dropPrivateFields = true, tx?: Transaction): Promise<ApplicationAnswer[]> {
  const answers = await (tx ?? db).query.applicationAnswers.findMany({
    where: (answers, { eq }) => eq(answers.applicationId, applicationId),
    with: {
      field: true,
    },
  });

  return mapDbAnswersToDto(answers, dropPrivateFields);
}

export async function recordAnswers(
  dto: ApplicationAnswerDto,
  application: InferSelectModel<typeof applications>,
  tx?: Transaction,
): Promise<ApplicationAnswer[]> {
  const category = await (tx ?? db).query.applicationCategories.findFirst({
    where: (categories, { eq }) => eq(categories.id, application.categoryId),
    with: {
      form: {
        with: {
          fields: {
            where: isNull(applicationFormFields.deletedAt)
          }
        }
      }
    }
  });
  if (!category) {
    throw new BadRequestError("Application category not found");
  }

  const { fields } = category.form;

  const valid = validateAnswers(dto, fields);
  if (!valid) {
    throw new BadRequestError("Invalid answers");
  }

  return await (tx ?? db).transaction(async (tx) => {
    await Promise.all(dto.map(async (answer) => {
      await tx.insert(applicationAnswers).values({
        applicationId: application.id,
        fieldId: answer.fieldId,
        answer: JSON.stringify(answer.value),
      })
    }));

    return await getAnswersByApplicationId(application.id, false, tx);
  });
}
