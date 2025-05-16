import z from 'zod';

export interface CustomApplicationField {
  name: string;
  description: string;
  type: "text" | "textarea" | "url" | "number" | "date"; // Example types
  required: boolean;
  isPublic: boolean; // Determines if the field value is visible to non-admins before results
}

export interface ApplicationFormat {
  customFields: CustomApplicationField[];
}

export interface VotingConfiguration {
  maxVotesPerVoter: number;
  maxVotesPerProjectPerVoter: number;
  allowedVoters: string[]; // List of ETH addresses
}

export const roundPublicFieldsSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string().nullable(),
  applicationPeriodStart: z.date(),
  applicationPeriodEnd: z.date(),
  votingPeriodStart: z.date(),
  votingPeriodEnd: z.date(),
  resultsPeriodStart: z.date(),
  applicationFormat: z.object({
    customFields: z.array(z.object({
      name: z.string(),
      description: z.string(),
      type: z.enum(["text", "textarea", "url", "number", "date"]),
      required: z.boolean(),
      isPublic: z.boolean(),
    })),
  }),
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
  adminWalletAddresses: z.array(z.string()).nonempty(), // Array of wallet addresses
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
  applicationFormat: z.object({
    customFields: z.array(z.object({
      name: z.string(),
      description: z.string(),
      type: z.enum(["text", "textarea", "url", "number", "date"]),
      required: z.boolean(),
      isPublic: z.boolean(),
    })),
  }),
  votingConfig: z.object({
    maxVotesPerVoter: z.number().int().positive(),
    maxVotesPerProjectPerVoter: z.number().int().positive(),
    allowedVoters: z.array(z.string()).nonempty(),
  }),
  adminWalletAddresses: z.array(z.string()).nonempty(), // Array of wallet addresses
});
export type CreateRoundDto = z.infer<typeof createRoundDtoSchema>;

export const patchRoundDtoSchema = createRoundDtoSchema.partial();
export type PatchRoundDto = z.infer<typeof patchRoundDtoSchema>;
