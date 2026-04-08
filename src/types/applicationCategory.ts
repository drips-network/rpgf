import { z } from "zod";

export const createApplicationCategoryDtoSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  applicationFormId: z.string().min(1).max(255),
  minVotePercentage: z.number().int().min(0).max(100).optional(),
  externalVotingToolName: z.string().max(255).optional(),
  externalVotingToolUrl: z.string().url().max(510).optional(),
  externalVotingToolSecret: z.string().max(255).optional(),
});
export type CreateApplicationCategoryDto = z.infer<typeof createApplicationCategoryDtoSchema>;

export const updateApplicationCategoryDtoSchema = createApplicationCategoryDtoSchema;
export type UpdateApplicationCategoryDto = z.infer<typeof updateApplicationCategoryDtoSchema>;

export type ApplicationFormNameAndId = {
  id: string;
  name: string;
};

export type ExternalVotingTool = {
  name: string;
  url: string;
};

export type ApplicationCategory = {
  id: string;
  name: string;
  description: string | null;
  minVotePercentage: number | null;
  externalVotingTool: ExternalVotingTool | null;
  applicationForm: ApplicationFormNameAndId;
};
