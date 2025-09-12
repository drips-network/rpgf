import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db/postgres.ts";
import { applicationCategories, applicationForms, rounds } from "../db/schema.ts";
import { ApplicationCategory, CreateApplicationCategoryDto, UpdateApplicationCategoryDto } from "../types/applicationCategory.ts";
import { BadRequestError, NotFoundError } from "../errors/generic.ts";
import { isUserRoundAdmin } from "./roundService.ts";
import { UnauthorizedError } from "../errors/auth.ts";
import { createLog } from "./auditLogService.ts";
import { AuditLogAction, AuditLogActorType } from "../types/auditLog.ts";

export async function createApplicationCategoryForRound(
  dto: CreateApplicationCategoryDto,
  requestingUserId: string,
  roundId: string,
): Promise<ApplicationCategory> {
  return await db.transaction(async (tx) => {
    // ensure the round exists and is not published
    const round = await tx.query.rounds.findFirst({
      where: and(
        eq(rounds.id, roundId),
      ),
      with: {
        admins: true,
      }
    });
    if (!round) {
      throw new BadRequestError("Round not found");
    }
    if (!isUserRoundAdmin(round, requestingUserId)) {
      throw new BadRequestError("You are not authorized to modify this round");
    }

    // ensure the form exists
    const form = await tx.query.applicationForms.findFirst({
      where: and(
        eq(applicationForms.id, dto.applicationFormId),
        isNull(applicationForms.deletedAt),
      )
    });
    if (!form) {
      throw new BadRequestError("Application form not found");
    }

    const [category] = await tx.insert(applicationCategories).values({
      name: dto.name,
      description: dto.description,
      roundId,
      applicationFormId: dto.applicationFormId,
    }).returning();

    await createLog({
      type: AuditLogAction.ApplicationCategoryCreated,
      roundId: round.id,
      actor: {
        type: AuditLogActorType.User,
        userId: requestingUserId,
      },
      payload: {
        ...dto,
        id: category.id,
      },
      tx,
    })

    return {
      ...category,
      applicationForm: {
        id: form.id,
        name: form.name,
      },
    };
  });
}

export async function updateApplicationCategory(
  roundId: string,
  categoryId: string,
  requestingUserId: string,
  dto: UpdateApplicationCategoryDto,
): Promise<ApplicationCategory | null> {
  return await db.transaction(async (tx) => {
    const existingCategory = await tx.query.applicationCategories.findFirst({
      where: eq(applicationCategories.id, categoryId),
      with: {
        round: {
          with: {
            admins: true,
          }
        }
      }
    });
    if (!existingCategory) {
      throw new NotFoundError("Application category not found");
    }
    if (existingCategory.round.published) {
      throw new BadRequestError("Cannot modify category of a published round");
    }
    if (!isUserRoundAdmin(existingCategory.round, requestingUserId)) {
      throw new BadRequestError("You are not authorized to modify this round");
    }
    if (existingCategory.roundId !== roundId) {
      throw new NotFoundError("Category does not belong to the specified round");
    }

    const form = await tx.query.applicationForms.findFirst({
      where: and(
        eq(applicationForms.id, dto.applicationFormId),
        isNull(applicationForms.deletedAt),
      )
    });
    if (!form) {
      throw new BadRequestError("Application form not found");
    }

    const [category] = await tx.update(applicationCategories).set({
      name: dto.name,
      description: dto.description,
      applicationFormId: dto.applicationFormId,
    }).where(eq(applicationCategories.id, categoryId)).returning();

    await createLog({
      type: AuditLogAction.ApplicationCategoryUpdated,
      roundId: existingCategory.round.id,
      actor: {
        type: AuditLogActorType.User,
        userId: requestingUserId,
      },
      payload: {
        ...dto,
        id: category.id,
        previousName: existingCategory.name,
      },
      tx,
    });

    return {
      ...category,
      applicationForm: {
        id: form.id,
        name: form.name,
      },
    };
  });
}

export async function deleteApplicationCategory(
  roundId: string,
  categoryId: string,
  requestingUserId: string,
): Promise<void> {
  return await db.transaction(async (tx) => {
    // ensure the category exists and the round is not published
    const existingCategory = await tx.query.applicationCategories.findFirst({
      where: eq(applicationCategories.id, categoryId),
      with: {
        round: {
          with: {
            admins: true,
          }
        }
      }
    });
    if (!existingCategory) {
      throw new NotFoundError("Application category not found");
    }
    if (!isUserRoundAdmin(existingCategory.round, requestingUserId)) {
      throw new BadRequestError("You are not authorized to modify this round");
    }
    if (existingCategory.roundId !== roundId) {
      throw new NotFoundError("Category does not belong to the specified round");
    }

    const category = await tx.query.applicationCategories.findFirst({
      where: eq(applicationCategories.id, categoryId),
      with: {
        round: true,
      }
    });
    if (!category) {
      throw new NotFoundError("Application category not found");
    }

    // soft delete
    await tx.update(applicationCategories).set({
      deletedAt: new Date(),
    }).where(eq(applicationCategories.id, categoryId));

    await createLog({
      type: AuditLogAction.ApplicationCategoryDeleted,
      roundId: category.round.id,
      actor: {
        type: AuditLogActorType.User,
        userId: requestingUserId,
      },
      payload: {
        id: category.id,
        previousName: category.name,
      },
      tx,
    });
  });
}

export async function getApplicationCategoriesByRoundId(
  roundId: string,
  requestingUserId: string | null,
): Promise<ApplicationCategory[]> {
  const round = await db.query.rounds.findFirst({
    where: eq(rounds.id, roundId),
    with: {
      admins: true,
    }
  });
  if (!round) {
    throw new NotFoundError("Round not found.");
  }
  if (!round.published && !isUserRoundAdmin(round, requestingUserId)) {
    throw new UnauthorizedError("You are not authorized to view this round's application categories.");
  }

  const categories = await db.query.applicationCategories.findMany({
    where: and(
      eq(applicationCategories.roundId, roundId),
      isNull(applicationCategories.deletedAt),
    ),
    with: {
      form: true,
    },
  });

  return categories.map((category) => ({
    ...category,
    applicationForm: {
      id: category.form.id,
      name: category.form.name,
    },
  }));
}
