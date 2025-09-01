import { eq, inArray, InferSelectModel } from "drizzle-orm";
import { db } from "../db/postgres.ts";
import { applicationFormFields, applicationForms } from "../db/schema.ts";
import { BadRequestError, NotFoundError } from "../errors/generic.ts";
import { type ApplicationForm, type CreateApplicationFormDto } from "../types/applicationForm.ts";

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
      .map((field) => field.properties),
  };
}

export async function createApplicationForm(
  dto: CreateApplicationFormDto,
  roundId: string,
): Promise<ApplicationForm> {
  const result = await db.transaction(async (tx) => {
    const round = await tx.query.rounds.findFirst({
      where: (rounds, { eq }) => eq(rounds.id, roundId),
    });
    if (!round) {
      throw new NotFoundError("No round found for the provided ID");
    }
    if (round.published) {
      throw new BadRequestError("Cannot create application form for a published round");
    }

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
      }).returning()
    ))).flat();

    return mapApplicationAndFieldsToApplicationForm(form, createdFields);
  });

  return result;
}

export async function updateApplicationForm(
  dto: CreateApplicationFormDto,
  formId: string,
): Promise<ApplicationForm> {
  ensureUniqueSlugs(dto.fields);

  const existingForm = await db.query.applicationForms.findFirst({
    where: (forms, { eq }) => eq(forms.id, formId),
    with: {
      fields: true,
      round: true,
    }
  });
  if (!existingForm) {
    throw new NotFoundError("No application form found for the provided ID");
  }
  if (existingForm.deletedAt) {
    throw new BadRequestError("Cannot update a deleted application form");
  }
  if (existingForm.round.published) {
    throw new BadRequestError("Cannot update application form for a published round");
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

    return mapApplicationAndFieldsToApplicationForm(updatedForm, fieldsAfterUpdate);
  });
}

export async function getApplicationFormsForRound(
  roundId: string,
): Promise<ApplicationForm[]> {
  const forms = await db.query.applicationForms.findMany({
    where: (forms, { eq, and, isNull }) => and(
      eq(forms.roundId, roundId),
      isNull(forms.deletedAt)
    ),
    with: {
      fields: true,
    }
  });

  return forms.map((form) => mapApplicationAndFieldsToApplicationForm(form, form.fields));
}

export async function getApplicationFormForCategory(
  categoryId: string,
): Promise<ApplicationForm | null> {
  const category = await db.query.applicationCategories.findFirst({
    where: (categories, { eq }) => eq(categories.id, categoryId),
    with: {
      form: {
        with: {
          fields: true,
        }
      }
    }
  });

  if (!category?.form) {
    return null;
  }

  return mapApplicationAndFieldsToApplicationForm(category.form, category.form.fields);
}

export async function deleteApplicationForm(
  formId: string,
) {
  // check if any category is assigned to this form
  const categories = await db.query.applicationCategories.findMany({
    where: (categories, { eq }) => eq(categories.applicationFormId, formId),
  });
  if (categories.length > 0) {
    throw new BadRequestError("Cannot delete application form assigned to a category");
  }

  // Soft-delete in order to be able to handle form edits during an active round gracefully
  await db.update(applicationForms).set({
    deletedAt: new Date(),
  }).where(eq(applicationForms.id, formId));

  // if the form itself is deleted, the fields are considered deleted as well, so no need to delete them explicitly

  return;
}
