import { z } from "zod";

export const ballotSchema = z.record(z.string().uuid(), z.number().int().positive());
export type Ballot = z.infer<typeof ballotSchema>;

export const submitBallotDtoSchema = z.object({
  ballot: ballotSchema,
});
export type SubmitBallotDto = z.infer<typeof submitBallotDtoSchema>;

export type WrappedBallot = {
  id: string;
  voter: {
    id: string;
    walletAddress: string;
  } 
  ballot: Ballot;
  createdAt: Date;
  updatedAt: Date;
}
