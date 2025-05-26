import { z } from "zod";

export const ballotSchema = z.record(z.string().uuid(), z.number().int().positive());
export type Ballot = z.infer<typeof ballotSchema>;

export const submitBallotDtoSchema = z.object({
  roundId: z.string(),
  ballot: ballotSchema,
});
export type SubmitBallotDto = z.infer<typeof submitBallotDtoSchema>;

export type WrappedBallot = {
  id: string;
  roundId: string;
  ballot: Ballot;
}
