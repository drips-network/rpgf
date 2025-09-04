import { z } from "zod";
import { ethereumAddressSchema } from "./shared.ts";

export type RoundAdmin = {
  walletAddress: string;
  id: string;
}

export const setRoundAdminsDtoSchema = z.object({
  walletAddresses: z.array(ethereumAddressSchema).min(1, "At least one wallet address is required").max(100000, "A maximum of 100000 wallet addresses can be added at once"),
});
export type SetRoundAdminsDto = z.infer<typeof setRoundAdminsDtoSchema>;
