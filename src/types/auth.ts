import type { SiweMessage } from "siwe"; // Assuming SiweMessage type is available from the 'siwe' import alias
import type { Payload as DjwtPayload } from "djwt"; // Corrected from JwtPayload to Payload

export interface SiweVerifyRequest {
  message: Partial<SiweMessage>;
  signature: string;
}

export interface RefreshTokenJwtPayload extends DjwtPayload {
  type: "refresh";
  walletAddress: string;
  userId: string;
}

export interface AccessTokenJwtPayload extends DjwtPayload {
  type: "access";
  walletAddress: string;
  userId: string;
}

export interface AuthenticatedUserState {
  walletAddress: string;
  userId: string;
}
