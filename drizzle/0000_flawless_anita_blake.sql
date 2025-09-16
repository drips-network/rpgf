CREATE TYPE "public"."audit_log_action" AS ENUM('round_created', 'round_settings_changed', 'round_admins_changed', 'round_voters_changed', 'round_published', 'round_deleted', 'application_category_created', 'application_category_updated', 'application_category_deleted', 'application_form_created', 'application_form_updated', 'application_form_deleted', 'application_submitted', 'application_updated', 'application_reviewed', 'ballot_submitted', 'ballot_updated', 'results_calculated', 'linked_drip_lists_edited', 'results_published', 'kyc_request_created', 'kyc_request_linked_to_application', 'kyc_request_updated');--> statement-breakpoint
CREATE TYPE "public"."kyc_provider" AS ENUM('Fern');--> statement-breakpoint
CREATE TYPE "public"."kyc_status" AS ENUM('CREATED', 'UNDER_REVIEW', 'NEEDS_ADDITIONAL_INFORMATION', 'ACTIVE', 'REJECTED', 'DEACTIVATED');--> statement-breakpoint
CREATE TYPE "public"."kyc_type" AS ENUM('INDIVIDUAL', 'BUSINESS');--> statement-breakpoint
CREATE TABLE "application_answers" (
	"application_version_id" uuid NOT NULL,
	"field_id" uuid NOT NULL,
	"answer" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "application_answers_application_version_id_field_id_pk" PRIMARY KEY("application_version_id","field_id")
);
--> statement-breakpoint
CREATE TABLE "application_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"round_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"application_form_id" uuid NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "application_form_fields" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"form_id" uuid NOT NULL,
	"type" varchar(255) NOT NULL,
	"slug" varchar(255),
	"order" integer NOT NULL,
	"required" boolean,
	"private" boolean,
	"properties" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "application_forms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"round_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "application_kyc_requests" (
	"application_id" uuid NOT NULL,
	"kyc_request_id" uuid NOT NULL,
	CONSTRAINT "application_kyc_requests_application_id_kyc_request_id_pk" PRIMARY KEY("application_id","kyc_request_id"),
	CONSTRAINT "application_kyc_requests_application_id_unique" UNIQUE("application_id")
);
--> statement-breakpoint
CREATE TABLE "application_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"project_name" varchar(255) NOT NULL,
	"drips_account_id" varchar(255) NOT NULL,
	"drips_project_data_snapshot" jsonb NOT NULL,
	"attestation_uid" varchar(255),
	"form_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"state" varchar(255) DEFAULT 'pending' NOT NULL,
	"submitter" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"round_id" uuid NOT NULL,
	"project_name" varchar(255) NOT NULL,
	"drips_project_data_snapshot" jsonb NOT NULL,
	"category_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "audit_logs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"action" "audit_log_action" NOT NULL,
	"actor" jsonb NOT NULL,
	"user_id" uuid,
	"round_id" uuid,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ballots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"round_id" uuid NOT NULL,
	"voter_user_id" uuid NOT NULL,
	"ballot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chains" (
	"id" serial PRIMARY KEY NOT NULL,
	"chain_id" integer NOT NULL,
	"gql_name" varchar(255) NOT NULL,
	"attestation_setup" jsonb,
	"whitelist_mode" boolean DEFAULT true NOT NULL,
	"rpc_url" varchar(255) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kyc_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "kyc_status" DEFAULT 'CREATED' NOT NULL,
	"round_id" uuid NOT NULL,
	"kyc_email" varchar(255) NOT NULL,
	"kyc_type" "kyc_type" NOT NULL,
	"kyc_provider" "kyc_provider" NOT NULL,
	"kyc_form_url" varchar(510) NOT NULL,
	"provider_user_id" varchar(255) NOT NULL,
	"provider_org_id" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "linked_drip_lists" (
	"round_id" uuid NOT NULL,
	"drip_list_id" varchar(255) NOT NULL,
	CONSTRAINT "linked_drip_lists_round_id_drip_list_id_pk" PRIMARY KEY("round_id","drip_list_id")
);
--> statement-breakpoint
CREATE TABLE "nonces" (
	"nonce" varchar(255) PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" varchar(510) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked" boolean DEFAULT false NOT NULL,
	CONSTRAINT "refresh_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "results" (
	"round_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"method" varchar(255) NOT NULL,
	"result" integer NOT NULL,
	"calculated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "results_round_id_application_id_pk" PRIMARY KEY("round_id","application_id")
);
--> statement-breakpoint
CREATE TABLE "round_admins" (
	"round_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "round_admins_round_id_user_id_pk" PRIMARY KEY("round_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "round_voters" (
	"round_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "round_voters_round_id_user_id_pk" PRIMARY KEY("round_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "rounds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chain_id" integer NOT NULL,
	"url_slug" varchar(255),
	"published" boolean DEFAULT false NOT NULL,
	"name" varchar(255),
	"emoji" varchar(255) NOT NULL,
	"color" varchar(255) NOT NULL,
	"description" text,
	"application_period_start" timestamp with time zone,
	"application_period_end" timestamp with time zone,
	"voting_period_start" timestamp with time zone,
	"voting_period_end" timestamp with time zone,
	"results_period_start" timestamp with time zone,
	"max_votes_per_voter" integer,
	"max_votes_per_project_per_voter" integer,
	"voter_guidelines_link" varchar(255),
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	"published_by_user_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"results_calculated" boolean DEFAULT false NOT NULL,
	"results_published" boolean DEFAULT false NOT NULL,
	"custom_avatar_cid" varchar(255),
	"kyc_provider" "kyc_provider",
	CONSTRAINT "rounds_url_slug_unique" UNIQUE("url_slug")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wallet_address" varchar(42) NOT NULL,
	"whitelisted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_wallet_address_unique" UNIQUE("wallet_address")
);
--> statement-breakpoint
ALTER TABLE "application_answers" ADD CONSTRAINT "application_answers_application_version_id_application_versions_id_fk" FOREIGN KEY ("application_version_id") REFERENCES "public"."application_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_answers" ADD CONSTRAINT "application_answers_field_id_application_form_fields_id_fk" FOREIGN KEY ("field_id") REFERENCES "public"."application_form_fields"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_categories" ADD CONSTRAINT "application_categories_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_categories" ADD CONSTRAINT "application_categories_application_form_id_application_forms_id_fk" FOREIGN KEY ("application_form_id") REFERENCES "public"."application_forms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_form_fields" ADD CONSTRAINT "application_form_fields_form_id_application_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."application_forms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_forms" ADD CONSTRAINT "application_forms_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_kyc_requests" ADD CONSTRAINT "application_kyc_requests_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_kyc_requests" ADD CONSTRAINT "application_kyc_requests_kyc_request_id_kyc_requests_id_fk" FOREIGN KEY ("kyc_request_id") REFERENCES "public"."kyc_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_versions" ADD CONSTRAINT "application_versions_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_versions" ADD CONSTRAINT "application_versions_form_id_application_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."application_forms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_versions" ADD CONSTRAINT "application_versions_category_id_application_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."application_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_submitter_users_id_fk" FOREIGN KEY ("submitter") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_category_id_application_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."application_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ballots" ADD CONSTRAINT "ballots_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ballots" ADD CONSTRAINT "ballots_voter_user_id_users_id_fk" FOREIGN KEY ("voter_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kyc_requests" ADD CONSTRAINT "kyc_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kyc_requests" ADD CONSTRAINT "kyc_requests_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linked_drip_lists" ADD CONSTRAINT "linked_drip_lists_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "results" ADD CONSTRAINT "results_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "results" ADD CONSTRAINT "results_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "round_admins" ADD CONSTRAINT "round_admins_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "round_admins" ADD CONSTRAINT "round_admins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_chain_id_chains_id_fk" FOREIGN KEY ("chain_id") REFERENCES "public"."chains"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_published_by_user_id_users_id_fk" FOREIGN KEY ("published_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "application_category_name_unique_index" ON "application_categories" USING btree ("round_id",lower("name")) WHERE "application_categories"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "form_field_slug_unique_index" ON "application_form_fields" USING btree ("form_id",lower("slug")) WHERE "application_form_fields"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "url_slug_unique_index" ON "rounds" USING btree (lower("url_slug"));