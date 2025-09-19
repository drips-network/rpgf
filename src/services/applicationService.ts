import { and, asc, desc, eq, InferSelectModel, isNull, or } from "drizzle-orm";
import { db, Transaction } from "../db/postgres.ts";
import { applicationCategories, applicationFormFields, applications, applicationVersions, results, rounds, users } from "../db/schema.ts";
import { log, LogLevel } from "./loggingService.ts";
import { BadRequestError, NotFoundError } from "../errors/generic.ts";
import {
  Application,
  ApplicationReviewDto,
  ApplicationState,
  ApplicationVersion,
  CreateApplicationDto,
  createApplicationDtoSchema,
  ListingApplication,
  UpdateApplicationDto,
  updateApplicationDtoSchema,
} from "../types/application.ts";
import { getProject } from "../gql/projects.ts";
import { JsonRpcProvider, type Provider } from "ethers";
import { Attestation, EAS, SchemaEncoder } from "@ethereum-attestation-service/eas-sdk";
import * as ipfs from "../ipfs/ipfs.ts";
import z from "zod";
import { SortConfig } from "../utils/sort.ts";
import { inferRoundState, isUserRoundAdmin } from "./roundService.ts";
import { mapDbAnswersToDto, recordAnswers, validateAnswers } from "./applicationAnswerService.ts";
import { ApplicationAnswer } from "../types/applicationAnswer.ts";
import { UnauthorizedError } from "../errors/auth.ts";
import { stringify } from "jsr:@std/csv";
import { createLog } from "./auditLogService.ts";
import { AuditLogAction, AuditLogActorType } from "../types/auditLog.ts";

async function validateEasAttestation(
  applicationDto: CreateApplicationDto | UpdateApplicationDto,
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

  const retryTimeout = 30000; // 30 seconds
  const retryInterval = 2000; // 2 seconds
  const startTime = Date.now();
  let attestation: Attestation | null = null;

  while (Date.now() - startTime < retryTimeout) {
    try {
      const foundAttestation = await eas.getAttestation(uid);
      if (foundAttestation) {
        attestation = foundAttestation;
        break;
      }
    } catch (error) {
      console.warn(`Attempt to fetch attestation failed: ${error}. Retrying...`);
    }

    await new Promise((resolve) => setTimeout(resolve, retryInterval));
  }

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

  const attestedApplicationDtoParse = createApplicationDtoSchema.or(updateApplicationDtoSchema).safeParse(JSON.parse(ipfsData));
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
      // field not found in the form, possibly deleted while the application was being filled
      continue;
    }

    // the field must be present in the attested fields IF IT IS NOT PRIVATE.
    // if it's present, it must match the value in the submitted application

    if (field.private) {
      if (attestedAnswers.find((a) => a.fieldId === fieldId)) {
        throw new BadRequestError(`EAS attestation must not contain private field ${fieldId}. The round organizers may have edited the application form. Please reload the page and try again.`);
      }
      continue;
    }

    if (!attestedAnswers.find((a) => a.fieldId === fieldId)) {
      throw new BadRequestError(`EAS attestation is missing field ${fieldId}. The round organizers may have edited the application form. Please reload the page and try again.`);
    }

    const attestedValue = attestedAnswers.find((a) => a.fieldId === fieldId);

    if (typeof attestedValue?.value !== typeof value) {
      throw new BadRequestError(
        `EAS attestation field ${fieldId} type does not match the submitted application. The round organizers may have edited the application form. Please reload the page and try again.`,
      );
    }

    if (JSON.stringify(attestedValue?.value) !== JSON.stringify(value)) {
      throw new BadRequestError(
        `EAS attestation field ${fieldId} value does not match the submitted application.`,
      );
    }
  }
}

function mapDbApplicationToDto(
  application: InferSelectModel<typeof applications> & {
    versions: (InferSelectModel<typeof applicationVersions> & {
      answers: ApplicationAnswer[];
      form: { id: string; name: string; };
      category: InferSelectModel<typeof applicationCategories>;
    })[];
  },
  submitter: { id: string; walletAddress: string },
  resultAllocation: number | null,
): Application {
  const latestVersion = application.versions[0];

  return {
    id: application.id,
    state: application.state,
    createdAt: application.createdAt,
    updatedAt: application.updatedAt,
    roundId: application.roundId,
    allocation: resultAllocation,
    submitter,
    projectName: latestVersion.projectName,
    dripsProjectDataSnapshot: latestVersion.dripsProjectDataSnapshot,
    latestVersion: {
      id: latestVersion.id,
      projectName: latestVersion.projectName,
      dripsAccountId: latestVersion.dripsAccountId,
      easAttestationUID: latestVersion.easAttestationUID ?? null,
      dripsProjectDataSnapshot: latestVersion.dripsProjectDataSnapshot,
      createdAt: latestVersion.createdAt,
      formId: latestVersion.formId,
      category: {
        id: latestVersion.category.id,
        name: latestVersion.category.name,
        description: latestVersion.category.description,
        applicationForm: latestVersion.form,
      },
      answers: latestVersion.answers,
    },
  }
}

function mapDbApplicationToListingDto(
  application: InferSelectModel<typeof applications>,
  resultAllocation: number | null,
): ListingApplication {
  if (!application.dripsProjectDataSnapshot) {
    throw new Error("dripsProjectDataSnapshot is null");
  }
  return {
    id: application.id,
    state: application.state,
    projectName: application.projectName,
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
  log(LogLevel.Info, "Creating application", {
    roundId,
    submitterUserId,
  });
  // Validate round in 'intake' state
  const round = await db.query.rounds.findFirst({
    where: eq(rounds.id, roundId),
    with: {
      chain: true,
    },
  });
  if (!round) {
    log(LogLevel.Error, "Round not found", { roundId });
    throw new NotFoundError("Round not found");
  }
  if (inferRoundState(round) !== 'intake') {
    log(LogLevel.Error, "Round is not currently accepting applications", {
      roundId,
    });
    throw new BadRequestError("Round is not currently accepting applications");
  }

  // Validate category and answers
  const applicationCategory = await db.query.applicationCategories.findFirst({
    where: and(
      eq(applicationCategories.roundId, round.id),
      eq(applicationCategories.id, applicationDto.categoryId),
      isNull(applicationCategories.deletedAt)
    ),
    with: {
      form: {
        with: {
          fields: {
            where: isNull(applicationFormFields.deletedAt)
          },
        }
      },
    }
  });

  if (!applicationCategory) {
    log(LogLevel.Error, "Invalid application category", {
      categoryId: applicationDto.categoryId,
    });
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
    log(LogLevel.Error, "Drips Account ID is not for a valid, claimed project", {
      dripsAccountId: applicationDto.dripsAccountId,
    });
    throw new BadRequestError(
      "Drips Account ID is not for a valid, claimed project",
    );
  }
  if (
    onChainProject.owner.address.toLowerCase() !==
    submitterWalletAddress.toLowerCase()
  ) {
    log(
      LogLevel.Error,
      "Drips Account ID is pointing at a project not currently owned by the submitter",
      { dripsAccountId: applicationDto.dripsAccountId, submitterWalletAddress },
    );
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
  const newApplication = await db.transaction(async (tx) => {
    const newApplication = (await tx.insert(applications).values({
      submitterUserId,
      roundId,
      projectName: applicationDto.projectName,
      dripsProjectDataSnapshot: onChainProject,
      categoryId: applicationDto.categoryId,
    }).returning())[0];

    const newVersion = (await tx.insert(applicationVersions).values({
      applicationId: newApplication.id,
      projectName: applicationDto.projectName,
      dripsProjectDataSnapshot: onChainProject,
      easAttestationUID: applicationDto.attestationUID,
      dripsAccountId: applicationDto.dripsAccountId,
      formId: applicationCategory.applicationFormId,
      categoryId: applicationCategory.id,
    }).returning())[0];

    const newAnswers = await recordAnswers(
      applicationDto.answers,
      newVersion.id,
      tx,
    );

    await createLog({
      type: AuditLogAction.ApplicationSubmitted,
      roundId: round.id,
      actor: {
        type: AuditLogActorType.User,
        userId: submitterUserId,
      },
      payload: {
        ...applicationDto,
        id: newApplication.id,
      },
      tx,
    });

    return {
      ...newApplication,
      versions: [{
        ...newVersion,
        answers: newAnswers,
        form: applicationCategory.form,
        category: applicationCategory,
      }],
    };
  });

  return mapDbApplicationToDto(
    newApplication,
    { id: submitterUserId, walletAddress: submitterWalletAddress },
    null,
  );
}

/**
 * Gets a single application with the privileges of `requestingUserId`.
 * Private fields are only included if the requesting user is the submitter or a round admin.
 */
export async function updateApplication(
  applicationId: string,
  roundId: string,
  submitterUserId: string,
  submitterWalletAddress: string,
  applicationDto: UpdateApplicationDto,
): Promise<Application> {
  log(LogLevel.Info, "Updating application", {
    applicationId,
    roundId,
    submitterUserId,
  });
  const application = await db.query.applications.findFirst({
    where: and(
      eq(applications.id, applicationId),
      eq(applications.roundId, roundId),
    ),
    with: {
      versions: {
        orderBy: desc(applicationVersions.createdAt),
      },
      round: true,
    },
  });

  if (!application) {
    log(LogLevel.Error, "Application not found", { applicationId });
    throw new NotFoundError("Application not found");
  }
  if (application.submitterUserId !== submitterUserId) {
    log(LogLevel.Error, "Not authorized to update this application", {
      applicationId,
      submitterUserId,
    });
    throw new UnauthorizedError("Not authorized to update this application");
  }
  if (inferRoundState(application.round) !== 'intake') {
    log(LogLevel.Error, "Round is not currently accepting applications", {
      roundId,
    });
    throw new BadRequestError("Round is not currently accepting applications");
  }

  const round = await db.query.rounds.findFirst({
    where: eq(rounds.id, roundId),
    with: {
      chain: true,
    },
  });
  if (!round) {
    log(LogLevel.Error, "Round not found", { roundId });
    throw new NotFoundError("Round not found");
  }
  if (inferRoundState(round) !== 'intake') {
    log(LogLevel.Error, "Round is not currently accepting applications", {
      roundId,
    });
    throw new BadRequestError("Round is not currently accepting applications");
  }

  const applicationCategory = await db.query.applicationCategories.findFirst({
    where: and(
      eq(applicationCategories.roundId, round.id),
      eq(applicationCategories.id, applicationDto.categoryId),
      isNull(applicationCategories.deletedAt)
    ),
    with: {
      form: {
        with: {
          fields: {
            where: isNull(applicationFormFields.deletedAt)
          },
        }
      },
    }
  });

  if (!applicationCategory) {
    log(LogLevel.Error, "Invalid application category", {
      categoryId: applicationDto.categoryId,
    });
    throw new BadRequestError("Invalid application category");
  }

  validateAnswers(applicationDto.answers, applicationCategory.form.fields);

  const { gqlName: chainGqlName, attestationSetup } = round.chain;

  const onChainProject = await getProject(
    applicationDto.dripsAccountId,
    chainGqlName,
  );
  if (!onChainProject) {
    log(LogLevel.Error, "Drips Account ID is not for a valid, claimed project", {
      dripsAccountId: applicationDto.dripsAccountId,
    });
    throw new BadRequestError(
      "Drips Account ID is not for a valid, claimed project",
    );
  }
  if (
    onChainProject.owner.address.toLowerCase() !==
    submitterWalletAddress.toLowerCase()
  ) {
    log(
      LogLevel.Error,
      "Drips Account ID is pointing at a project not currently owned by the submitter",
      { dripsAccountId: applicationDto.dripsAccountId, submitterWalletAddress },
    );
    throw new BadRequestError(
      "Drips Account ID is pointing at a project not currently owned by the submitter",
    );
  }

  if (attestationSetup) {
    await validateEasAttestation(
      applicationDto,
      applicationCategory.form.fields,
      submitterWalletAddress,
      attestationSetup.easAddress,
      new JsonRpcProvider(round.chain.rpcUrl),
    )
  }

  const updatedApplication = await db.transaction(async (tx) => {
    const newVersion = (await tx.insert(applicationVersions).values({
      applicationId: application.id,
      projectName: applicationDto.projectName,
      dripsProjectDataSnapshot: onChainProject,
      easAttestationUID: applicationDto.attestationUID,
      dripsAccountId: applicationDto.dripsAccountId,
      formId: applicationCategory.applicationFormId,
      categoryId: applicationCategory.id,
    }).returning())[0];

    // set the application state back to pending and update the fields
    // duplicated for listing
    await tx.update(applications).set({
      state: "pending",
      projectName: applicationDto.projectName,
      dripsProjectDataSnapshot: onChainProject,
      categoryId: applicationDto.categoryId,
    }).where(
      eq(applications.id, application.id),
    );

    await recordAnswers(
      applicationDto.answers,
      newVersion.id,
      tx,
    );

    await createLog({
      type: AuditLogAction.ApplicationUpdated,
      roundId: round.id,
      actor: {
        type: AuditLogActorType.User,
        userId: submitterUserId,
      },
      payload: {
        ...applicationDto,
        id: application.id,
      },
      tx,
    });

    const fullApplication = (await db.query.applications.findFirst({
      where: eq(applications.id, applicationId),
      with: {
        versions: {
          orderBy: desc(applicationVersions.createdAt),
          with: {
            answers: {
              with: {
                field: true,
              }
            },
            form: true,
            category: true,
          }
        },
      }
    }))!;

    return {
      ...fullApplication,
      versions: fullApplication.versions.map((v) => ({
        ...v,
        answers: mapDbAnswersToDto(v.answers, false),
      })),
    };
  });

  return mapDbApplicationToDto(
    updatedApplication,
    { id: submitterUserId, walletAddress: submitterWalletAddress },
    null,
  );
}

export async function getApplicationHistory(
  applicationId: string,
  roundId: string,
  requestingUserId: string | null,
): Promise<ApplicationVersion[]> {
  log(LogLevel.Info, "Getting application history", {
    applicationId,
    roundId,
    requestingUserId,
  });
  const application = await db.query.applications.findFirst({
    where: eq(applications.id, applicationId),
    with: {
      round: {
        with: {
          admins: true,
        },
      },
      submitter: true,
      versions: {
        orderBy: desc(applicationVersions.createdAt),
        with: {
          answers: {
            with: {
              field: true,
            }
          },
          form: true,
          category: true,
        }
      }
    }
  });

  if (!application) {
    log(LogLevel.Error, "Application not found", { applicationId });
    throw new NotFoundError("Application not found");
  }
  if (application.roundId !== roundId) {
    log(LogLevel.Error, "Application does not belong to the specified round", {
      applicationId,
      roundId,
    });
    throw new NotFoundError("Application does not belong to the specified round");
  }

  const userIsAdmin = isUserRoundAdmin(application.round, requestingUserId);
  const userIsSubmitter = application.submitter.id === requestingUserId;

  if (!userIsAdmin && !userIsSubmitter && application.state !== "approved") {
    log(LogLevel.Error, "Not authorized to view this application", {
      applicationId,
      requestingUserId,
    });
    throw new UnauthorizedError("Not authorized to view this application");
  }

  return application.versions.map((v) => ({
    id: v.id,
    projectName: v.projectName,
    dripsAccountId: v.dripsAccountId,
    easAttestationUID: v.easAttestationUID ?? null,
    dripsProjectDataSnapshot: v.dripsProjectDataSnapshot,
    createdAt: v.createdAt,
    formId: v.formId,
    category: {
      id: v.category.id,
      name: v.category.name,
      description: v.category.description,
      applicationForm: v.form,
    },
    answers: mapDbAnswersToDto(v.answers, !userIsAdmin && !userIsSubmitter),
  }));
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
  log(LogLevel.Info, "Getting application", {
    applicationId,
    roundId,
    requestingUserId,
  });
  const application = await db.query.applications.findFirst({
    where: eq(applications.id, applicationId),
    with: {
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
      },
      versions: {
        orderBy: desc(applicationVersions.createdAt),
        with: {
          answers: {
            with: {
              field: true,
            }
          },
          form: true,
          category: true,
        }
      }
    }
  });

  if (!application) {
    return null;
  }
  if (application.roundId !== roundId) {
    log(LogLevel.Error, "Application does not belong to the specified round", {
      applicationId,
      roundId,
    });
    throw new NotFoundError("Application does not belong to the specified round");
  }

  const userIsAdmin = isUserRoundAdmin(application.round, requestingUserId);
  const userIsSubmitter = application.submitter.id === requestingUserId;

  // If the application is not in a public state, only admins and the submitter can view it
  if (application.state !== "approved" && !userIsAdmin && !userIsSubmitter) {
    log(LogLevel.Error, "Not authorized to view this application", {
      applicationId,
      requestingUserId,
    });
    throw new UnauthorizedError("Not authorized to view this application");
  }

  // Drop private fields if user is not admin or submitter
  const applicationWithFilteredAnswers = {
    ...application,
    versions: application.versions.map((v) => ({
      ...v,
      answers: mapDbAnswersToDto(v.answers, !userIsAdmin && !userIsSubmitter),
    })),
  };

  // Return calculated result if exists & published or exists & user is admin
  const resultAllocation = application.round.resultsPublished || userIsAdmin
    ? application.round.results.find((r) => r.applicationId === application.id)?.result ?? null
    : null;

  return mapDbApplicationToDto(
    applicationWithFilteredAnswers,
    application.submitter,
    resultAllocation,
  );
}

/** Return minimal listing applications */
export async function getApplications(
  roundId: string,
  requestingUserId: string | null,
  filterConfig: { state?: ApplicationState; submitterUserId?: string, categoryId?: string } | null =
    null,
  sortConfig:
    | SortConfig<"random" | "name" | "createdAt" | "allocation">
    | null = null,
  limit = 20,
  offset = 0,
): Promise<ListingApplication[]> {
  log(LogLevel.Info, "Getting applications", {
    roundId,
    requestingUserId,
    filterConfig,
    sortConfig,
    limit,
    offset,
  });
  const round = await db.query.rounds.findFirst({
    where: eq(rounds.id, roundId),
    with: {
      admins: true,
    }
  });
  if (!round) {
    log(LogLevel.Error, "Round not found", { roundId });
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
    .innerJoin(applicationCategories, eq(applications.categoryId, applicationCategories.id))
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
        filterConfig?.categoryId
          ? eq(applications.categoryId, filterConfig.categoryId)
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
    returnResults && application.results?.result ? application.results.result : null,
  ));
}

export async function getApplicationsCsv(
  roundId: string,
  requestingUserId: string | null,
) {
  log(LogLevel.Info, "Getting applications CSV", {
    roundId,
    requestingUserId,
  });
  const round = await db.query.rounds.findFirst({
    where: eq(rounds.id, roundId),
    with: {
      admins: true,
    }
  });
  if (!round) {
    log(LogLevel.Error, "Round not found", { roundId });
    throw new NotFoundError("Round not found");
  }

  const isAdmin = isUserRoundAdmin(round, requestingUserId);
  const includeRejectedAndPrivateData = isAdmin;
  const includeKycData = isAdmin;
  const includeVoteResult = includeRejectedAndPrivateData || round.resultsPublished;

  const data = await db.query.applications.findMany({
    where: and(
      eq(applications.roundId, roundId),
      includeRejectedAndPrivateData ? undefined : eq(applications.state, "approved"),
    ),
    with: {
      versions: {
        orderBy: desc(applicationVersions.createdAt),
        limit: 1,
        with: {
          answers: {
            with: {
              field: true,
            }
          },
          category: {
            columns: {
              id: true,
              name: true,
            },
          },
          form: {
            columns: {
              id: true,
              name: true,
            }
          },
        }
      },
      result: true,
      kycRequestMapping: {
        with: {
          kycRequest: true,
        }
      }
    }
  });

  const uniqueAnswerSlugs = Array.from(new Set(data.flatMap((app) =>
    app.versions[0].answers
      // Extremely important: this drops private fields unless the user is an admin
      .filter((a) => includeRejectedAndPrivateData ? true : !a.field.private)
      .map((a) => a.field.slug ?? null)
      .filter((s): s is string => s !== null)
  )));

  const kycSlugs = includeKycData ? [
    "KYC Status",
    "KYC Email address",
    "KYC Updated At",
    "KYC Provider",
  ] : [];

  const csvData = [
    ["ID", "State", "Project Name", "GitHub URL", "Drips Account ID", "Submitter Wallet Address", "Category ID", "Category Name", "Form ID", "Form Name", ...kycSlugs, ...uniqueAnswerSlugs, "Created At", "Allocation"],
    ...data.map((app) => [
      app.id,
      app.state,
      app.versions[0].projectName,
      app.versions[0].dripsProjectDataSnapshot.gitHubUrl,
      app.versions[0].dripsAccountId,
      app.submitterUserId,
      app.versions[0].category.id,
      app.versions[0].category.name,
      app.versions[0].form.id,
      app.versions[0].form.name,
      ...(includeKycData ? [
        app.kycRequestMapping?.kycRequest.status ?? "N/A",
        app.kycRequestMapping?.kycRequest.kycEmail ?? "N/A",
        app.kycRequestMapping?.kycRequest.updatedAt.toISOString() ?? "N/A",
        app.kycRequestMapping?.kycRequest.kycProvider ?? "N/A",
      ] : []),
      ...uniqueAnswerSlugs.map((slug) => {
        const answer = app.versions[0].answers.find((a) => a.field.slug === slug);
        return answer ? (typeof answer.answer === "string" ? answer.answer : JSON.stringify(answer.answer)) : "";
      }),
      app.createdAt.toISOString(),
      includeVoteResult ? (app.result !== null ? app.result.result.toString() : "Not yet calculated") : "N/A",
    ])
  ];

  return stringify(csvData);
}

export async function setApplicationsState(
  tx: Transaction,
  applicationIds: string[],
  newState: ApplicationState,
): Promise<ListingApplication[]> {
  log(LogLevel.Info, "Setting applications state", {
    applicationIds,
    newState,
  });
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
    log(LogLevel.Error, "Some applications were not in pending state", {
      applicationIds,
    });
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
  log(LogLevel.Info, "Applying application review", {
    roundId,
    requestingUserId,
  });
  const round = await db.query.rounds.findFirst({
    where: eq(rounds.id, roundId),
    with: {
      admins: true,
    }
  });
  if (!round) {
    log(LogLevel.Error, "Round not found", { roundId });
    throw new NotFoundError("Round not found");
  }
  if (!isUserRoundAdmin(round, requestingUserId)) {
    log(
      LogLevel.Error,
      "Not authorized to review applications for this round",
      { roundId, requestingUserId },
    );
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

    await createLog({
      type: AuditLogAction.ApplicationsReviewed,
      roundId: round.id,
      actor: {
        type: AuditLogActorType.User,
        userId: requestingUserId,
      },
      payload: review,
      tx,
    });

    return [...approvedApplications, ...rejectedApplications];
  });

  return result;
}
