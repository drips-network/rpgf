import { z } from "zod";

export const ballotSchema = z.record(z.string().uuid(), z.number().int().positive());
export type Ballot = z.infer<typeof ballotSchema>;

export const submitBallotDtoSchema = z.object({
  roundId: z.number(),
  ballot: ballotSchema,
});
export type SubmitBallotDto = z.infer<typeof submitBallotDtoSchema>;
