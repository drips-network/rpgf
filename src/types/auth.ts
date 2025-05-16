import type { SiweMessage } from "siwe"; // Assuming SiweMessage type is available from the 'siwe' import alias
import type { Payload as DjwtPayload } from "djwt"; // Corrected from JwtPayload to Payload

export interface SiweVerifyRequest {
  message: Partial<SiweMessage>;
  signature: string;
}

export interface AppJwtPayload extends DjwtPayload {
  walletAddress: string;
  userId: number;
}

export interface AuthenticatedUserState {
  walletAddress: string;
  userId: number;
}
