ALTER TYPE "public"."audit_log_action" ADD VALUE 'ballot_allocations_saved' BEFORE 'results_calculated';--> statement-breakpoint
ALTER TYPE "public"."audit_log_action" ADD VALUE 'ballot_draft_saved' BEFORE 'results_calculated';--> statement-breakpoint
CREATE TABLE "ballot_category_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"round_id" uuid NOT NULL,
	"voter_user_id" uuid NOT NULL,
	"allocations" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ballot_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"round_id" uuid NOT NULL,
	"voter_user_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"votes" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "application_categories" ADD COLUMN "min_vote_percentage" integer;--> statement-breakpoint
ALTER TABLE "ballot_category_allocations" ADD CONSTRAINT "ballot_category_allocations_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ballot_category_allocations" ADD CONSTRAINT "ballot_category_allocations_voter_user_id_users_id_fk" FOREIGN KEY ("voter_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ballot_drafts" ADD CONSTRAINT "ballot_drafts_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ballot_drafts" ADD CONSTRAINT "ballot_drafts_voter_user_id_users_id_fk" FOREIGN KEY ("voter_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ballot_drafts" ADD CONSTRAINT "ballot_drafts_category_id_application_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."application_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "unique_allocation_per_voter_per_round_index" ON "ballot_category_allocations" USING btree ("round_id","voter_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_draft_per_voter_per_category_index" ON "ballot_drafts" USING btree ("round_id","voter_user_id","category_id");