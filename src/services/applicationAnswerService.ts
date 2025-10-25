import { InferSelectModel } from "drizzle-orm/table";
import { applicationAnswers, applicationFormFields } from "../db/schema.ts";
import { log, LogLevel } from "./loggingService.ts";
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
  applicationFields: Pick<InferSelectModel<typeof applicationFormFields>, "id" | "type" | "required" | "properties">[],
): boolean {
  log(LogLevel.Info, "Validating answers", {
    answerCount: dto.length,
    fieldCount: applicationFields.length,
  });
  // ensure all required fields are present in the answers
  const requiredFields = applicationFields.filter((f) => f.required).map((f) => f.id);
  for (const requiredFieldId of requiredFields) {
    const answer = dto.find((a) => a.fieldId === requiredFieldId);

    if (!answer || !answer.value) {
      log(LogLevel.Warn, "Required field not found in answers", {
        requiredFieldId,
      });
      return false;
    }
  }

  // ensure no duplicate field IDs in the answers
  const fieldIdSet = new Set<string>();
  for (const answer of dto) {
    if (fieldIdSet.has(answer.fieldId)) {
      log(LogLevel.Warn, "Duplicate field ID in answers", {
        fieldId: answer.fieldId,
      });
      return false;
    }
    fieldIdSet.add(answer.fieldId);
  }

  // ensure all answered field IDs exist in the form
  const formFieldIds = new Set(applicationFields.map((f) => f.id));
  for (const answer of dto) {
    if (!formFieldIds.has(answer.fieldId)) {
      log(LogLevel.Warn, "Answered field ID not found in form", {
        fieldId: answer.fieldId,
      });
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
      log(LogLevel.Warn, "Answer validation failed", {
        fieldId: answer.fieldId,
      });
      return false;
    }

    validatedFieldIds.add(answer.fieldId);
  }

  // ensure no fields unvalidated
  if (validatedFieldIds.size !== dto.length) {
    log(LogLevel.Warn, "Not all fields were validated");
    return false;
  }

  log(LogLevel.Info, "Answers validated successfully");
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
          url: dbAnswer.answer as string | null,
        };
      case "text":
      case "textarea":
        return {
          type: "text",
          fieldId: field.id,
          field: field.properties as ApplicationTextField | ApplicationTextAreaField,
          text: dbAnswer.answer as string | null,
        };
      case "email":
        return {
          type: "email",
          fieldId: field.id,
          field: field.properties as ApplicationEmailField,
          email: dbAnswer.answer as string | null,
        };
      case "list":
        return {
          type: "list",
          fieldId: field.id,
          field: field.properties as ApplicationListField,
          entries: dbAnswer.answer as Record<string, string | number>[] | null,
        };
      case "select":
        return {
          type: "select",
          fieldId: field.id,
          field: field.properties as ApplicationSelectField,
          selected: dbAnswer.answer as string[] | null,
        };
      default:
        throw new Error(`Unsupported field type: ${field.type}`);
    }
  });
}

export async function getAnswersByApplicationVersionId(applicationVersionId: string, dropPrivateFields = true, tx?: Transaction): Promise<ApplicationAnswer[]> {
  log(LogLevel.Info, "Getting answers by application version ID", {
    applicationVersionId,
    dropPrivateFields,
  });
  const answers = await (tx ?? db).query.applicationAnswers.findMany({
    where: (answers, { eq }) => eq(answers.applicationVersionId, applicationVersionId),
    with: {
      field: true,
    },
    orderBy: (answers, { asc }) => [asc(answers.order)],
  });

  return mapDbAnswersToDto(answers, dropPrivateFields);
}

export async function recordAnswers(
  dto: ApplicationAnswerDto,
  applicationVersionId: string,
  tx: Transaction,
): Promise<ApplicationAnswer[]> {
  log(LogLevel.Info, "Recording answers", {
    applicationVersionId,
    answerCount: dto.length,
  });
  const applicationVersion = await tx.query.applicationVersions.findFirst({
    where: (versions, { eq }) => eq(versions.id, applicationVersionId),
    with: {
      category: {
        with: {
          form: {
            with: {
              fields: {
                where: isNull(applicationFormFields.deletedAt)
              }
            }
          }
        }
      }
    }
  });
  if (!applicationVersion) {
    log(LogLevel.Error, "Application version not found", {
      applicationVersionId,
    });
    throw new BadRequestError("Application version not found");
  }

  const { fields } = applicationVersion.category.form;

  const valid = validateAnswers(dto, fields);
  if (!valid) {
    log(LogLevel.Error, "Invalid answers", { applicationVersionId });
    throw new BadRequestError("Invalid answers");
  }

  return await tx.transaction(async (tx) => {

    await Promise.all(fields.map(async (field) => {
      const answerValue = dto.find(a => a.fieldId === field.id)?.value ?? null;

      await tx.insert(applicationAnswers).values({
        applicationVersionId: applicationVersionId,
        fieldId: field.id,
        answer: answerValue === null ? null : JSON.stringify(answerValue),
        order: field.order,
      });
    }));

    return await getAnswersByApplicationVersionId(applicationVersionId, false, tx);
  });
}
