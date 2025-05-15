import type { SiweMessage } from "siwe"; // Assuming SiweMessage type is available from the 'siwe' import alias
import type { Payload as DjwtPayload } from "djwt"; // Corrected from JwtPayload to Payload

// Interface for the request body when verifying a SIWE signature
export interface SiweVerifyRequest {
  message: Partial<SiweMessage>; // Client sends fields of SiweMessage
  signature: string;
}

// Our application-specific JWT payload
export interface AppJwtPayload extends DjwtPayload {
  walletAddress: string;
  // Add other custom claims if needed in the future, e.g., userId, roles
}

// Structure for user information attached to context (e.g., ctx.state.user)
export interface AuthenticatedUserState {
  walletAddress: string;
  // userId?: number; // Can be added if fetched and included
}
