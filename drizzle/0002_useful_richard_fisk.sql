CREATE TYPE "public"."kyc_provider" AS ENUM('Fern');--> statement-breakpoint
CREATE TYPE "public"."kyc_status" AS ENUM('CREATED', 'UNDER_REVIEW', 'NEEDS_ADDITIONAL_INFORMATION', 'ACTIVE', 'REJECTED', 'DEACTIVATED');--> statement-breakpoint
CREATE TYPE "public"."kyc_type" AS ENUM('INDIVIDUAL', 'BUSINESS');--> statement-breakpoint
CREATE TABLE "application_kyc_requests" (
	"application_id" uuid NOT NULL,
	"kyc_request_id" uuid NOT NULL,
	CONSTRAINT "application_kyc_requests_application_id_kyc_request_id_pk" PRIMARY KEY("application_id","kyc_request_id"),
	CONSTRAINT "application_kyc_requests_application_id_unique" UNIQUE("application_id")
);
--> statement-breakpoint
CREATE TABLE "kyc_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "kyc_status" DEFAULT 'CREATED' NOT NULL,
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
ALTER TABLE "rounds" ADD COLUMN "kyc_provider" "kyc_provider";--> statement-breakpoint
ALTER TABLE "application_kyc_requests" ADD CONSTRAINT "application_kyc_requests_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_kyc_requests" ADD CONSTRAINT "application_kyc_requests_kyc_request_id_kyc_requests_id_fk" FOREIGN KEY ("kyc_request_id") REFERENCES "public"."kyc_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kyc_requests" ADD CONSTRAINT "kyc_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;