import { z } from "zod";
import { CreateKycRequestForApplicationDto, KycProvider, KycRequest, KycStatus, KycType } from "../types/kyc.ts";
import { db, Transaction } from "../db/postgres.ts";
import { log, LogLevel } from "./loggingService.ts";
import { applicationKycRequests, applications, kycRequests, roundKycConfigurations, users } from "../db/schema.ts";
import { BadRequestError, NotFoundError } from "../errors/generic.ts";
import { isUserRoundAdmin } from "./roundService.ts";
import { UnauthorizedError } from "../errors/auth.ts";
import { InferSelectModel } from "drizzle-orm/table";
import { and, eq, ilike } from "drizzle-orm";
import { createLog } from "./auditLogService.ts";
import { AuditLogAction, AuditLogActorType } from "../types/auditLog.ts";

const FERN_API_BASE = "https://api.fernhq.com";
const FERN_API_KEY = Deno.env.get("FERN_KYC_API_KEY");

if (!FERN_API_KEY && Deno.env.get("DENO_ENV") === "production") {
  throw new Error("FERN_KYC_API_KEY is not set");
}

function _assertCanKyc() {
  if (!FERN_API_KEY) {
    throw new Error("FERN_KYC_API_KEY is not set");
  }
}

function _fetchFern(
  endpoint: string,
  options: RequestInit = {},
) {
  return fetch(`${FERN_API_BASE}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": Deno.env.get("FERN_KYC_API_KEY") || "",
      ...(options.headers || {}),
    },
  });
}

function _mapDbKycToDto(kycStatus: InferSelectModel<typeof kycRequests>, kycConfiguration: InferSelectModel<typeof roundKycConfigurations>): KycRequest {
  let formUrl: string;

  switch (kycStatus.kycProvider) {
    case KycProvider.Fern:
      if (!kycStatus.kycFormUrl) {
        throw new Error("KYC form URL is missing for Fern KYC request");
      }

      formUrl = kycStatus.kycFormUrl;
      break;
    case KycProvider.Treova:
      if (!kycConfiguration.treovaFormId) {
        throw new Error("Treova form ID is not configured for this round");
      }

      formUrl = `https://kyc.treova.ai/${kycConfiguration.treovaFormId}`;
      break;
  }

  return {
    id: kycStatus.id,
    kycProvider: kycStatus.kycProvider,
    kycType: kycStatus.kycType,
    kycEmail: kycStatus.kycEmail,
    kycFormUrl: formUrl,
    status: kycStatus.status,
    updatedAt: kycStatus.updatedAt,
  };
}

async function _createFernKycCustomer({
  email,
  firstName,
  lastName,
  businessName,
  type,
}: {
  email: string,
  firstName: string,
  lastName: string,
  businessName?: string,
  type: KycType,
}) {
  _assertCanKyc();

  const createCustomerResponse = await _fetchFern("/customers", {
    method: "POST",
    body: JSON.stringify({
      email,
      firstName,
      lastName,
      businessName,
      customerType: type === KycType.Individual ? "INDIVIDUAL" : "BUSINESS",
    }),
  });

  const resultJson = await createCustomerResponse.json();

  const parseResult = z.object({
    customerId: z.string(),
    customerStatus: z.enum(["CREATED"]),
    kycLink: z.string().url(),
    organizationId: z.string(),
  }).safeParse(resultJson);

  if (!parseResult.success) {
    if ('message' in resultJson && resultJson.message === 'Account already exists') {
      throw new BadRequestError("A KYC request already for this user already exists on Fern");
    }

    console.error("Failed to create Fern customer:", resultJson);
    throw new Error("Failed to create KYC request");
  }

  return {
    kycLink: parseResult.data.kycLink,
    customerId: parseResult.data.customerId,
    organizationId: parseResult.data.organizationId,
  };
}

export async function createKycRequest({
  userId,
  requestingUserId,
  applicationId,
  provider,
  type,
  email,
  firstName,
  lastName,
  businessName,
  roundId,
}: {
  userId: string,
  requestingUserId: string,
  applicationId: string,
  provider: KycProvider,
  type: KycType,
  email?: string,
  firstName?: string,
  lastName?: string,
  businessName?: string,
  roundId: string,
}, tx: Transaction): Promise<KycRequest> {
  log(LogLevel.Info, "Creating KYC request", {
    userId,
    requestingUserId,
    applicationId,
    provider,
    type,
    roundId,
  });
  _assertCanKyc();

  const kycConfiguration = await tx.query.roundKycConfigurations.findFirst({
    where: eq(roundKycConfigurations.roundId, roundId),
  });
  if (!kycConfiguration) {
    log(LogLevel.Error, "KYC is not configured for this round", { roundId });
    throw new BadRequestError("KYC is not configured for this round");
  }

  let kycLink: string | null = null;
  let customerId: string | null = null;
  let organizationId: string | null = null;

  switch (provider) {
    case KycProvider.Fern: {
      if (!email || !firstName || !lastName || (type === KycType.Business && !businessName)) {
        throw new BadRequestError("Missing required fields for Fern KYC");
      }

      const res = await _createFernKycCustomer({
        email,
        firstName,
        lastName,
        businessName,
        type,
      });

      kycLink = res.kycLink;
      customerId = res.customerId;
      organizationId = res.organizationId;
      break;
    }

    case KycProvider.Treova: {
      // Treova does not create customers in advance, instead everyone gets the same link.
      // As a result, nothing needs to be done here - we just wait for a webhook to update the status
      // of a particular user.

      throw new Error("Treova does not support creating KYC requests via the API yet");
    }
  }

  const inserted = await tx.insert(kycRequests).values({
    userId,
    status: KycStatus.Created,
    roundId,
    kycEmail: email,
    kycType: type,
    kycProvider: provider,
    kycFormUrl: kycLink,
    providerUserId: customerId,
    providerOrgId: organizationId,
  }).returning();

  await tx.insert(applicationKycRequests).values({
    applicationId,
    kycRequestId: inserted[0].id,
  });

  const requestingUser = await tx.query.users.findFirst({
    where: eq(users.id, requestingUserId),
    columns: {
      walletAddress: true,
    }
  });
  if (!requestingUser) {
    throw new Error("Requesting user not found");
  }

  await createLog({
    type: AuditLogAction.KycRequestCreated,
    roundId,
    actor: { type: AuditLogActorType.User, userId: requestingUserId },
    payload: { kycRequestId: inserted[0].id },
    tx,
  });

  return _mapDbKycToDto(inserted[0], kycConfiguration);
}

export async function createKycRequestForApplication(
  applicationId: string,
  requestingUserId: string,
  dto: CreateKycRequestForApplicationDto,
): Promise<KycRequest> {
  log(LogLevel.Info, "Creating KYC request for application", {
    applicationId,
    requestingUserId,
  });
  _assertCanKyc();

  return await db.transaction(async (tx) => {
    const application = await tx.query.applications.findFirst({
      where: (app, { eq }) =>
        eq(app.id, applicationId),
      with: {
        round: {
          with: {
            admins: true,
            kycConfiguration: true,
          }
        },
      }
    });
    if (!application) {
      log(LogLevel.Error, "Application not found", { applicationId });
      throw new NotFoundError("Application not found");
    }
    if (!application.round.kycConfiguration) {
      log(LogLevel.Error, "KYC is not required for this application", {
        applicationId,
      });
      throw new BadRequestError("KYC is not required for this application");
    }

    if (application.round.kycConfiguration.kycProvider !== KycProvider.Fern) {
      log(
        LogLevel.Error,
        `KYC provider ${application.round.kycConfiguration.kycProvider} is not supported for creating KYC requests via the API`,
        { applicationId },
      );
      throw new BadRequestError(`KYC provider ${application.round.kycConfiguration.kycProvider} is not supported for creating KYC requests via the API`);
    }

    const isSubmitter = application.submitterUserId === requestingUserId;
    const isRoundAdmin = isUserRoundAdmin(application.round, requestingUserId);

    if (!isSubmitter && !isRoundAdmin) {
      log(
        LogLevel.Error,
        "You are not allowed to create a KYC request for this application",
        { applicationId, requestingUserId },
      );
      throw new UnauthorizedError("You are not allowed to create a KYC request for this application");
    }

    const existingKyc = await tx.query.applicationKycRequests.findFirst({
      where: eq(applicationKycRequests.applicationId, applicationId)
    });
    if (existingKyc) {
      log(LogLevel.Error, "KYC request already exists for this application", {
        applicationId,
      });
      throw new BadRequestError("KYC request already exists for this application");
    }

    return await createKycRequest({
      userId: application.submitterUserId,
      requestingUserId,
      applicationId,
      provider: KycProvider.Fern,
      type: dto.type,
      email: dto.email,
      firstName: dto.firstName,
      lastName: dto.lastName,
      businessName: dto.businessName,
      roundId: application.roundId,
    }, tx);
  });
}

export async function getKycRequestForApplication(
  applicationId: string,
  requestingUserId: string,
): Promise<KycRequest> {
  log(LogLevel.Info, "Getting KYC request for application", {
    applicationId,
    requestingUserId,
  });
  _assertCanKyc();

  const applicationKycRequest = await db.query.applicationKycRequests.findFirst({
    where: eq(applicationKycRequests.applicationId, applicationId),
    with: {
      application: {
        with: {
          round: {
            with: {
              admins: true,
              kycConfiguration: true,
            }
          }
        }
      },
      kycRequest: true,
    }
  });
  if (!applicationKycRequest) {
    log(LogLevel.Error, "KYC record not found", { applicationId });
    throw new NotFoundError("KYC record not found");
  }

  const isRequesterApplicationOwner = applicationKycRequest.application.submitterUserId === requestingUserId;
  const isRequesterRoundAdmin = isUserRoundAdmin(applicationKycRequest.application.round, requestingUserId);

  if (!isRequesterApplicationOwner && !isRequesterRoundAdmin) {
    log(LogLevel.Error, "You are not allowed to view this KYC status", {
      applicationId,
      requestingUserId,
    });
    throw new UnauthorizedError("You are not allowed to view this KYC status");
  }

  return _mapDbKycToDto(applicationKycRequest.kycRequest, applicationKycRequest.application.round.kycConfiguration);
}

export async function getKycRequestsForRound(
  roundId: string,
  requestingUserId: string,
): Promise<KycRequest[]> {
  log(LogLevel.Info, "Getting KYC requests for round", {
    roundId,
    requestingUserId,
  });
  _assertCanKyc();

  const kycRecords = await db.query.kycRequests.findMany({
    where: and(
      eq(kycRequests.userId, requestingUserId),
      eq(kycRequests.roundId, roundId),
    ),
    with: {
      round: {
        columns: {},
        with: {
          kycConfiguration: true,
        }
      }
    }
  });

  return kycRecords.map((v) => _mapDbKycToDto(v, v.round.kycConfiguration));
}

export async function linkExistingKycToApplication(
  applicationId: string,
  kycRequestId: string,
  requestingUserId: string,
) {
  log(LogLevel.Info, "Linking existing KYC to application", {
    applicationId,
    kycRequestId,
    requestingUserId,
  });
  const application = await db.query.applications.findFirst({
    where: (app, { eq }) =>
      eq(app.id, applicationId),
    with: {
      round: {
        with: {
          admins: true,
        }
      },
    }
  });
  if (!application) {
    log(LogLevel.Error, "Application not found", { applicationId });
    throw new NotFoundError("Application not found");
  }
  const isSubmitter = application.submitterUserId === requestingUserId;
  const isRoundAdmin = isUserRoundAdmin(application.round, requestingUserId);
  if (!isSubmitter && !isRoundAdmin) {
    log(
      LogLevel.Error,
      "You are not allowed to link a KYC request to this application",
      { applicationId, requestingUserId },
    );
    throw new UnauthorizedError("You are not allowed to link a KYC request to this application");
  }

  const existingApplicationKyc = await db.query.applicationKycRequests.findFirst({
    where: eq(applicationKycRequests.applicationId, applicationId)
  });
  if (existingApplicationKyc) {
    log(
      LogLevel.Error,
      "A KYC request is already linked to this application",
      { applicationId },
    );
    throw new BadRequestError("A KYC request is already linked to this application");
  }
  const kycRequest = await db.query.kycRequests.findFirst({
    where: eq(kycRequests.id, kycRequestId)
  });
  if (!kycRequest) {
    log(LogLevel.Error, "KYC request not found", { kycRequestId });
    throw new NotFoundError("KYC request not found");
  }
  if (kycRequest.userId !== requestingUserId && !isRoundAdmin) {
    log(
      LogLevel.Error,
      "You are not allowed to link this KYC request to the application",
      { kycRequestId, requestingUserId },
    );
    throw new UnauthorizedError("You are not allowed to link this KYC request to the application");
  }
  if (kycRequest.roundId !== application.roundId) {
    log(
      LogLevel.Error,
      "The KYC request and application must belong to the same round",
      { kycRequestId, applicationId },
    );
    throw new BadRequestError("The KYC request and application must belong to the same round");
  }

  await db.insert(applicationKycRequests).values({
    applicationId,
    kycRequestId,
  });
  return;
}

export async function updateKycStatus(
  newStatus: KycStatus,
  providerUserId: string,
  provider: KycProvider,
) {
  log(LogLevel.Info, "Updating KYC status", {
    newStatus,
    providerUserId,
    provider,
  });
  await db.transaction(async (tx) => {
    const kycRequest = await tx.update(kycRequests)
      .set({ status: newStatus, updatedAt: new Date() })
      .where(eq(kycRequests.providerUserId, providerUserId))
      .returning();

    if (kycRequest.length === 0) {
      console.warn(`No KYC request found for providerUserId ${providerUserId}, ignoring status update`);
      return;
    }

    await createLog({
      type: AuditLogAction.KycRequestUpdated,
      roundId: kycRequest[0].roundId,
      actor: { type: AuditLogActorType.KycProvider, provider },
      payload: {
        kycRequestId: kycRequest[0].id,
        previousStatus: kycRequest[0].status,
        newStatus
      },
      tx,
    })
  });

  return;
}

// Awkward doubling here but we need special logic to handle
// Treova webhooks, for which a KYC request may not exist yet
export async function updateKycStatusTreova(
  newStatus: KycStatus,
  applicantId: string,
  walletAddress: string,
  formId: string,
  kycType: KycType,
) {
  log(LogLevel.Info, "Updating KYC status for Treova", {
    newStatus,
    applicantId,
    walletAddress,
    formId,
    kycType,
  });
  await db.transaction(async (tx) => {
    const kycConfiguration = await tx.query.roundKycConfigurations.findFirst({
      where: eq(roundKycConfigurations.treovaFormId, formId),
    });
    if (!kycConfiguration) {
      log(LogLevel.Error, "KYC configuration not found for this form ID", {
        formId,
      });
      throw new NotFoundError("KYC configuration not found for this form ID");
    }

    const user = await tx.query.users.findFirst({
      where: ilike(users.walletAddress, walletAddress),
      columns: {
        id: true,
      }
    });
    if (!user) {
      log(LogLevel.Error, "User not found for this wallet address", {
        walletAddress,
      });
      throw new NotFoundError("User not found for this wallet address");
    }

    // find all applications by the wallet address in the round
    const apps = await tx.query.applications.findMany({
      where: and(
        eq(applications.roundId, kycConfiguration.roundId),
        eq(applications.submitterUserId, user.id),
      ),
      with: {
        kycRequestMapping: {
          with: {
            kycRequest: true,
          }
        }
      }
    });

    for (const app of apps) {
      const existingKycRequest = app.kycRequestMapping?.kycRequest;

      if (existingKycRequest) {
        // If a KYC request already exists for this application, just update it
        await tx.update(kycRequests)
          .set({ status: newStatus, updatedAt: new Date() })
          .where(eq(kycRequests.id, existingKycRequest.id))
          .returning();

        await createLog({
          type: AuditLogAction.KycRequestUpdated,
          roundId: kycConfiguration.roundId,
          actor: { type: AuditLogActorType.KycProvider, provider: KycProvider.Treova },
          payload: {
            kycRequestId: existingKycRequest.id,
            previousStatus: existingKycRequest.status,
            newStatus
          },
          tx,
        });
      } else {
        // If not, create a new KYC request and link it to the application
        const inserted = await tx.insert(kycRequests).values({
          userId: user.id,
          status: newStatus,
          roundId: kycConfiguration.roundId,
          kycType,
          kycProvider: KycProvider.Treova,
          providerUserId: applicantId,
        }).returning();

        await tx.insert(applicationKycRequests).values({
          applicationId: app.id,
          kycRequestId: inserted[0].id,
        });

        await createLog({
          type: AuditLogAction.KycRequestCreated,
          roundId: kycConfiguration.roundId,
          actor: { type: AuditLogActorType.KycProvider, provider: KycProvider.Treova },
          payload: { kycRequestId: inserted[0].id },
          tx,
        });
      }
    }
  });
}
