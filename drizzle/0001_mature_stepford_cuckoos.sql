CREATE TYPE "public"."audit_log_action" AS ENUM('round_created', 'round_settings_changed', 'round_admins_changed', 'round_voters_changed', 'round_published', 'round_deleted', 'application_category_created', 'application_category_updated', 'application_category_deleted', 'application_form_created', 'application_form_updated', 'application_form_deleted', 'application_submitted', 'application_reviewed', 'ballot_submitted', 'ballot_updated', 'results_calculated', 'linked_drip_lists_edited', 'results_published');--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "audit_logs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"action" "audit_log_action" NOT NULL,
	"user_id" uuid NOT NULL,
	"round_id" uuid,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;