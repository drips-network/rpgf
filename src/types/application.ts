import { z } from "zod";
import { InferSelectModel } from "drizzle-orm/table";
import { applications } from "../db/schema.ts";

export const applicationStateSchema = z.enum(["pending", "approved", "rejected"]);
export type ApplicationState = z.infer<typeof applicationStateSchema>;

export const createApplicationDtoSchema = z.object({
  projectName: z.string().min(1).max(255),
  dripsAccountId: z.string().min(1).max(255),
  attestationUID: z.string().min(1).max(255).optional(),
  answers: z.array(z.object({
    fieldId: z.string().min(1).max(255),
    value: z.string().max(10000),
  }))
});
export type CreateApplicationDto = z.infer<typeof createApplicationDtoSchema>;

export const applicationReviewDtoSchema = z.array(z.object({
  applicationId: z.string(),
  decision: z.enum(["approve", "reject"]),
}));
export type ApplicationReviewDto = z.infer<typeof applicationReviewDtoSchema>;

export type Application = InferSelectModel<typeof applications>;
