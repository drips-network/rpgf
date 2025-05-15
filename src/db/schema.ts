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

// Users table
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  walletAddress: varchar("wallet_address", { length: 42 }).notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
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
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// Round Admins table (join table for many-to-many relationship)
export const roundAdmins = pgTable("round_admins", {
  roundId: integer("round_id").notNull().references(() => rounds.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  assignedAt: timestamp("assigned_at", { withTimezone: true }).defaultNow(),
}, (table) => [
    primaryKey({ columns: [table.roundId, table.userId] }),
  ]
);

// We will later add tables for applications, votes, etc.
// Drizzle relations can be defined here as well for query convenience.
// For example:
// export const userRelations = relations(users, ({ many }) => ({
//   createdRounds: many(rounds),
//   administeredRounds: many(roundAdmins),
// }));
// export const roundRelations = relations(rounds, ({ one, many }) => ({
//   creator: one(users, {
//     fields: [rounds.createdByUserId],
//     references: [users.id],
//   }),
//   admins: many(roundAdmins),
// }));
// export const roundAdminRelations = relations(roundAdmins, ({ one }) => ({
//   round: one(rounds, { fields: [roundAdmins.roundId], references: [rounds.id] }),
//   user: one(users, { fields: [roundAdmins.userId], references: [users.id] }),
// }));
