import { and, asc, desc, eq, or } from "drizzle-orm";
import { db, Transaction } from "../db/postgres.ts";
import { applications, results, rounds, users } from "../db/schema.ts";
import { BadRequestError, NotFoundError } from "../errors/generic.ts";
import {
  Application,
  ApplicationReviewDto,
  ApplicationState,
  CreateApplicationDto,
  createApplicationDtoSchema,
} from "../types/application.ts";
import { ApplicationFormat } from "../types/round.ts";
import mapFilterUndefined from "../utils/mapFilterUndefined.ts";
import { getProject } from "../gql/projects.ts";
import { JsonRpcProvider, type Provider } from "ethers";
import { EAS, SchemaEncoder } from "@ethereum-attestation-service/eas-sdk";
import * as ipfs from "../ipfs/ipfs.ts";
import z from "zod";
import { escapeCsvValue } from "../utils/csv.ts";
import { SortConfig } from "../utils/sort.ts";

async function validateEasAttestation(
  applicationDto: CreateApplicationDto,
  applicationFormat: ApplicationFormat,
  submitterWalletAddress: string,
  easContractAddress: string,
  provider: Provider,
) {
  const { attestationUID: uid, projectName, dripsAccountId, fields } =
    applicationDto;
  if (!uid) {
    throw new BadRequestError("EAS UID is required for attestation validation");
  }

  const eas = new EAS(easContractAddress);
  eas.connect(provider);

  const attestation = await eas.getAttestation(uid);
  if (!attestation) {
    throw new BadRequestError("EAS attestation not found");
  }

  if (
    attestation.attester.toLowerCase() !== submitterWalletAddress.toLowerCase()
  ) {
    throw new BadRequestError(
      "EAS attestation does not match the submitter's wallet address",
    );
  }

  const schemaEncoder = new SchemaEncoder(
    "string applicationDataIpfs,string roundSlug",
  );
  const decoded = schemaEncoder.decodeData(attestation.data);

  const ipfsHashParse = z.string().safeParse(
    decoded.find((v) => v.name === "applicationDataIpfs")?.value.value,
  );
  if (!ipfsHashParse.success) {
    throw new BadRequestError(
      "EAS attestation does not contain applicationDataIpfs, or is invalid",
    );
  }

  const ipfsData = await ipfs.getIpfsFile(ipfsHashParse.data);

  const attestedApplicationDtoParse = createApplicationDtoSchema(
    applicationFormat,
    false,
  ).safeParse(JSON.parse(ipfsData));
  if (!attestedApplicationDtoParse.success) {
    throw new BadRequestError(
      "EAS attestation data is not a valid application DTO for this round",
    );
  }

  const attestedApplicationDto = attestedApplicationDtoParse.data;

  if (attestedApplicationDto.projectName !== projectName) {
    throw new BadRequestError(
      "EAS attestation project name does not match the submitted application",
    );
  }

  if (attestedApplicationDto.dripsAccountId !== dripsAccountId) {
    throw new BadRequestError(
      "EAS attestation drips account ID does not match the submitted application",
    );
  }

  const attestedFields = attestedApplicationDto.fields;

  for (const [key, value] of Object.entries(fields)) {
    const fillableFields = applicationFormat.filter((f) => "slug" in f);
    const field = fillableFields.find((f) => f.slug === key);
    if (!field) {
      throw new Error(`Field ${key} is not part of the application format`);
    }

    // the field must be present in the attested fields IF IT IS NOT PRIVATE.
    // if it's present, it must match the value in the submitted application

    if (field.private) {
      continue;
    }

    if (!(key in attestedFields)) {
      throw new BadRequestError(`EAS attestation is missing field ${key}`);
    }

    const attestedValue = attestedFields[key];

    if (typeof attestedValue !== typeof value) {
      throw new BadRequestError(
        `EAS attestation field ${key} type does not match the submitted application`,
      );
    }

    if (JSON.stringify(attestedValue) !== JSON.stringify(value)) {
      throw new BadRequestError(
        `EAS attestation field ${key} value does not match the submitted application`,
      );
    }
  }
}

export async function createApplication(
  roundId: string,
  submitterUserId: string,
  submitterWalletAddress: string,
  applicationDto: CreateApplicationDto,
): Promise<Application> {
  const result = await db.transaction(async (tx) => {
    const round = await db.query.rounds.findFirst({
      where: eq(rounds.id, roundId),
      with: {
        chain: true,
      },
    });
    if (!round) {
      throw new NotFoundError("Round not found");
    }

    const { gqlName: chainGqlName, attestationSetup } = round.chain;

    const provider = new JsonRpcProvider(round.chain.rpcUrl);

    if (attestationSetup) {
      await validateEasAttestation(
        applicationDto,
        round.applicationFormat,
        submitterWalletAddress,
        attestationSetup.easAddress,
        provider,
      );
    }

    const onChainProject = await getProject(
      applicationDto.dripsAccountId,
      chainGqlName,
    );
    if (!onChainProject) {
      throw new BadRequestError(
        "Drips Account ID is not for a valid, claimed project",
      );
    }
    if (
      onChainProject.owner.address.toLowerCase() !==
        submitterWalletAddress.toLowerCase()
    ) {
      throw new BadRequestError(
        "Drips Account ID is pointing at a project not currently owned by the submitter",
      );
    }

    const newApplications = await tx.insert(applications).values({
      projectName: applicationDto.projectName,
      dripsProjectDataSnapshot: onChainProject,
      easAttestationUID: applicationDto.attestationUID,
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

  return result;
}

export async function getApplications(
  roundId: string,
  applicationFormat: ApplicationFormat,
  includePrivateFields = false,
  filterConfig: { state?: ApplicationState; submitterUserId?: string } | null =
    null,
  sortConfig:
    | SortConfig<"random" | "name" | "createdAt" | "allocation">
    | null = null,
  limit = 20,
  offset = 0,
  withResults = false,
): Promise<
  (Application & {
    submitter: { walletAddress: string };
    result: number | null;
  })[]
> {
  let applicationsResult = (await db
    .select()
    .from(applications)
    .leftJoin(results, eq(applications.id, results.applicationId))
    .innerJoin(users, eq(applications.submitterUserId, users.id))
    .where(
      and(
        eq(applications.roundId, roundId),
        filterConfig?.state
          ? eq(applications.state, filterConfig.state)
          : undefined,
        filterConfig?.submitterUserId
          ? eq(applications.submitterUserId, filterConfig.submitterUserId)
          : undefined,
      ),
    )
    .orderBy(...(() => {
      if (!sortConfig) return [];

      const direction = sortConfig.direction === "asc" ? asc : desc;

      switch (sortConfig.field) {
        case "random":
          // Scrambling later
          return [];
        case "name":
          return [direction(applications.projectName)];
        case "createdAt":
          return [direction(applications.createdAt)];
        case "allocation":
          return withResults ? [direction(results.result)] : [];
      }
    })())
    .limit(limit)
    .offset(offset))
    .map((r) => ({
      ...(includePrivateFields
        ? r.applications
        : filterPrivateFields(applicationFormat, r.applications)),
      result: withResults ? r.results?.result ?? null : null,
      submitter: { walletAddress: r.users.walletAddress },
    }));

  // apply random sort if requested
  if (sortConfig?.field === "random") {
    applicationsResult = applicationsResult.sort(() => Math.random() - 0.5);
  }

  return applicationsResult;
}

export async function getApplicationsCsv(
  roundId: string,
  applicationFormat: ApplicationFormat,
) {
  const applications = await getApplications(
    roundId,
    applicationFormat,
    true,
    undefined,
    undefined,
    100000,
    0,
  );

  const applicationFieldSlugs = Object.keys(applications[0]?.fields ?? {});
  const applicationFieldHeaders = applicationFieldSlugs.map((slug) =>
    `"${slug}"`
  ).join(",");

  const header =
    `"ID","Project Name","GitHub URL","Drips Account ID","Submitter Wallet Address",${applicationFieldHeaders},"Created At"`;

  const rows = applications.map((application) => {
    const fields: string[] = applicationFieldSlugs.map((slug) => {
      const value = application.fields[slug];

      if (typeof value === "string") {
        return value;
      } else if (typeof value === "object" || Array.isArray(value)) {
        return JSON.stringify(value);
      } else {
        return "Unknown";
      }
    });

    return `"${
      [
        application.id,
        application.projectName,
        application.dripsProjectDataSnapshot.gitHubUrl ?? "Unknown",
        application.dripsAccountId,
        application.submitter.walletAddress,
        ...fields,
        application.createdAt.toISOString(),
      ].map(escapeCsvValue).join('","')
    }"`;
  });

  return [header, ...rows].join("\n");
}

export function filterPrivateFields<T extends Application>(
  applicationFormat: ApplicationFormat,
  application: T,
): T {
  const fieldSlugsToReturn = mapFilterUndefined(applicationFormat, (field) => {
    if (!("slug" in field)) {
      return undefined;
    }

    if ("private" in field && field.private) {
      return undefined;
    }
    return field.slug;
  });

  const filteredFields = Object.fromEntries(
    Object.entries(application.fields).filter(([key]) =>
      fieldSlugsToReturn.includes(key)
    ),
  );

  return {
    ...application,
    fields: filteredFields,
  };
}

export async function setApplicationsState(
  tx: Transaction,
  applicationIds: string[],
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
          )
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
  const applicationIdsToApprove = review.filter((ri) =>
    ri.decision === "approve"
  ).map((d) => d.applicationId);
  const applicationIdsToReject = review.filter((ri) => ri.decision === "reject")
    .map((d) => d.applicationId);

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
