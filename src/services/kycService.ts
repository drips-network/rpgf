import { z } from "zod";
import { CreateKycRequestForApplicationDto, KycProvider, KycRequest, KycStatus, KycType } from "../types/kyc.ts";
import { db, Transaction } from "../db/postgres.ts";
import { applicationKycRequests, kycRequests } from "../db/schema.ts";
import { BadRequestError, NotFoundError } from "../errors/generic.ts";
import { isUserRoundAdmin } from "./roundService.ts";
import { UnauthorizedError } from "../errors/auth.ts";
import { InferSelectModel } from "drizzle-orm/table";
import { and, eq } from "drizzle-orm";

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

function _mapDbKycToDto(kycStatus: InferSelectModel<typeof kycRequests>): KycRequest {
  return {
    id: kycStatus.id,
    kycType: kycStatus.kycType,
    kycEmail: kycStatus.kycEmail,
    kycRequestId: kycStatus.id,
    kycFormUrl: kycStatus.kycFormUrl,
    status: kycStatus.status,
    updatedAt: kycStatus.updatedAt,
  };
}

export async function createKycRequest({
  userId,
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
  applicationId: string,
  provider: KycProvider,
  type: KycType,
  email: string,
  firstName: string,
  lastName: string,
  businessName?: string,
  roundId: string,
}, tx: Transaction ): Promise<KycRequest> {
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

  const {
    kycLink,
    customerId,
    organizationId,
  } = parseResult.data;

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

  return _mapDbKycToDto(inserted[0]);
}

export async function createKycRequestForApplication(
  applicationId: string,
  requestingUserId: string,
  dto: CreateKycRequestForApplicationDto,
): Promise<KycRequest> {
  _assertCanKyc();

  return await db.transaction(async (tx) => {
    const application = await tx.query.applications.findFirst({
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
      throw new NotFoundError("Application not found");
    }
    if (!application.round.kycProvider) {
      throw new BadRequestError("KYC is not required for this application");
    }

    const isSubmitter = application.submitterUserId === requestingUserId;
    const isRoundAdmin = isUserRoundAdmin(application.round, requestingUserId);

    if (!isSubmitter && !isRoundAdmin) {
      throw new UnauthorizedError("You are not allowed to create a KYC request for this application");
    }

    const existingKyc = await tx.query.applicationKycRequests.findFirst({
      where: eq(applicationKycRequests.applicationId, applicationId)
    });
    if (existingKyc) {
      throw new BadRequestError("KYC request already exists for this application");
    }

    return await createKycRequest({
      userId: requestingUserId,
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
  _assertCanKyc();

  const applicationKycRequest = await db.query.applicationKycRequests.findFirst({
    where: eq(applicationKycRequests.applicationId, applicationId),
    with: {
      application: {
        with: {
          round: {
            with: {
              admins: true,
            }
          }
        }
      },
      kycRequest: true,
    }
  });
  if (!applicationKycRequest) {
    throw new NotFoundError("KYC record not found");
  }

  const isRequesterApplicationOwner = applicationKycRequest.application.submitterUserId === requestingUserId;
  const isRequesterRoundAdmin = isUserRoundAdmin(applicationKycRequest.application.round, requestingUserId);

  if (!isRequesterApplicationOwner && !isRequesterRoundAdmin) {
    throw new UnauthorizedError("You are not allowed to view this KYC status");
  }

  return _mapDbKycToDto(applicationKycRequest.kycRequest);
}

export async function getKycRequestsForRound(
  roundId: string,
  requestingUserId: string,
): Promise<KycRequest[]> {
  _assertCanKyc();

  const kycRecords = await db.query.kycRequests.findMany({
    where: and(
      eq(kycRequests.userId, requestingUserId),
      eq(kycRequests.roundId, roundId),
    ),
  });

  return kycRecords.map(_mapDbKycToDto);
}

export async function linkExistingKycToApplication(
  applicationId: string,
  kycRequestId: string,
  requestingUserId: string,
) {
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
    throw new NotFoundError("Application not found");
  }
  const isSubmitter = application.submitterUserId === requestingUserId;
  const isRoundAdmin = isUserRoundAdmin(application.round, requestingUserId);
  if (!isSubmitter && !isRoundAdmin) {
    throw new UnauthorizedError("You are not allowed to link a KYC request to this application");
  }

  const existingApplicationKyc = await db.query.applicationKycRequests.findFirst({
    where: eq(applicationKycRequests.applicationId, applicationId)
  });
  if (existingApplicationKyc) {
    throw new BadRequestError("A KYC request is already linked to this application");
  }
  const kycRequest = await db.query.kycRequests.findFirst({
    where: eq(kycRequests.id, kycRequestId)
  });
  if (!kycRequest) {
    throw new NotFoundError("KYC request not found");
  }
  if (kycRequest.userId !== requestingUserId && !isRoundAdmin) {
    throw new UnauthorizedError("You are not allowed to link this KYC request to the application");
  }
  if (kycRequest.roundId !== application.roundId) {
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
) {
  await db.update(kycRequests)
    .set({ status: newStatus, updatedAt: new Date() })
    .where(eq(kycRequests.providerUserId, providerUserId));

  return;
}
