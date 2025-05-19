import { z } from "zod";
import { ApplicationFormat } from "./round.ts";
import mapFilterUndefined from "../utils/mapFilterUndefined.ts";
import { projectChainDataSchema } from "../gql/projects.ts";

export const applicationStateSchema = z.enum(["pending", "approved", "rejected"]);
export type ApplicationState = z.infer<typeof applicationStateSchema>;

function buildDynamicApplicatonFieldSchema(applicationFormat: ApplicationFormat) {
  const fillableFields = applicationFormat.filter((f) => 'slug' in f);

  const fields = Object.fromEntries(mapFilterUndefined(fillableFields, (field) => {
    let fieldSchema;

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
        fieldSchema = z.array(z.union([z.string(), z.number()]));
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

export const createApplicationDtoSchema = (applicationFormat: ApplicationFormat) => z.object({
  projectName: z.string().min(1).max(255),
  dripsAccountId: z.string().min(1).max(255),
  fields: buildDynamicApplicatonFieldSchema(applicationFormat),
});
export type CreateApplicationDto = z.infer<ReturnType<typeof createApplicationDtoSchema>>;

export const applicationSchema = (applicationFormat: ApplicationFormat) => z.object({
  id: z.number(),
  state: applicationStateSchema,
  projectName: z.string().min(1).max(255),
  projectDataSnapshot: projectChainDataSchema,
  dripsAccountId: z.string().min(1).max(255),
  submitterUserId: z.number(),
  roundId: z.number(),
  fields: buildDynamicApplicatonFieldSchema(applicationFormat),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type Application = z.infer<ReturnType<typeof applicationSchema>>;

export const applicationReviewDtoSchema = z.array(z.object({
  applicationId: z.number(),
  decision: z.enum(["approve", "reject"]),
}));
export type ApplicationReviewDto = z.infer<typeof applicationReviewDtoSchema>;
