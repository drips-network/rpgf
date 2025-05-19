import { and, eq, or } from "drizzle-orm";
import { db, Transaction } from "../db/postgres.ts";
import { applications } from "../db/schema.ts";
import { BadRequestError } from "../errors/generic.ts";
import {
  Application,
  ApplicationReviewDto,
  applicationSchema,
  ApplicationState,
  CreateApplicationDto,
} from "../types/application.ts";
import { ApplicationFormat } from "../types/round.ts";
import mapFilterUndefined from "../utils/mapFilterUndefined.ts";

export async function createApplication(
  roundId: number,
  submitterUserId: number,
  applicationFormat: ApplicationFormat,
  applicationDto: CreateApplicationDto,
): Promise<Application> {
  const result = await db.transaction(async (tx) => {
    const existingApplication = await tx.query.applications.findFirst({
      where: and(
        eq(applications.roundId, roundId),
        eq(applications.submitterUserId, submitterUserId),
      ),
    });

    if (existingApplication) {
      throw new BadRequestError(
        "You have already submitted an application for this round",
      );
    }

    const newApplications = await tx.insert(applications).values({
      projectName: applicationDto.projectName,
      dripsAccountId: applicationDto.dripsAccountId,
      fields: applicationDto.fields,
      submitterUserId,
      roundId,
    }).returning();

    if (!newApplications || newApplications.length === 0) {
      throw new Error("Failed to create application");
    }

    return newApplications[0];
  });

  return applicationSchema(applicationFormat).parse(result);
}

export async function getApplications(
  roundId: number,
  applicationFormat: ApplicationFormat,
  includePrivateFields = false,
  filter?: { state?: ApplicationState; submitterUserId?: number },
  limit = 20,
  offset = 0,
): Promise<Application[]> {
  const result = (await db.query.applications.findMany({
    where: and(
      eq(applications.roundId, roundId),
      filter?.state ? eq(applications.state, filter.state) : undefined,
      filter?.submitterUserId ? eq(applications.submitterUserId, filter.submitterUserId) : undefined,
    ),
    limit,
    offset,
  })).map((application) => {
    if (includePrivateFields) return application;

    return filterPrivateFields(applicationFormat, application);
  });

  console.log({ filter, result });
  
  return result;
}

export function filterPrivateFields(
  applicationFormat: ApplicationFormat,
  application: Application,
): Application {
  const fieldSlugsToReturn = mapFilterUndefined(applicationFormat, (field) => {
    if (!('slug' in field)) {
      return undefined;
    }

    if ('private' in field && field.private) {
      return undefined;
    }
    return field.slug;
  });

  const filteredFields = Object.fromEntries(
    Object.entries(application.fields).filter(([key]) => fieldSlugsToReturn.includes(key)),
  );

  return {
    ...application,
    fields: filteredFields,
  };
}

// submit application reviews
export async function setApplicationsState(
  tx: Transaction,
  applicationIds: number[],
  newState: ApplicationState,
): Promise<Application[]> {
  if (applicationIds.length === 0) {
    return [];
  }

  const updatedApplications = await tx
    .update(applications)
    .set({ state: newState })
    .where(
      or(
        ...applicationIds.map((applicationId) =>
          and(
            eq(applications.state, "pending"),
            eq(applications.id, applicationId),
          ),
        ),
      ),
    ).returning();

  if (updatedApplications.length !== applicationIds.length) {
    throw new BadRequestError("Some applications were not in pending state");
  }

  return updatedApplications;
}

export async function applyApplicationReview(
  review: ApplicationReviewDto,
): Promise<Application[]> {
  const applicationIdsToApprove = review.filter((ri) => ri.decision === "approve").map((d) => d.applicationId);
  const applicationIdsToReject = review.filter((ri) => ri.decision === "reject").map((d) => d.applicationId);

  const result = await db.transaction(async (tx) => {
    const approvedApplications = await setApplicationsState(
      tx,
      applicationIdsToApprove,
      "approved",
    );

    const rejectedApplications = await setApplicationsState(
      tx,
      applicationIdsToReject,
      "rejected",
    );

    return [...approvedApplications, ...rejectedApplications];
  });

  return result;
}