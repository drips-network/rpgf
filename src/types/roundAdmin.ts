import { z } from "zod";
import { ethereumAddressSchema } from "./shared.ts";

export type RoundAdmin = {
  walletAddress: string;
  id: string;
  superAdmin: boolean;
}

const roundAdminInputSchema = z.object({
  walletAddress: ethereumAddressSchema,
  superAdmin: z.boolean().optional(),
});

const normalizedRoundAdminSchema = z.object({
  admins: z.array(z.object({
    walletAddress: ethereumAddressSchema,
    superAdmin: z.boolean(),
  })).min(1, "At least one wallet address is required").max(100000, "A maximum of 100000 wallet addresses can be added at once"),
});

export const setRoundAdminsDtoSchema = z.union([
  z.object({
    admins: z.array(roundAdminInputSchema).min(1, "At least one wallet address is required").max(100000, "A maximum of 100000 wallet addresses can be added at once"),
  }).transform(({ admins }) => ({
    admins: admins.map((admin) => ({
      walletAddress: admin.walletAddress,
      superAdmin: admin.superAdmin ?? false,
    })),
  })),
  z.object({
    walletAddresses: z.array(ethereumAddressSchema).min(1, "At least one wallet address is required").max(100000, "A maximum of 100000 wallet addresses can be added at once"),
    superAdminWalletAddresses: z.array(ethereumAddressSchema).max(100000, "A maximum of 100000 wallet addresses can be added at once").optional(),
  }).transform(({ walletAddresses, superAdminWalletAddresses }) => ({
    admins: walletAddresses.map((walletAddress) => ({
      walletAddress,
      superAdmin: superAdminWalletAddresses?.includes(walletAddress) ?? false,
    })),
  })),
]).pipe(normalizedRoundAdminSchema);

export type SetRoundAdminsDto = z.infer<typeof setRoundAdminsDtoSchema>;
