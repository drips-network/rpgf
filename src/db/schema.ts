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
import type { ApplicationFormat, VotingConfiguration } from "$app/types/round.ts"; // Re-using these for JSONB structure
import { relations, sql } from "drizzle-orm";

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
  votingConfig: jsonb("voting_config").notNull().$type<VotingConfiguration>(),
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
