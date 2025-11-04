import { and, asc, desc, eq, InferSelectModel, isNull, or } from "drizzle-orm";
import { db, Transaction } from "../db/postgres.ts";
import {
  applicationCategories,
  applicationFormFields,
  applicationKycRequests,
  applications,
  applicationVersions,
  customDatasetFields,
  customDatasets,
  customDatasetValues,
  kycRequests,
  results,
  rounds,
  users,
} from "../db/schema.ts";
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
import projects from "../gql/projects.ts";
import { Interface, type Provider } from "ethers";
import {
  Attestation,
  EAS,
  SchemaEncoder,
} from "@ethereum-attestation-service/eas-sdk";
import * as ipfs from "../ipfs/ipfs.ts";
import z from "zod";
import { SortConfig } from "../utils/sort.ts";
import { inferRoundState, isUserRoundAdmin, isUserRoundSuperAdmin } from "./roundService.ts";
import {
  mapDbAnswersToDto,
  recordAnswers,
  validateAnswers,
} from "./applicationAnswerService.ts";
import { ApplicationAnswer } from "../types/applicationAnswer.ts";
import { UnauthorizedError } from "../errors/auth.ts";
import { stringify } from "std/csv";
import { createLog } from "./auditLogService.ts";
import { AuditLogAction, AuditLogActorType } from "../types/auditLog.ts";
import { KycProvider } from "../types/kyc.ts";
import { cachingService } from "./cachingService.ts";
import { getProviderForChain } from "$app/ethereum/providerRegistry.ts";
import { createOrGetUser } from "./userService.ts";

export async function validateEasAttestation(
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
      log(
        LogLevel.Error,
        `Attempt to fetch attestation failed: ${error}. Retrying...`,
      );
    }

    await new Promise((resolve) => setTimeout(resolve, retryInterval));
  }

  if (!attestation) {
    log(LogLevel.Error, "EAS attestation not found", { uid });
    throw new BadRequestError("EAS attestation not found");
  }

  if (
    attestation.attester.toLowerCase() !== submitterWalletAddress.toLowerCase()
  ) {
    log(LogLevel.Error, "EAS attestation attester does not match submitter", {
      uid,
      attester: attestation.attester,
      submitterWalletAddress,
    });

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
    log(
      LogLevel.Error,
      "EAS attestation missing or invalid applicationDataIpfs",
      {
        uid,
        decodedData: decoded,
      },
    );

    throw new BadRequestError(
      "EAS attestation does not contain applicationDataIpfs, or is invalid",
    );
  }

  const ipfsData = await ipfs.getIpfsFile(ipfsHashParse.data);

  const attestedApplicationDtoParse = createApplicationDtoSchema.or(
    updateApplicationDtoSchema,
  ).safeParse(JSON.parse(ipfsData));
  if (!attestedApplicationDtoParse.success) {
    log(LogLevel.Error, "EAS attestation data is not a valid application DTO", {
      uid,
      ipfsData,
      validationErrors: attestedApplicationDtoParse.error.issues,
    });

    throw new BadRequestError(
      "EAS attestation data is not a valid application DTO for this round",
    );
  }

  const attestedApplicationDto = attestedApplicationDtoParse.data;

  if (attestedApplicationDto.projectName !== projectName) {
    log(
      LogLevel.Error,
      "EAS attestation project name does not match submitted application",
      {
        uid,
        attestedProjectName: attestedApplicationDto.projectName,
        submittedProjectName: projectName,
      },
    );

    throw new BadRequestError(
      "EAS attestation project name does not match the submitted application",
    );
  }

  if (attestedApplicationDto.dripsAccountId !== dripsAccountId) {
    log(
      LogLevel.Error,
      "EAS attestation drips account ID does not match submitted application",
      {
        uid,
        attestedDripsAccountId: attestedApplicationDto.dripsAccountId,
        submittedDripsAccountId: dripsAccountId,
      },
    );

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
        log(LogLevel.Error, "EAS attestation contains private field", {
          uid,
          fieldId,
        });
        throw new BadRequestError(
          `EAS attestation must not contain private field ${fieldId}. The round organizers may have edited the application form. Please reload the page and try again.`,
        );
      }
      continue;
    }

    if (!attestedAnswers.find((a) => a.fieldId === fieldId)) {
      log(LogLevel.Error, "EAS attestation is missing non-private field", {
        uid,
        fieldId,
      });
      throw new BadRequestError(
        `EAS attestation is missing field ${fieldId}. The round organizers may have edited the application form. Please reload the page and try again.`,
      );
    }

    const attestedValue = attestedAnswers.find((a) => a.fieldId === fieldId);

    if (typeof attestedValue?.value !== typeof value) {
      log(
        LogLevel.Error,
        "EAS attestation field type does not match submitted application",
        {
          uid,
          fieldId,
          attestedType: typeof attestedValue?.value,
          submittedType: typeof value,
        },
      );
      throw new BadRequestError(
        `EAS attestation field ${fieldId} type does not match the submitted application. The round organizers may have edited the application form. Please reload the page and try again.`,
      );
    }

    if (JSON.stringify(attestedValue?.value) !== JSON.stringify(value)) {
      log(
        LogLevel.Error,
        "EAS attestation field value does not match submitted application",
        {
          uid,
          fieldId,
          attestedValue: attestedValue?.value,
          submittedValue: value,
        },
      );
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
      form: { id: string; name: string };
      category: InferSelectModel<typeof applicationCategories>;
    })[];
    customDatasetValues?: (InferSelectModel<typeof customDatasetValues> & {
      dataset: InferSelectModel<typeof customDatasets>;
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
      deferredAttestationTxHash: latestVersion.deferredAttestationTxHash ?? null,
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
    customDatasetValues: application.customDatasetValues?.map((cdv) => ({
      datasetId: cdv.datasetId,
      datasetName: cdv.dataset.name,
      values: cdv.values,
    })) ?? [],
  };
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
  };
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
  const actingUserId = submitterUserId;
  const actingWalletAddress = submitterWalletAddress;
  const submitterOverride = applicationDto.submitterOverride ?? null;
  const submittingOnBehalf = submitterOverride !== null;

  const round = await db.query.rounds.findFirst({
    where: eq(rounds.id, roundId),
    with: {
      chain: true,
      kycConfiguration: true,
      admins: true,
    },
  });
  if (!round) {
    log(LogLevel.Error, "Round not found", { roundId });
    throw new NotFoundError("Round not found");
  }

  const actorIsSuperAdmin = isUserRoundSuperAdmin(round, actingUserId);
  if (submittingOnBehalf && !actorIsSuperAdmin) {
    log(LogLevel.Error, "User attempted to submit on behalf without super admin rights", {
      roundId,
      actingUserId,
      submitterOverride,
    });
    throw new UnauthorizedError("Only super admins can submit on behalf of another user.");
  }

  const effectiveWalletAddress = (submittingOnBehalf
    ? submitterOverride!
    : actingWalletAddress).toLowerCase();

  const roundState = inferRoundState(round);
  if (roundState !== "intake" && !actorIsSuperAdmin) {
    log(LogLevel.Error, "Round is not currently accepting applications", {
      roundId,
      roundState,
    });
    throw new BadRequestError("Round is not currently accepting applications");
  }

  // Validate category and answers
  const applicationCategory = await db.query.applicationCategories.findFirst({
    where: and(
      eq(applicationCategories.roundId, round.id),
      eq(applicationCategories.id, applicationDto.categoryId),
      isNull(applicationCategories.deletedAt),
    ),
    with: {
      form: {
        with: {
          fields: {
            where: isNull(applicationFormFields.deletedAt),
          },
        },
      },
    },
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

  const onChainProject = await projects.getProject(
    applicationDto.dripsAccountId,
    chainGqlName,
  );
  if (!onChainProject) {
    log(
      LogLevel.Error,
      "Drips Account ID is not for a valid, claimed project",
      {
        dripsAccountId: applicationDto.dripsAccountId,
      },
    );
    throw new BadRequestError(
      "Drips Account ID is not for a valid, claimed project",
    );
  }
  if (
    onChainProject.owner.address.toLowerCase() !==
      effectiveWalletAddress.toLowerCase()
  ) {
    log(
      LogLevel.Error,
      "Drips Account ID is pointing at a project not currently owned by the submitter",
      {
        dripsAccountId: applicationDto.dripsAccountId,
        submitterWalletAddress: effectiveWalletAddress,
      },
    );
    throw new BadRequestError(
      "Drips Account ID is pointing at a project not currently owned by the submitter",
    );
  }

  // Validate the EAS attestation if required
  const hasAttestationUid = Boolean(applicationDto.attestationUID);
  const hasDeferredTx = Boolean(applicationDto.deferredAttestationTxHash);

  if (attestationSetup) {
    if (!hasAttestationUid && !hasDeferredTx) {
      log(LogLevel.Error, "Missing attestation proof for attestation-enabled round", {
        roundId,
        submitterUserId,
      });
      throw new BadRequestError(
        "This round requires either an attestation UID or a deferred attestation transaction hash.",
      );
    }

    if (hasAttestationUid) {
      await validateEasAttestation(
        applicationDto,
        applicationCategory.form.fields,
        effectiveWalletAddress,
        attestationSetup.easAddress,
        await getProviderForChain(round.chain),
      );
    } else {
      log(LogLevel.Info, "Deferring attestation validation until transaction confirms", {
        roundId,
        submitterUserId,
        deferredAttestationTxHash: applicationDto.deferredAttestationTxHash,
      });
    }
  }

  // Create answers and application
  const { dbApplication, submitter: resolvedSubmitter } = await db.transaction(async (tx) => {
    let resolvedSubmitter: { id: string; walletAddress: string };
    if (submittingOnBehalf) {
      const user = await createOrGetUser(tx, effectiveWalletAddress);
      resolvedSubmitter = { id: user.id, walletAddress: user.walletAddress };
    } else {
      resolvedSubmitter = { id: actingUserId, walletAddress: effectiveWalletAddress };
    }

    const insertedApplication = (await tx.insert(applications).values({
      submitterUserId: resolvedSubmitter.id,
      roundId,
      projectName: applicationDto.projectName,
      dripsProjectDataSnapshot: onChainProject,
      categoryId: applicationDto.categoryId,
    }).returning())[0];

    const newVersion = (await tx.insert(applicationVersions).values({
      applicationId: insertedApplication.id,
      projectName: applicationDto.projectName,
      dripsProjectDataSnapshot: onChainProject,
      easAttestationUID: applicationDto.attestationUID,
      deferredAttestationTxHash: applicationDto.deferredAttestationTxHash,
      dripsAccountId: applicationDto.dripsAccountId,
      formId: applicationCategory.applicationFormId,
      categoryId: applicationCategory.id,
    }).returning())[0];

    const newAnswers = await recordAnswers(
      applicationDto.answers,
      newVersion.id,
      tx,
    );

    // **Handle Treova KYC**
    if (round.kycConfiguration?.kycProvider === KycProvider.Treova) {
      const existingKycRequest = await tx.query.kycRequests.findFirst({
        where: and(
          eq(kycRequests.userId, resolvedSubmitter.id),
          eq(kycRequests.roundId, round.id),
        ),
      });

      if (existingKycRequest) {
        await tx.insert(applicationKycRequests).values({
          applicationId: insertedApplication.id,
          kycRequestId: existingKycRequest.id,
        });

        await createLog({
          type: AuditLogAction.KycRequestLinkedToApplication,
          roundId: round.id,
          actor: { type: AuditLogActorType.System },
          payload: {
            kycRequestId: existingKycRequest.id,
            applicationId: insertedApplication.id,
          },
          tx,
        });

        log(LogLevel.Info, "Linked existing KYC Request to new application", {
          userId: resolvedSubmitter.id,
          roundId: round.id,
          applicationId: insertedApplication.id,
          kycRequestId: existingKycRequest.id,
        });
      } else {
        log(
          LogLevel.Info,
          "No existing KYC Request for user and round, not linking",
          {
            userId: resolvedSubmitter.id,
            roundId: round.id,
            applicationId: insertedApplication.id,
          },
        );
      }
    }

    await createLog({
      type: AuditLogAction.ApplicationSubmitted,
      roundId: round.id,
      actor: {
        type: AuditLogActorType.User,
        userId: actingUserId,
      },
      payload: {
        ...applicationDto,
        id: insertedApplication.id,
      },
      tx,
    });

    log(LogLevel.Info, "Created new application", {
      applicationId: insertedApplication.id,
      roundId,
      actorUserId: actingUserId,
      submitterUserId: resolvedSubmitter.id,
      submittingOnBehalf,
    });

    await cachingService.delByPattern(
      cachingService.generateKey(["applications", roundId, "*"]),
    );

    return {
      dbApplication: {
        ...insertedApplication,
        versions: [{
          ...newVersion,
          answers: newAnswers,
          form: applicationCategory.form,
          category: applicationCategory,
        }],
        customDatasetValues: [],
      },
      submitter: resolvedSubmitter,
    };
  });

  return mapDbApplicationToDto(
    dbApplication,
    resolvedSubmitter,
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
  if (inferRoundState(application.round) !== "intake") {
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
  if (inferRoundState(round) !== "intake") {
    log(LogLevel.Error, "Round is not currently accepting applications", {
      roundId,
    });
    throw new BadRequestError("Round is not currently accepting applications");
  }

  const applicationCategory = await db.query.applicationCategories.findFirst({
    where: and(
      eq(applicationCategories.roundId, round.id),
      eq(applicationCategories.id, applicationDto.categoryId),
      isNull(applicationCategories.deletedAt),
    ),
    with: {
      form: {
        with: {
          fields: {
            where: isNull(applicationFormFields.deletedAt),
          },
        },
      },
    },
  });

  if (!applicationCategory) {
    log(LogLevel.Error, "Invalid application category", {
      categoryId: applicationDto.categoryId,
    });
    throw new BadRequestError("Invalid application category");
  }

  validateAnswers(applicationDto.answers, applicationCategory.form.fields);

  const { gqlName: chainGqlName, attestationSetup } = round.chain;

  const onChainProject = await projects.getProject(
    applicationDto.dripsAccountId,
    chainGqlName,
  );
  if (!onChainProject) {
    log(
      LogLevel.Error,
      "Drips Account ID is not for a valid, claimed project",
      {
        dripsAccountId: applicationDto.dripsAccountId,
      },
    );
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

  const hasAttestationUid = Boolean(applicationDto.attestationUID);
  const hasDeferredTx = Boolean(applicationDto.deferredAttestationTxHash);

  if (attestationSetup) {
    if (!hasAttestationUid && !hasDeferredTx) {
      log(LogLevel.Error, "Missing attestation proof for attestation-enabled round on update", {
        roundId,
        applicationId,
        submitterUserId,
      });
      throw new BadRequestError(
        "This round requires either an attestation UID or a deferred attestation transaction hash.",
      );
    }

    if (hasAttestationUid) {
      await validateEasAttestation(
        applicationDto,
        applicationCategory.form.fields,
        submitterWalletAddress,
        attestationSetup.easAddress,
        await getProviderForChain(round.chain),
      );
    } else {
      log(LogLevel.Info, "Deferring attestation validation until transaction confirms", {
        applicationId,
        submitterUserId,
        deferredAttestationTxHash: applicationDto.deferredAttestationTxHash,
      });
    }
  }

  const updatedApplication = await db.transaction(async (tx) => {
    const newVersion = (await tx.insert(applicationVersions).values({
      applicationId: application.id,
      projectName: applicationDto.projectName,
      dripsProjectDataSnapshot: onChainProject,
      easAttestationUID: applicationDto.attestationUID,
      deferredAttestationTxHash: applicationDto.deferredAttestationTxHash,
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

    await cachingService.delByPattern(
      cachingService.generateKey(["applications", roundId, "*"]),
    );
    await cachingService.delByPattern(
      cachingService.generateKey(["application", applicationId, "*"]),
    );

    const fullApplication = (await tx.query.applications.findFirst({
      where: eq(applications.id, applicationId),
      with: {
        versions: {
          orderBy: desc(applicationVersions.createdAt),
          with: {
            answers: {
              with: {
                field: true,
              },
            },
            form: true,
            category: true,
          },
        },
      },
    }))!;

    return {
      ...fullApplication,
      versions: fullApplication.versions.map((v) => ({
        ...v,
        answers: mapDbAnswersToDto(v.answers, false),
      })),
      customDatasetValues: [],
    };
  });

  return mapDbApplicationToDto(
    updatedApplication,
    { id: submitterUserId, walletAddress: submitterWalletAddress },
    null,
  );
}

export async function addApplicationAttestationFromTransaction(
  applicationId: string,
  roundId: string,
  submitterUserId: string,
  submitterWalletAddress: string,
): Promise<Application> {
  log(LogLevel.Info, "Adding attestation UID from transaction", {
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
      round: {
        with: {
          chain: true,
        },
      },
      versions: {
        orderBy: desc(applicationVersions.createdAt),
      },
    },
  });

  if (!application) {
    log(LogLevel.Error, "Application not found when adding attestation", {
      applicationId,
      roundId,
    });
    throw new NotFoundError("Application not found");
  }

  if (application.submitterUserId !== submitterUserId) {
    log(LogLevel.Error, "User not authorized to add attestation", {
      applicationId,
      submitterUserId,
    });
    throw new UnauthorizedError("Not authorized to update this application");
  }

  if (!application.round) {
    log(LogLevel.Error, "Application round missing while adding attestation", {
      applicationId,
    });
    throw new NotFoundError("Round not found");
  }

  if (inferRoundState(application.round) !== "intake") {
    log(LogLevel.Error, "Round is not currently accepting applications", {
      roundId,
    });
    throw new BadRequestError("Round is not currently accepting applications");
  }

  const attestationSetup = application.round.chain?.attestationSetup;
  if (!attestationSetup) {
    log(LogLevel.Error, "Attestation setup missing for round when adding attestation", {
      roundId,
    });
    throw new BadRequestError("Round does not accept attestations");
  }

  const pendingVersion = application.versions.find((version) =>
    !version.easAttestationUID && Boolean(version.deferredAttestationTxHash)
  );

  if (!pendingVersion) {
    log(LogLevel.Error, "No deferred attestation found for application", {
      applicationId,
    });
    throw new BadRequestError(
      "No deferred attestation transaction found for this application",
    );
  }

  const transactionHash = pendingVersion.deferredAttestationTxHash;

  if (!transactionHash) {
    log(LogLevel.Error, "Deferred attestation transaction hash missing", {
      applicationId,
    });
    throw new BadRequestError(
      "Application does not have a deferred attestation transaction hash",
    );
  }

  log(LogLevel.Info, "Resolving deferred attestation", {
    applicationId,
    transactionHash,
  });

  const provider = await getProviderForChain(application.round.chain);

  const receiptTimeoutMs = 30000;
  const receiptPollIntervalMs = 2000;
  let receipt = await provider.getTransactionReceipt(transactionHash);
  const transactionStart = Date.now();

  while (!receipt && Date.now() - transactionStart < receiptTimeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, receiptPollIntervalMs));
    receipt = await provider.getTransactionReceipt(transactionHash);
  }

  if (!receipt) {
    log(LogLevel.Error, "Transaction receipt not found for attestation", {
      transactionHash,
    });
    throw new BadRequestError("Attestation transaction not found or not yet mined");
  }

  const attestedInterface = new Interface([
    "event Attested(address indexed recipient, address indexed attester, bytes32 indexed schema, bytes32 uid, bytes data)",
  ]);
  const expectedContractAddress = attestationSetup.easAddress.toLowerCase();

  let parsedLog: ReturnType<typeof attestedInterface.parseLog> | null = null;
  for (const logEntry of receipt.logs) {
    if (logEntry.address.toLowerCase() !== expectedContractAddress) {
      continue;
    }

    try {
      const candidateLog = attestedInterface.parseLog(logEntry);
      if (!candidateLog) {
        continue;
      }
      const candidateSchemaUid = (candidateLog.args.schema as string).toLowerCase();

      if (candidateSchemaUid !== attestationSetup.applicationAttestationSchemaUID.toLowerCase()) {
        continue;
      }

      parsedLog = candidateLog;
      break;
    } catch {
      continue;
    }
  }

  if (!parsedLog) {
    log(LogLevel.Error, "No attestation log found in transaction", {
      transactionHash,
      expectedSchemaUid: attestationSetup.applicationAttestationSchemaUID,
    });
    throw new BadRequestError("Transaction does not contain the expected attestation event");
  }

  const attestationUid = parsedLog.args.uid as string;
  const attesterAddress = (parsedLog.args.attester as string).toLowerCase();

  if (!attestationUid) {
    log(LogLevel.Error, "Attestation UID missing in parsed log", {
      transactionHash,
    });
    throw new BadRequestError("Attestation UID could not be determined from transaction");
  }

  if (attesterAddress !== submitterWalletAddress.toLowerCase()) {
    log(LogLevel.Error, "Attestation attester does not match submitter", {
      transactionHash,
      attesterAddress,
      submitterWalletAddress,
    });
    throw new BadRequestError("Attestation was not created by the submitting wallet");
  }

  const versionAnswers = await db.query.applicationAnswers.findMany({
    where: (answers, { eq }) => eq(answers.applicationVersionId, pendingVersion.id),
    orderBy: (answers, { asc }) => [asc(answers.order)],
  });

  const answersForValidation = versionAnswers.map((answer) => ({
    fieldId: answer.fieldId,
    value: answer.answer ?? null,
  })) as CreateApplicationDto["answers"];

  const applicationCategory = await db.query.applicationCategories.findFirst({
    where: and(
      eq(applicationCategories.roundId, application.round.id),
      eq(applicationCategories.id, pendingVersion.categoryId),
      isNull(applicationCategories.deletedAt),
    ),
    with: {
      form: {
        with: {
          fields: {
            where: isNull(applicationFormFields.deletedAt),
          },
        },
      },
    },
  });

  if (!applicationCategory) {
    log(LogLevel.Error, "Application category not found during attestation validation", {
      applicationId,
      categoryId: pendingVersion.categoryId,
    });
    throw new BadRequestError("Application category not found");
  }

  const validationPayload: CreateApplicationDto = {
    projectName: pendingVersion.projectName,
    dripsAccountId: pendingVersion.dripsAccountId,
    attestationUID: attestationUid,
    deferredAttestationTxHash: pendingVersion.deferredAttestationTxHash ?? undefined,
    categoryId: pendingVersion.categoryId,
    answers: answersForValidation,
  };

  await validateEasAttestation(
    validationPayload,
    applicationCategory.form.fields,
    submitterWalletAddress,
    attestationSetup.easAddress,
    provider,
  );

  const updatedApplication = await db.transaction(async (tx) => {
    await tx.update(applicationVersions).set({
      easAttestationUID: attestationUid,
    }).where(eq(applicationVersions.id, pendingVersion.id));

    const logPayload = {
      ...validationPayload,
      id: application.id,
    };

    await createLog({
      type: AuditLogAction.ApplicationUpdated,
      roundId: application.round.id,
      actor: {
        type: AuditLogActorType.User,
        userId: submitterUserId,
      },
      payload: logPayload,
      tx,
    });

    await cachingService.delByPattern(
      cachingService.generateKey(["applications", roundId, "*"]),
    );
    await cachingService.delByPattern(
      cachingService.generateKey(["application", applicationId, "*"]),
    );

    const fullApplication = (await tx.query.applications.findFirst({
      where: eq(applications.id, applicationId),
      with: {
        versions: {
          orderBy: desc(applicationVersions.createdAt),
          with: {
            answers: {
              with: {
                field: true,
              },
            },
            form: true,
            category: true,
          },
        },
      },
    }))!;

    return {
      ...fullApplication,
      versions: fullApplication.versions.map((version) => ({
        ...version,
        answers: mapDbAnswersToDto(version.answers, false),
      })),
      customDatasetValues: [],
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
            },
            orderBy: (answers, { asc }) => [asc(answers.order)],
          },
          form: true,
          category: true,
        },
      },
    },
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
    throw new NotFoundError(
      "Application does not belong to the specified round",
    );
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
    deferredAttestationTxHash: v.deferredAttestationTxHash ?? null,
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

  const cacheKey = cachingService.generateKey([
    "application",
    applicationId,
    requestingUserId || "public",
  ]);
  const cachedApplication = await cachingService.get<Application>(cacheKey);
  if (cachedApplication) {
    log(LogLevel.Info, "Returning cached application", { applicationId });
    return cachedApplication;
  }

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
            },
          },
          results: true,
        },
      },
      submitter: {
        columns: {
          id: true,
          walletAddress: true,
        },
      },
      versions: {
        orderBy: desc(applicationVersions.createdAt),
        with: {
          answers: {
            with: {
              field: true,
            },
            orderBy: (answers, { asc }) => [asc(answers.order)],
          },
          form: true,
          category: true,
        },
      },
    },
  });

  if (!application) {
    return null;
  }
  if (application.roundId !== roundId) {
    log(LogLevel.Error, "Application does not belong to the specified round", {
      applicationId,
      roundId,
    });
    throw new NotFoundError(
      "Application does not belong to the specified round",
    );
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
    customDatasetValues: (await db.query.customDatasetValues.findMany({
      where: eq(customDatasetValues.applicationId, application.id),
      with: {
        dataset: true,
      },
    })).filter((cdv) => cdv.dataset.isPublic),
  };

  // Return calculated result if exists & published or exists & user is admin
  const resultAllocation = application.round.resultsPublished || userIsAdmin
    ? application.round.results.find((r) => r.applicationId === application.id)
      ?.result ?? null
    : null;

  const result = mapDbApplicationToDto(
    applicationWithFilteredAnswers,
    application.submitter,
    resultAllocation,
  );

  await cachingService.set(cacheKey, result);

  return result;
}

/** Return minimal listing applications */
export async function getApplications(
  roundId: string,
  requestingUserId: string | null,
  filterConfig: {
    state?: ApplicationState;
    submitterUserId?: string;
    categoryId?: string;
  } | null = null,
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

  const cacheKey = cachingService.generateKey([
    "applications",
    roundId,
    requestingUserId || "public",
    JSON.stringify(filterConfig),
    JSON.stringify(sortConfig),
    limit,
    offset,
  ]);

  const cachedApplications = await cachingService.get<ListingApplication[]>(
    cacheKey,
  );
  if (cachedApplications) {
    log(LogLevel.Info, "Returning cached applications", { roundId });
    return cachedApplications;
  }

  const round = await db.query.rounds.findFirst({
    where: eq(rounds.id, roundId),
    with: {
      admins: true,
    },
  });
  if (!round) {
    log(LogLevel.Error, "Round not found", { roundId });
    throw new NotFoundError("Round not found");
  }

  // We return result allocations only to admins or if results are published
  const returnResults = isUserRoundAdmin(round, requestingUserId) ||
    round.resultsPublished;

  // Admins can see all applications. Non-admins can only see approved applications, or their own
  const returnOnlyAcceptedOrOwn = !isUserRoundAdmin(round, requestingUserId);

  let applicationsResult = await db
    .select()
    .from(applications)
    .leftJoin(results, eq(applications.id, results.applicationId))
    .innerJoin(users, eq(applications.submitterUserId, users.id))
    .innerJoin(
      applicationCategories,
      eq(applications.categoryId, applicationCategories.id),
    )
    .where(
      and(
        returnOnlyAcceptedOrOwn
          ? or(
            eq(applications.state, "approved"),
            requestingUserId
              ? eq(applications.submitterUserId, requestingUserId)
              : undefined,
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
    .offset(offset);

  // apply random sort if requested
  if (sortConfig?.field === "random") {
    applicationsResult = applicationsResult.sort(() => Math.random() - 0.5);
  }

  const result = applicationsResult.map((application) =>
    mapDbApplicationToListingDto(
      application.applications,
      returnResults && application.results?.result
        ? application.results.result
        : null,
    )
  );

  await cachingService.set(cacheKey, result);

  return result;
}

export async function getApplicationsCsv(
  roundId: string,
  requestingUserId: string | null,
  onlyApproved = false,
) {
  log(LogLevel.Info, "Getting applications CSV", {
    roundId,
    requestingUserId,
  });
  const round = await db.query.rounds.findFirst({
    where: eq(rounds.id, roundId),
    with: {
      admins: true,
    },
  });
  if (!round) {
    log(LogLevel.Error, "Round not found", { roundId });
    throw new NotFoundError("Round not found");
  }

  const isAdmin = isUserRoundAdmin(round, requestingUserId);
  const includeRejectedAndPrivateData = isAdmin;
  const includeKycData = isAdmin;
  const includeVoteResult = includeRejectedAndPrivateData ||
    round.resultsPublished;

  const data = await db.query.applications.findMany({
    where: and(
      eq(applications.roundId, roundId),
      includeRejectedAndPrivateData && !onlyApproved
        ? undefined
        : eq(applications.state, "approved"),
    ),
    with: {
      versions: {
        orderBy: desc(applicationVersions.createdAt),
        limit: 1,
        with: {
          answers: {
            with: {
              field: true,
            },
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
            },
          },
        },
      },
      result: true,
      kycRequestMapping: {
        with: {
          kycRequest: true,
        },
      },
    },
  });

  const uniqueAnswerSlugs = Array.from(
    new Set(data.flatMap((app) =>
      app.versions[0].answers
        // Extremely important: this drops private fields unless the user is an admin
        .filter((a) => includeRejectedAndPrivateData ? true : !a.field.private)
        .map((a) => a.field.slug ?? null)
        .filter((s): s is string => s !== null)
    )),
  );

  const publicDatasets = await db.query.customDatasets.findMany({
    where: and(
      eq(customDatasets.roundId, roundId),
      eq(customDatasets.isPublic, true),
    ),
    with: {
      fields: {
        orderBy: asc(customDatasetFields.order),
      },
      values: true,
    },
  });

  const datasetHeaders = publicDatasets.flatMap((ds) =>
    ds.fields.map((f) => `${ds.name}:${f.name}`)
  );

  const kycSlugs = includeKycData
    ? [
      "KYC Status",
      "KYC Email address",
      "KYC Updated At",
      "KYC Provider",
    ]
    : [];

  const csvData = [
    [
      "ID",
      "State",
      "Project Name",
      "GitHub URL",
      "Drips Account ID",
      "Submitter Wallet Address",
      "Category ID",
      "Category Name",
      "Form ID",
      "Form Name",
      ...kycSlugs,
      ...uniqueAnswerSlugs,
      ...datasetHeaders,
      "Created At",
      "Allocation",
    ],
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
      ...(includeKycData
        ? [
          app.kycRequestMapping?.kycRequest.status ?? "",
          app.kycRequestMapping?.kycRequest.kycEmail ?? "",
          app.kycRequestMapping?.kycRequest.updatedAt.toISOString() ?? "",
          app.kycRequestMapping?.kycRequest.kycProvider ?? "",
        ]
        : []),
      ...uniqueAnswerSlugs.map((slug) => {
        const answer = app.versions[0].answers.find((a) =>
          a.field.slug === slug
        );
        return answer
          ? (typeof answer.answer === "string"
            ? answer.answer
            : JSON.stringify(answer.answer))
          : "";
      }),
      ...publicDatasets.flatMap((ds) => {
        const appValues = ds.values.find((v) => v.applicationId === app.id);
        return ds.fields.map((f) =>
          appValues?.values[f.name]?.toString() ?? ""
        );
      }),
      app.createdAt.toISOString(),
      includeVoteResult
        ? (app.result !== null ? app.result.result.toString() : "")
        : "",
    ]),
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

  return updatedApplications.map((app) =>
    mapDbApplicationToListingDto(
      app,
      null,
    )
  );
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
    },
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
    throw new UnauthorizedError(
      "Not authorized to review applications for this round",
    );
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

    const allApplicationIds = [
      ...applicationIdsToApprove,
      ...applicationIdsToReject,
    ];

    await cachingService.delByPattern(
      cachingService.generateKey(["applications", roundId, "*"]),
    );
    for (const id of allApplicationIds) {
      await cachingService.delByPattern(
        cachingService.generateKey(["application", id, "*"]),
      );
    }

    return [...approvedApplications, ...rejectedApplications];
  });

  return result;
}
