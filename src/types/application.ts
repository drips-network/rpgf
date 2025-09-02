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
  categoryId: z.string().min(1).max(255),
  answers: applicationAnswerDtoSchema,
});
export type CreateApplicationDto = z.infer<typeof createApplicationDtoSchema>;

export const applicationReviewDtoSchema = z.array(z.object({
  applicationId: z.string(),
  decision: z.enum(["approve", "reject"]),
}));
export type ApplicationReviewDto = z.infer<typeof applicationReviewDtoSchema>;

export type Application = {
  id: string;
  state: ApplicationState;
  projectName: string;
  dripsAccountId: string;
  easAttestationUID: string | null;
  dripsProjectDataSnapshot: ProjectData;
  createdAt: Date;
  updatedAt: Date;
  roundId: string;
  formId: string;
  /** Calculated result for this application, if any */
  allocation: number | null;
  category: ApplicationCategory;
  answers: ApplicationAnswer[];
  submitter: {
    id: string;
    walletAddress: string;
  }
};

export type ListingApplication = {
  id: string;
  state: ApplicationState;
  projectName: string;
  dripsAccountId: string;
  dripsProjectDataSnapshot: ProjectData;
  /** Calculated result for this application, if any */
  allocation: number | null;
};
