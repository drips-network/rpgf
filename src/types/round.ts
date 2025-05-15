export interface CustomApplicationField {
  name: string;
  description: string;
  type: "text" | "textarea" | "url" | "number" | "date"; // Example types
  required: boolean;
  isPublic: boolean; // Determines if the field value is visible to non-admins before results
}

export interface ApplicationFormat {
  customFields: CustomApplicationField[];
}

export interface VotingConfiguration {
  maxVotesPerVoter: number;
  maxVotesPerProjectPerVoter: number;
  allowedVoters: string[]; // List of ETH addresses
}

export interface Round {
  id: number;
  name: string;
  description?: string;
  applicationPeriodStart: Date;
  applicationPeriodEnd: Date;
  votingPeriodStart: Date;
  votingPeriodEnd: Date;
  resultsPeriodStart: Date;
  applicationFormat: ApplicationFormat;
  votingConfig: VotingConfiguration;
  createdByUserId: number;
  createdAt: Date;
  updatedAt: Date;
}

// Data Transfer Object for creating a new round
// Omits id, createdByUserId (derived from auth), createdAt, updatedAt (auto-generated)
export interface CreateRoundDto {
  name: string;
  description?: string;
  applicationPeriodStart: string; // ISO Date strings from client
  applicationPeriodEnd: string;   // ISO Date strings from client
  votingPeriodStart: string;    // ISO Date strings from client
  votingPeriodEnd: string;      // ISO Date strings from client
  resultsPeriodStart: string;   // ISO Date strings from client
  applicationFormat: ApplicationFormat;
  votingConfig: VotingConfiguration;
  adminWalletAddresses: string[]; // Wallet addresses of users to be made admins for this round
}
