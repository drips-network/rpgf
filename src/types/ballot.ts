import { z } from "zod";

export const ballotSchema = z.record(z.string().uuid(), z.number().int().min(0));
export type Ballot = z.infer<typeof ballotSchema>;

// Category allocation: maps categoryId -> integer percentage (0-100), must sum to 100
export const saveCategoryAllocationsDtoSchema = z.object({
  categoryPercentages: z.record(z.string().uuid(), z.number().int().min(0).max(100)),
});
export type SaveCategoryAllocationsDto = z.infer<typeof saveCategoryAllocationsDtoSchema>;

// Draft votes for a single category: maps applicationId -> integer vote count
export const saveDraftVotesDtoSchema = z.object({
  votes: z.record(z.string().uuid(), z.number().int().min(0)),
});
export type SaveDraftVotesDto = z.infer<typeof saveDraftVotesDtoSchema>;

// Final submission: server assembles ballot from drafts, client only sends signature
export const submitBallotDtoSchema = z.object({
  signature: z.string().min(1, "Signature is required"),
  chainId: z.number().int().positive("Chain ID must be a positive integer"),
});
export type SubmitBallotDto = z.infer<typeof submitBallotDtoSchema>;

// Direct ballot submission (e.g. via spreadsheet): includes full ballot inline
export const submitBallotDirectDtoSchema = z.object({
  ballot: ballotSchema,
  signature: z.string().min(1, "Signature is required"),
  chainId: z.number().int().positive("Chain ID must be a positive integer"),
});
export type SubmitBallotDirectDto = z.infer<typeof submitBallotDirectDtoSchema>;

export type WrappedBallot = {
  id: string;
  user: {
    id: string;
    walletAddress: string;
  }
  ballot: Ballot;
  signature: string | null;
  chainId: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export type CategoryAllocations = {
  categoryPercentages: Record<string, number>;
  createdAt: Date;
  updatedAt: Date;
}

export type DraftVotes = Record<string, Record<string, number>>; // categoryId -> applicationId -> voteCount
