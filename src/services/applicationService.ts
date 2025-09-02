import { and, asc, desc, eq, InferSelectModel, isNull, or } from "drizzle-orm";
import { db, Transaction } from "../db/postgres.ts";
import { applicationCategories, applicationFormFields, applications, results, rounds, users } from "../db/schema.ts";
import { BadRequestError, NotFoundError } from "../errors/generic.ts";
import {
  Application,
  ApplicationReviewDto,
  ApplicationState,
  CreateApplicationDto,
  createApplicationDtoSchema,
  ListingApplication,
} from "../types/application.ts";
import { getProject } from "../gql/projects.ts";
import { JsonRpcProvider, type Provider } from "ethers";
import { EAS, SchemaEncoder } from "@ethereum-attestation-service/eas-sdk";
import * as ipfs from "../ipfs/ipfs.ts";
import z from "zod";
import { SortConfig } from "../utils/sort.ts";
import { inferRoundState, isUserRoundAdmin } from "./roundService.ts";
import { getAnswersByApplicationId, recordAnswers, validateAnswers } from "./applicationAnswerService.ts";
import { ApplicationAnswer } from "../types/applicationAnswer.ts";
import { UnauthorizedError } from "../errors/auth.ts";

async function validateEasAttestation(
  applicationDto: CreateApplicationDto,
  formFields: InferSelectModel<typeof applicationFormFields>[],
  submitterWalletAddress: string,
  easContractAddress: string,
  provider: Provider,
) {
  const { attestationUID: uid, projectName, dripsAccountId, answers } =
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

  const attestedApplicationDtoParse = createApplicationDtoSchema.safeParse(JSON.parse(ipfsData));
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

  const attestedAnswers = attestedApplicationDto.answers;

  for (const { fieldId, value } of answers) {
    const fillableFields = formFields.filter((f) => f.slug);
    const field = fillableFields.find((f) => f.id === fieldId);
    if (!field) {
      throw new Error(`Field ${fieldId} is not part of the application format`);
    }

    // the field must be present in the attested fields IF IT IS NOT PRIVATE.
    // if it's present, it must match the value in the submitted application

    if (field.private) {
      if (attestedAnswers.find((a) => a.fieldId === fieldId)) {
        throw new BadRequestError(`EAS attestation must not contain private field ${fieldId}`);
      }
      continue;
    }

    if (!attestedAnswers.find((a) => a.fieldId === fieldId)) {
      throw new BadRequestError(`EAS attestation is missing field ${fieldId}`);
    }

    const attestedValue = attestedAnswers.find((a) => a.fieldId === fieldId);

    if (typeof attestedValue?.value !== typeof value) {
      throw new BadRequestError(
        `EAS attestation field ${fieldId} type does not match the submitted application`,
      );
    }

    if (JSON.stringify(attestedValue?.value) !== JSON.stringify(value)) {
      throw new BadRequestError(
        `EAS attestation field ${fieldId} value does not match the submitted application`,
      );
    }
  }
}

function mapDbApplicationToDto(
  application: InferSelectModel<typeof applications>,
  category: InferSelectModel<typeof applicationCategories>,
  submitter: { id: string; walletAddress: string },
  answers: ApplicationAnswer[],
  resultAllocation: number | null,
): Application {
  return {
    id: application.id,
    state: application.state,
    projectName: application.projectName,
    dripsAccountId: application.dripsAccountId,
    easAttestationUID: application.easAttestationUID ?? null,
    dripsProjectDataSnapshot: application.dripsProjectDataSnapshot,
    createdAt: application.createdAt,
    updatedAt: application.updatedAt,
    roundId: application.roundId,
    formId: application.formId,
    category: {
      id: category.id,
      name: category.name,
      description: category.description,
      applicationFormId: category.applicationFormId,
    },
    answers,
    allocation: resultAllocation,
    submitter,
  }
}

function mapDbApplicationToListingDto(
  application: InferSelectModel<typeof applications>,
  resultAllocation: number | null,
): ListingApplication {
  return {
    id: application.id,
    state: application.state,
    projectName: application.projectName,
    dripsAccountId: application.dripsAccountId,
    dripsProjectDataSnapshot: application.dripsProjectDataSnapshot,
    allocation: resultAllocation,
  }
}

export async function createApplication(
  roundId: string,
  submitterUserId: string,
  submitterWalletAddress: string,
  applicationDto: CreateApplicationDto,
): Promise<Application> {
  // Validate round in 'intake' state
  const round = await db.query.rounds.findFirst({
    where: eq(rounds.id, roundId),
    with: {
      chain: true,
    },
  });
  if (!round) {
    throw new NotFoundError("Round not found");
  }
  if (inferRoundState(round) !== 'intake') {
    throw new BadRequestError("Round is not currently accepting applications");
  }

  // Validate category and answers
  const applicationCategory = await db.query.applicationCategories.findFirst({
    where: and(
      eq(rounds.id, roundId),
      eq(applicationCategories.id, applicationDto.categoryId),
      isNull(applicationCategories.deletedAt)
    ),
    with: {
      form: {
        with: {
          fields: {
            where: isNull(applicationFormFields.deletedAt)
          }
        }
      },
    }
  });
  if (!applicationCategory) {
    throw new BadRequestError("Invalid application category");
  }

  validateAnswers(applicationDto.answers, applicationCategory.form.fields);

  // Validate provided Drips project ID is valid and owned by the submitter
  const { gqlName: chainGqlName, attestationSetup } = round.chain;

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

  // Validate the EAS attestation if required
  if (attestationSetup) {
    await validateEasAttestation(
      applicationDto,
      applicationCategory.form.fields,
      submitterWalletAddress,
      attestationSetup.easAddress,
      new JsonRpcProvider(round.chain.rpcUrl),
    )
  }

  // Create answers and application
  const result = await db.transaction(async (tx) => {
    const newApplication = (await tx.insert(applications).values({
      projectName: applicationDto.projectName,
      dripsProjectDataSnapshot: onChainProject,
      easAttestationUID: applicationDto.attestationUID,
      dripsAccountId: applicationDto.dripsAccountId,
      submitterUserId,
      roundId,
      formId: applicationCategory.applicationFormId,
      categoryId: applicationCategory.id,
    }).returning())[0];

    const newAnswers = await recordAnswers(
      applicationDto.answers,
      newApplication,
    );

    return mapDbApplicationToDto(
      newApplication,
      applicationCategory,
      { id: submitterUserId, walletAddress: submitterWalletAddress },
      newAnswers,
      null,
    )
  });

  return result;
}

/**
 * Gets a single application with the privileges of `requestingUserId`.
 * Private fields are only included if the requesting user is the submitter or a round admin.
 */
export async function getApplication(
  applicationId: string,
  roundId: string,
  requestingUserId: string | null,
): Promise<Application | null> {
  const application = await db.query.applications.findFirst({
    where: eq(applications.id, applicationId),
    with: {
      category: true,
      round: {
        columns: {
          id: true,
          resultsPublished: true,
        },
        with: {
          admins: {
            columns: {
              userId: true,
            }
          },
          results: true,
        }
      },
      submitter: {
        columns: {
          id: true,
          walletAddress: true,
        }
      }
    }
  });

  if (!application) {
    return null;
  }
  if (application.roundId !== roundId) {
    throw new NotFoundError("Application does not belong to the specified round");
  }

  const userIsAdmin = isUserRoundAdmin(application.round, requestingUserId);
  const userIsSubmitter = application.submitter.id === requestingUserId;

  // If the application is not in a public state, only admins and the submitter can view it
  if (application.state !== "approved" && !userIsAdmin && !userIsSubmitter) {
    throw new UnauthorizedError("Not authorized to view this application");
  }

  // Drop private fields if user is not admin or submitter
  const answers = await getAnswersByApplicationId(applicationId, !(userIsSubmitter || userIsAdmin));

  // Return calculated result if exists & published or exists & user is admin
  const resultAllocation = application.round.resultsPublished || userIsAdmin
    ? application.round.results.find((r) => r.applicationId === application.id)?.result ?? null
    : null;

  return mapDbApplicationToDto(
    application,
    application.category,
    application.submitter,
    answers,
    resultAllocation,
  );
}

/** Return minimal listing applications */
export async function getApplications(
  roundId: string,
  requestingUserId: string | null,
  filterConfig: { state?: ApplicationState; submitterUserId?: string } | null =
    null,
  sortConfig:
    | SortConfig<"random" | "name" | "createdAt" | "allocation">
    | null = null,
  limit = 20,
  offset = 0,
): Promise<ListingApplication[]> {
  const round = await db.query.rounds.findFirst({
    where: eq(rounds.id, roundId),
    with: {
      admins: true,
    }
  });
  if (!round) {
    throw new NotFoundError("Round not found");
  }

  // We return result allocations only to admins or if results are published
  const returnResults = isUserRoundAdmin(round, requestingUserId) || round.resultsPublished;

  // Admins can see all applications. Non-admins can only see approved applications, or their own
  const returnOnlyAcceptedOrOwn = !isUserRoundAdmin(round, requestingUserId);

  let applicationsResult = (await db
    .select()
    .from(applications)
    .leftJoin(results, eq(applications.id, results.applicationId))
    .innerJoin(users, eq(applications.submitterUserId, users.id))
    .where(
      and(
        returnOnlyAcceptedOrOwn
          ? or(
            eq(applications.state, "approved"),
            requestingUserId ? eq(applications.submitterUserId, requestingUserId) : undefined,
          )
          : undefined,
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
          return returnResults ? [direction(results.result)] : [];
      }
    })())
    .limit(limit)
    .offset(offset))

  // apply random sort if requested
  if (sortConfig?.field === "random") {
    applicationsResult = applicationsResult.sort(() => Math.random() - 0.5);
  }

  return applicationsResult.map((application) => mapDbApplicationToListingDto(
    application.applications,
    application.results?.result ?? null,
  ));
}

export async function getApplicationsCsv(
  roundId: string,
  requestingUserId: string | null,
) {
  const round = await db.query.rounds.findFirst({
    where: eq(rounds.id, roundId),
    with: {
      admins: true,
    }
  });
  if (!round) {
    throw new NotFoundError("Round not found");
  }

  // TODO: Get all applications, with:
  // - submitter wallet address
  // - 

  // const returnPrivateFields = isUserRoundAdmin(round, requestingUserId);
  // const returnResults = returnPrivateFields || round.resultsPublished;

  // const applications = await db
  //   .select()


  // const applicationFieldSlugs = Object.keys(applications[0]?.fields ?? {});
  // const applicationFieldHeaders = applicationFieldSlugs.map(escapeCsvValue)
  //   .join(",");

  // const header =
  //   `ID,Project Name,GitHub URL,Drips Account ID,Submitter Wallet Address,${applicationFieldHeaders},Created At,Vote result`;

  // const rows = applications.map((application) => {
  //   const fields: string[] = applicationFieldSlugs.map((slug) => {
  //     const value = application.fields[slug];
  //     return escapeCsvValue(value);
  //   });

  //   return [
  //     escapeCsvValue(application.id),
  //     escapeCsvValue(application.projectName),
  //     escapeCsvValue(application.dripsProjectDataSnapshot.gitHubUrl ?? "Unknown"),
  //     escapeCsvValue(application.dripsAccountId),
  //     escapeCsvValue(application.submitter.walletAddress),
  //     ...fields,
  //     escapeCsvValue(application.createdAt.toISOString()),
  //     escapeCsvValue(application.result !== null ? application.result.toString() : "Results not yet calculated"),
  //   ].join(',');
  // });

  return ["Hi,there"].join("\n");
}

export async function setApplicationsState(
  tx: Transaction,
  applicationIds: string[],
  newState: ApplicationState,
): Promise<ListingApplication[]> {
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

  return updatedApplications.map((app) => mapDbApplicationToListingDto(
    app,
    null,
  ));
}

export async function applyApplicationReview(
  roundId: string,
  requestingUserId: string,
  review: ApplicationReviewDto,
): Promise<ListingApplication[]> {
  const round = await db.query.rounds.findFirst({
    where: eq(rounds.id, roundId),
    with: {
      admins: {
        columns: {
          userId: true,
        }
      }
    }
  });
  if (!round) {
    throw new NotFoundError("Round not found");
  }
  if (!isUserRoundAdmin(round, requestingUserId)) {
    throw new UnauthorizedError("Not authorized to review applications for this round");
  }

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
