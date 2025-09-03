import { z } from "zod";
import { ethereumAddressSchema } from "./shared.ts";

export type RoundVoter = {
  walletAddress: string;
  id: string;
}

export const setRoundVotersDtoSchema = z.object({
  walletAddresses: z.array(ethereumAddressSchema).max(100000, "A maximum of 100000 wallet addresses can be added at once"),
});
export type SetRoundVotersDto = z.infer<typeof setRoundVotersDtoSchema>;
