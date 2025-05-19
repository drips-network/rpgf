import {
  pgTable,
  serial,
  varchar,
  text,
  timestamp,
  integer,
  jsonb,
  primaryKey,
} from "drizzle-orm/pg-core";
import type { ApplicationFormat, CreateRoundDto } from "$app/types/round.ts";
import type { ApplicationState } from "$app/types/application.ts";
import { relations, sql } from "drizzle-orm";
import { CreateApplicationDto } from "../types/application.ts";

// Users table
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  walletAddress: varchar("wallet_address", { length: 42 }).notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => sql`(CURRENT_TIMESTAMP)`).notNull(),
});

// Rounds table
export const rounds = pgTable("rounds", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  applicationPeriodStart: timestamp("application_period_start", {
    withTimezone: true,
  }).notNull(),
  applicationPeriodEnd: timestamp("application_period_end", {
    withTimezone: true,
  }).notNull(),
  votingPeriodStart: timestamp("voting_period_start", {
    withTimezone: true,
  }).notNull(),
  votingPeriodEnd: timestamp("voting_period_end", {
    withTimezone: true,
  }).notNull(),
  resultsPeriodStart: timestamp("results_period_start", {
    withTimezone: true,
  }).notNull(),
  // Storing complex objects as JSONB
  // The '$type' property helps Drizzle infer the shape for type safety
  applicationFormat: jsonb("application_format").notNull().$type<ApplicationFormat>(),
  votingConfig: jsonb("voting_config").notNull().$type<CreateRoundDto['votingConfig']>(),
  createdByUserId: integer("created_by_user_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
});

// Round Admins table (join table for many-to-many relationship)
export const roundAdmins = pgTable("round_admins", {
  roundId: integer("round_id").notNull(),
  userId: integer("user_id").notNull(),
  assignedAt: timestamp("assigned_at", { withTimezone: true }).defaultNow(),
}, (table) => [
    primaryKey({ columns: [table.roundId, table.userId] }),
  ]
);

export const roundVoters = pgTable("round_voters", {
  roundId: integer("round_id").notNull(),
  userId: integer("user_id").notNull(),
  assignedAt: timestamp("assigned_at", { withTimezone: true }).defaultNow(),
}, (table) => [
    primaryKey({ columns: [table.roundId, table.userId] }),
  ]
);

export const roundAdminsRelations = relations(roundAdmins, ({ one }) => ({
	user: one(users, { fields: [roundAdmins.userId], references: [users.id] }),
  round: one(rounds, { fields: [roundAdmins.roundId], references: [rounds.id] }),
}));

export const roundVotersRelations = relations(roundVoters, ({ one }) => ({
  user: one(users, { fields: [roundVoters.userId], references: [users.id] }),
  round: one(rounds, { fields: [roundVoters.roundId], references: [rounds.id] }),
}));

export const applications = pgTable("applications", {
  id: serial("id").primaryKey(),
  state: varchar("state", { length: 255 }).notNull().default("pending").$type<ApplicationState>(),
  projectName: varchar("project_name", { length: 255 }).notNull(),
  dripsAccountId: varchar("drips_account_id", { length: 255 }).notNull(),
  submitterUserId: integer("submitter").notNull().references(() => users.id),
  fields: jsonb("fields").notNull().$type<CreateApplicationDto['fields']>(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
  roundId: integer("round_id").notNull().references(() => rounds.id),
});

export const applicationsRelations = relations(applications, ({ one }) => ({
  round: one(rounds, { fields: [applications.roundId], references: [rounds.id] }),
  submitter: one(users, { fields: [applications.submitterUserId], references: [users.id] }),
}));
