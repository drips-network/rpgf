import {
  pgTable,
  serial,
  varchar,
  text,
  timestamp,
  integer,
  jsonb,
  primaryKey,
  uuid,
  uniqueIndex,
  AnyPgColumn,
  boolean,
  pgEnum,
} from "drizzle-orm/pg-core";
import { PossibleColor } from "$app/types/round.ts";
import type { ApplicationState } from "$app/types/application.ts";
import { isNull, relations, SQL, sql } from "drizzle-orm";
import { SubmitBallotDto } from "../types/ballot.ts";
import { ProjectData } from "../gql/projects.ts";
import { ApplicationFormFields } from "../types/applicationForm.ts";
import { AuditLogAction, AuditLogKycProviderActor, AuditLogSystemActor, AuditLogUserActor } from "../types/auditLog.ts";
import { KycProvider, KycStatus, KycType } from "../types/kyc.ts";

export function lower(email: AnyPgColumn): SQL {
  return sql`lower(${email})`;
}

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  walletAddress: varchar("wallet_address", { length: 42 }).notNull().unique(),
  /** Whether the user is whitelisted for creating new round drafts, required if REQUIRE_WHITELIST_FOR_CREATING_ROUNDS in env is true */
  whitelisted: boolean("whitelisted").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => sql`(CURRENT_TIMESTAMP)`).notNull(),
});

export const nonces = pgTable("nonces", {
  nonce: varchar("nonce", { length: 255 }).primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const refreshTokens = pgTable("refresh_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  token: varchar("token", { length: 510 }).notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  revoked: boolean("revoked").notNull().default(false),
});

type EasConfig = {
  easAddress: string;
  applicationAttestationSchemaUID: string;
  applicationReviewAttestationSchemaUID: string;
}

export const chains = pgTable("chains", {
  id: serial("id").primaryKey(),
  chainId: integer("chain_id").notNull(),
  gqlName: varchar("gql_name", { length: 255 }).notNull(),
  attestationSetup: jsonb("attestation_setup").$type<EasConfig>(), // if null, attestations not required on given chain
  whitelistMode: boolean("whitelist_mode").notNull().default(true),
  rpcUrl: varchar("rpc_url", { length: 255 }).notNull(),
});

export const kycStatus = pgEnum('kyc_status', [
  'CREATED',
  'UNDER_REVIEW',
  'NEEDS_ADDITIONAL_INFORMATION',
  'ACTIVE',
  'REJECTED',
  'DEACTIVATED'
]);

export const kycProvider = pgEnum('kyc_provider', [
  'Fern',
]);

export const kycType = pgEnum('kyc_type', [
  'INDIVIDUAL',
  'BUSINESS',
]);

export const rounds = pgTable("rounds", {
  id: uuid("id").primaryKey().defaultRandom(),
  chainId: integer("chain_id").notNull().references(() => chains.id),
  urlSlug: varchar("url_slug", { length: 255 }).unique(),
  published: boolean("published").notNull().default(false),
  name: varchar("name", { length: 255 }),
  emoji: varchar("emoji", { length: 255 }).notNull(),
  color: varchar("color", { length: 255 }).notNull().$type<PossibleColor>(),
  description: text("description"),
  applicationPeriodStart: timestamp("application_period_start", {
    withTimezone: true,
  }),
  applicationPeriodEnd: timestamp("application_period_end", {
    withTimezone: true,
  }),
  votingPeriodStart: timestamp("voting_period_start", {
    withTimezone: true,
  }),
  votingPeriodEnd: timestamp("voting_period_end", {
    withTimezone: true,
  }),
  resultsPeriodStart: timestamp("results_period_start", {
    withTimezone: true,
  }),
  maxVotesPerVoter: integer("max_votes_per_voter"),
  maxVotesPerProjectPerVoter: integer("max_votes_per_project_per_voter"),
  voterGuidelinesLink: varchar("voter_guidelines_link", { length: 255 }),
  createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  publishedByUserId: uuid("published_by_user_id").references(() => users.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
  resultsCalculated: boolean("results_calculated").notNull().default(false),
  resultsPublished: boolean("results_published").notNull().default(false),
  customAvatarCid: varchar("custom_avatar_cid", { length: 255 }),
  kycProvider: kycProvider("kyc_provider").$type<KycProvider>(),
}, (table => [
  uniqueIndex('url_slug_unique_index').on(lower(table.urlSlug)),
]
));
export const roundsRelations = relations(rounds, ({ one, many }) => ({
  chain: one(chains, { fields: [rounds.chainId], references: [chains.id] }),
  createdBy: one(users, { fields: [rounds.createdByUserId], references: [users.id] }),
  applications: many(applications),
  admins: many(roundAdmins),
  voters: many(roundVoters),
  ballots: many(ballots),
  linkedDripLists: many(linkedDripLists),
  applicationForms: many(applicationForms),
  applicationCategories: many(applicationCategories),
  results: many(results),
}));

export const roundAdmins = pgTable("round_admins", {
  roundId: uuid("round_id").references(() => rounds.id).notNull(),
  userId: uuid("user_id").notNull().references(() => users.id),
  assignedAt: timestamp("assigned_at", { withTimezone: true }).defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.roundId, table.userId] }),
]);
export const roundAdminsRelations = relations(roundAdmins, ({ one }) => ({
  round: one(rounds, { fields: [roundAdmins.roundId], references: [rounds.id] }),
  user: one(users, { fields: [roundAdmins.userId], references: [users.id] }),
}));

export const roundVoters = pgTable("round_voters", {
  roundId: uuid("round_id").notNull(),
  userId: uuid("user_id").notNull(),
  assignedAt: timestamp("assigned_at", { withTimezone: true }).defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.roundId, table.userId] }),
]);
export const roundVotersRelations = relations(roundVoters, ({ one }) => ({
  user: one(users, { fields: [roundVoters.userId], references: [users.id] }),
  round: one(rounds, { fields: [roundVoters.roundId], references: [rounds.id] }),
}));

export const applicationCategories = pgTable("application_categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  roundId: uuid("round_id").references(() => rounds.id).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  applicationFormId: uuid("application_form_id").notNull().references(() => applicationForms.id),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex('application_category_name_unique_index')
    .on(table.roundId, lower(table.name))
    .where(isNull(table.deletedAt)),
]);
export const applicationCategoriesRelations = relations(applicationCategories, ({ one }) => ({
  round: one(rounds, { fields: [applicationCategories.roundId], references: [rounds.id] }),
  form: one(applicationForms, { fields: [applicationCategories.applicationFormId], references: [applicationForms.id] }),
}));

export const applicationForms = pgTable("application_forms", {
  id: uuid("id").primaryKey().defaultRandom(),
  roundId: uuid("round_id").references(() => rounds.id).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
});
export const applicationFormsRelations = relations(applicationForms, ({ one, many }) => ({
  round: one(rounds, { fields: [applicationForms.roundId], references: [rounds.id] }),
  fields: many(applicationFormFields),
}));

export const applicationFormFields = pgTable("application_form_fields", {
  id: uuid("id").primaryKey().defaultRandom(),
  formId: uuid("form_id").notNull().references(() => applicationForms.id),
  type: varchar("type", { length: 255 }).notNull().$type<ApplicationFormFields[number]['type']>(),
  slug: varchar("slug", { length: 255 }),
  order: integer("order").notNull(),
  required: boolean("required"),
  private: boolean("private"),
  properties: jsonb("properties").notNull().$type<ApplicationFormFields[number]>(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [
  uniqueIndex('form_field_slug_unique_index').on(table.formId, lower(table.slug)).where(sql`${table.deletedAt} IS NULL`),
]);
export const applicationFormFieldsRelations = relations(applicationFormFields, ({ one }) => ({
  form: one(applicationForms, { fields: [applicationFormFields.formId], references: [applicationForms.id] }),
}));

export const applications = pgTable("applications", {
  id: uuid("id").primaryKey().defaultRandom(),
  state: varchar("state", { length: 255 }).notNull().default("pending").$type<ApplicationState>(),
  projectName: varchar("project_name", { length: 255 }).notNull(),
  easAttestationUID: varchar("attestation_uid", { length: 255 }),
  dripsAccountId: varchar("drips_account_id", { length: 255 }).notNull(),
  dripsProjectDataSnapshot: jsonb("drips_project_data_snapshot").$type<ProjectData>().notNull(),
  submitterUserId: uuid("submitter").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
  roundId: uuid("round_id").notNull().references(() => rounds.id),
  formId: uuid("form_id").notNull().references(() => applicationForms.id),
  categoryId: uuid("category_id").references(() => applicationCategories.id).notNull(),
});
export const applicationsRelations = relations(applications, ({ one, many }) => ({
  round: one(rounds, { fields: [applications.roundId], references: [rounds.id] }),
  submitter: one(users, { fields: [applications.submitterUserId], references: [users.id] }),
  result: one(results),
  answers: many(applicationAnswers),
  form: one(applicationForms, { fields: [applications.formId], references: [applicationForms.id] }),
  category: one(applicationCategories, { fields: [applications.categoryId], references: [applicationCategories.id] }),
  kycRequestMapping: one(applicationKycRequests),
}));

export const applicationAnswers = pgTable("application_answers", {
  applicationId: uuid("application_id").notNull().references(() => applications.id),
  fieldId: uuid("field_id").notNull().references(() => applicationFormFields.id),
  answer: jsonb("answer").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  primaryKey({ columns: [table.applicationId, table.fieldId] }),
]);
export const applicationAnswersRelations = relations(applicationAnswers, ({ one }) => ({
  application: one(applications, { fields: [applicationAnswers.applicationId], references: [applications.id] }),
  field: one(applicationFormFields, { fields: [applicationAnswers.fieldId], references: [applicationFormFields.id] }),
}));

export const ballots = pgTable("ballots", {
  id: uuid("id").primaryKey().defaultRandom(),
  roundId: uuid("round_id").notNull().references(() => rounds.id),
  voterUserId: uuid("voter_user_id").notNull().references(() => users.id),
  ballot: jsonb("ballot").notNull().$type<SubmitBallotDto['ballot']>(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
});
export const votesRelations = relations(ballots, ({ one }) => ({
  round: one(rounds, { fields: [ballots.roundId], references: [rounds.id] }),
  user: one(users, { fields: [ballots.voterUserId], references: [users.id] }),
}));

export const linkedDripLists = pgTable("linked_drip_lists", {
  roundId: uuid("round_id").notNull().references(() => rounds.id),
  dripListAccountId: varchar("drip_list_id", { length: 255 }).notNull(),
}, (table) => [
  primaryKey({ columns: [table.roundId, table.dripListAccountId] }),
]
);
export const linkedDripListsRelations = relations(linkedDripLists, ({ one }) => ({
  round: one(rounds, { fields: [linkedDripLists.roundId], references: [rounds.id] }),
}));

// After voting is closed, admins can calculate results using different methods. The resulting allocations are
// stored in this table for later retrieval and analysis.
export const results = pgTable("results", {
  roundId: uuid("round_id").notNull().references(() => rounds.id),
  applicationId: uuid("application_id").notNull().references(() => applications.id),
  method: varchar("method", { length: 255 }).notNull().$type<'median' | 'avg' | 'sum'>(),
  result: integer("result").notNull(),
  calculatedAt: timestamp("calculated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table => [
  primaryKey({ columns: [table.roundId, table.applicationId] }),
]));
export const resultsRelations = relations(results, ({ one }) => ({
  round: one(rounds, { fields: [results.roundId], references: [rounds.id] }),
  application: one(applications, { fields: [results.applicationId], references: [applications.id] }),
}));

export const auditLogAction = pgEnum('audit_log_action', [
  'round_created',
  'round_settings_changed',
  'round_admins_changed',
  'round_voters_changed',
  'round_published',
  'round_deleted',
  'application_category_created',
  'application_category_updated',
  'application_category_deleted',
  'application_form_created',
  'application_form_updated',
  'application_form_deleted',
  'application_submitted',
  'application_reviewed',
  'ballot_submitted',
  'ballot_updated',
  'results_calculated',
  'linked_drip_lists_edited',
  'results_published',
  'kyc_request_created',
  'kyc_request_linked_to_application',
  'kyc_request_updated',
]);

export type DbAuditLogActor =
  | Omit<AuditLogUserActor, 'walletAddress'>
  | AuditLogSystemActor
  | AuditLogKycProviderActor;

export const auditLogs = pgTable("audit_logs", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  action: auditLogAction("action").notNull().$type<AuditLogAction>(),
  actor: jsonb("actor").notNull().$type<DbAuditLogActor>(),
  userId: uuid("user_id").references(() => users.id),
  roundId: uuid("round_id"),
  payload: jsonb("payload"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  user: one(users, { fields: [auditLogs.userId], references: [users.id] }),
}));

export const kycRequests = pgTable("kyc_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  status: kycStatus("status").notNull().default('CREATED').$type<KycStatus>(),
  roundId: uuid("round_id").notNull().references(() => rounds.id),
  kycEmail: varchar("kyc_email", { length: 255 }).notNull(),
  kycType: kycType("kyc_type").notNull().$type<KycType>(),
  kycProvider: kycProvider("kyc_provider").notNull().$type<KycProvider>(),
  kycFormUrl: varchar("kyc_form_url", { length: 510 }).notNull(),
  providerUserId: varchar("provider_user_id", { length: 255 }).notNull(),
  providerOrgId: varchar("provider_org_id", { length: 255 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
});
export const kycRequestsRelations = relations(kycRequests, ({ one }) => ({
  round: one(rounds, { fields: [kycRequests.roundId], references: [rounds.id] }),
  user: one(users, { fields: [kycRequests.userId], references: [users.id] }),
}));

export const applicationKycRequests = pgTable("application_kyc_requests", {
  applicationId: uuid("application_id").notNull().unique().references(() => applications.id),
  kycRequestId: uuid("kyc_request_id").notNull().references(() => kycRequests.id),
}, (table) => [
  primaryKey({ columns: [table.applicationId, table.kycRequestId] }),
]);
export const applicationKycRequestsRelations = relations(applicationKycRequests, ({ one }) => ({
  application: one(applications, { fields: [applicationKycRequests.applicationId], references: [applications.id] }),
  kycRequest: one(kycRequests, { fields: [applicationKycRequests.kycRequestId], references: [kycRequests.id] }),
}));
