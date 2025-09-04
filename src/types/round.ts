import z from "zod";
import type { ApplicationCategory } from "./applicationCategory.ts";
import { cid } from 'is-ipfs';

export const roundStateSchema = z.union([
  z.literal("pending-intake"),
  z.literal("intake"),
  z.literal("pending-voting"),
  z.literal("voting"),
  z.literal("pending-results"),
  z.literal("results"),
]);
export type RoundState = z.infer<typeof roundStateSchema>;

export const possibleColorSchema = z.union([
  z.literal('#27C537'),
  z.literal('#FF5F5F'),
  z.literal('#5FB2FF'),
  z.literal('#9A5E27'),
  z.literal('#9B5DFF'),
  z.literal('#FF84DC'),
  z.literal('#FFA24B'),
  z.literal('#27939A'),
  z.literal('#FFAB99'),
  z.literal('#FF7020'),
  z.literal('#FFC120'),
  z.literal('#BD4139'),
  z.literal('#5555FF'),
  z.literal('#BBA781'),
  z.literal('#9BD226'),
]);
export type PossibleColor = z.infer<typeof possibleColorSchema>;

export type Round<IsPublished extends boolean> = {
  id: string;
  published: IsPublished;
  chainId: number;
  emoji: string;
  color: string;
  urlSlug: IsPublished extends true ? string : string | null;
  state: IsPublished extends true ? RoundState : null;
  name: IsPublished extends true ? string : string | null;
  customAvatarCid: string | null;
  description: string | null;
  applicationPeriodStart: IsPublished extends true ? Date : Date | null;
  applicationPeriodEnd: IsPublished extends true ? Date : Date | null;
  votingPeriodStart: IsPublished extends true ? Date : Date | null;
  votingPeriodEnd: IsPublished extends true ? Date : Date | null;
  resultsPeriodStart: IsPublished extends true ? Date : Date | null;
  maxVotesPerVoter: IsPublished extends true ? number : number | null;
  maxVotesPerProjectPerVoter: IsPublished extends true ? number : number | null;
  voterGuidelinesLink: string | null;
  createdByUser: {
    walletAddress: string;
    id: string;
  };
  createdAt: Date;
  updatedAt: Date;
  resultsCalculated: boolean;
  resultsPublished: boolean;
  /** Whether the requesting user is an admin of the round */
  isAdmin: boolean;
  /** Whether the requesting user is a voter in the round */
  isVoter: boolean;
  linkedDripLists: string[];
  applicationCategories: ApplicationCategory[];
  validation: IsPublished extends true ? null : {
    scheduleValid: boolean;
    applicationFormValid: boolean;
    readyToPublish: boolean;
  }
  adminCount: number | null;
}

export const createRoundDtoSchema = z.object({
  draft: z.literal(true),
  emoji: z.string().emoji(),
  chainId: z.number().int().positive(),
  color: possibleColorSchema,
  name: z.string().min(1).max(255).nullable(),
  customAvatarCid: z.custom<string>(cid).nullable(),
  urlSlug: z.string().max(255).regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "URL slug must be URL-safe",
  ).transform((val) => val.toLowerCase()).nullable(),
  description: z.string().max(10000).nullable(),
  applicationPeriodStart: z.string().refine(
    (date) => !isNaN(Date.parse(date)),
    {
      message: "Invalid date format for applicationPeriodStart",
    },
  ).nullable(),
  applicationPeriodEnd: z.string().refine((date) => !isNaN(Date.parse(date)), {
    message: "Invalid date format for applicationPeriodEnd",
  }).nullable(),
  votingPeriodStart: z.string().refine((date) => !isNaN(Date.parse(date)), {
    message: "Invalid date format for votingPeriodStart",
  }).nullable(),
  votingPeriodEnd: z.string().refine((date) => !isNaN(Date.parse(date)), {
    message: "Invalid date format for votingPeriodEnd",
  }).nullable(),
  resultsPeriodStart: z.string().refine((date) => !isNaN(Date.parse(date)), {
    message: "Invalid date format for resultsPeriodStart",
  }).nullable(),
  maxVotesPerVoter: z.number().int().positive().nullable(),
  maxVotesPerProjectPerVoter: z.number().int().positive().nullable(),
  voterGuidelinesLink: z.string().url().max(255).nullable(),
});
export type CreateRoundDto = z.infer<typeof createRoundDtoSchema>;

export const patchRoundDtoSchema = createRoundDtoSchema.partial().omit({
  draft: true,
  chainId: true,
});
export type PatchRoundDto = z.infer<typeof patchRoundDtoSchema>;

export const linkDripListsToRoundDtoSchema = z.object({
  dripListAccountIds: z.string().array(),
});
