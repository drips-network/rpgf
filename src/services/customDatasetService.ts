import { CreateCustomDatasetDto, CustomDataset, UpdateCustomDatasetDto } from "$app/types/customDataset.ts";
import { db } from "$app/db/postgres.ts";
import { applications, customDatasetFields, customDatasets, customDatasetValues, rounds } from "$app/db/schema.ts";
import { and, count, eq, inArray, InferSelectModel } from "drizzle-orm";
import { createLog } from "./auditLogService.ts";
import { AuditLogAction, AuditLogActorType } from "../types/auditLog.ts";
import { log, LogLevel } from "./loggingService.ts";
import { isUserRoundAdmin } from "./roundService.ts";
import { NotFoundError } from "$app/errors/generic.ts";
import { UnauthorizedError } from "../errors/auth.ts";
import { parse, stringify } from "std/csv";
import { BadRequestError } from "$app/errors/generic.ts";
import { cachingService } from "./cachingService.ts";

function mapDbCustomDatasetToDto(dbDataset: InferSelectModel<typeof customDatasets>, rowCount: number): CustomDataset {
  return {
    id: dbDataset.id,
    roundId: dbDataset.roundId,
    name: dbDataset.name,
    isPublic: dbDataset.isPublic,
    createdAt: dbDataset.createdAt,
    updatedAt: dbDataset.updatedAt,
    rowCount,
  };
}

export async function createCustomDataset(
  roundId: string,
  dto: CreateCustomDatasetDto,
  creatorUserId: string,
): Promise<CustomDataset> {
  log(LogLevel.Info, "Creating custom dataset", { roundId, creatorUserId, dto });
  const round = await db.query.rounds.findFirst({
    where: eq(rounds.id, roundId),
    with: {
      admins: true,
    },
  });

  if (!round) {
    throw new NotFoundError("Round not found");
  }

  if (!isUserRoundAdmin(round, creatorUserId)) {
    throw new UnauthorizedError("Only round admins can create datasets.");
  }

  const datasetCount = await db.select({ count: count() }).from(customDatasets).where(eq(customDatasets.roundId, roundId));
  if (datasetCount[0].count >= 5) {
    throw new BadRequestError("A round can have a maximum of 5 custom datasets.");
  }

  const result = await db.transaction(async (tx) => {
    const [dataset] = await tx.insert(customDatasets).values({
      roundId,
      name: dto.name,
    }).returning();

    await createLog({
      type: AuditLogAction.CustomDatasetCreated,
      roundId,
      actor: {
        type: AuditLogActorType.User,
        userId: creatorUserId,
      },
      payload: { ...dto, id: dataset.id },
      tx,
    });

    return dataset;
  });

  return mapDbCustomDatasetToDto(result, 0);
}

export async function uploadCustomDataset(
  roundId: string,
  datasetId: string,
  csv: string,
  uploaderUserId: string,
): Promise<CustomDataset> {
  log(LogLevel.Info, "Uploading custom dataset", { roundId, datasetId, uploaderUserId });
  const round = await db.query.rounds.findFirst({
    where: eq(rounds.id, roundId),
    with: {
      admins: true,
    },
  });

  if (!round) {
    throw new NotFoundError("Round not found");
  }

  if (!isUserRoundAdmin(round, uploaderUserId)) {
    throw new UnauthorizedError("Only round admins can upload datasets.");
  }

  const rows = parse(csv, { skipFirstRow: false });

  if (rows.length < 1) {
    throw new BadRequestError("CSV is empty.");
  }

  const header = rows[0];
  if (header[0] !== "applicationId") {
    throw new BadRequestError("First column of CSV must be 'applicationId'.");
  }

  if (header.length - 1 > 10) {
    throw new BadRequestError("A custom dataset can have a maximum of 10 fields.");
  }

  const dataRows = rows.slice(1);
  const applicationIds = dataRows.map((row: string[]) => row[0]);

  if (applicationIds.length === 0) {
    throw new BadRequestError("CSV must have at least one data row.");
  }

  // ensure all application IDs are valid UUIDs
  for (const id of applicationIds) {
    if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(id)) {
      throw new BadRequestError(`Invalid application ID format: '${id}'.`);
    }
  }

  const roundApplications = await db.query.applications.findMany({
    where: and(
      eq(applications.roundId, roundId),
      inArray(applications.id, applicationIds),
    ),
    columns: {
      id: true,
    },
  });

  const roundApplicationIds = new Set(roundApplications.map((app) => app.id));
  const errors: string[] = [];
  const seenApplicationIds = new Set<string>();

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const applicationId = row[0];

    if (seenApplicationIds.has(applicationId)) {
      errors.push(`Row ${i + 2}: Duplicate application ID '${applicationId}'.`);
    }

    if (!roundApplicationIds.has(applicationId)) {
      errors.push(`Row ${i + 2}: Application with ID '${applicationId}' not found in this round.`);
    }

    seenApplicationIds.add(applicationId);
  }

  if (errors.length > 0) {
    throw new BadRequestError(errors.join("\n"));
  }

  const result = await db.transaction(async (tx) => {
    await tx.delete(customDatasetFields).where(eq(customDatasetFields.datasetId, datasetId));
    await tx.delete(customDatasetValues).where(eq(customDatasetValues.datasetId, datasetId));

    const fieldNames = header.slice(1);
    const fieldsToInsert = fieldNames.map((name: string, i: number) => ({
      datasetId,
      name,
      order: i,
    }));
    if (fieldsToInsert.length > 0) {
      await tx.insert(customDatasetFields).values(fieldsToInsert);
    }

    const valuesToInsert = dataRows.map((row: string[]) => {
      const values: Record<string, string> = {};
      for (let i = 1; i < header.length; i++) {
        values[header[i]] = row[i];
      }
      return {
        datasetId,
        applicationId: row[0],
        values,
      };
    });

    if (valuesToInsert.length > 0) {
      await tx.insert(customDatasetValues).values(valuesToInsert);
    }

    const created = await tx.query.customDatasets.findFirst({
      where: eq(customDatasets.id, datasetId),
    });
    if (!created) {
      throw new Error("Dataset not found after upload");
    }

    const rowCount = valuesToInsert.length;

    await createLog({
      type: AuditLogAction.CustomDatasetUploaded,
      roundId,
      actor: {
        type: AuditLogActorType.User,
        userId: uploaderUserId,
      },
      payload: { id: datasetId, rowCount },
      tx,
    });

    await cachingService.delByPattern(
      cachingService.generateKey(["applications", roundId, "*"]),
    );
    for (const id of applicationIds) {
      await cachingService.delByPattern(
        cachingService.generateKey(["application", id, "*"]),
      );
    }

    return mapDbCustomDatasetToDto(created, rowCount);
  });

  return result;
}

export async function updateCustomDataset(
  roundId: string,
  datasetId: string,
  dto: UpdateCustomDatasetDto,
  updaterUserId: string,
): Promise<CustomDataset> {
  log(LogLevel.Info, "Updating custom dataset", { roundId, datasetId, updaterUserId, dto });
  if (Object.keys(dto).length === 0) {
    throw new BadRequestError("No fields to update.");
  }

  const round = await db.query.rounds.findFirst({
    where: eq(rounds.id, roundId),
    with: {
      admins: true,
    },
  });

  if (!round) {
    throw new NotFoundError("Round not found");
  }

  if (!isUserRoundAdmin(round, updaterUserId)) {
    throw new UnauthorizedError("Only round admins can update datasets.");
  }

  const result = await db.transaction(async (tx) => {
    const [updated] = await tx.update(customDatasets).set(dto).where(
      eq(customDatasets.id, datasetId),
    ).returning();

    await createLog({
      type: AuditLogAction.CustomDatasetUpdated,
      roundId,
      actor: {
        type: AuditLogActorType.User,
        userId: updaterUserId,
      },
      payload: { ...dto, id: datasetId },
      tx,
    });

    await cachingService.delByPattern(
      cachingService.generateKey(["applications", roundId, "*"]),
    );

    const applicationIds = await tx.query.customDatasetValues.findMany({
      where: eq(customDatasetValues.datasetId, datasetId),
      columns: {
        applicationId: true,
      },
    });

    if (applicationIds.length > 0) {
      for (const app of applicationIds) {
        await cachingService.delByPattern(
          cachingService.generateKey(["application", app.applicationId, "*"]),
        );
      }
    }

    return updated;
  });

  return mapDbCustomDatasetToDto(result, await db.select({ count: count() }).from(customDatasetValues).where(
    eq(customDatasetValues.datasetId, datasetId),
  ).then((res) => res[0].count));
}

export async function listCustomDatasets(
  roundId: string,
  requestingUserId?: string,
): Promise<CustomDataset[]> {
  log(LogLevel.Info, "Listing custom datasets", { roundId, requestingUserId });
  const round = await db.query.rounds.findFirst({
    where: eq(rounds.id, roundId),
    with: {
      admins: true,
    },
  });

  if (!round) {
    throw new NotFoundError("Round not found");
  }

  const isAdmin = isUserRoundAdmin(round, requestingUserId);

  const datasets = await db.query.customDatasets.findMany({
    where: and(
      eq(customDatasets.roundId, roundId),
      isAdmin ? undefined : eq(customDatasets.isPublic, true),
    ),
    with: {
      fields: true,
    },
  });

  const result: CustomDataset[] = [];

  for (const dataset of datasets) {
    const rowCount = await db.select({ count: count() }).from(customDatasetValues).where(
      eq(customDatasetValues.datasetId, dataset.id),
    ).then((res) => res[0].count);
    
    result.push(mapDbCustomDatasetToDto(dataset, rowCount));
  }

  return result;
}

async function getCustomDataset(
  roundId: string,
  datasetId: string,
) {
  log(LogLevel.Info, "Getting custom dataset", { roundId, datasetId });
  const dataset = await db.query.customDatasets.findFirst({
    where: and(
      eq(customDatasets.id, datasetId),
      eq(customDatasets.roundId, roundId),
    ),
    with: {
      fields: true,
      values: true,
    },
  });

  if (!dataset) {
    throw new NotFoundError("Dataset not found");
  }

  return dataset;
}

export async function downloadCustomDataset(
  roundId: string,
  datasetId: string,
) {
  log(LogLevel.Info, "Downloading custom dataset", { roundId, datasetId });
  const dataset = await getCustomDataset(roundId, datasetId);
  const headers = ["applicationId", ...dataset.fields.map((f) => f.name)];
  const rows = dataset.values.map((v) => {
    const row = [v.applicationId];
    for (const field of dataset.fields) {
      row.push(v.values[field.name]?.toString() ?? "");
    }
    return row;
  });

  return stringify([headers, ...rows]);
}

export async function deleteCustomDataset(
  roundId: string,
  datasetId: string,
  deleterUserId: string,
) {
  log(LogLevel.Info, "Deleting custom dataset", { roundId, datasetId, deleterUserId });
  const round = await db.query.rounds.findFirst({
    where: eq(rounds.id, roundId),
    with: {
      admins: true,
    },
  });

  if (!round) {
    throw new NotFoundError("Round not found");
  }

  if (!isUserRoundAdmin(round, deleterUserId)) {
    throw new UnauthorizedError("Only round admins can delete datasets.");
  }

  await db.transaction(async (tx) => {
    await tx.delete(customDatasets).where(eq(customDatasets.id, datasetId));

    await createLog({
      type: AuditLogAction.CustomDatasetDeleted,
      roundId,
      actor: {
        type: AuditLogActorType.User,
        userId: deleterUserId,
      },
      payload: { id: datasetId },
      tx,
    });

    await cachingService.delByPattern(
      cachingService.generateKey(["applications", roundId, "*"]),
    );
  });
}
