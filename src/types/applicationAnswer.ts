import { z } from "zod";
import { ApplicationEmailField, ApplicationListField, ApplicationSelectField, ApplicationTextAreaField, ApplicationTextField, ApplicationUrlField } from "./applicationForm.ts";

export type ApplicationUrlAnswer = {
  type: "url";
  fieldId: string;
  field: ApplicationUrlField;
  url: string | null;
}
export const applicationUrlAnswerDtoSchema = z.object({
  fieldId: z.string().min(1).max(255),
  value: z.string().max(2000).url().nullable(),
});

export type ApplicationTextAnswer = {
  type: "text";
  fieldId: string;
  field: ApplicationTextField | ApplicationTextAreaField;
  text: string | null;
}
export const applicationTextAnswerDtoSchema = z.object({
  fieldId: z.string().min(1).max(255),
  value: z.string().max(10000).nullable(),
});

export type ApplicationEmailAnswer = {
  type: "email";
  fieldId: string;
  field: ApplicationEmailField;
  email: string | null;
}
export const applicationEmailAnswerDtoSchema = z.object({
  fieldId: z.string().min(1).max(255),
  value: z.string().max(255).email().nullable(),
});

export type ApplicationListAnswer = {
  type: "list";
  fieldId: string;
  field: ApplicationListField;
  entries: Record<string, string | number>[] | null;
}
export const applicationListAnswerDtoSchema = z.object({
  fieldId: z.string().min(1).max(255),
  value: z.array(z.record(z.union([z.string().max(1000), z.number()]))).max(100).nullable(),
});

export type ApplicationSelectAnswer = {
  type: "select";
  fieldId: string;
  field: ApplicationSelectField;
  selected: string[] | null;
}
export const applicationSelectAnswerDtoSchema = z.object({
  fieldId: z.string().min(1).max(255),
  value: z.array(z.string().min(1).max(255)).max(100).nullable(),
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
