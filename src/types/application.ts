import { z } from "zod";
import { ProjectData } from "../gql/projects.ts";
import { ApplicationCategory } from "./applicationCategory.ts";
import { ApplicationAnswer, applicationAnswerDtoSchema } from "./applicationAnswer.ts";

export const applicationStateSchema = z.enum(["pending", "approved", "rejected"]);
export type ApplicationState = z.infer<typeof applicationStateSchema>;

export const createApplicationDtoSchema = z.object({
  projectName: z.string().min(1).max(255),
  dripsAccountId: z.string().min(1).max(255),
  attestationUID: z.string().min(1).max(255).optional(),
  deferredAttestationTxHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/).optional(),
  categoryId: z.string().uuid().min(1).max(255),
  answers: applicationAnswerDtoSchema,
});
export type CreateApplicationDto = z.infer<typeof createApplicationDtoSchema>;

export const updateApplicationDtoSchema = z.object({
  projectName: z.string().min(1).max(255),
  dripsAccountId: z.string().min(1).max(255),
  attestationUID: z.string().min(1).max(255).optional(),
  deferredAttestationTxHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/).optional(),
  categoryId: z.string().uuid().min(1).max(255),
  answers: applicationAnswerDtoSchema,
});
export type UpdateApplicationDto = z.infer<typeof updateApplicationDtoSchema>;

export const applicationReviewDtoSchema = z.array(z.object({
  applicationId: z.string(),
  decision: z.enum(["approve", "reject"]),
}));
export type ApplicationReviewDto = z.infer<typeof applicationReviewDtoSchema>;

export type ApplicationVersion = {
  id: string;
  projectName: string;
  dripsAccountId: string;
  easAttestationUID: string | null;
  deferredAttestationTxHash: string | null;
  dripsProjectDataSnapshot: ProjectData;
  createdAt: Date;
  formId: string;
  category: ApplicationCategory;
  answers: ApplicationAnswer[];
};

export type Application = {
  id: string;
  state: ApplicationState;
  createdAt: Date;
  updatedAt: Date;
  roundId: string;
  /** Calculated result for this application, if any */
  allocation: number | null;
  submitter: {
    id: string;
    walletAddress: string;
  };
  latestVersion: ApplicationVersion;

  // Included so that this type extends ListingApplication
  projectName: string;
  dripsProjectDataSnapshot: ProjectData;
  customDatasetValues: {
    datasetId: string;
    datasetName: string;
    values: Record<string, string | number | boolean | null>;
  }[];
};

export type ListingApplication = {
  id: string;
  state: ApplicationState;
  projectName: string;
  dripsProjectDataSnapshot: ProjectData;
  /** Calculated result for this application, if any */
  allocation: number | null;
};
