CREATE TYPE "public"."audit_log_actor" AS ENUM('user', 'system', 'kyc_provider');--> statement-breakpoint
ALTER TYPE "public"."audit_log_action" ADD VALUE 'kyc_request_created';--> statement-breakpoint
ALTER TYPE "public"."audit_log_action" ADD VALUE 'kyc_request_linked_to_application';--> statement-breakpoint
ALTER TYPE "public"."audit_log_action" ADD VALUE 'kyc_request_updated';--> statement-breakpoint
ALTER TABLE "audit_logs" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint

-- Step 1: Add the new actor column, allowing NULLs for now.
ALTER TABLE "audit_logs" ADD COLUMN "actor" "audit_log_actor";--> statement-breakpoint

-- Step 2: Backfill all existing rows with the 'user' actor type.
-- This ensures the NOT NULL constraint we add next will not fail.
UPDATE "audit_logs" SET "actor" = 'user';--> statement-breakpoint

-- Step 3: Now that all rows are populated, enforce the NOT NULL constraint.
ALTER TABLE "audit_logs" ALTER COLUMN "actor" SET NOT NULL;--> statement-breakpoint

-- Step 4: Set the default value for all new rows moving forward.
ALTER TABLE "audit_logs" ALTER COLUMN "actor" SET DEFAULT 'user';
