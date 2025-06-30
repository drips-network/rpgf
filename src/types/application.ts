import { z } from "zod";
import { ApplicationFormat } from "./round.ts";
import mapFilterUndefined from "../utils/mapFilterUndefined.ts";
import { InferSelectModel } from "drizzle-orm/table";
import { applications } from "../db/schema.ts";

export const applicationStateSchema = z.enum(["pending", "approved", "rejected"]);
export type ApplicationState = z.infer<typeof applicationStateSchema>;

function buildDynamicApplicatonFieldSchema(applicationFormat: ApplicationFormat, withPrivateFields = true) {
  const fillableFields = applicationFormat.filter((f) => 'slug' in f);

  const fields = Object.fromEntries(mapFilterUndefined(fillableFields, (field) => {
    let fieldSchema;
    
    if (!withPrivateFields && field.private) return undefined;

    switch (field.type) {
      case "text":
      case "textarea":
        fieldSchema = z.string().min(1).max(255);
        break;
      case "url":
        fieldSchema = z.string().url();
        break;
      case "email":
        fieldSchema = z.string().email();
        break;
      case "list":
        fieldSchema = z.array(
          z.record(z.string(), z.union([z.string(), z.number()]))
        ).max(field.maxItems);
        break;
      case "select":
        fieldSchema = field.allowMultiple ? z.array(z.string()) : z.string();
        break;
      default:
        return undefined;
    }

    if (!fieldSchema) return undefined;

    if (!field.required) fieldSchema = fieldSchema.optional();

    return [field.slug, fieldSchema];
  }));

  return z.object(fields);
}

export const createApplicationDtoSchema = (applicationFormat: ApplicationFormat, withPrivateFields = true) => z.object({
  projectName: z.string().min(1).max(255),
  dripsAccountId: z.string().min(1).max(255),
  attestationUID: z.string().min(1).max(255).optional(),
  fields: buildDynamicApplicatonFieldSchema(applicationFormat, withPrivateFields),
});
export type CreateApplicationDto = z.infer<ReturnType<typeof createApplicationDtoSchema>>;

export const applicationReviewDtoSchema = z.array(z.object({
  applicationId: z.string(),
  decision: z.enum(["approve", "reject"]),
}));
export type ApplicationReviewDto = z.infer<typeof applicationReviewDtoSchema>;

export type Application = InferSelectModel<typeof applications>;
