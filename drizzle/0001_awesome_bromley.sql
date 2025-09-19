ALTER TYPE "public"."kyc_provider" ADD VALUE 'Treova';--> statement-breakpoint
CREATE TABLE "round_kyc_configurations" (
	"round_id" uuid PRIMARY KEY NOT NULL,
	"kyc_provider" "kyc_provider" NOT NULL,
	"treova_form_id" varchar(255)
);
--> statement-breakpoint
ALTER TABLE "kyc_requests" ALTER COLUMN "kyc_email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "kyc_requests" ALTER COLUMN "kyc_form_url" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "kyc_requests" ALTER COLUMN "provider_org_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "round_kyc_configurations" ADD CONSTRAINT "round_kyc_configurations_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rounds" DROP COLUMN "kyc_provider";