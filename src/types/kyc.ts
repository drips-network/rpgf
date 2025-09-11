import { z } from "zod";

export enum KycProvider {
  Fern = "Fern",
}

export enum KycStatus {
  Created = "CREATED",
  UnderReview = "UNDER_REVIEW",
  NeedsAdditionalInformation = "NEEDS_ADDITIONAL_INFORMATION",
  Active = "ACTIVE",
  Rejected = "REJECTED",
  Deactivated = "DEACTIVATED",
}

export enum KycType {
  Individual = "INDIVIDUAL",
  Business = "BUSINESS",
}

export type KycRequest = {
  id: string;
  kycType: KycType;
  kycRequestId: string;
  kycFormUrl: string;
  kycEmail: string;
  status: KycStatus;
  updatedAt: Date;
}

export const createKycRequestForApplicationDtoSchema = z.object({
  type: z.enum([KycType.Individual, KycType.Business]),
  firstName: z.string().min(1).max(200),
  lastName: z.string().min(1).max(200),
  businessName: z.string().min(1).max(200).optional(),
  email: z.string().email(),
});
export type CreateKycRequestForApplicationDto = z.infer<typeof createKycRequestForApplicationDtoSchema>;
