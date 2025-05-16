import z from 'zod';
import { ethereumAddressSchema } from "./shared.ts";

// Simply just renders some markdown content in the application form
export const applicationMarkdownFieldSchema = z.object({
  type: z.literal("markdown"),
  content: z.string().min(1).max(50000),
});

// Displays a horizontal line in the application form
export const applicationDividerFieldSchema = z.object({
  type: z.literal("divider"),
});

// Displays as a standard text field
export const applicationTextFieldSchema = z.object({
  type: z.literal("text"),
  private: z.boolean(),
  label: z.string().min(1).max(255),
  descriptionMd: z.string().max(10000).optional(),
});

// Displays as a standard text area
export const applicationTextAreaFieldSchema = z.object({
  type: z.literal("textarea"),
  private: z.boolean(),
  label: z.string().min(1).max(255),
  descriptionMd: z.string().max(10000).optional(),
});

// Displays as a text field that validates for a valid URL
export const applicationUrlFieldSchema = z.object({
  type: z.literal("url"),
  private: z.boolean(),
  label: z.string().min(1).max(255),
  descriptionMd: z.string().max(10000).optional(),
});

// Displays as a text field that validates for a valid email
export const applicationEmailFieldSchema = z.object({
  type: z.literal("email"),
  private: z.boolean(),
  label: z.string().min(1).max(255),
  descriptionMd: z.string().max(10000).optional(),
});

// Allows building a list of entries, where each entry has all the fields defined in entryFields
export const applicationListFieldSchema = z.object({
  type: z.literal("list"),
  private: z.boolean(),
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

// Displays as a ListSelect component, either multi- or single-select
export const applicationSelectFieldSchema = z.object({
  type: z.literal("dropdown"),
  private: z.boolean(),
  label: z.string().min(1).max(255),
  descriptionMd: z.string().max(10000).optional(),
  options: z.array(z.object({
    label: z.string().min(1).max(255),
    value: z.string().min(1).max(255),
  })),
  allowMultiple: z.boolean().optional(),
});

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

const applicationFormatSchema = z.array(applicationFieldSchema).max(50);
export type ApplicationFormat = z.infer<typeof applicationFormatSchema>;

export const roundPublicFieldsSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string().nullable(),
  applicationPeriodStart: z.date(),
  applicationPeriodEnd: z.date(),
  votingPeriodStart: z.date(),
  votingPeriodEnd: z.date(),
  resultsPeriodStart: z.date(),
  applicationFormat: applicationFormatSchema,
  votingConfig: z.object({
    maxVotesPerVoter: z.number().int().positive(),
    maxVotesPerProjectPerVoter: z.number().int().positive(),
  }),
  createdByUserId: z.number(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type RoundPublicFields = z.infer<typeof roundPublicFieldsSchema>;

export const roundAdminFieldsSchema = roundPublicFieldsSchema.extend({
  votingConfig: z.object({
    maxVotesPerVoter: z.number().int().positive(),
    maxVotesPerProjectPerVoter: z.number().int().positive(),
    allowedVoters: z.array(z.string()).nonempty(),
  }),
  adminWalletAddresses: z.array(ethereumAddressSchema).nonempty(), // Array of wallet addresses
});
export type RoundAdminFields = z.infer<typeof roundAdminFieldsSchema>;

export const createRoundDtoSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(10000).optional(),
  applicationPeriodStart: z.string().refine((date) => !isNaN(Date.parse(date)), {
    message: "Invalid date format for applicationPeriodStart",
  }),
  applicationPeriodEnd: z.string().refine((date) => !isNaN(Date.parse(date)), {
    message: "Invalid date format for applicationPeriodEnd",
  }),
  votingPeriodStart: z.string().refine((date) => !isNaN(Date.parse(date)), {
    message: "Invalid date format for votingPeriodStart",
  }),
  votingPeriodEnd: z.string().refine((date) => !isNaN(Date.parse(date)), {
    message: "Invalid date format for votingPeriodEnd",
  }),
  resultsPeriodStart: z.string().refine((date) => !isNaN(Date.parse(date)), {
    message: "Invalid date format for resultsPeriodStart",
  }),
  applicationFormat: applicationFormatSchema,
  votingConfig: z.object({
    maxVotesPerVoter: z.number().int().positive(),
    maxVotesPerProjectPerVoter: z.number().int().positive(),
    allowedVoters: z.array(ethereumAddressSchema).nonempty(),
  }),
  adminWalletAddresses: z.array(ethereumAddressSchema).nonempty(), // Array of wallet addresses
});
export type CreateRoundDto = z.infer<typeof createRoundDtoSchema>;

export const patchRoundDtoSchema = createRoundDtoSchema.partial();
export type PatchRoundDto = z.infer<typeof patchRoundDtoSchema>;
