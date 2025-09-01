import { z } from "zod";

export const createApplicationCategoryDtoSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  applicationFormId: z.string().min(1).max(255),
});
export type CreateApplicationCategoryDto = z.infer<typeof createApplicationCategoryDtoSchema>;

export const updateApplicationCategoryDtoSchema = createApplicationCategoryDtoSchema;
export type UpdateApplicationCategoryDto = z.infer<typeof updateApplicationCategoryDtoSchema>;

export type ApplicationCategory = {
  id: string;
  name: string;
  description: string | null;
  applicationFormId: string;
};
