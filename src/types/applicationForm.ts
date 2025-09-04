import { z } from "zod";

// Simply just renders some markdown content in the application form
export const applicationMarkdownFieldSchema = z.object({
  id: z.string().min(1).max(255).optional(),
  type: z.literal("markdown"),
  content: z.string().min(1).max(50000),
});
export type ApplicationMarkdownField = z.infer<typeof applicationMarkdownFieldSchema>;

// Displays a horizontal line in the application form
export const applicationDividerFieldSchema = z.object({
  id: z.string().min(1).max(255).optional(),
  type: z.literal("divider"),
});
export type ApplicationDividerField = z.infer<typeof applicationDividerFieldSchema>;

// Displays as a standard text field
export const applicationTextFieldSchema = z.object({
  id: z.string().min(1).max(255).optional(),
  type: z.literal("text"),
  private: z.boolean(),
  required: z.boolean(),
  slug: z.string().min(1).max(255),
  label: z.string().min(1).max(255),
  descriptionMd: z.string().max(10000).optional(),
});
export type ApplicationTextField = z.infer<typeof applicationTextFieldSchema>;

// Displays as a standard text area
export const applicationTextAreaFieldSchema = z.object({
  id: z.string().min(1).max(255).optional(),
  type: z.literal("textarea"),
  private: z.boolean(),
  required: z.boolean(),
  slug: z.string().min(1).max(255),
  label: z.string().min(1).max(255),
  descriptionMd: z.string().max(10000).optional(),
});
export type ApplicationTextAreaField = z.infer<typeof applicationTextAreaFieldSchema>;

// Displays as a text field that validates for a valid URL
export const applicationUrlFieldSchema = z.object({
  id: z.string().min(1).max(255).optional(),
  type: z.literal("url"),
  private: z.boolean(),
  required: z.boolean(),
  slug: z.string().min(1).max(255),
  label: z.string().min(1).max(255),
  descriptionMd: z.string().max(10000).optional(),
});
export type ApplicationUrlField = z.infer<typeof applicationUrlFieldSchema>;

// Displays as a text field that validates for a valid email
export const applicationEmailFieldSchema = z.object({
  id: z.string().min(1).max(255).optional(),
  type: z.literal("email"),
  private: z.boolean(),
  required: z.boolean(),
  slug: z.string().min(1).max(255),
  label: z.string().min(1).max(255),
  descriptionMd: z.string().max(10000).optional(),
});
export type ApplicationEmailField = z.infer<typeof applicationEmailFieldSchema>;

// Allows building a list of entries, where each entry has all the fields defined in entryFields
export const applicationListFieldSchema = z.object({
  id: z.string().min(1).max(255).optional(),
  type: z.literal("list"),
  private: z.boolean(),
  slug: z.string().min(1).max(255),
  required: z.boolean(),
  label: z.string().min(1).max(255),
  descriptionMd: z.string().max(10000).optional(),
  maxItems: z.number().int().positive(),
  entryFields: z.array(z.union([
    z.object({
      type: z.literal("number"),
      label: z.string().min(1).max(255),
    }),
    z.object({
      type: z.literal("text"),
      label: z.string().min(1).max(255),
    }),
    z.object({
      type: z.literal("url"),
      label: z.string().min(1).max(255),
    }),
  ])),
});
export type ApplicationListField = z.infer<typeof applicationListFieldSchema>;

// Displays as a ListSelect component, either multi- or single-select
export const applicationSelectFieldSchema = z.object({
  id: z.string().min(1).max(255).optional(),
  type: z.literal("select"),
  private: z.boolean(),
  required: z.boolean(),
  slug: z.string().min(1).max(255),
  label: z.string().min(1).max(255),
  descriptionMd: z.string().max(10000).optional(),
  options: z.array(z.object({
    label: z.string().min(1).max(255),
    value: z.string().min(1).max(255),
  })),
  allowMultiple: z.boolean().optional(),
});
export type ApplicationSelectField = z.infer<typeof applicationSelectFieldSchema>;

const applicationFieldSchema = z.union([
  applicationMarkdownFieldSchema,
  applicationDividerFieldSchema,
  applicationTextFieldSchema,
  applicationTextAreaFieldSchema,
  applicationUrlFieldSchema,
  applicationEmailFieldSchema,
  applicationListFieldSchema,
  applicationSelectFieldSchema,
]);
export type ApplicationField = z.infer<typeof applicationFieldSchema>;

const applicationFormFields = z.array(applicationFieldSchema).max(50);
export type ApplicationFormFields = z.infer<typeof applicationFormFields>;

export const applicationFormSchema = z.object({
  id: z.string().min(1).max(255),
  name: z.string().min(1).max(255),
  fields: applicationFormFields,
});
export type ApplicationForm = z.infer<typeof applicationFormSchema>;

export const createApplicationFormDtoSchema = z.object({
  name: z.string().min(1).max(255),
  fields: applicationFormFields,
});
export type CreateApplicationFormDto = z.infer<typeof createApplicationFormDtoSchema>;
