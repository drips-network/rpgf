import { z } from "zod";

export const ballotSchema = z.record(z.string().uuid(), z.number().int().min(0));
export type Ballot = z.infer<typeof ballotSchema>;

export const submitBallotDtoSchema = z.object({
  ballot: ballotSchema,
  signature: z.string().min(1, "Signature is required"),
  chainId: z.number().int().positive("Chain ID must be a positive integer"),
});
export type SubmitBallotDto = z.infer<typeof submitBallotDtoSchema>;

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
