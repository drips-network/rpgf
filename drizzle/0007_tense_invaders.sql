ALTER TABLE "audit_logs" ADD COLUMN "actor" jsonb DEFAULT '{"type":"system"}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_logs" DROP COLUMN "actor_type";--> statement-breakpoint
DROP TYPE "public"."audit_log_actor";