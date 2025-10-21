import { z } from "zod";

export const createCustomDatasetDtoSchema = z.object({
  name: z.string().min(1).max(255),
});
export type CreateCustomDatasetDto = z.infer<
  typeof createCustomDatasetDtoSchema
>;

export const updateCustomDatasetDtoSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  isPublic: z.boolean().optional(),
});
export type UpdateCustomDatasetDto = z.infer<
  typeof updateCustomDatasetDtoSchema
>;

export interface CustomDataset {
  id: string;
  roundId: string;
  name: string;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
  rowCount: number;
}
