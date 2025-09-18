import { z } from "zod";
import { ApplicationEmailField, ApplicationListField, ApplicationSelectField, ApplicationTextAreaField, ApplicationTextField, ApplicationUrlField } from "./applicationForm.ts";

export type ApplicationUrlAnswer = {
  type: "url";
  fieldId: string;
  field: ApplicationUrlField;
  url: string;
}
export const applicationUrlAnswerDtoSchema = z.object({
  fieldId: z.string().min(1).max(255),
  value: z.string().max(2000).url(),
});

export type ApplicationTextAnswer = {
  type: "text";
  fieldId: string;
  field: ApplicationTextField | ApplicationTextAreaField;
  text: string;
}
export const applicationTextAnswerDtoSchema = z.object({
  fieldId: z.string().min(1).max(255),
  value: z.string().max(5000),
});

export type ApplicationEmailAnswer = {
  type: "email";
  fieldId: string;
  field: ApplicationEmailField;
  email: string;
}
export const applicationEmailAnswerDtoSchema = z.object({
  fieldId: z.string().min(1).max(255),
  value: z.string().max(255).email(),
});

export type ApplicationListAnswer = {
  type: "list";
  fieldId: string;
  field: ApplicationListField;
  entries: Record<string, string | number>[];
}
export const applicationListAnswerDtoSchema = z.object({
  fieldId: z.string().min(1).max(255),
  value: z.array(z.record(z.union([z.string().max(1000), z.number()]))).max(100),
});

export type ApplicationSelectAnswer = {
  type: "select";
  fieldId: string;
  field: ApplicationSelectField;
  selected: string[];
}
export const applicationSelectAnswerDtoSchema = z.object({
  fieldId: z.string().min(1).max(255),
  value: z.array(z.string().min(1).max(255)).max(100),
});

export type ApplicationAnswer =
  ApplicationUrlAnswer |
  ApplicationTextAnswer |
  ApplicationEmailAnswer |
  ApplicationListAnswer |
  ApplicationSelectAnswer;

export const applicationAnswerDtoSchema = z.array(z.union([
  applicationUrlAnswerDtoSchema,
  applicationTextAnswerDtoSchema,
  applicationEmailAnswerDtoSchema,
  applicationListAnswerDtoSchema,
  applicationSelectAnswerDtoSchema,
]));
export type ApplicationAnswerDto = z.infer<typeof applicationAnswerDtoSchema>;
