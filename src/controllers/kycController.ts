import { RouteParams, RouterContext } from "oak";
import { AppState, AuthenticatedAppState } from "../../main.ts";
import { createHmac, timingSafeEqual } from "node:crypto";
import { Buffer } from "node:buffer";
import { z } from "zod";
import { createKycRequestForApplication, getKycRequestForApplication, getKycRequestsForRound, linkExistingKycToApplication, updateKycStatus, updateKycStatusTreova } from "../services/kycService.ts";
import { createKycRequestForApplicationDtoSchema, KycProvider, KycStatus, KycType } from "../types/kyc.ts";
import parseDto from "../utils/parseDto.ts";
import { ethereumAddressSchema } from "../types/shared.ts";

const FERN_WEBHOOK_SECRET = Deno.env.get("FERN_KYC_WEBHOOK_SECRET") || "";
if (Deno.env.get("DENO_ENV") === "production" && !FERN_WEBHOOK_SECRET) {
  throw new Error("FERN_KYC_WEBHOOK_SECRET is not set");
}

const TREOVA_KYC_WEBHOOK_SECRET = Deno.env.get("TREOVA_KYC_WEBHOOK_SECRET");
if (Deno.env.get("DENO_ENV") === "production" && !TREOVA_KYC_WEBHOOK_SECRET) {
  throw new Error("TREOVA_KYC_WEBHOOK_SECRET is not set");
}

const generateWebhookSig = (
  body: string,
  timestamp: string,
  secret: string
): string => {
  const payloadToSign = `${timestamp}.${body}`;

  return createHmac("sha256", secret)
    .update(payloadToSign)
    .digest("hex");
};

const isValidWebhookSig = (
  body: string,
  timestamp: string,
  signature: string,
  secret: string
): boolean => {
  const expectedSignature = generateWebhookSig(body, timestamp, secret);
  const sigBuffer = Buffer.from(signature, "hex");
  const expectedSigBuffer = Buffer.from(expectedSignature, "hex");
  return (
    sigBuffer.length === expectedSigBuffer.length &&
    timingSafeEqual(sigBuffer, expectedSigBuffer)
  );
};

export async function fernUpdateWebhookController(
  ctx: RouterContext<
    "/api/kyc/status-updated-webhook/fern",
    RouteParams<"/api/kyc/status-updated-webhook/fern">,
    AppState
  >,
) {
  if (!FERN_WEBHOOK_SECRET) {
    console.error("FERN_WEBHOOK_SECRET not set – cannot verify Fern webhooks!");
    return ctx.response.status = 500;
  }

  const signature = ctx.request.headers.get("x-api-signature");
  const timestamp = ctx.request.headers.get("x-api-timestamp");
  const rawBody = await ctx.request.body.text();

  console.log("Received Fern KYC webhook", rawBody);

  if (!signature || !timestamp || !isValidWebhookSig(rawBody, timestamp, signature, FERN_WEBHOOK_SECRET)) {
    console.error("Invalid webhook signature – request possibly forged!");
    return ctx.response.status = 401;
  }

  const now = Date.now();
  const reqTime = Number(timestamp);
  if (isNaN(reqTime) || Math.abs(now - reqTime * 1000) > 5 * 60 * 1000) { // 5 minute tolerance
    console.error("Webhook timestamp outside of tolerance – possible replay attack!");
    return ctx.response.status = 400;
  }

  const parsedPayload = z.object({
    id: z.string(),
    type: z.literal("customer.updated"),
    resource: z.object({
      customerId: z.string(),
      organizationId: z.string(),
      customerStatus: z.enum([
        "CREATED",
        "UNDER_REVIEW",
        "NEEDS_ADDITIONAL_INFORMATION",
        "ACTIVE",
        "REJECTED",
        "DEACTIVATED",
      ]),
    }),
  }).safeParse(JSON.parse(rawBody));

  if (!parsedPayload.success) {
    return ctx.response.status = 200; // return 200 to avoid retries, assuming we got an event we cannot handle.
    // TODO: actually verify if it's an event we cannot handle, or if it's a malformed request.
  }

  const { resource: { customerId, customerStatus } } = parsedPayload.data;

  await updateKycStatus(customerStatus as KycStatus, customerId, KycProvider.Fern);
}

export async function treovaUpdateWebhookController(
  ctx: RouterContext<
    "/api/kyc/status-updated-webhook/treova",
    RouteParams<"/api/kyc/status-updated-webhook/treova">,
    AppState
  >,
) {
  if (!TREOVA_KYC_WEBHOOK_SECRET) {
    console.error("TREOVA_KYC_WEBHOOK_SECRET not set – cannot verify Treova webhooks!");
    return ctx.response.status = 500;
  }

  const signature = ctx.request.headers.get("x-webhook-signature");
  const timestamp = ctx.request.headers.get("x-webhook-timestamp");
  const rawBody = await ctx.request.body.text();

  console.log("Received Treova KYC webhook", rawBody);

  if (!signature || !timestamp || !isValidWebhookSig(rawBody, timestamp, signature, TREOVA_KYC_WEBHOOK_SECRET)) {
    console.error("Invalid webhook signature – request possibly forged!");
    return ctx.response.status = 401;
  }

  const parsedPayload = z.object({
    event: z.literal("kyc.status.updated"),
    data: z.object({
      wallet_address: ethereumAddressSchema,
      applicantId: z.string().max(256),
      status: z.enum([
        "PENDING",
        "OUTREACH",
        "VERIFIED",
        "REJECTED",
      ]),
    }),
  }).safeParse(JSON.parse(rawBody));

  if (!parsedPayload.success) {
    return ctx.response.status = 200; // return 200 to avoid retries, assuming we got an event we cannot handle.
  }

  const { data: { applicantId, status, wallet_address } } = parsedPayload.data;

  // TODO: pull this from the webhook once it's added
  const treovaFormId = 'cmp_67e3ab21';
  const kycType = KycType.Individual;

  const TREOVA_STATUS_TO_KYC_STATUS: Record<string, KycStatus> = {
    "PENDING": KycStatus.UnderReview,
    "OUTREACH": KycStatus.NeedsAdditionalInformation,
    "VERIFIED": KycStatus.Active,
    "REJECTED": KycStatus.Rejected,
  };
  const kycStatus = TREOVA_STATUS_TO_KYC_STATUS[status];

  await updateKycStatusTreova(
    kycStatus,
    applicantId,
    wallet_address,
    treovaFormId,
    kycType,
  )
};

export async function createKycRequestForApplicationController(
  ctx: RouterContext<
    "/api/kyc/applications/:applicationId/request",
    RouteParams<"/api/kyc/applications/:applicationId/request">,
    AuthenticatedAppState
  >,
) {
  const applicationId = ctx.params.applicationId;
  const userId = ctx.state.user.userId;
  const dto = await parseDto(createKycRequestForApplicationDtoSchema, ctx);

  const result = await createKycRequestForApplication(
    applicationId,
    userId,
    dto,
  );

  ctx.response.status = 200;
  ctx.response.body = result;
}

export async function getKycRequestForApplicationController(
  ctx: RouterContext<
    "/api/kyc/applications/:applicationId/request",
    RouteParams<"/api/kyc/applications/:applicationId/request">,
    AuthenticatedAppState
  >,
) {
  const applicationId = ctx.params.applicationId;
  const userId = ctx.state.user.userId;

  const kycStatus = await getKycRequestForApplication(applicationId, userId);

  ctx.response.status = 200;
  ctx.response.body = kycStatus;
}

export async function getKycRequestsForRoundController(
  ctx: RouterContext<
    "/api/kyc/rounds/:roundId/requests",
    RouteParams<"/api/kyc/rounds/:roundId/requests">,
    AuthenticatedAppState
  >,
) {
  const userId = ctx.state.user.userId;
  const roundId = ctx.params.roundId;

  const kycRequests = await getKycRequestsForRound(roundId, userId);

  ctx.response.status = 200;
  ctx.response.body = kycRequests;
}

export async function linkExistingKycToApplicationController(
  ctx: RouterContext<
    "/api/kyc/applications/:applicationId/link-existing",
    RouteParams<"/api/kyc/applications/:applicationId/link-existing">,
    AuthenticatedAppState
  >,
) {
  const applicationId = ctx.params.applicationId;
  const userId = ctx.state.user.userId;
  const dto = await parseDto(z.object({
    kycRequestId: z.string().uuid(),
  }), ctx);

  // This will throw if it fails
  await linkExistingKycToApplication(
    applicationId,
    dto.kycRequestId,
    userId,
  );

  ctx.response.status = 200;
}
