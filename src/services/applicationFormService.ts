import { eq, inArray, InferSelectModel, isNull } from "drizzle-orm";
import { db } from "../db/postgres.ts";
import { applicationFormFields, applicationForms } from "../db/schema.ts";
import { BadRequestError, NotFoundError } from "../errors/generic.ts";
import { type ApplicationForm, type CreateApplicationFormDto } from "../types/applicationForm.ts";
import { isUserRoundAdmin } from "./roundService.ts";
import { createLog } from "./auditLogService.ts";
import { AuditLogAction, AuditLogActorType } from "../types/auditLog.ts";

function ensureUniqueSlugs(fields: CreateApplicationFormDto["fields"]) {
  const slugs: string[] = fields
    .filter((field) => "slug" in field && field.slug)
    .map((field) => "slug" in field ? field.slug : null)
    .filter((slug): slug is string => slug !== null);

  const uniqueSlugs = new Set(slugs);

  if (slugs.length !== uniqueSlugs.size) {
    throw new BadRequestError("Field slugs must be unique");
  }
}

function mapApplicationAndFieldsToApplicationForm(
  application: InferSelectModel<typeof applicationForms>,
  fields: InferSelectModel<typeof applicationFormFields>[],
): ApplicationForm {
  return {
    id: application.id,
    name: application.name,
    fields: fields
      .sort((a, b) => a.order - b.order)
      .map((field) => ({
        ...field.properties,
        id: field.id,
        private: field.private ?? false,
        required: field.required ?? false,
      })),
  };
}

export async function createApplicationForm(
  dto: CreateApplicationFormDto,
  requestingUserId: string,
  roundId: string,
): Promise<ApplicationForm> {
  const round = await db.query.rounds.findFirst({
    where: (rounds, { eq }) => eq(rounds.id, roundId),
    columns: {
      id: true,
      published: true,
    },
    with: {
      admins: true,
    }
  });
  if (!round) {
    throw new NotFoundError("No round found for the provided ID");
  }
  if (!isUserRoundAdmin(round, requestingUserId)) {
    throw new BadRequestError("You are not authorized to modify this round");
  }

  // ensure no form with the same name exists for the round
  const existingForm = await db.query.applicationForms.findFirst({
    where: (forms, { and, eq, isNull }) => and(
      eq(forms.roundId, roundId),
      eq(forms.name, dto.name),
      isNull(forms.deletedAt)
    ),
  });
  if (existingForm) {
    throw new BadRequestError("An application form with the same name already exists for this round");
  }

  const result = await db.transaction(async (tx) => {

    // First, create the form itself
    const [form] = await tx.insert(applicationForms).values({
      roundId,
      name: dto.name,
    }).returning();

    // then, create the fields
    const createdFields = (await Promise.all(dto.fields.map((field, index) =>
      tx.insert(applicationFormFields).values({
        formId: form.id,
        order: index,
        type: field.type,
        slug: "slug" in field ? field.slug : null,
        properties: field,
        required: "required" in field ? field.required : null,
        private: "private" in field ? field.private : null,
      }).returning()
    ))).flat();

    await createLog({
      type: AuditLogAction.ApplicationFormCreated,
      roundId: round.id,
      actor: {
        type: AuditLogActorType.User,
        userId: requestingUserId,
      },
      payload: {
        ...dto,
        id: form.id,
      },
      tx,
    })

    return mapApplicationAndFieldsToApplicationForm(form, createdFields);
  });

  return result;
}

export async function updateApplicationForm(
  dto: CreateApplicationFormDto,
  requestingUserId: string,
  roundDraftId: string,
  formId: string,
): Promise<ApplicationForm> {
  ensureUniqueSlugs(dto.fields);

  const existingForm = await db.query.applicationForms.findFirst({
    where: (forms, { eq }) => eq(forms.id, formId),
    with: {
      fields: {
        where: isNull(applicationFormFields.deletedAt),
      },
      round: {
        with: {
          admins: true,
        }
      },
    }
  });
  if (!existingForm) {
    throw new NotFoundError("No application form found for the provided ID");
  }
  if (!isUserRoundAdmin(existingForm.round, requestingUserId)) {
    throw new BadRequestError("You are not authorized to modify this round");
  }
  if (existingForm.deletedAt) {
    throw new BadRequestError("Cannot update a deleted application form");
  }
  if (existingForm.roundId !== roundDraftId) {
    throw new NotFoundError("The application form does not belong to the specified round draft");
  }

  return await db.transaction(async (tx) => {
    // Update the form name
    const [updatedForm] = await tx.update(applicationForms).set({
      name: dto.name,
    }).where(eq(applicationForms.id, formId)).returning();

    const incomingFields = dto.fields;
    const existingFields = existingForm.fields;

    const fieldIndexMap = new Map(incomingFields.map((field, index) => [field, index]));

    const fieldsToCreate = incomingFields.filter((field) => !("id" in field) || !field.id);
    const fieldsToUpdate = incomingFields.filter((f) =>
      // Ensure it's a field that already exists
      f.id && existingFields.some(ef => ef.id === f.id)
    );
    const incomingFieldIds = new Set(incomingFields.map((f) => f.id));
    const fieldIdsToDelete = existingFields
      .map((f) => f.id)
      .filter((id) => !incomingFieldIds.has(id));

    if (fieldIdsToDelete.length > 0) {
      await tx
        .update(applicationFormFields)
        .set({ deletedAt: new Date() })
        .where(inArray(applicationFormFields.id, fieldIdsToDelete));
    }

    // Creations (Batch Insert)
    if (fieldsToCreate.length > 0) {
      await tx.insert(applicationFormFields).values(
        fieldsToCreate.map((field) => ({
          formId,
          type: field.type,
          slug: "slug" in field ? field.slug : null,
          properties: field,
          private: "private" in field ? field.private : null,
          required: "required" in field ? field.required : null,
          order: fieldIndexMap.get(field)!,
        })),
      );
    }

    // Updates (Run in parallel)
    if (fieldsToUpdate.length > 0) {
      await Promise.all(
        fieldsToUpdate.map((field) =>
          tx
            .update(applicationFormFields)
            .set({
              type: field.type,
              slug: "slug" in field ? field.slug : null,
              properties: field,
              // **Set order based on the field's index in the DTO array**
              order: fieldIndexMap.get(field)!,
              private: "private" in field ? field.private : null,
              required: "required" in field ? field.required : null,
            })
            .where(eq(applicationFormFields.id, field.id!)),
        ),
      );
    }

    const fieldsAfterUpdate = await tx.query.applicationFormFields.findMany({
      where: (fields, { and, eq, isNull }) =>
        and(eq(fields.formId, formId), isNull(fields.deletedAt)),
      orderBy: (fields, { asc }) => [asc(fields.order)],
    });

    await createLog({
      type: AuditLogAction.ApplicationFormUpdated,
      roundId: existingForm.round.id,
      actor: {
        type: AuditLogActorType.User,
        userId: requestingUserId,
      },
      payload: {
        ...dto,
        id: existingForm.id,
      },
      tx,
    });

    return mapApplicationAndFieldsToApplicationForm(updatedForm, fieldsAfterUpdate);
  });
}

export async function getApplicationFormForCategory(
  roundId: string,
  categoryId: string,
): Promise<ApplicationForm | null> {
  const category = await db.query.applicationCategories.findFirst({
    where: (categories, { eq }) => eq(categories.id, categoryId),
    with: {
      form: {
        with: {
          fields: true,
        }
      },
      round: {
        columns: {
          id: true,
          // This route should only be used for applicants post-publish of the round
          published: true,
        }
      }
    }
  });

  if (!category) {
    throw new NotFoundError("No application category found for the provided ID");
  }
  if (category.roundId !== roundId) {
    throw new NotFoundError("The application category does not belong to the specified round");
  }

  if (!category?.form) {
    return null;
  }

  return mapApplicationAndFieldsToApplicationForm(category.form, category.form.fields);
}

export async function deleteApplicationForm(
  formId: string,
  requestingUserId: string,
  roundId: string,
) {
  await db.transaction(async (tx) => {

    const form = await tx.query.applicationForms.findFirst({
      where: (forms, { eq }) => eq(forms.id, formId),
      with: {
        round: {
          with: {
            admins: true,
          }
        },
      }
    });
    if (!form) {
      throw new NotFoundError("No application form found for the provided ID");
    }
    if (!isUserRoundAdmin(form.round, requestingUserId)) {
      throw new BadRequestError("You are not authorized to modify this round");
    }
    if (form.deletedAt) {
      throw new BadRequestError("Application form is already deleted");
    }
    if (form.round.published) {
      throw new BadRequestError("Cannot delete application form for a published round");
    }
    if (form.roundId !== roundId) {
      throw new NotFoundError("The application form does not belong to the specified round");
    }

    // check if any category is assigned to this form
    const categories = await tx.query.applicationCategories.findMany({
      where: (categories, { eq, isNull, and }) => and(
        eq(categories.applicationFormId, formId),
        isNull(categories.deletedAt),
      ),
    });
    if (categories.length > 0) {
      throw new BadRequestError("Cannot delete application form assigned to a category");
    }

    // Soft-delete in order to be able to handle form edits during an active round gracefully
    await tx.update(applicationForms).set({
      deletedAt: new Date(),
    }).where(eq(applicationForms.id, formId));

    await createLog({
      type: AuditLogAction.ApplicationFormDeleted,
      roundId: form.round.id,
      actor: {
        type: AuditLogActorType.User,
        userId: requestingUserId,
      },
      payload: {
        id: form.id,
        previousName: form.name,
      },
      tx,
    });

    // if the form itself is deleted, the fields are considered deleted as well, so no need to delete them explicitly

    return;
  });
}

export async function getApplicationFormsByRoundId(
  roundId: string,
): Promise<ApplicationForm[]> {
  const forms = await db.query.applicationForms.findMany({
    where: (forms, { and, eq, isNull }) => and(
      eq(forms.roundId, roundId),
      isNull(forms.deletedAt)
    ),
    with: {
      fields: {
        where: isNull(applicationFormFields.deletedAt),
      },
    }
  });

  return forms.map((form) => mapApplicationAndFieldsToApplicationForm(form, form.fields));
}
